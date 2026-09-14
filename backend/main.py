"""
TRINETRA FastAPI Backend
=========================
GET  /health
GET  /api/v1/health
POST /api/v1/predict
GET  /api/v1/cases
"""
import os
import sys

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from backend.services.prediction_service import run_prediction

app = FastAPI(
    title="TRINETRA Prediction API",
    description="Geographic + Time-to-Event prediction for cyber-financial fraud cases.",
    version="2.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class HopPayload(BaseModel):
    hop_id: Optional[str] = None
    event_time: str
    available_time: Optional[str] = None
    destination_account: Optional[str] = None
    amount: Optional[float] = 0.0
    channel: Optional[str] = None
    institution: Optional[str] = None
    source: Optional[str] = "api"

class ComplaintPayload(BaseModel):
    complaint_id: Optional[str] = None
    incident_time: str
    available_time: Optional[str] = None
    typology_id: Optional[str] = None
    amount_inr: Optional[float] = 0.0
    victim_context: Optional[Dict[str, Any]] = {}
    source: Optional[str] = "api"

class PredictRequest(BaseModel):
    case_id: str
    prediction_time: str
    hops: Optional[List[HopPayload]] = []
    complaint: Optional[ComplaintPayload] = None
    sla_minutes: Optional[float] = None

@app.get("/health")
@app.get("/api/v1/health")
def health():
    return {"status": "ok", "service": "TRINETRA Prediction API v2.0", "architecture": "Schema-First Canonical"}

@app.post("/api/v1/predict")
def predict(request: PredictRequest):
    try:
        payload = request.model_dump()
        result = run_prediction(payload)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/v1/cases")
def list_cases():
    return {
        "status": "ok",
        "supported_fixtures": [
            "NCRP-26-81942",
            "NCRP-26-81911",
            "NCRP-26-81895",
            "NCRP-26-81773",
            "NCRP-26-81742",
            "NCRP-26-81631",
            "NCRP-26-81602"
        ],
        "message": "Send POST /api/v1/predict with any case_id and telemetry payload for live inference."
    }

