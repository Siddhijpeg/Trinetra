"""
TRINETRA — Time-to-Event Engine V2 Public Interface
=====================================================
Drop-in V2 replacement for ml/timing/interface.py.
Loads artifacts from artifacts/models/timing_v2/.

API is identical to interface.py so the backend requires no contract changes.
"""

import os, pickle
import numpy as np
import pandas as pd
from typing import Dict, Any, Optional
from core.canonical.schemas import PredictionContext
from ml.timing.feature_builder import TimeToEventFeatureBuilder

FEATURE_COLS = [
    "hop_count", "cumulative_amount", "current_txn_amount",
    "elapsed_since_first_txn", "elapsed_since_prev_txn",
    "prediction_hour", "prediction_dayofweek",
    "has_complaint", "elapsed_since_incident", "amount_retained_ratio",
]

ROOT      = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../"))
ART_DIR   = os.path.join(ROOT, "artifacts/models/timing_v2")

_hazard_model  = None
_aft_model     = None
_quantile_model = None


def _load_models():
    global _hazard_model, _aft_model, _quantile_model
    with open(os.path.join(ART_DIR, "dynamic_hazard.pkl"), "rb") as f:
        _hazard_model = pickle.load(f)
    with open(os.path.join(ART_DIR, "aft_model.pkl"), "rb") as f:
        _aft_model = pickle.load(f)
    with open(os.path.join(ART_DIR, "quantile_model.pkl"), "rb") as f:
        _quantile_model = pickle.load(f)


def estimate_intervention_window(
    context: PredictionContext,
    sla_minutes: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Time-to-Event prediction using V2 trained models.
    Identical return contract to interface.py (V1).
    """
    if _hazard_model is None:
        _load_models()

    fb       = TimeToEventFeatureBuilder()
    features = fb.build_features(context)
    row      = {col: features.get(col, 0.0) for col in FEATURE_COLS}
    X        = pd.DataFrame([row])[FEATURE_COLS]

    # 1. Primary: Dynamic Hazard → Survival Curve
    surv_curves = _hazard_model.predict_survival_curve(X)
    surv_curve  = surv_curves[0]
    primary_q   = _hazard_model.predict_quantiles_from_curve(surv_curve)

    # SLA probability
    sla_result = None
    if sla_minutes is not None:
        prob_beyond = float(surv_curve[-1]["probability_remaining"])
        for pt in surv_curve:
            if pt["minutes"] >= sla_minutes:
                prob_beyond = float(pt["probability_remaining"])
                break
        sla_result = {
            "sla_minutes": sla_minutes,
            "probability_remaining_beyond_sla": float(round(prob_beyond, 4)),
        }

    # 2. AFT companion
    aft_pred = float(_aft_model.predict(X)[0])

    # 3. Direct quantile companion
    q_preds  = _quantile_model.predict(X)
    direct_q = {f"p{int(q*100)}_minutes": float(round(q_preds[q][0], 1))
                for q in sorted(q_preds.keys())}

    uncertainty = {
        "lower_minutes": float(round(primary_q["p25_minutes"], 1)),
        "upper_minutes": float(round(primary_q["p75_minutes"], 1)),
        "method": "Hazard Survival Curve Quantile Interval [P25, P75]",
    }

    result = {
        "case_id":          context.case_id,
        "prediction_time":  context.prediction_time.isoformat(),
        "intervention_distribution": {
            "survival_curve":  surv_curve,
            "p25_minutes":     float(round(primary_q["p25_minutes"], 1)),
            "p50_minutes":     float(round(primary_q["p50_minutes"], 1)),
            "p75_minutes":     float(round(primary_q["p75_minutes"], 1)),
        },
        "uncertainty":       uncertainty,
        "companion_estimates": {
            "aft": {"expected_minutes": float(round(aft_pred, 1))},
            "direct_quantiles": direct_q,
        },
        "model_version": "Time-to-Event v2.0 (Dynamic Hazard + AFT + Quantile, V2 Dataset)",
    }
    if sla_result:
        result["operational_sla"] = sla_result
    return result
