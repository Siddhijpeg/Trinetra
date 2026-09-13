"""
TRINETRA — Geographic Prediction Interface (M8 Reliability-Aware Registry)
============================================================================

Public API: predict_geography(context: PredictionContext) -> Dict[str, Any]

Implements the Sequential Bayesian + M8 evidence update:
    log-posterior += log-likelihood × reliability_weight

Frozen parameters:
    lambda = 0.5  (registry blend weight)
    k      = 5.0  (reliability scaling)
    w_rel  = 2.0  (reliability weighting exponent)
    T      = 5.17 (temperature for probability calibration)
"""
import os
import json
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional
from core.canonical.schemas import PredictionContext

# ── Frozen M8 config (DO NOT CHANGE without re-evaluation) ───────────────────
M8_LAMBDA  = 0.5
M8_K       = 5.0
M8_W_REL   = 2.0
M8_TEMP    = 5.17
M8_TOP_K   = 10   # zones to return in the ranked list

# ── Model loading (lazy, singleton) ──────────────────────────────────────────
_m8_artifacts = None
_rich_registry = None
_zones_df      = None

def _load_m8():
    global _m8_artifacts, _rich_registry, _zones_df
    root = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../'))
    with open(os.path.join(root, "artifacts/models/trained_model_m8.json")) as f:
        _m8_artifacts = json.load(f)
    with open(os.path.join(root, "artifacts/models/rich_registry.json")) as f:
        _rich_registry = json.load(f)
    _zones_df = pd.read_csv(os.path.join(root, "data/synthetic/zones.csv"))

def _get_artifacts():
    if _m8_artifacts is None:
        _load_m8()
    return _m8_artifacts, _rich_registry, _zones_df

# ── Temperature-scaled softmax ────────────────────────────────────────────────
def _softmax_temp(logits: np.ndarray, T: float) -> np.ndarray:
    scaled = logits / T
    scaled -= np.max(scaled)   # numerical stability
    exp_l = np.exp(scaled)
    return exp_l / (np.sum(exp_l) + 1e-12)

# ── Core prediction logic ─────────────────────────────────────────────────────
def predict_geography(context: PredictionContext) -> Dict[str, Any]:
    """
    Geographic prediction using the frozen M8 Reliability-Aware Registry.

    Takes a canonical PredictionContext and returns:
    - ranked zones with calibrated probabilities
    - registry signals per hop
    - update history (prediction_history) per snapshot
    """
    artifacts, registry, zones_df = _get_artifacts()

    global_prior       = artifacts["global_prior"]
    typology_priors    = artifacts["typology_priors"]
    mule_zone_lhoods   = artifacts["mule_zone_likelihoods"]
    node_risk_registry = artifacts["node_risk_registry"]
    zone_list          = artifacts["encoders"]["target_zone"]

    # ── Typology-conditioned base prior ──────────────────────────────────────
    typology = None
    if context.available_complaint_context:
        typology = context.available_complaint_context.typology

    base_prior = typology_priors.get(typology, global_prior) if typology else global_prior
    log_post = np.array([np.log(base_prior.get(z, 1e-9)) for z in zone_list])

    history = [{"stage": "T0_prior", "probabilities": _softmax_temp(log_post, M8_TEMP).tolist()}]
    registry_signals = []

    # ── Sequential M8 update per observed hop ───────────────────────────────
    for i, txn in enumerate(context.observed_transactions):
        dest_id = None
        if txn.destination_entity:
            dest_id = txn.destination_entity.entity_id

        if not dest_id:
            continue

        # Registry evidence
        reg_entry = registry.get(dest_id, {})
        historical_sightings = reg_entry.get("historical_sightings", 0)

        # Reliability weight (M8 formula): w_rel / (1 + exp(-k*(λ - threshold)))
        # Simplified: linearly scaled by normalized sightings with M8 blend
        raw_rel = historical_sightings / max(historical_sightings + 1, 1)
        reliability = M8_W_REL * (M8_LAMBDA + (1 - M8_LAMBDA) * raw_rel)

        # Log-likelihood from mule-zone mapping
        lh_array = np.array([
            np.log(mule_zone_lhoods.get(z, {}).get(dest_id, 0.01))
            for z in zone_list
        ])

        # M8 update: multiply log-likelihood by reliability weight
        log_post += lh_array * reliability

        signal = {
            "hop": i + 1,
            "destination_account": dest_id,
            "historical_sightings": historical_sightings,
            "reliability": round(float(reliability), 4),
            "in_registry": dest_id in registry,
        }
        registry_signals.append(signal)

        probs_snapshot = _softmax_temp(log_post, M8_TEMP)
        history.append({
            "stage": f"HOP_{i+1}",
            "probabilities": probs_snapshot.tolist(),
        })

    # ── Final calibrated distribution ─────────────────────────────────────────
    final_probs = _softmax_temp(log_post, M8_TEMP)
    sorted_idx  = np.argsort(final_probs)[::-1]

    def _zone_meta(z_id):
        row = zones_df[zones_df["zone_id"] == z_id]
        if not row.empty:
            r = row.iloc[0]
            return {"zone_name": str(r["zone_name"]), "state": str(r["state"]),
                    "lat": float(r["lat"]), "lng": float(r["lng"])}
        return {"zone_name": z_id, "state": "Unknown", "lat": 0.0, "lng": 0.0}

    ranked_zones = []
    for rank, idx in enumerate(sorted_idx[:M8_TOP_K], start=1):
        z_id = zone_list[idx]
        meta = _zone_meta(z_id)
        ranked_zones.append({
            "rank": rank,
            "zone_id": z_id,
            "district": meta["zone_name"],
            "state": meta["state"],
            "lat": meta["lat"],
            "lng": meta["lng"],
            "probability": float(round(final_probs[idx], 6)),
        })

    return {
        "case_id": context.case_id,
        "prediction_time": context.prediction_time.isoformat(),
        "ranked_zones": ranked_zones,
        "calibrated_confidence": float(round(float(final_probs[sorted_idx[0]]), 4)),
        "registry_signals": registry_signals,
        "prediction_history": history,
        "model_version": "M8_Reliability_Aware_Frozen",
        "m8_config": {
            "lambda": M8_LAMBDA,
            "k": M8_K,
            "w_rel": M8_W_REL,
            "temperature": M8_TEMP,
        }
    }
