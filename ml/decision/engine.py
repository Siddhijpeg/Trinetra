"""
TRINETRA Decision Engine
========================
Fuses Geographic and Time-to-Event predictions into a structured decision.

Architecture:
  Geographic output (Top-K zones, probabilities, registry signals)
    + Time-to-Event output (P25/P50/P75, survival curve, SLA probabilities)
    + Operational context (amount, SLA minutes)
    ↓
  Transparent deterministic policy
    ↓
  CRITICAL_ALERT | REVIEW | MONITOR
    + structured reasons
    + confidence score
    + geographic summary
    + timing summary

This is NOT a trained classifier. The policy is:
  - deterministic
  - config-driven
  - explainable
  - version-controlled in ml/decision/config.py

Do NOT train fake labels on top of this engine.
Do NOT use the Decision output as a feature for another model.
Recoverability ≠ urgency ≠ confidence ≠ exposure.
These are kept as separate concepts throughout.
"""

from __future__ import annotations
import numpy as np
from typing import Dict, Any, List, Optional

from ml.decision import config as C


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def evaluate_decision(
    geo_result:  Dict[str, Any],
    timing_result: Dict[str, Any],
    fin_result:  Dict[str, Any],
    sla_minutes: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Evaluate a CRITICAL_ALERT / REVIEW / MONITOR decision from model outputs.

    Parameters
    ----------
    geo_result:
        Output of ml/geographic/interface_v2.predict_geography()
        Must include: confidence_score, ranked_zones, registry_signals,
                      calibrated_confidence (optional)
    timing_result:
        Output of ml/timing/interface.estimate_intervention_window()
        Must include: intervention_distribution.{p25,p50,p75}_minutes,
                      intervention_distribution.survival_curve (optional)
    fin_result:
        Output of backend/services/financial_exposure.calculate_financial_exposure()
        Must include: amount_at_risk_inr
    sla_minutes:
        Operational SLA in minutes (default: config.DEFAULT_SLA_MINUTES)

    Returns
    -------
    Structured decision dict with decision, confidence, reasons, summaries.
    """
    if sla_minutes is None:
        sla_minutes = C.DEFAULT_SLA_MINUTES

    # ── Extract geographic signals ─────────────────────────────────────────
    geo  = _parse_geo(geo_result)
    tim  = _parse_timing(timing_result, sla_minutes)
    fin  = _parse_financial(fin_result)

    # ── Evaluate each signal dimension ────────────────────────────────────
    geo_strength  = _geo_strength(geo)
    tim_urgency   = _timing_urgency(tim)
    sla_viable    = _sla_viability(tim)
    registry_ok   = _registry_quality(geo)
    exposure_lvl  = _exposure_level(fin)

    # ── Apply decision policy ──────────────────────────────────────────────
    decision, reasons = _apply_policy(
        geo, tim, fin,
        geo_strength, tim_urgency, sla_viable, registry_ok, exposure_lvl
    )

    # ── Compute continuous confidence score ───────────────────────────────
    confidence = _confidence_score(geo, tim, fin, geo_strength, tim_urgency, registry_ok, exposure_lvl)

    # ── Build structured output ────────────────────────────────────────────
    geo_summary = _geo_summary(geo, geo_strength, registry_ok)
    tim_summary = _timing_summary(tim, tim_urgency, sla_viable, sla_minutes)

    return {
        "decision":           decision,
        "decision_confidence": round(float(confidence), 3),
        "reasons":            reasons,
        "geographic_summary": geo_summary,
        "timing_summary":     tim_summary,
        "financial_summary": {
            "amount_at_risk_inr":    fin.get("amount_at_risk_inr", 0),
            "exposure_level":        exposure_lvl,
        },
        "sla_minutes_used":    sla_minutes,
        "rule_engine_version": C.DECISION_ENGINE_VERSION,
    }


# ─────────────────────────────────────────────────────────────────────────────
# INPUT PARSERS
# ─────────────────────────────────────────────────────────────────────────────

def _parse_geo(geo: Dict) -> Dict:
    """Normalise geographic result to a flat dict for policy logic."""
    if not geo or geo.get("status") == "error":
        return {"confidence": 0.0, "top3_mass": 0.0, "top1_prob": 0.0,
                "top_zone": None, "ranked_zones": [], "registry_signals": [],
                "best_reliability": 0.0, "has_registry": False}

    ranked   = geo.get("ranked_zones", [])
    top1_prob = float(ranked[0]["probability"]) if ranked else 0.0
    top3_mass = float(sum(r["probability"] for r in ranked[:3])) if ranked else 0.0
    confidence = float(geo.get("confidence_score", geo.get("calibrated_confidence", 0) * 100)) / 100.0

    signals = geo.get("registry_signals", [])
    best_rel = max((s.get("reliability", 0.0) for s in signals), default=0.0)
    has_reg  = any(s.get("in_registry", False) and s.get("historical_sightings", 0) >= C.GEO_MIN_REGISTRY_SIGHTINGS
                   for s in signals)

    return {
        "confidence":      confidence,
        "top1_prob":       top1_prob,
        "top3_mass":       top3_mass,
        "top_zone":        (ranked[0]["zone_id"] if ranked else None),
        "top_zone_name":   (ranked[0].get("district", ranked[0].get("zone_id","")) if ranked else ""),
        "ranked_zones":    ranked,
        "registry_signals": signals,
        "best_reliability": best_rel,
        "has_registry":    has_reg,
    }


def _parse_timing(timing: Dict, sla_minutes: float) -> Dict:
    """Normalise timing result."""
    if not timing or timing.get("status") == "error":
        return {"p25": 999.0, "p50": 999.0, "p75": 999.0, "interval_width": 999.0,
                "sla_prob": 0.0, "horizon_probs": {}, "survival_curve": []}

    dist = timing.get("intervention_distribution", {})
    p25  = float(dist.get("p25_minutes", 999.0))
    p50  = float(dist.get("p50_minutes", 999.0))
    p75  = float(dist.get("p75_minutes", 999.0))
    surv = dist.get("survival_curve", [])

    # Extract P(T > horizon) from survival curve for each configured SLA horizon
    horizon_probs = {}
    for h in C.SLA_HORIZONS_MINUTES:
        horizon_probs[h] = _survival_at(surv, h)

    sla_prob = _survival_at(surv, sla_minutes)

    return {
        "p25":            p25,
        "p50":            p50,
        "p75":            p75,
        "interval_width": max(0.0, p75 - p25),
        "sla_prob":       sla_prob,
        "horizon_probs":  horizon_probs,
        "survival_curve": surv,
    }


def _parse_financial(fin: Dict) -> Dict:
    if not fin:
        return {"amount_at_risk_inr": 0.0}
    return {
        "amount_at_risk_inr": float(fin.get("amount_at_risk_inr",
                                   fin.get("estimated_exposure_inr", 0.0))),
    }


def _survival_at(curve: list, t_minutes: float) -> float:
    """Return P(T > t_minutes) from survival curve via linear interpolation."""
    if not curve:
        return 0.5   # neutral default when curve unavailable
    prob = float(curve[-1]["probability_remaining"])
    for pt in curve:
        if float(pt["minutes"]) >= t_minutes:
            prob = float(pt["probability_remaining"])
            break
    return round(prob, 4)


# ─────────────────────────────────────────────────────────────────────────────
# SIGNAL DIMENSION EVALUATORS
# ─────────────────────────────────────────────────────────────────────────────

def _geo_strength(geo: Dict) -> str:
    """'high' | 'medium' | 'low'"""
    c = geo["top1_prob"]
    if c >= C.GEO_HIGH_CONFIDENCE_THRESHOLD:
        return "high"
    if c >= C.GEO_LOW_CONFIDENCE_THRESHOLD:
        return "medium"
    return "low"


def _timing_urgency(tim: Dict) -> str:
    """'high' | 'medium' | 'low'"""
    p50 = tim["p50"]
    if p50 <= C.TIMING_HIGH_URGENCY_P50_THRESHOLD:
        return "high"
    if p50 <= C.TIMING_MEDIUM_URGENCY_P50_THRESHOLD:
        return "medium"
    return "low"


def _sla_viability(tim: Dict) -> str:
    """'viable' | 'marginal' | 'expired'"""
    sp = tim["sla_prob"]
    if sp >= C.TIMING_SLA_VIABLE_THRESHOLD:
        return "viable"
    if sp >= C.TIMING_SLA_LOW_THRESHOLD:
        return "marginal"
    return "expired"


def _registry_quality(geo: Dict) -> str:
    """'supported' | 'none'"""
    if geo["has_registry"] and geo["best_reliability"] >= C.GEO_REGISTRY_SUPPORTED_THRESHOLD:
        return "supported"
    return "none"


def _exposure_level(fin: Dict) -> str:
    """'high' | 'medium' | 'low'"""
    a = fin.get("amount_at_risk_inr", 0)
    if a >= C.EXPOSURE_HIGH_THRESHOLD:
        return "high"
    if a >= C.EXPOSURE_MEDIUM_THRESHOLD:
        return "medium"
    return "low"


# ─────────────────────────────────────────────────────────────────────────────
# DECISION POLICY
# ─────────────────────────────────────────────────────────────────────────────

def _apply_policy(geo, tim, fin, geo_strength, tim_urgency, sla_viable, registry_ok, exposure_lvl):
    """
    Apply the deterministic decision policy.
    Returns (decision_str, reasons_list).
    """
    reasons: List[str] = []

    # ── CRITICAL_ALERT rule 1: strong geo + high urgency + viable window ──
    if (geo_strength == "high"
            and tim_urgency == "high"
            and sla_viable in ("viable", "marginal")):
        reasons.append(f"Strong geographic signal: Top-1 {geo['top1_prob']*100:.1f}% ≥ {C.GEO_HIGH_CONFIDENCE_THRESHOLD*100:.0f}% threshold")
        reasons.append(f"High timing urgency: P50 window ≈ {tim['p50']:.0f} min (threshold {C.TIMING_HIGH_URGENCY_P50_THRESHOLD:.0f} min)")
        if sla_viable == "viable":
            reasons.append(f"SLA feasible: P(T > SLA) = {tim['sla_prob']:.2f} ≥ {C.TIMING_SLA_VIABLE_THRESHOLD}")
        else:
            reasons.append(f"SLA marginal but open: P(T > SLA) = {tim['sla_prob']:.2f}")
        if registry_ok == "supported":
            reasons.append(f"Registry-backed prediction (reliability {geo['best_reliability']:.3f})")
        return "CRITICAL", reasons

    # ── CRITICAL_ALERT rule 2: high geo + medium urgency + high exposure ──
    if (geo_strength == "high"
            and tim_urgency in ("high", "medium")
            and sla_viable in ("viable", "marginal")
            and exposure_lvl == "high"):
        reasons.append(f"High exposure (₹{fin['amount_at_risk_inr']:,.0f}) with strong geographic signal ({geo['top1_prob']*100:.1f}%)")
        reasons.append(f"Moderate-to-high urgency: P50 ≈ {tim['p50']:.0f} min")
        if registry_ok == "supported":
            reasons.append(f"Registry evidence present (reliability {geo['best_reliability']:.3f})")
        return "CRITICAL", reasons

    # ── CRITICAL_ALERT rule 3: medium geo + high urgency + registry supported ──
    if (geo_strength == "medium"
            and tim_urgency == "high"
            and sla_viable == "viable"
            and registry_ok == "supported"
            and exposure_lvl in ("high","medium")):
        reasons.append(f"Registry-supported prediction with high urgency (P50 ≈ {tim['p50']:.0f} min)")
        reasons.append(f"Geographic concentration: Top-1 {geo['top1_prob']*100:.1f}%, Top-3 mass {geo['top3_mass']*100:.1f}%")
        reasons.append(f"Intervention window open: P(T > SLA) = {tim['sla_prob']:.2f}")
        return "CRITICAL", reasons

    # ── REVIEW rule 1: medium/high geo + medium urgency ──────────────────
    if geo_strength in ("medium","high") and tim_urgency in ("medium","high"):
        reasons.append(f"Geographic prediction available: Top-1 {geo['top1_prob']*100:.1f}%")
        reasons.append(f"Meaningful time window: P50 ≈ {tim['p50']:.0f} min, P75 ≈ {tim['p75']:.0f} min")
        if sla_viable == "expired":
            reasons.append("SLA viability low — manual assessment required")
        if exposure_lvl == "high":
            reasons.append(f"High exposure: ₹{fin['amount_at_risk_inr']:,.0f}")
        return "REVIEW", reasons

    # ── REVIEW rule 2: any geo + viable SLA + high exposure ──────────────
    if sla_viable == "viable" and exposure_lvl == "high":
        reasons.append(f"High financial exposure (₹{fin['amount_at_risk_inr']:,.0f}) with open SLA window")
        reasons.append(f"Geographic signal: Top-1 {geo['top1_prob']*100:.1f}% (moderate or below threshold)")
        return "REVIEW", reasons

    # ── REVIEW rule 3: medium geo alone ──────────────────────────────────
    if geo_strength == "medium":
        reasons.append(f"Moderate geographic concentration: Top-1 {geo['top1_prob']*100:.1f}%")
        reasons.append(f"Timing window P50 ≈ {tim['p50']:.0f} min — monitor for narrowing")
        return "REVIEW", reasons

    # ── REVIEW rule 4: high geo + low urgency (long window, actionable later) ─
    if geo_strength == "high":
        reasons.append(f"Strong geographic signal: Top-1 {geo['top1_prob']*100:.1f}%")
        reasons.append(f"Longer intervention window: P50 ≈ {tim['p50']:.0f} min — plan intervention")
        if registry_ok == "supported":
            reasons.append(f"Registry evidence present (reliability {geo['best_reliability']:.3f})")
        return "REVIEW", reasons

    # ── MONITOR (default) ─────────────────────────────────────────────────
    reasons.append(f"Weak geographic signal: Top-1 {geo['top1_prob']*100:.1f}% < {C.GEO_LOW_CONFIDENCE_THRESHOLD*100:.0f}% threshold")
    reasons.append(f"Timing window: P50 ≈ {tim['p50']:.0f} min — intervention opportunity may be available")
    if exposure_lvl == "low":
        reasons.append(f"Low financial exposure (₹{fin['amount_at_risk_inr']:,.0f})")
    return "MONITOR", reasons


# ─────────────────────────────────────────────────────────────────────────────
# CONFIDENCE SCORE
# ─────────────────────────────────────────────────────────────────────────────

def _confidence_score(geo, tim, fin, geo_strength, tim_urgency, registry_ok, exposure_lvl) -> float:
    """
    Compute a continuous 0–1 confidence score.
    This summarises decision signal strength — it is NOT a probability of outcome.
    Weights are defined in config.py.
    """
    # Geographic component: normalised Top-1 probability (cap at 0.5 → 1.0 score)
    geo_score = min(1.0, geo["top1_prob"] / 0.50)

    # Timing component: urgency mapped to [0,1]
    # P50=0 → 1.0;  P50=MEDIUM_THRESHOLD → 0.5;  P50≥2×MEDIUM_THRESHOLD → 0.0
    p50 = tim["p50"]
    if p50 <= 0:
        tim_score = 1.0
    elif p50 >= 2 * C.TIMING_MEDIUM_URGENCY_P50_THRESHOLD:
        tim_score = 0.0
    else:
        tim_score = 1.0 - (p50 / (2 * C.TIMING_MEDIUM_URGENCY_P50_THRESHOLD))

    # Registry component: best reliability normalised
    reg_score = min(1.0, geo["best_reliability"] / 0.5) if registry_ok == "supported" else 0.0

    # Exposure component: log-scaled
    amt = max(1.0, fin.get("amount_at_risk_inr", 0))
    exp_score = min(1.0, np.log10(amt) / np.log10(C.EXPOSURE_HIGH_THRESHOLD))

    score = (C.CONFIDENCE_WEIGHT_GEO     * geo_score
           + C.CONFIDENCE_WEIGHT_TIMING  * tim_score
           + C.CONFIDENCE_WEIGHT_REGISTRY * reg_score
           + C.CONFIDENCE_WEIGHT_EXPOSURE * exp_score)

    return round(float(np.clip(score, 0.0, 1.0)), 3)


# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY BUILDERS
# ─────────────────────────────────────────────────────────────────────────────

def _geo_summary(geo, geo_strength, registry_ok) -> Dict:
    ranked = geo["ranked_zones"]
    return {
        "top_zone":          geo.get("top_zone"),
        "top_zone_name":     geo.get("top_zone_name", ""),
        "top1_probability":  round(geo["top1_prob"], 4),
        "top3_mass":         round(geo["top3_mass"], 4),
        "confidence_pct":    round(geo["confidence"] * 100, 1),
        "geo_strength":      geo_strength,
        "registry_supported": registry_ok == "supported",
        "best_registry_reliability": round(geo["best_reliability"], 3),
        "top3_zones": [
            {"zone_id": r["zone_id"],
             "name": r.get("district", r.get("zone_id","")),
             "state": r.get("state",""),
             "probability": round(r["probability"], 4)}
            for r in ranked[:3]
        ],
    }


def _timing_summary(tim, tim_urgency, sla_viable, sla_minutes) -> Dict:
    return {
        "p25_minutes":      round(tim["p25"], 1),
        "p50_minutes":      round(tim["p50"], 1),
        "p75_minutes":      round(tim["p75"], 1),
        "interval_width_minutes": round(tim["interval_width"], 1),
        "urgency":          tim_urgency,
        "sla_minutes":      sla_minutes,
        "sla_viability":    sla_viable,
        "p_beyond_sla":     round(tim["sla_prob"], 3),
        "horizon_probs":    {f"p_beyond_{h}min": round(v, 3)
                             for h, v in tim["horizon_probs"].items()},
    }
