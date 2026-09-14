"""
TRINETRA — Geographic Engine V2 Public Inference Interface
===========================================================
Wraps the V2-trained M8 model artifacts.

Keeps the same public API signature as interface.py (V1) so the backend
service layer can route to v1 or v2 without changing the contract.

Artifacts loaded (lazy singleton):
    artifacts/models/geographic_v2/trained_model_geographic_v2.json
    artifacts/models/geographic_v2/rich_registry_v2.json
    artifacts/models/geographic_v2/calibration_v2.json
    data/synthetic_v2/zone_catalog.csv   (zone metadata)
"""

import os, json
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional
from core.canonical.schemas import PredictionContext

# ── Frozen M8 parameters ─────────────────────────────────────────────────────
M8_LAMBDA = 0.5
M8_K      = 5.0
M8_W_REL  = 2.0
M8_TOP_K  = 10

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))

# ── Lazy singletons ───────────────────────────────────────────────────────────
_artifacts   = None
_registry    = None
_calibration = None
_zones_df    = None


def _load():
    global _artifacts, _registry, _calibration, _zones_df
    art_dir = os.path.join(ROOT, "artifacts/models/geographic_v2")

    with open(os.path.join(art_dir, "trained_model_geographic_v2.json")) as f:
        _artifacts = json.load(f)
    with open(os.path.join(art_dir, "rich_registry_v2.json")) as f:
        _registry = json.load(f)
    with open(os.path.join(art_dir, "calibration_v2.json")) as f:
        _calibration = json.load(f)

    _zones_df = pd.read_csv(os.path.join(ROOT, "data/synthetic_v2/zone_catalog.csv"))


def _get():
    if _artifacts is None:
        _load()
    return _artifacts, _registry, _calibration, _zones_df


def _softmax(logits: np.ndarray, T: float) -> np.ndarray:
    s = logits / T
    s -= np.max(s)
    e = np.exp(s)
    return e / (e.sum() + 1e-12)


# ── Public prediction API ─────────────────────────────────────────────────────

def predict_geography(context: PredictionContext) -> Dict[str, Any]:
    """
    Geographic prediction using the V2 M8 Reliability-Aware Registry.

    Returns the same schema as V1 interface.py so the backend requires
    no contract changes.
    """
    artifacts, registry, calibration, zones_df = _get()

    global_prior    = artifacts["global_prior"]
    typology_priors = artifacts["typology_priors"]
    mule_zone_lhoods = artifacts["mule_zone_likelihoods"]
    zone_list       = artifacts["encoders"]["target_zone"]
    T               = float(calibration["T_m8"])

    global_log_prior = np.array([np.log(global_prior.get(z, 1e-9)) for z in zone_list])

    # ── Typology-conditioned prior ───────────────────────────────────────────
    typology = None
    if context.available_complaint_context:
        typology = context.available_complaint_context.typology
    base_prior = typology_priors.get(typology, global_prior) if typology else global_prior
    log_post   = np.array([np.log(base_prior.get(z, 1e-9)) for z in zone_list])

    history = [{"stage": "T0_prior", "top_zone": None,
                "confidence": float(round(_softmax(log_post, T).max() * 100, 1))}]
    registry_signals = []

    # ── Sequential + M8 update per hop ───────────────────────────────────────
    for i, txn in enumerate(context.observed_transactions):
        dest_id = txn.destination_entity.entity_id if txn.destination_entity else None
        if not dest_id:
            continue

        # Sequential log-likelihood update
        lh = np.array([np.log(mule_zone_lhoods.get(z, {}).get(dest_id, 0.01))
                       for z in zone_list])
        log_post += lh

        # M8 registry reliability update
        reg_entry = registry.get(dest_id, {})
        n_a       = reg_entry.get("historical_sightings", 0)
        in_reg    = dest_id in registry

        if in_reg and n_a > 0:
            zone_counts = reg_entry.get("zone_counts", {})
            q_a = np.array([
                (zone_counts.get(z, 0) + M8_LAMBDA * global_prior.get(z, 1e-6)) /
                (n_a + M8_LAMBDA)
                for z in zone_list
            ])
            log_q_a = np.log(q_a + 1e-12)

            probs_arr = q_a / (q_a.sum() + 1e-12)
            entropy   = float(-np.sum(probs_arr * np.log2(probs_arr + 1e-12)))
            norm_ent  = entropy / np.log2(len(zone_list)) if len(zone_list) > 1 else 0.0
            strength  = n_a / (n_a + M8_K)
            reliability = strength * (1.0 - norm_ent)

            log_post += M8_W_REL * reliability * (log_q_a - global_log_prior)
        else:
            reliability = 0.0

        probs_snap = _softmax(log_post, T)
        top_idx    = int(np.argmax(probs_snap))
        history.append({
            "stage":      f"HOP_{i+1}",
            "top_zone":   zone_list[top_idx],
            "confidence": float(round(probs_snap[top_idx] * 100, 1)),
        })
        registry_signals.append({
            "hop":                    i + 1,
            "destination_account":   dest_id,
            "historical_sightings":  n_a,
            "reliability":           round(float(reliability), 4),
            "in_registry":           in_reg,
        })

    # ── Final calibrated distribution ────────────────────────────────────────
    final_probs = _softmax(log_post, T)
    sorted_idx  = np.argsort(final_probs)[::-1]

    def _zone_meta(zid):
        row = zones_df[zones_df["zone_id"] == zid]
        if not row.empty:
            r = row.iloc[0]
            return {
                "zone_name": str(r.get("zone_name", zid)),
                "locality":  str(r.get("locality", "")),
                "city":      str(r.get("city", "")),
                "district":  str(r.get("district", "")),
                "state":     str(r.get("state", "")),
                "lat":       float(r.get("lat", 0.0)),
                "lng":       float(r.get("lng", 0.0)),
            }
        return {"zone_name": zid, "locality": "", "city": "", "district": "",
                "state": "", "lat": 0.0, "lng": 0.0}

    ranked_zones = []
    for rank, idx in enumerate(sorted_idx[:M8_TOP_K], start=1):
        zid  = zone_list[idx]
        meta = _zone_meta(zid)
        ranked_zones.append({
            "rank":        rank,
            "zone_id":     zid,
            "zone_name":   meta["zone_name"],
            "locality":    meta["locality"],
            "city":        meta["city"],
            "district":    meta["district"],
            "state":       meta["state"],
            "lat":         meta["lat"],
            "lng":         meta["lng"],
            "probability": float(round(final_probs[idx], 6)),
        })

    top_idx_final = sorted_idx[0]
    top_zone      = zone_list[top_idx_final]
    top_conf_pct  = float(round(final_probs[top_idx_final] * 100, 1))

    # Update T0_prior entry with top zone
    if history:
        t0_probs = _softmax(
            np.array([np.log(base_prior.get(z, 1e-9)) for z in zone_list]), T)
        history[0]["top_zone"] = zone_list[int(np.argmax(t0_probs))]
        history[0]["confidence"] = float(round(t0_probs.max() * 100, 1))

    return {
        "case_id":                   context.case_id,
        "prediction_time":           context.prediction_time.isoformat(),
        "predicted_destination_zone": top_zone,
        "confidence_score":          top_conf_pct,
        "calibrated_confidence":     float(round(final_probs[top_idx_final], 4)),
        "ranked_zones":              ranked_zones,
        "registry_signals":          registry_signals,
        "prediction_history":        history,
        "model_version":             "M8_Geographic_V2",
        "m8_config": {
            "lambda": M8_LAMBDA, "k": M8_K,
            "w_rel": M8_W_REL, "temperature": T,
        },
    }
