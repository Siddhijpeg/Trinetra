"""
TRINETRA FastAPI Backend
=========================
GET  /health
GET  /api/v1/health
POST /api/v1/predict
GET  /api/v1/cases
GET  /api/v1/cases/{case_id}
POST /api/v1/predict-case
GET  /api/v1/meta/typologies
GET  /api/v1/meta/states
GET  /api/v1/meta/featured
GET  /api/v1/meta/stats
"""
import os
import sys
import logging

logging.basicConfig(level=logging.INFO)

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List, Dict, Any

from backend.services.prediction_service_v2 import run_prediction_v2
from backend.services import v2_case_repository as repo

app = FastAPI(
    title="TRINETRA Prediction API",
    description="Geographic V2 + Time-to-Event V2 + Decision Engine V1 prediction for cyber-financial fraud cases.",
    version="2.2.0",
)

# ── CORS ─────────────────────────────────────────────────────────────────────
import json as _json

_cors_env = os.environ.get("CORS_ORIGINS", "")
_extra_origins = _json.loads(_cors_env) if _cors_env.startswith("[") else (
    [o.strip() for o in _cors_env.split(",") if o.strip()] if _cors_env else []
)

ALLOWED_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:8443",
    "http://127.0.0.1:5173",
    "http://127.0.0.1:8443",
] + _extra_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Pydantic models ───────────────────────────────────────────────────────────

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

class PredictCaseRequest(BaseModel):
    """Request a prediction for a stored V2 case by ID + stage.
    Backend builds the PredictionContext from V2 data — no payload construction needed."""
    case_id:     str
    stage:       int   = -1    # -1 = latest, 0 = complaint only, N = first N hops
    sla_minutes: Optional[float] = None

# ── Routes ────────────────────────────────────────────────────────────────────

@app.get("/health")
@app.get("/api/v1/health")
def health():
    return {
        "status": "ok",
        "service": "TRINETRA Prediction API v2.2",
        "architecture": "Schema-First Canonical",
        "prediction_service": "V2 (Geographic V2 + Timing V2 + Decision Engine V1)",
        "case_repository": "V2 Dataset (60k complaints)",
    }


# ── Direct predict (accepts full payload) ────────────────────────────────────

@app.post("/api/v1/predict")
def predict(request: PredictRequest):
    try:
        payload = request.model_dump()
        result = run_prediction_v2(payload)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Predict by V2 case ID + stage ────────────────────────────────────────────

@app.post("/api/v1/predict-case")
def predict_case(request: PredictCaseRequest):
    """
    Request a V2 prediction using a stored complaint_id and evidence stage.
    Backend builds the PredictionContext from V2 data — frontend does not
    need to pass hop/complaint fields.

    stage=-1 → latest (all available hops)
    stage=0  → complaint only
    stage=N  → first N hops
    """
    payload = repo.build_prediction_payload(
        complaint_id=request.case_id,
        stage=request.stage,
        sla_minutes=request.sla_minutes,
    )
    if payload is None:
        raise HTTPException(status_code=404, detail=f"Case not found: {request.case_id}")
    try:
        result = run_prediction_v2(payload)
        result["_stage_requested"] = request.stage
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Case list — paginated, filtered, sorted ───────────────────────────────────

@app.get("/api/v1/cases")
def list_cases(
    page:        int   = Query(1,    ge=1,  description="Page number (1-indexed)"),
    page_size:   int   = Query(50,   ge=1,  le=200, description="Items per page (max 200)"),
    search:      Optional[str] = Query(None, description="Search complaint_id, typology, state, district"),
    typology_id: Optional[str] = Query(None, description="Filter by typology_id (e.g. TYP_04)"),
    state:       Optional[str] = Query(None, description="Filter by victim_state"),
    status:      Optional[str] = Query(None, description="Filter by evaluation status (COMPLETED, FROZEN, etc.)"),
    sort_by:     str  = Query("complaint_timestamp", description="Sort field"),
    sort_order:  str  = Query("desc",  description="asc or desc"),
):
    try:
        return repo.get_case_list(
            page=page,
            page_size=page_size,
            search=search,
            typology_id=typology_id,
            state=state,
            status=status,
            sort_by=sort_by,
            sort_order=sort_order,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ── Case detail ───────────────────────────────────────────────────────────────

@app.get("/api/v1/cases/{case_id}")
def get_case(case_id: str):
    """
    Return full V2 case detail: complaint metadata, all V2 hops sorted by
    hop_sequence, evidence_stages (T0, Hop1, …, Latest), and evaluation_truth
    (ground truth — explicitly isolated, never feed to models).
    """
    detail = repo.get_case_detail(case_id)
    if detail is None:
        raise HTTPException(status_code=404, detail=f"Case not found: {case_id}")
    return detail


# ── Metadata endpoints ────────────────────────────────────────────────────────

@app.get("/api/v1/meta/typologies")
def get_typologies():
    """List all typology IDs and names present in the V2 dataset."""
    try:
        return {"typologies": repo.get_typology_list()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/meta/states")
def get_states():
    """List all victim_state values present in the V2 dataset."""
    try:
        return {"states": repo.get_state_list()}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/meta/featured")
def get_featured():
    """Return the 10 featured A–J demo case IDs from ui_test_cases.json."""
    try:
        ids = repo.get_featured_case_ids()
        return {
            "featured_cases": [
                {"case_key": k, "complaint_id": v}
                for k, v in sorted(ids.items())
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/v1/meta/stats")
def get_stats():
    """Dataset statistics."""
    try:
        return repo.get_dataset_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

