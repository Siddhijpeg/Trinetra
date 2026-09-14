"""
TRINETRA Prediction Service
============================
Coordinates Geographic (M8), Time-to-Event, Financial Exposure, and Decision Engines.
Public API: run_prediction(payload)
"""
import os
import sys
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from core.canonical.schemas import PredictionContext
from core.canonical.events import TransactionEvent, ComplaintEvent
from core.canonical.entities import EntityReference

from ml.geographic.interface import predict_geography
from ml.timing.interface import estimate_intervention_window
from backend.services.financial_exposure import calculate_financial_exposure
from backend.services.decision_engine import evaluate_decision

logger = logging.getLogger(__name__)


def build_context_from_payload(payload: Dict[str, Any]) -> PredictionContext:
    """
    Converts a clean API payload dict into a canonical PredictionContext.
    The caller never knows about CSV internals or model paths.
    """
    prediction_time = datetime.fromisoformat(payload["prediction_time"])
    case_id = payload["case_id"]

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


def run_prediction(payload: Dict[str, Any]) -> Dict[str, Any]:
    """
    Executes the full TRINETRA prediction pipeline.

    1. Build canonical PredictionContext
    2. Invoke Geographic M8 engine
    3. Invoke Time-to-Event Engine
    4. Calculate Financial Exposure
    5. Evaluate Decision Engine priority & actions
    6. Return unified prototype JSON response
    """
    context = build_context_from_payload(payload)
    sla_minutes = payload.get("sla_minutes")

    # 1. Geographic prediction with error handling
    try:
        geo_result = predict_geography(context)
    except Exception as e:
        logger.error(f"Geographic prediction error for {context.case_id}: {e}")
        geo_result = {
            "status": "error",
            "error_message": str(e),
            "predicted_destination_zone": None,
            "confidence_score": 0.0,
        }

    # 2. Time-to-Event prediction with error handling
    try:
        timing_result = estimate_intervention_window(context, sla_minutes=sla_minutes)
    except Exception as e:
        logger.error(f"Timing prediction error for {context.case_id}: {e}")
        timing_result = {
            "status": "error",
            "error_message": str(e),
            "intervention_distribution": {
                "survival_curve": [],
                "p25_minutes": 0.0,
                "p50_minutes": 0.0,
                "p75_minutes": 0.0,
            },
        }

    # 3. Financial Exposure
    fin_result = calculate_financial_exposure(context)

    # 4. Decision Engine
    decision_result = evaluate_decision(
        geo_result=geo_result,
        timing_result=timing_result,
        fin_result=fin_result,
        sla_minutes=sla_minutes,
    )

    return {
        "case_id": context.case_id,
        "prediction_time": context.prediction_time.isoformat(),
        "geographic": geo_result,
        "timing": timing_result,
        "financial_exposure": fin_result,
        "decision": decision_result,
        "system": {
            "prototype": True,
            "model_versions": {
                "geographic": geo_result.get("model_version", "M8_Reliability_Aware_Frozen"),
                "timing": timing_result.get("model_version", "Time-to-Event v1.0 (Dynamic Hazard + AFT + Quantile)"),
                "decision_engine": decision_result.get("rule_engine_version", "Deterministic Policy v1.0"),
            },
        },
    }
