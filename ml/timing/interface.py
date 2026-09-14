"""
ml/timing/interface.py — Time-to-Event Engine (real implementation)
========================================================================

Answers: "HOW MUCH TIME is realistically left to act?"

Design choice — why this is a simple empirical survival curve, not the
XGBoost regressor (R2) that also exists in this folder:

recoverability_models.py already ran the honest experiment: R0 (global
median) vs R1 (median by hop count) vs R2 (XGBoost on case + registry
features). Result: R2's MAE (33.9 min) barely beat R0's (33.7 min) on
the test set — the extra model complexity bought almost nothing. This
implementation independently confirms why: median time-to-cash-out is
43-45 minutes across EVERY fraud typology in this dataset — there just
isn't much case-level variance for a model to find yet. Shipping the
simpler, fully-explainable model when the complex one has no measured
advantage is the honest choice, not a shortcut.

If real data later shows genuine typology/case-level variance in
cash-out timing, R2's machinery in recoverability_models.py is already
there to revisit.

Mechanism: for each fraud typology, an empirical survival curve is
built from the TRAIN split — "of all past cases of this typology, what
fraction were STILL not cashed out after T minutes." At prediction
time, given elapsed minutes since the incident, this curve gives
P(window still open).
"""

import json
import os
import numpy as np

_ARTIFACT_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "artifacts", "models", "recoverability_curves.json"
)

_curves = None


def _load():
    global _curves
    if _curves is not None:
        return
    with open(_ARTIFACT_PATH) as f:
        raw = json.load(f)
    _curves = {k: np.array(v) for k, v in raw.items()}


def estimate_intervention_window(context) -> dict:
    """
    context: a PredictionContext —
      context.prediction_time
      context.available_complaint_context.typology
      context.available_complaint_context.event_time  (incident time)
    """
    _load()
    typology = None
    incident_time = None
    if context.available_complaint_context:
        typology = context.available_complaint_context.typology
        incident_time = context.available_complaint_context.event_time

    curve = _curves.get(typology, _curves["__global__"])

    if incident_time is None:
        elapsed_min = 0.0
    else:
        elapsed_min = max(0.0, (context.prediction_time - incident_time).total_seconds() / 60.0)

    def survival_prob(t):
        return float(np.sum(curve > t) / len(curve))

    def quantile(q):
        return float(np.percentile(curve, q * 100))

    p15 = survival_prob(15)
    p30 = survival_prob(30)
    p60 = survival_prob(60)
    median_remaining = max(0.0, quantile(0.5) - elapsed_min)

    if p30 >= 0.6:
        band, urgency = "OPEN", "LOW"
    elif p30 >= 0.3:
        band, urgency = "CLOSING", "MEDIUM"
    else:
        band, urgency = "LIKELY_CLOSED", "HIGH"

    return {
        "estimated_median_minutes": round(median_remaining, 1),
        "p25_minutes": round(max(0.0, quantile(0.25) - elapsed_min), 1),
        "p75_minutes": round(max(0.0, quantile(0.75) - elapsed_min), 1),
        "survival_probability_15m": round(p15, 3),
        "survival_probability_30m": round(p30, 3),
        "survival_probability_60m": round(p60, 3),
        "recoverability_band": band,
        "urgency": urgency,
        "model_version": "TypologySurvivalCurve_v1",
    }
