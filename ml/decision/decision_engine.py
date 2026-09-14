"""
ml/decision/decision_engine.py — Decision Engine (real implementation)
===========================================================================

Answers: "GIVEN the geographic prediction and the time remaining, WHAT
should the system do?"

This is NOT the prediction model. It consumes the outputs of:
  - ml/geographic/interface.py  -> predict_geography()   ("WHERE")
  - ml/timing/interface.py      -> estimate_intervention_window()  ("WHEN")

...and produces an action tier:
  CRITICAL_ALERT — confident AND time-sensitive -> auto-alert bank/LEA now
  REVIEW         — moderate on either axis -> route to a human analyst
  MONITOR        — low confidence or window likely closed -> log only

Two principles this module deliberately keeps separate (per
ml/decision/README.md's original design note, now implemented):
  - registry reliability != prediction confidence: a known mule
    increases trust in the prediction, but the calibrated_confidence
    from the geographic engine already accounts for that — this module
    does not re-weight by registry signals a second time.
  - recoverability != urgency: they are evaluated on independent axes
    and combined only at the final routing step, never conflated into
    a single blended score beforehand.

Thresholds are NOT hardcoded guesses — they are percentiles of what's
actually achievable, fit on the validation split (see
artifacts/models/decision_thresholds.json). An earlier attempt with
fixed thresholds (e.g. confidence >= 0.5) routed almost nothing to
CRITICAL_ALERT, because with dozens of zones and ~20-27% overall
accuracy, a raw 50% confidence is rarely reached — the threshold has to
reflect what the system can actually produce, not an arbitrary bar.
"""

import json
import os

from ml.geographic.interface import predict_geography
from ml.timing.interface import estimate_intervention_window

_THRESHOLDS_PATH = os.path.join(
    os.path.dirname(__file__), "..", "..", "artifacts", "models", "decision_thresholds.json"
)

_thresholds = None


def _load_thresholds():
    global _thresholds
    if _thresholds is not None:
        return _thresholds
    with open(_THRESHOLDS_PATH) as f:
        _thresholds = json.load(f)
    return _thresholds


def decide(context) -> dict:
    """
    Runs both engines against the same context and routes the case.

    Returns:
      {
        "tier": "CRITICAL_ALERT" | "REVIEW" | "MONITOR",
        "geographic": <predict_geography() output>,
        "timing": <estimate_intervention_window() output>,
        "reasoning": [str, ...]   # short, human-readable justification
      }
    """
    th = _load_thresholds()

    geo = predict_geography(context)
    timing = estimate_intervention_window(context)

    confidence = geo["calibrated_confidence"]
    # recoverability at 30 minutes is used as the single recoverability
    # scalar for tier routing — it's the window most SLAs care about;
    # the full curve (15/30/60m + quantiles) is still returned to the
    # caller for display.
    recoverability = timing["survival_probability_30m"]

    reasoning = []

    if confidence >= th["conf_high"] and recoverability >= th["recov_high"]:
        tier = "CRITICAL_ALERT"
        reasoning.append(
            f"Confidence {confidence:.0%} >= high bar ({th['conf_high']:.0%}) "
            f"and recoverability {recoverability:.0%} >= high bar ({th['recov_high']:.0%})."
        )
    elif confidence >= th["conf_med"] or recoverability >= th["recov_med"]:
        tier = "REVIEW"
        reasoning.append(
            f"Confidence {confidence:.0%} or recoverability {recoverability:.0%} "
            f"cleared the medium bar, but not both at the high bar — routed to a human analyst."
        )
    else:
        tier = "MONITOR"
        reasoning.append(
            f"Confidence {confidence:.0%} and recoverability {recoverability:.0%} "
            f"are both low — logged for pattern-tracking, no active alert."
        )

    if geo["registry_signals"]:
        top_signal = max(geo["registry_signals"], key=lambda s: s["reliability"])
        reasoning.append(
            f"Account {top_signal['account']} is registry-flagged "
            f"({top_signal['sightings']} prior sightings, "
            f"{top_signal['concentration']:.0%} concentrated in {top_signal['top_zone']})."
        )

    if timing["urgency"] == "HIGH":
        reasoning.append("Intervention window is likely closing — time-sensitive.")

    return {
        "tier": tier,
        "geographic": geo,
        "timing": timing,
        "reasoning": reasoning,
    }
