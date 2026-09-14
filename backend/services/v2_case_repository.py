"""
TRINETRA — V2 Case Repository
==============================
Loads data/synthetic_v2/ CSVs once at first access and keeps them indexed
in memory for the lifetime of the backend process.

Public API
----------
get_case_list(page, page_size, search, typology_id, state, status, sort_by, sort_order)
    → {"items": [...], "page": int, "page_size": int, "total": int, "total_pages": int}

get_case_detail(complaint_id)
    → {"case_id", "complaint", "hops", "evidence_stages", "evaluation_truth"}
    evaluation_truth is explicitly isolated — never feed to models.

build_prediction_payload(complaint_id, stage)
    → payload dict compatible with run_prediction_v2()
    Only available_evidence up to the given stage is included.

Ground-truth separation
-----------------------
cashout_events.csv contains evaluation truth (true zone, cashout time, status,
frozen/recovered amounts). This data MUST NOT enter the prediction pipeline.
It is returned only in evaluation_truth blocks, clearly labelled.

Architecture
------------
All DataFrames are loaded lazily (first call), then cached as module-level
singletons. No file I/O after first load. Thread-safe for read-only access.
"""

from __future__ import annotations
import os
import math
import logging
from typing import Any, Dict, List, Optional
from functools import lru_cache

import pandas as pd

logger = logging.getLogger(__name__)

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DATA_DIR = os.path.join(ROOT, "data/synthetic_v2")

_complaints_df:  Optional[pd.DataFrame] = None
_hops_df:        Optional[pd.DataFrame] = None
_cashout_df:     Optional[pd.DataFrame] = None
_hop_index:      Optional[Dict[str, List[Dict]]] = None   # complaint_id → sorted hops
_cashout_index:  Optional[Dict[str, Dict]]        = None  # complaint_id → cashout row

# ── UI test cases A–J featured complaint IDs (from ui_test_cases.json) ────────
_FEATURED_IDS: Optional[Dict[str, str]] = None  # case_key → complaint_id

# ── Typology display mapping ──────────────────────────────────────────────────
TYPOLOGY_DISPLAY: Dict[str, str] = {
    "TYP_01": "OTP / KYC Fraud",
    "TYP_02": "Fake Loan App",
    "TYP_03": "Part-Time Job Scam",
    "TYP_04": "Investment / Crypto Scam",
    "TYP_05": "Sextortion",
    "TYP_06": "Marketplace / OLX Fraud",
    "TYP_07": "Digital Arrest",
    "TYP_08": "SIM Swap / Account Takeover",
    "TYP_09": "Romance / Honey Trap Scam",
    "TYP_10": "Courier / Parcel Scam",
}

# ── Load ──────────────────────────────────────────────────────────────────────

def _load():
    global _complaints_df, _hops_df, _cashout_df, _hop_index, _cashout_index, _FEATURED_IDS

    if _complaints_df is not None:
        return  # already loaded

    logger.info("V2CaseRepository: loading CSV files…")

    _complaints_df = pd.read_csv(os.path.join(DATA_DIR, "complaints.csv"))
    _hops_df       = pd.read_csv(os.path.join(DATA_DIR, "hops.csv"))
    _cashout_df    = pd.read_csv(os.path.join(DATA_DIR, "cashout_events.csv"))

    # ── Pre-sort hops for stable evidence stage ordering ──────────────────────
    _hops_df.sort_values(["complaint_id", "hop_sequence"], inplace=True)

    # ── Build hop index: complaint_id → list of hop dicts ────────────────────
    _hop_index = {}
    for row in _hops_df.itertuples(index=False):
        cid = row.complaint_id
        if cid not in _hop_index:
            _hop_index[cid] = []
        _hop_index[cid].append({
            "hop_id":            row.hop_id,
            "complaint_id":      cid,
            "hop_sequence":      int(row.hop_sequence),
            "from_account":      str(row.from_account),
            "to_account":        str(row.to_account),
            "amount_transferred": float(row.amount_transferred),
            "bank_channel":      str(row.bank_channel) if pd.notna(row.bank_channel) else None,
            "institution":       str(row.institution)  if pd.notna(row.institution)  else None,
            "event_timestamp":   str(row.event_timestamp),
            "available_timestamp": str(row.available_timestamp),
        })

    # ── Build cashout index ───────────────────────────────────────────────────
    _cashout_index = {}
    for row in _cashout_df.itertuples(index=False):
        _cashout_index[row.complaint_id] = {
            "cashout_id":        row.cashout_id,
            "final_account":     str(row.final_account),
            "zone_id":           str(row.zone_id),
            "zone_name":         str(row.zone_name)  if pd.notna(row.zone_name)  else None,
            "district":          str(row.district)   if pd.notna(row.district)   else None,
            "state":             str(row.state)       if pd.notna(row.state)      else None,
            "lat":               float(row.lat)       if pd.notna(row.lat)        else None,
            "lng":               float(row.lng)       if pd.notna(row.lng)        else None,
            "amount_cashed_out": float(row.amount_cashed_out),
            "amount_frozen":     float(row.amount_frozen),
            "amount_recovered":  float(row.amount_recovered),
            "status":            str(row.status),
            "event_timestamp":   str(row.event_timestamp),
            "available_timestamp": str(row.available_timestamp),
        }

    # ── Load featured A–J case IDs from ui_test_cases.json ───────────────────
    _FEATURED_IDS = {}
    try:
        import json
        manifest_path = os.path.join(DATA_DIR, "ui_test_cases.json")
        with open(manifest_path) as f:
            manifest = json.load(f)
        for c in manifest.get("cases", []):
            _FEATURED_IDS[c["case_key"]] = c["complaint_id"]
    except Exception as e:
        logger.warning(f"Could not load ui_test_cases.json: {e}")

    logger.info(
        f"V2CaseRepository loaded: {len(_complaints_df):,} complaints, "
        f"{len(_hops_df):,} hops, {len(_cashout_df):,} cashout events."
    )


def _ensure_loaded():
    if _complaints_df is None:
        _load()


# ── Helpers ───────────────────────────────────────────────────────────────────

def _complaint_to_list_item(row: Any) -> Dict:
    """Convert a complaints DataFrame row to a case list item."""
    cid = row.complaint_id
    hops = _hop_index.get(cid, [])
    hop_count = len(hops)
    latest_available = None
    if hops:
        ts_list = [h["available_timestamp"] for h in hops if h.get("available_timestamp")]
        if ts_list:
            latest_available = max(ts_list)
    cashout = _cashout_index.get(cid, {})
    eval_status = cashout.get("status", "UNKNOWN") if cashout else "NO_CASHOUT_DATA"
    return {
        "case_id":                       str(row.complaint_id),
        "typology_id":                   str(row.typology_id),
        "typology_name":                 str(row.typology_name),
        "amount_inr":                    float(row.amount_inr),
        "victim_state":                  str(row.victim_state),
        "victim_district":               str(row.victim_district),
        "victim_zone_id":                str(row.victim_zone_id),
        "incident_timestamp":            str(row.incident_timestamp),
        "complaint_timestamp":           str(row.complaint_timestamp),
        "complaint_available_timestamp": str(row.available_timestamp),
        "hop_count":                     hop_count,
        "latest_available_evidence_time": latest_available,
        "has_complaint_available":       True,
        "evaluation_status":             eval_status,
    }


# ── Public API ────────────────────────────────────────────────────────────────

def get_case_list(
    page:       int   = 1,
    page_size:  int   = 50,
    search:     Optional[str] = None,
    typology_id: Optional[str] = None,
    state:      Optional[str] = None,
    status:     Optional[str] = None,   # maps to cashout evaluation_status
    sort_by:    str   = "complaint_timestamp",
    sort_order: str   = "desc",
) -> Dict:
    _ensure_loaded()

    df = _complaints_df.copy()

    # ── Filters ──────────────────────────────────────────────────────────────
    if search and search.strip():
        q = search.strip().lower()
        mask = (
            df["complaint_id"].str.lower().str.contains(q, na=False) |
            df["typology_name"].str.lower().str.contains(q, na=False) |
            df["typology_id"].str.lower().str.contains(q, na=False) |
            df["victim_state"].str.lower().str.contains(q, na=False) |
            df["victim_district"].str.lower().str.contains(q, na=False)
        )
        df = df[mask]

    if typology_id and typology_id.upper() != "ALL":
        df = df[df["typology_id"] == typology_id.upper()]

    if state and state.upper() != "ALL":
        df = df[df["victim_state"].str.lower() == state.lower()]

    # status filter: match evaluation_status from cashout_events
    if status and status.upper() not in ("ALL", ""):
        matching_ids = {
            cid for cid, c in _cashout_index.items()
            if c.get("status", "").upper() == status.upper()
        }
        df = df[df["complaint_id"].isin(matching_ids)]

    # ── Sort ─────────────────────────────────────────────────────────────────
    valid_sort_cols = {
        "complaint_timestamp", "incident_timestamp", "available_timestamp",
        "amount_inr", "complaint_id",
    }
    col = sort_by if sort_by in valid_sort_cols else "complaint_timestamp"
    asc = (sort_order.lower() == "asc")
    df = df.sort_values(col, ascending=asc)

    # ── Pagination ────────────────────────────────────────────────────────────
    page_size = max(1, min(page_size, 200))
    total     = len(df)
    total_pages = math.ceil(total / page_size) if total > 0 else 1
    page      = max(1, min(page, total_pages))
    start     = (page - 1) * page_size
    end       = start + page_size
    page_df   = df.iloc[start:end]

    items = [_complaint_to_list_item(row) for row in page_df.itertuples(index=False)]

    return {
        "items":       items,
        "page":        page,
        "page_size":   page_size,
        "total":       total,
        "total_pages": total_pages,
    }


def get_case_detail(complaint_id: str) -> Optional[Dict]:
    """
    Return full case detail: complaint metadata, all hops, evidence_stages,
    and evaluation_truth (explicitly isolated — never feed to models).
    """
    _ensure_loaded()

    row = _complaints_df[_complaints_df["complaint_id"] == complaint_id]
    if row.empty:
        return None

    r = row.iloc[0]
    hops = _hop_index.get(complaint_id, [])
    cashout = _cashout_index.get(complaint_id)

    # ── Build evidence stages ─────────────────────────────────────────────────
    # T0: complaint available — no hops
    # Hop N: first N hops (by hop_sequence, filtered to available_timestamp <= T_n)
    # Prediction time for each stage = last available evidence time in that stage
    stages = []
    for n in range(len(hops) + 1):
        stage_hops = hops[:n]
        if n == 0:
            pred_time = str(r["available_timestamp"])
            label = "T0 (Complaint only)"
        else:
            latest_hop_avail = max(h["available_timestamp"] for h in stage_hops)
            pred_time = latest_hop_avail
            label = f"Hop {n} evidence"
        stages.append({
            "stage":           n,
            "label":           label,
            "prediction_time": pred_time,
            "hop_count":       n,
            "evidence_summary": f"Complaint + {n} hop(s)" if n > 0 else "Complaint only",
        })

    return {
        "case_id": complaint_id,
        "complaint": {
            "complaint_id":   str(r["complaint_id"]),
            "typology_id":    str(r["typology_id"]),
            "typology_name":  str(r["typology_name"]),
            "amount_inr":     float(r["amount_inr"]),
            "victim_state":   str(r["victim_state"]),
            "victim_district": str(r["victim_district"]),
            "victim_zone_id": str(r["victim_zone_id"]),
            "incident_timestamp":  str(r["incident_timestamp"]),
            "complaint_timestamp": str(r["complaint_timestamp"]),
            "available_timestamp": str(r["available_timestamp"]),
        },
        "hops":            hops,
        "hop_count":       len(hops),
        "evidence_stages": stages,
        # ── Ground truth — EVALUATION ONLY, never feed to models ─────────────
        "evaluation_truth": {
            "_warning": "EVALUATION ONLY — Do NOT pass this data to Geographic, Timing, or Decision engines.",
            "cashout": cashout,
        },
    }


def build_prediction_payload(
    complaint_id: str,
    stage: int = -1,   # -1 = latest (all available hops)
    sla_minutes: Optional[float] = None,
) -> Optional[Dict]:
    """
    Build a POST /api/v1/predict compatible payload from V2 case data.

    Only evidence available at or before the chosen stage is included.
    Evaluation truth (cashout zone, true timestamps) is NEVER included.

    stage=-1 → use all available hops (latest)
    stage=0  → complaint only, no hops
    stage=N  → first N hops
    """
    _ensure_loaded()

    row = _complaints_df[_complaints_df["complaint_id"] == complaint_id]
    if row.empty:
        return None

    r    = row.iloc[0]
    hops = _hop_index.get(complaint_id, [])

    # Determine which hops to include
    if stage < 0:
        used_hops = hops          # all available
    else:
        used_hops = hops[:stage]  # first N only

    # Determine prediction_time = latest available_timestamp in evidence
    if used_hops:
        pred_time = max(h["available_timestamp"] for h in used_hops)
    else:
        pred_time = str(r["available_timestamp"])

    # SLA heuristic if not supplied
    if sla_minutes is None:
        sla_minutes = 30.0

    payload: Dict[str, Any] = {
        "case_id":         complaint_id,
        "prediction_time": pred_time,
        "sla_minutes":     sla_minutes,
        "complaint": {
            "complaint_id":  complaint_id,
            "incident_time": str(r["incident_timestamp"]),
            "available_time": str(r["available_timestamp"]),
            "amount_inr":    float(r["amount_inr"]),
            "typology_id":   str(r["typology_id"]),
        },
        "hops": [
            {
                "hop_id":              h["hop_id"],
                "event_time":          h["event_timestamp"],
                "available_time":      h["available_timestamp"],
                "amount":              h["amount_transferred"],
                "destination_account": h["to_account"],
                "channel":             h["bank_channel"],
                "institution":         h["institution"],
            }
            for h in used_hops
        ],
    }
    return payload


def get_featured_case_ids() -> Dict[str, str]:
    """Return {case_key: complaint_id} for the 10 featured A–J demo cases."""
    _ensure_loaded()
    return dict(_FEATURED_IDS or {})


def get_typology_list() -> List[Dict]:
    """Return list of all typologies present in the dataset."""
    _ensure_loaded()
    result = (
        _complaints_df[["typology_id", "typology_name"]]
        .drop_duplicates()
        .sort_values("typology_id")
    )
    return result.to_dict(orient="records")


def get_state_list() -> List[str]:
    """Return sorted list of all victim_state values."""
    _ensure_loaded()
    return sorted(_complaints_df["victim_state"].dropna().unique().tolist())


def get_dataset_stats() -> Dict:
    """Return quick stats about the loaded dataset."""
    _ensure_loaded()
    return {
        "total_complaints": len(_complaints_df),
        "total_hops":       len(_hops_df),
        "total_cashout_events": len(_cashout_df),
        "typologies":       _complaints_df["typology_id"].nunique(),
        "states":           _complaints_df["victim_state"].nunique(),
    }
