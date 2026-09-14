"""
TRINETRA Prediction Service — V2
==================================
Uses Geographic Engine V2 + Time-to-Event Engine V2 + Decision Engine.

Backward-compatible with prediction_service.py response contract.
Routes to V2 model interfaces by default.

Usage:
    from backend.services.prediction_service_v2 import run_prediction_v2
"""

import os, sys, logging
from datetime import datetime
from typing import Optional, Dict, Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

from core.canonical.schemas import PredictionContext
from core.canonical.events import TransactionEvent, ComplaintEvent
from core.canonical.entities import EntityReference

from ml.geographic.interface_v2 import predict_geography
from ml.timing.interface_v2 import estimate_intervention_window
from ml.decision.engine import evaluate_decision
from backend.services.financial_exposure import calculate_financial_exposure

logger = logging.getLogger(__name__)


def build_context_from_payload(payload: Dict[str, Any]) -> PredictionContext:
    """
    Identical to prediction_service.py — builds PredictionContext from API payload.
    """
    prediction_time = datetime.fromisoformat(payload["prediction_time"])
    case_id         = payload["case_id"]

    transactions = []
    for h in payload.get("hops", []):
        dest = EntityReference(entity_id=h["destination_account"], entity_type="ACCOUNT") \
               if h.get("destination_account") else None
        transactions.append(TransactionEvent(
            event_id=h.get("hop_id", f"HOP_{case_id}"),
            case_id=case_id,
            event_time=datetime.fromisoformat(h["event_time"]),
            available_time=datetime.fromisoformat(h.get("available_time") or h["event_time"]),
            source=h.get("source", "api"),
            amount=float(h.get("amount", 0.0)),
            destination_entity=dest,
            channel=h.get("channel"),
            institution=h.get("institution"),
        ))

    complaint = None
    if payload.get("complaint"):
        c = payload["complaint"]
        complaint = ComplaintEvent(
            event_id=c.get("complaint_id", case_id),
            case_id=case_id,
            event_time=datetime.fromisoformat(c["incident_time"]),
            available_time=datetime.fromisoformat(c.get("available_time") or c["incident_time"]),
            source=c.get("source", "api"),
            typology=c.get("typology_id"),
            victim_context=c.get("victim_context", {}),
            metadata={"amount_inr": float(c.get("amount_inr", 0.0))},
        )

    return PredictionContext(
        case_id=case_id,
        prediction_time=prediction_time,
        observed_transactions=transactions,
        available_complaint_context=complaint,
    )


def run_prediction_v2(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Full V2 TRINETRA prediction pipeline:
      1. Build canonical PredictionContext
      2. Geographic Engine V2 (M8 + V2 zone catalog)
      3. Time-to-Event Engine V2 (Hazard + AFT + Quantile)
      4. Financial Exposure
      5. Decision Engine (transparent policy fusion)
      6. Return unified response

    Input contract: same as prediction_service.run_prediction()
    Output contract: superset of V1 (adds decision fields, V2 zone metadata)
    """
    context     = build_context_from_payload(payload)
    sla_minutes = payload.get("sla_minutes")

    # ── 1. Geographic V2 ──────────────────────────────────────────────────────
    try:
        geo_result = predict_geography(context)
    except Exception as e:
        logger.error(f"Geographic V2 error for {context.case_id}: {e}")
        geo_result = {
            "status":                    "error",
            "error_message":             str(e),
            "predicted_destination_zone": None,
            "confidence_score":          0.0,
            "ranked_zones":              [],
            "registry_signals":          [],
        }

    # ── 2. Time-to-Event V2 ───────────────────────────────────────────────────
    try:
        timing_result = estimate_intervention_window(context, sla_minutes=sla_minutes)
    except Exception as e:
        logger.error(f"Timing V2 error for {context.case_id}: {e}")
        timing_result = {
            "status":                "error",
            "error_message":         str(e),
            "intervention_distribution": {
                "survival_curve": [],
                "p25_minutes": 0.0,
                "p50_minutes": 0.0,
                "p75_minutes": 0.0,
            },
        }

    # ── 3. Financial exposure ─────────────────────────────────────────────────
    fin_result = calculate_financial_exposure(context)

    # ── 4. Decision Engine ────────────────────────────────────────────────────
    try:
        decision_result = evaluate_decision(
            geo_result=geo_result,
            timing_result=timing_result,
            fin_result=fin_result,
            sla_minutes=sla_minutes,
        )
    except Exception as e:
        logger.error(f"Decision Engine error for {context.case_id}: {e}")
        decision_result = {
            "decision":            "REVIEW",
            "decision_confidence": 0.0,
            "reasons":             [f"Decision engine error: {e}"],
            "rule_engine_version": "Deterministic Policy v2.0 (error fallback)",
        }

    return {
        "case_id":          context.case_id,
        "prediction_time":  context.prediction_time.isoformat(),
        "geographic":       geo_result,
        "timing":           timing_result,
        "financial_exposure": fin_result,
        "decision":         decision_result,
        "system": {
            "prototype": True,
            "dataset_version": "v2",
            "model_versions": {
                "geographic": geo_result.get("model_version", "M8_Geographic_V2"),
                "timing":     timing_result.get("model_version", "Time-to-Event v2.0"),
                "decision":   decision_result.get("rule_engine_version", "Deterministic Policy v2.0"),
            },
        },
    }
