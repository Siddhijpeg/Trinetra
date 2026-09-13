"""
TRINETRA — Time-to-Event Engine Public Interface
=================================================

Public API:
    estimate_intervention_window(prediction_context, sla_minutes=None)

Wraps the Dynamic Hazard, AFT, and Quantile models trained on the canonical
feature representation. Caller has no knowledge of model paths or internals.

Prototype Status: SYNTHETICALLY_VALIDATED_TIME_TO_EVENT_ENGINE
"""
import os
import pickle
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional
from core.canonical.schemas import PredictionContext
from ml.timing.feature_builder import TimeToEventFeatureBuilder

# Feature column order — must match training
FEATURE_COLS = [
    "hop_count", "cumulative_amount", "current_txn_amount",
    "elapsed_since_first_txn", "elapsed_since_prev_txn",
    "prediction_hour", "prediction_dayofweek",
    "has_complaint", "elapsed_since_incident", "amount_retained_ratio",
    "to_account_historical_flags", "registry_flagged_entity", "m8_reliability",
]

_hazard_model  = None
_aft_model     = None
_quantile_model = None

def _load_models():
    global _hazard_model, _aft_model, _quantile_model
    artifacts_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../artifacts/models/timing'))
    with open(os.path.join(artifacts_dir, "dynamic_hazard.pkl"), "rb") as f:
        _hazard_model = pickle.load(f)
    with open(os.path.join(artifacts_dir, "aft_model.pkl"), "rb") as f:
        _aft_model = pickle.load(f)
    with open(os.path.join(artifacts_dir, "quantile_model.pkl"), "rb") as f:
        _quantile_model = pickle.load(f)


def estimate_intervention_window(
    context: PredictionContext,
    sla_minutes: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Primary public interface to the TRINETRA Time-to-Event Engine.

    Architecture:
        PredictionContext
            ↓
        TimeToEventFeatureBuilder  (schema-safe, leakage-free)
            ↓
        Dynamic Hazard  →  Survival Curve S(t)  →  P25/P50/P75
        AFT             →  Expected time (companion)
        Quantile        →  P25/P50/P75 (companion)
            ↓
        Intervention Distribution + Uncertainty

    The current implementation is:
        SYNTHETICALLY_VALIDATED_TIME_TO_EVENT_ENGINE
    """
    if _hazard_model is None:
        _load_models()

    feat_builder = TimeToEventFeatureBuilder()
    features = feat_builder.build_features(context)

    # Align to training column order, fill zeros for missing optional features
    row = {col: features.get(col, 0.0) for col in FEATURE_COLS}
    X = pd.DataFrame([row])[FEATURE_COLS]

    # 1. Primary: Dynamic Hazard → Survival Curve
    surv_curves = _hazard_model.predict_survival_curve(X)
    surv_curve  = surv_curves[0]
    primary_q   = _hazard_model.predict_quantiles_from_curve(surv_curve)

    # SLA probability (only if requested)
    sla_result = None
    if sla_minutes is not None:
        prob_beyond = surv_curve[-1]["probability_remaining"]
        for pt in surv_curve:
            if pt["minutes"] >= sla_minutes:
                prob_beyond = pt["probability_remaining"]
                break
        sla_result = {
            "sla_minutes": sla_minutes,
            "probability_remaining_beyond_sla": float(round(prob_beyond, 4)),
        }

    # 2. Companion: AFT point estimate
    aft_pred = float(_aft_model.predict(X)[0])

    # 3. Companion: Direct quantile estimates
    q_preds = _quantile_model.predict(X)
    direct_q = {
        f"p{int(q*100)}_minutes": float(round(q_preds[q][0], 1))
        for q in sorted(q_preds.keys())
    }

    # 4. Uncertainty: hazard quantile spread
    uncertainty = {
        "lower_minutes": float(round(primary_q["p25_minutes"], 1)),
        "upper_minutes": float(round(primary_q["p75_minutes"], 1)),
        "method": "Hazard Survival Curve Quantile Interval [P25, P75]",
    }

    # Collect which capabilities were used
    caps_used = [f for f in FEATURE_COLS if row.get(f, 0.0) != 0.0]

    result = {
        "case_id": context.case_id,
        "prediction_time": context.prediction_time.isoformat(),
        "intervention_distribution": {
            "survival_curve": surv_curve,
            "p25_minutes": float(round(primary_q["p25_minutes"], 1)),
            "p50_minutes": float(round(primary_q["p50_minutes"], 1)),
            "p75_minutes": float(round(primary_q["p75_minutes"], 1)),
        },
        "uncertainty": uncertainty,
        "companion_estimates": {
            "aft": {"expected_minutes": float(round(aft_pred, 1))},
            "direct_quantiles": direct_q,
        },
        "model_version": "Time-to-Event v1.0 (Dynamic Hazard + AFT + Quantile)",
        "data_capabilities_used": caps_used,
        "prototype_status": "SYNTHETICALLY_VALIDATED_TIME_TO_EVENT_ENGINE",
    }
    if sla_result:
        result["operational_sla"] = sla_result

    return result
