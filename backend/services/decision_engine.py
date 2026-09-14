"""
TRINETRA Decision Engine (Phase 3)
===================================
Thin, explainable orchestration layer converting Geographic, Time-to-Event,
and Financial Exposure signals into actionable prototype decisions.
"""
from typing import Dict, Any, Optional, List
from backend.config.decision_thresholds import (
    TIME_URGENT_P50_MINUTES,
    TIME_CRITICAL_P50_MINUTES,
    FINANCIAL_HIGH_EXPOSURE_INR,
    FINANCIAL_CRITICAL_EXPOSURE_INR,
    GEO_HIGH_CONFIDENCE,
    GEO_MEDIUM_CONFIDENCE,
)

def evaluate_decision(
    geo_result: Dict[str, Any],
    timing_result: Dict[str, Any],
    fin_result: Dict[str, Any],
    sla_minutes: Optional[float] = None
) -> Dict[str, Any]:
    """
    Evaluates model signals and returns a structured priority decision with reason codes.
    """
    reason_codes: List[str] = []
    
    # 1. Geographic Signal Evaluation
    geo_conf = float(geo_result.get("confidence_score", 0.0))
    if geo_conf >= GEO_HIGH_CONFIDENCE:
        reason_codes.append("HIGH_GEO_CONFIDENCE")
    elif geo_conf >= GEO_MEDIUM_CONFIDENCE:
        reason_codes.append("MODERATE_GEO_CONFIDENCE")
    else:
        reason_codes.append("LOW_GEO_CONFIDENCE")

    # 2. Time-to-Event Signal Evaluation
    dist = timing_result.get("intervention_distribution", {})
    p50 = float(dist.get("p50_minutes", 60.0))
    
    if p50 <= TIME_CRITICAL_P50_MINUTES:
        reason_codes.append("CRITICAL_TIME_WINDOW")
    elif p50 <= TIME_URGENT_P50_MINUTES:
        reason_codes.append("URGENT_TIME_WINDOW")
    else:
        reason_codes.append("STANDARD_TIME_WINDOW")

    # 3. Financial Exposure Evaluation
    exposure_inr = float(fin_result.get("estimated_exposure_inr", 0.0))
    if exposure_inr >= FINANCIAL_CRITICAL_EXPOSURE_INR:
        reason_codes.append("CRITICAL_FINANCIAL_EXPOSURE")
    elif exposure_inr >= FINANCIAL_HIGH_EXPOSURE_INR:
        reason_codes.append("HIGH_FINANCIAL_EXPOSURE")
    else:
        reason_codes.append("MODERATE_FINANCIAL_EXPOSURE")

    # 4. Registry Signals (if present in Geographic M8 output)
    reg_signals = geo_result.get("registry_signals", [])
    if any(s.get("in_registry", False) or s.get("historical_sightings", 0) > 0 for s in reg_signals):
        reason_codes.append("REGISTRY_SIGNAL_PRESENT")

    # 5. SLA Status & Breach Risk
    sla_status = {"sla_minutes": sla_minutes, "breach_risk": "LOW", "status_label": "Within SLA"}
    if sla_minutes is not None and sla_minutes > 0:
        if p50 <= sla_minutes:
            sla_status["breach_risk"] = "HIGH"
            sla_status["status_label"] = f"P50 window (~{p50:.1f}m) within SLA target ({sla_minutes:.0f}m)"
            reason_codes.append("SLA_BREACH_RISK")
        else:
            sla_status["breach_risk"] = "LOW"
            sla_status["status_label"] = f"P50 window (~{p50:.1f}m) exceeds SLA target ({sla_minutes:.0f}m)"

    # 6. Priority Assignment Policy Rules
    if ("CRITICAL_TIME_WINDOW" in reason_codes) or \
       ("URGENT_TIME_WINDOW" in reason_codes and "HIGH_FINANCIAL_EXPOSURE" in reason_codes) or \
       ("CRITICAL_FINANCIAL_EXPOSURE" in reason_codes and geo_conf >= GEO_HIGH_CONFIDENCE):
        priority = "CRITICAL"
        action = "AUTO ALERT — Issue automated priority freeze request to nodal bank & dispatch emergency field intervention"
    elif ("URGENT_TIME_WINDOW" in reason_codes) or \
         ("HIGH_FINANCIAL_EXPOSURE" in reason_codes) or \
         (geo_conf >= GEO_HIGH_CONFIDENCE):
        priority = "HIGH"
        action = "HUMAN REVIEW — Dispatch urgent alert to duty officer for priority account block"
    elif (geo_conf >= GEO_MEDIUM_CONFIDENCE) or (exposure_inr > 0):
        priority = "MEDIUM"
        action = "HUMAN REVIEW — Queue case for standard analyst investigation"
    else:
        priority = "LOW"
        action = "MONITOR — Continue tracking network for subsequent hop activity"

    # Decision confidence combines geographic confidence and timing urgency
    time_factor = (1.0 - min(p50, 120.0) / 120.0) * 30.0
    decision_confidence = float(round(min(100.0, max(0.0, geo_conf * 0.7 + time_factor)), 1))

    return {
        "priority": priority,
        "recommended_action": action,
        "decision_confidence": decision_confidence,
        "sla_status": sla_status,
        "reason_codes": reason_codes,
        "rule_engine_version": "Deterministic Policy v1.0",
    }
