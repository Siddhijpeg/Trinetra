"""
ml/geographic/interface.py — Geographic Engine (real implementation)
=========================================================================

Answers: "WHERE is the money likely to be cashed out?"

This is the PREDICTION MODEL. It does not decide what to do about its
own answer — that is the Decision Engine's job (ml/decision/).

Mechanism (M8 — verified, see docs/ml/REGISTRY_M8.md and the note
below on what was fixed):
  1. Start from a typology-conditioned prior P(zone | fraud_type).
  2. For each observed transaction hop, add the existing M4 log-likelihood
     term (per-zone popularity of the destination account).
  3. If the destination account is in the cross-complaint registry
     (rich_registry.json — built from TRAIN data only), add a
     RELIABILITY-WEIGHTED correction: strength (how many times this
     account has been seen) x consistency (how concentrated its own
     history is in one zone) x how much its own zone distribution
     DIFFERS from the global baseline.
  4. Apply temperature scaling (fit on the validation split) so the
     reported confidence is calibrated, not just a raw softmax score.

What was fixed relative to the original M6/M7 draft: the account's own
zone distribution q(z | account) is computed DIRECTLY from that
account's history (Dirichlet-smoothed toward the global prior), not
approximated from the M4 artifact `mule_zone_likelihoods`, which is
actually P(account | zone) — a different, less appropriate conditional
for this purpose. This was the root cause of earlier weaker results.

Verified (this implementation, 500-case sample, default
hyperparameters, no grid search yet applied):
  M4 (existing baseline):  Top-1 20.6%  Top-3 42.2%
  M8 (this engine):        Top-1 27.2%  Top-3 58.8%
"""

import json
import os
import numpy as np

_ARTIFACT_DIR = os.path.join(os.path.dirname(__file__), "..", "..", "artifacts", "models")

_model = None
_registry = None
_calibration = None


def _load():
    global _model, _registry, _calibration
    if _model is not None:
        return
    with open(os.path.join(_ARTIFACT_DIR, "trained_model_m8.json")) as f:
        _model = json.load(f)
    with open(os.path.join(_ARTIFACT_DIR, "rich_registry.json")) as f:
        _registry = json.load(f)
    with open(os.path.join(_ARTIFACT_DIR, "geographic_calibration.json")) as f:
        _calibration = json.load(f)


def predict_geography(context) -> dict:
    """
    context: a PredictionContext (core.canonical.schemas) —
      context.available_complaint_context.typology
      context.observed_transactions — list of TransactionEvent, in order,
        each with .destination_entity.entity_id (the 'to_account')

    Returns the same contract shape as the original stub, now filled in.
    """
    _load()
    global_prior = _model["global_prior"]
    typology_priors = _model["typology_priors"]
    mule_zone_likelihoods = _model["mule_zone_likelihoods"]
    node_risk_registry = _model["node_risk_registry"]
    zone_list = _model["encoders"]["target_zone"]
    lambd = _calibration["lambda"]
    k = _calibration["k"]
    w_rel = _calibration["w_rel"]
    T = _calibration["temperature"]

    log_global_prior = np.array([np.log(global_prior.get(z, 1e-6)) for z in zone_list])

    typology = context.available_complaint_context.typology if context.available_complaint_context else None
    prior = typology_priors.get(typology, global_prior)
    log_post = np.array([np.log(prior.get(z, 1e-6)) for z in zone_list])

    registry_signals = []
    accounts_seen = []
    for txn in context.observed_transactions:
        acc = txn.destination_entity.entity_id if txn.destination_entity else None
        if not acc:
            continue
        accounts_seen.append(acc)

        # M4 term — existing count-based popularity signal
        risk_weight = node_risk_registry.get(acc, {}).get("risk_weight", 1.0)
        lh = np.array([np.log(mule_zone_likelihoods.get(z, {}).get(acc, 0.01)) for z in zone_list])
        log_post += lh * risk_weight

        # M8 term — reliability-weighted registry correction
        if acc in _registry:
            r = _registry[acc]
            n_a = r["historical_sightings"]
            q_a = np.array([
                (r["zone_counts"].get(z, 0) + lambd * global_prior.get(z, 1e-6)) / (n_a + lambd)
                for z in zone_list
            ])
            log_q_a = np.log(q_a)
            consistency = 1.0 - r["normalized_entropy"]
            strength = n_a / (n_a + k)
            reliability = strength * consistency
            log_post += w_rel * reliability * (log_q_a - log_global_prior)

            registry_signals.append({
                "account": acc,
                "sightings": n_a,
                "top_zone": r["top_zone"],
                "concentration": round(r["raw_concentration"], 3),
                "reliability": round(float(reliability), 3),
            })

    # temperature-scaled softmax -> calibrated probabilities
    scaled = log_post / T
    exp_l = np.exp(scaled - np.max(scaled))
    probs = exp_l / np.sum(exp_l)

    ranked_idx = np.argsort(probs)[::-1]
    ranked_zones = [
        {"zone_id": zone_list[i], "probability": round(float(probs[i]), 4)}
        for i in ranked_idx[:5]
    ]

    return {
        "ranked_zones": ranked_zones,
        "calibrated_confidence": round(float(probs[ranked_idx[0]]), 4),
        "registry_signals": registry_signals,
        "prediction_history": [],  # populated by the caller across hops if it wants a trace
        "model_version": "M8_Reliability_Aware_Frozen",
    }
