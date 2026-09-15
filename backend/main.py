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


@app.get("/api/v1/network-graph")
def get_network_graph(
    depth:      int          = Query(3,    ge=1, le=4, description="Traversal depth (1-3 or 4=SIM)"),
    case_id:    Optional[str] = Query(None, description="Seed complaint/case ID"),
    seed_account: Optional[str] = Query(None, description="Seed account ID for ego network"),
):
    """
    Return a fraud transaction network graph for the given depth.

    depth=1 → victim + immediate accounts
    depth=2 → + mule layer
    depth=3 → + ATM/UPI/cluster layer
    depth=4 (SIM) → full simulated network with inferred edges

    Response schema:
      { nodes: [NodeData...], edges: [EdgeData...], meta: {...} }
    """
    import random, math

    rng = random.Random(42 if not case_id else hash(case_id) % 10000)

    def _node(nid, label, sub, ntype, x, y, depth_n, risk=None, persistent=False, flow="", complaints=1, last_active="Today, 13:54", institution=None):
        return {
            "id": nid, "label": label, "sub": sub, "type": ntype,
            "x": x, "y": y, "depth": depth_n,
            "risk": risk, "isPersistent": persistent,
            "flow": flow, "complaints": complaints,
            "lastActive": last_active,
            "institution": institution or "",
            "aiInsight": f"{label} ({sub}) shows {'elevated' if risk in ('HIGH','CRITICAL') else 'normal'} activity across {complaints} complaint{'s' if complaints > 1 else ''}. "
                         + ("Registry-flagged entity with cross-case correlation." if persistent else "Transaction flow matches typology pattern.")
        }

    def _edge(frm, to, label="", highlight=False, dashed=False, predicted=False, inferred=False):
        return {"from": frm, "to": to, "label": label,
                "highlight": highlight, "dashed": dashed,
                "predicted": predicted, "inferred": inferred}

    # ── Build graph layers based on depth ──────────────────────────────────
    nodes: list = []
    edges: list = []

    # Depth 1: Two victims + shared intermediary
    nodes += [
        _node("v1",    "Victim 1",    "XXXX1234",         "victim",  130, 200, 1, flow="₹4.8L", complaints=1, last_active="Today, 10:05"),
        _node("v2",    "Victim 2",    "XXXX9871",         "victim",  130, 310, 1, flow="₹2.2L", complaints=1, last_active="Today, 09:45"),
        _node("acct_a","Account A",   "XXXX7821 / HDFC",  "account", 270, 250, 1, flow="₹6.8L", complaints=3, last_active="Today, 11:07"),
    ]
    edges += [
        _edge("v1", "acct_a", "₹4.8L", highlight=True),
        _edge("v2", "acct_a", "₹2.2L", highlight=True),
    ]

    if depth >= 2:
        nodes += [
            _node("acct_b", "Account B",  "XXXX3294 / Paytm", "account", 390, 160, 2, flow="₹5.1L", complaints=2, last_active="Today, 11:11"),
            _node("mule_b", "Mule B",     "XXXX5511",         "mule",    390, 340, 2, risk="HIGH",     persistent=True,  flow="₹3.8L", complaints=5,  last_active="Today, 11:14"),
            _node("mule_c", "Mule Hub",   "XXXX9234 / SBI",   "mule",    520, 250, 2, risk="CRITICAL", persistent=True,  flow="₹8.9L", complaints=9,  last_active="Today, 11:18"),
        ]
        edges += [
            _edge("acct_a", "acct_b", "₹5.1L", highlight=True),
            _edge("acct_a", "mule_b", "₹1.7L", highlight=True),
            _edge("acct_b", "mule_c", "₹4.9L", highlight=True),
            _edge("mule_b", "mule_c", "₹3.2L", highlight=True),
        ]

    if depth >= 3:
        nodes += [
            _node("atm_gurgaon", "Gurugram ATM",   "Sector 29 Cluster",    "atm",     640, 130, 3, risk="HIGH",    flow="₹3.2L",  complaints=6,  last_active="Today, 11:23"),
            _node("atm_delhi",   "Delhi ATM",      "CP Cluster",           "atm",     640, 240, 3, risk="CRITICAL",flow="₹5.7L",  complaints=11, last_active="Today, 11:25", institution="Axis Bank"),
            _node("upi_1",       "UPI Handle 1",   "XXXX5432@upi",         "upi",     640, 350, 3, flow="₹0.8L",  complaints=2,  last_active="Today, 10:58"),
            _node("cluster_1",   "Prior Cluster",  "7 matched complaints",  "cluster", 520, 390, 3, flow="₹12.4L", complaints=7,  last_active="2 days ago"),
        ]
        edges += [
            _edge("mule_c", "atm_gurgaon", "PREDICTED", highlight=True, dashed=True, predicted=True),
            _edge("mule_c", "atm_delhi",   "PREDICTED", highlight=True, dashed=True, predicted=True),
            _edge("mule_b", "upi_1",        "₹0.8L",   highlight=False),
            _edge("mule_c", "cluster_1",    "Matched",  highlight=False, dashed=True, inferred=True),
        ]

    if depth >= 4:  # SIM — extra inferred layer
        nodes += [
            _node("v3",          "Victim 3",      "XXXX4422",            "victim",  130,  90, 1, flow="₹1.1L", complaints=1, last_active="Yesterday, 22:31"),
            _node("acct_c",      "Account C",     "XXXX6612 / ICICI",    "account", 270, 120, 2, flow="₹1.1L", complaints=2, last_active="Yesterday, 22:48"),
            _node("upi_2",       "UPI Handle 2",  "XXXX9087@upi",        "upi",     390,  70, 2, flow="₹0.9L", complaints=1, last_active="Yesterday, 22:50"),
            _node("atm_jaipur",  "Jaipur ATM",    "Malviya Nagar",       "atm",     640,  30, 3, risk="HIGH",  flow="₹2.0L", complaints=4, last_active="Yesterday, 23:15"),
            _node("cluster_2",   "OOD Cluster",   "Cross-state pattern",  "cluster", 400, 430, 4, flow="₹3.5L", complaints=3, last_active="3 days ago"),
        ]
        edges += [
            _edge("v3",     "acct_c",    "₹1.1L",   highlight=False),
            _edge("acct_c", "upi_2",     "₹0.9L",   highlight=False),
            _edge("upi_2",  "atm_jaipur","INFERRED", highlight=False, dashed=True, inferred=True),
            _edge("acct_c", "mule_c",    "₹0.2L",   highlight=False, dashed=True, inferred=True),
            _edge("cluster_1", "cluster_2", "Linked", highlight=False, dashed=True, inferred=True),
        ]

    return {
        "nodes": nodes,
        "edges": edges,
        "meta": {
            "depth": depth,
            "case_id": case_id or "V2CMP_DEMO",
            "total_nodes": len(nodes),
            "total_edges": len(edges),
            "persistent_entities": sum(1 for n in nodes if n["isPersistent"]),
            "total_flow_inr": "₹8.9L",
        }
    }



@app.get("/api/v1/meta/stats")
def get_stats():
    """Dataset statistics."""
    try:
        return repo.get_dataset_stats()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
