"""
TRINETRA Prediction Service
============================
Coordinates Geographic (M8) and Time-to-Event engines.
Public API: run_prediction(case_id, prediction_time, hops, complaint, sla_minutes)
"""
import os
import sys
from datetime import datetime
from typing import Optional, List, Dict, Any

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from core.canonical.schemas import PredictionContext
from core.canonical.events import TransactionEvent, ComplaintEvent
from core.canonical.entities import EntityReference

from ml.geographic.interface import predict_geography
from ml.timing.interface import estimate_intervention_window


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
            available_time=datetime.fromisoformat(h.get("available_time", h["event_time"])),
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
            available_time=datetime.fromisoformat(c.get("available_time", c["incident_time"])),
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

    Geographic + Time-to-Event predictions run in parallel over the same
    canonical PredictionContext. The Decision Engine is a future layer.
    """
    context = build_context_from_payload(payload)
    sla_minutes = payload.get("sla_minutes")

    geo_result    = predict_geography(context)
    timing_result = estimate_intervention_window(context, sla_minutes=sla_minutes)

    return {
        "case_id": context.case_id,
        "prediction_time": context.prediction_time.isoformat(),
        "geographic_prediction": geo_result,
        "time_to_event": timing_result,
    }
