"""
tests/test_synthetic_adapter.py
================================
Adapter tests covering V1 and V2 CSV schemas for:
  - TransactionEvent (hops)
  - ComplaintEvent   (complaints)
  - OutcomeEvent     (cashout_events)
  - Censored-case isolation
  - Missing-field degradation
  - V1 regression (no available_timestamp on cashout_events)

Run with:
    python -m pytest tests/test_synthetic_adapter.py -v
"""

import os, sys, io, tempfile
import pytest
import pandas as pd
from datetime import datetime

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
sys.path.insert(0, ROOT)

from core.adapters.synthetic_adapter import SyntheticAdapter

adapter = SyntheticAdapter()

# ── helpers ──────────────────────────────────────────────────────────────────

def _write_csv(tmp_dir: str, name: str, rows: list[dict], columns: list[str] = None) -> str:
    df = pd.DataFrame(rows)
    if columns:
        for c in columns:
            if c not in df.columns:
                df[c] = None
        df = df[columns]
    path = os.path.join(tmp_dir, name)
    df.to_csv(path, index=False)
    return path

# ── SECTION 1: V1-compatible hops ─────────────────────────────────────────────

class TestParseTransactionsV1:
    def test_basic_v1_hop(self, tmp_path):
        path = _write_csv(str(tmp_path), "hops.csv", [{
            "hop_id": "HOP_CMP_1_1", "complaint_id": "CMP_1", "hop_sequence": 1,
            "from_account": "ACC_001", "to_account": "ACC_002",
            "amount_transferred": 50000.0, "bank_channel": "IMPS",
            "event_timestamp": "2025-01-01T10:00:00",
            "available_timestamp": "2025-01-01T10:30:00",
        }])
        events = adapter.parse_transactions(path)
        assert len(events) == 1
        e = events[0]
        assert e.event_id == "HOP_CMP_1_1"
        assert e.case_id == "CMP_1"
        assert e.amount == 50000.0
        assert e.channel == "IMPS"
        assert e.institution is None          # V1 has no institution column
        assert e.zone_id is None              # never populated at hop level
        assert e.source_entity.entity_id == "ACC_001"
        assert e.destination_entity.entity_id == "ACC_002"
        assert isinstance(e.event_time, datetime)
        assert isinstance(e.available_time, datetime)

    def test_v1_hop_available_after_event(self, tmp_path):
        """available_time must be >= event_time."""
        path = _write_csv(str(tmp_path), "hops.csv", [{
            "hop_id": "HOP_X_1", "complaint_id": "CMP_X", "hop_sequence": 1,
            "from_account": "A", "to_account": "B",
            "amount_transferred": 1000.0, "bank_channel": "UPI",
            "event_timestamp": "2025-06-01T08:00:00",
            "available_timestamp": "2025-06-01T09:00:00",
        }])
        e = adapter.parse_transactions(path)[0]
        assert e.available_time >= e.event_time

    def test_missing_channel_is_none(self, tmp_path):
        """channel should be None when column is missing or null."""
        path = _write_csv(str(tmp_path), "hops.csv", [{
            "hop_id": "HOP_NC", "complaint_id": "CMP_NC", "hop_sequence": 1,
            "from_account": "A", "to_account": "B", "amount_transferred": 100.0,
            "bank_channel": None,
            "event_timestamp": "2025-01-01T10:00:00",
            "available_timestamp": "2025-01-01T11:00:00",
        }])
        e = adapter.parse_transactions(path)[0]
        assert e.channel is None

# ── SECTION 2: V2-specific hops ──────────────────────────────────────────────

class TestParseTransactionsV2:
    def test_v2_hop_with_institution(self, tmp_path):
        path = _write_csv(str(tmp_path), "hops.csv", [{
            "hop_id": "HOP_V2_1", "complaint_id": "V2CMP_1", "hop_sequence": 1,
            "from_account": "VICT_001", "to_account": "ACCV2_001",
            "amount_transferred": 120000.0, "bank_channel": "UPI", "institution": "HDFC",
            "event_timestamp": "2026-02-10T14:00:00",
            "available_timestamp": "2026-02-10T14:45:00",
        }])
        e = adapter.parse_transactions(path)[0]
        assert e.channel == "UPI"
        assert e.institution == "HDFC"
        assert e.zone_id is None      # still never populated at hop level

    def test_v2_rtgs_channel(self, tmp_path):
        path = _write_csv(str(tmp_path), "hops.csv", [{
            "hop_id": "HOP_RTGS", "complaint_id": "V2CMP_2", "hop_sequence": 1,
            "from_account": "VICT_002", "to_account": "ACCV2_002",
            "amount_transferred": 500000.0, "bank_channel": "RTGS", "institution": None,
            "event_timestamp": "2026-03-01T09:00:00",
            "available_timestamp": "2026-03-01T09:40:00",
        }])
        e = adapter.parse_transactions(path)[0]
        assert e.channel == "RTGS"

# ── SECTION 3: Complaints (V1 + V2) ──────────────────────────────────────────

class TestParseComplaintsV1:
    def test_v1_complaint_basic(self, tmp_path):
        path = _write_csv(str(tmp_path), "complaints.csv", [{
            "complaint_id": "CMP_001", "typology_id": "TYP_01",
            "typology_name": "OTP Fraud", "amount_inr": 25000.0,
            "victim_state": "Delhi", "victim_district": "Central Delhi",
            "incident_timestamp": "2025-01-15T13:00:00",
            "complaint_timestamp": "2025-01-15T15:00:00",
            "available_timestamp": "2025-01-15T15:10:00",
        }])
        c = adapter.parse_complaints(path)[0]
        assert c.case_id == "CMP_001"
        assert c.typology == "TYP_01"
        assert c.metadata["amount_inr"] == 25000.0
        assert c.victim_context.get("victim_state") == "Delhi"
        assert isinstance(c.event_time, datetime)    # incident_timestamp
        assert isinstance(c.available_time, datetime)  # available_timestamp

    def test_available_time_uses_available_timestamp(self, tmp_path):
        """available_time must use available_timestamp, NOT complaint_timestamp."""
        path = _write_csv(str(tmp_path), "complaints.csv", [{
            "complaint_id": "CMP_TS", "typology_id": "TYP_02",
            "typology_name": "Test", "amount_inr": 1000.0,
            "victim_state": "Bihar", "victim_district": "Patna",
            "incident_timestamp": "2025-02-01T10:00:00",
            "complaint_timestamp": "2025-02-01T12:00:00",
            "available_timestamp": "2025-02-01T12:15:00",
        }])
        c = adapter.parse_complaints(path)[0]
        # event_time = incident, available_time = available_timestamp (12:15, not 12:00)
        assert c.event_time.hour == 10
        assert c.available_time.hour == 12
        assert c.available_time.minute == 15

    def test_missing_typology_is_none(self, tmp_path):
        path = _write_csv(str(tmp_path), "complaints.csv", [{
            "complaint_id": "CMP_NT", "amount_inr": 5000.0,
            "incident_timestamp": "2025-03-01T10:00:00",
            "available_timestamp": "2025-03-01T11:00:00",
        }])
        c = adapter.parse_complaints(path)[0]
        assert c.typology is None

class TestParseComplaintsV2:
    def test_v2_victim_zone_id(self, tmp_path):
        path = _write_csv(str(tmp_path), "complaints.csv", [{
            "complaint_id": "V2CMP_001", "typology_id": "TYP_07",
            "typology_name": "Digital Arrest", "amount_inr": 300000.0,
            "victim_state": "Maharashtra", "victim_district": "Mumbai City",
            "victim_zone_id": "V2_ZID_039",
            "incident_timestamp": "2026-03-10T14:00:00",
            "available_timestamp": "2026-03-10T14:20:00",
        }])
        c = adapter.parse_complaints(path)[0]
        assert c.victim_context.get("victim_zone_id") == "V2_ZID_039"
        assert c.victim_context.get("victim_district") == "Mumbai City"

    def test_null_victim_district_allowed(self, tmp_path):
        """2% of V2 complaints have null victim_district — must not crash."""
        path = _write_csv(str(tmp_path), "complaints.csv", [{
            "complaint_id": "V2CMP_NULL", "typology_id": "TYP_01",
            "typology_name": "OTP Fraud", "amount_inr": 10000.0,
            "victim_state": "Rajasthan", "victim_district": None,
            "victim_zone_id": "V2_ZID_050",
            "incident_timestamp": "2026-01-05T09:00:00",
            "available_timestamp": "2026-01-05T10:00:00",
        }])
        c = adapter.parse_complaints(path)[0]
        assert "victim_district" not in c.victim_context or c.victim_context.get("victim_district") is None

# ── SECTION 4: Outcomes (V1 regression) ──────────────────────────────────────

class TestParseOutcomesV1:
    def test_v1_cashout_no_available_ts(self, tmp_path):
        """V1 cashout_events has no available_timestamp — must fall back to event_timestamp."""
        path = _write_csv(str(tmp_path), "cashout_events.csv", [{
            "cashout_id": "CSH_CMP_001", "complaint_id": "CMP_001",
            "final_account": "ACC_010", "zone_id": "Z009",
            "location_id": "ATM_Z009_001", "amount_cashed_out": 50000.0,
            "status": "COMPLETED", "event_timestamp": "2025-01-15T15:45:00",
            # NO available_timestamp column
        }])
        o = adapter.parse_outcomes(path)[0]
        assert o.outcome_status == "COMPLETED"
        assert o.cashout_location == "Z009"
        # available_time falls back to event_time
        assert o.available_time == o.event_time

    def test_v1_frozen_status(self, tmp_path):
        path = _write_csv(str(tmp_path), "cashout_events.csv", [{
            "cashout_id": "CSH_CMP_002", "complaint_id": "CMP_002",
            "final_account": "ACC_011", "zone_id": "Z002",
            "location_id": "ATM_Z002_005", "amount_cashed_out": 0.0,
            "status": "FROZEN", "event_timestamp": "2025-02-01T16:00:00",
        }])
        o = adapter.parse_outcomes(path)[0]
        assert o.outcome_status == "FROZEN"
        assert o.cashout_location == "Z002"
        assert o.metadata.get("amount_cashed_out") == 0.0

# ── SECTION 5: Outcomes (V2) ─────────────────────────────────────────────────

class TestParseOutcomesV2:
    def test_v2_completed_with_latlon(self, tmp_path):
        path = _write_csv(str(tmp_path), "cashout_events.csv", [{
            "cashout_id": "CSH_V2CMP_001", "complaint_id": "V2CMP_001",
            "final_account": "ACCV2_001", "zone_id": "V2_ZID_003",
            "zone_name": "Gurugram Sector 29", "district": "Gurugram", "state": "Haryana",
            "location_id": "ATM_V2_ZID_003_012",
            "lat": 28.4601, "lng": 77.0270,
            "amount_cashed_out": 100000.0, "amount_frozen": 0.0,
            "amount_recovered": 0.0,
            "status": "COMPLETED",
            "event_timestamp": "2026-01-10T11:00:00",
            "available_timestamp": "2026-01-10T11:15:00",
        }])
        o = adapter.parse_outcomes(path)[0]
        assert o.outcome_status == "COMPLETED"
        assert o.cashout_location == "V2_ZID_003"
        assert o.metadata.get("lat") == pytest.approx(28.4601, abs=1e-4)
        assert o.metadata.get("lng") == pytest.approx(77.0270, abs=1e-4)
        assert o.metadata.get("event_observed") is True
        assert o.available_time > o.event_time

    def test_v2_frozen_partial(self, tmp_path):
        path = _write_csv(str(tmp_path), "cashout_events.csv", [{
            "cashout_id": "CSH_PF", "complaint_id": "V2CMP_PF",
            "final_account": "ACCV2_PF", "zone_id": "V2_ZID_050",
            "zone_name": "Jaipur", "district": "Jaipur", "state": "Rajasthan",
            "location_id": "ATM_001", "lat": 26.91, "lng": 75.79,
            "amount_cashed_out": 40000.0, "amount_frozen": 60000.0,
            "amount_recovered": 0.0,
            "status": "PARTIAL_FREEZE",
            "event_timestamp": "2026-02-15T09:00:00",
            "available_timestamp": "2026-02-15T09:20:00",
        }])
        o = adapter.parse_outcomes(path)[0]
        assert o.outcome_status == "PARTIAL_FREEZE"
        assert o.metadata["amount_frozen"] == 60000.0

    def test_v2_censored_isolates_generator_truth(self, tmp_path):
        """
        CRITICAL: For CENSORED outcomes, cashout_location, lat, lng must be None.
        The generator puts a target zone in the CSV, but that is latent truth
        and must never enter canonical inference.
        """
        path = _write_csv(str(tmp_path), "cashout_events.csv", [{
            "cashout_id": "CSH_CENS", "complaint_id": "V2CMP_CENS",
            "final_account": "ACCV2_CENS", "zone_id": "V2_ZID_087",  # latent truth
            "zone_name": "Guwahati", "district": "Kamrup Metro", "state": "Assam",
            "location_id": "ATM_V2_ZID_087_003",
            "lat": 26.1450, "lng": 91.7370,   # latent truth — must be blocked
            "amount_cashed_out": None, "amount_frozen": 0.0, "amount_recovered": 0.0,
            "status": "CENSORED",
            "event_timestamp": "2026-03-05T20:00:00",    # observation boundary (last_hop + 24h)
            "available_timestamp": "2026-03-05T20:25:00",
        }])
        o = adapter.parse_outcomes(path)[0]
        # These MUST be None — generator truth must not leak into canonical events
        assert o.cashout_location is None, "CENSORED cashout_location must be None"
        assert o.metadata.get("lat") is None, "CENSORED lat must not be exposed"
        assert o.metadata.get("lng") is None, "CENSORED lng must not be exposed"
        assert o.outcome_status == "CENSORED"
        assert o.metadata.get("event_observed") is False
        # amount_cashed_out was null — should not be in metadata or be null
        assert o.metadata.get("amount_cashed_out") is None

    def test_v2_reversed_outcome(self, tmp_path):
        path = _write_csv(str(tmp_path), "cashout_events.csv", [{
            "cashout_id": "CSH_REV", "complaint_id": "V2CMP_REV",
            "final_account": "ACCV2_REV", "zone_id": "V2_ZID_019",
            "zone_name": "Bengaluru MG Road", "district": "Bengaluru Urban",
            "state": "Karnataka", "location_id": "ATM_001",
            "lat": 12.9716, "lng": 77.5946,
            "amount_cashed_out": 200000.0, "amount_frozen": 0.0,
            "amount_recovered": 200000.0,
            "status": "REVERSED",
            "event_timestamp": "2026-04-01T14:00:00",
            "available_timestamp": "2026-04-01T14:30:00",
        }])
        o = adapter.parse_outcomes(path)[0]
        assert o.outcome_status == "REVERSED"
        assert o.metadata["amount_recovered"] == 200000.0
        assert o.cashout_location == "V2_ZID_019"

# ── SECTION 6: Multiple rows / batch correctness ─────────────────────────────

class TestBatchParsing:
    def test_multiple_hops_correct_case_ids(self, tmp_path):
        rows = [
            {"hop_id": f"HOP_{i}", "complaint_id": f"CMP_{i}", "hop_sequence": 1,
             "from_account": "V", "to_account": "M", "amount_transferred": float(i * 1000),
             "bank_channel": "UPI", "event_timestamp": f"2026-01-0{i+1}T10:00:00",
             "available_timestamp": f"2026-01-0{i+1}T10:30:00"}
            for i in range(1, 6)
        ]
        path = _write_csv(str(tmp_path), "hops.csv", rows)
        events = adapter.parse_transactions(path)
        assert len(events) == 5
        for i, e in enumerate(events, 1):
            assert e.case_id == f"CMP_{i}"
            assert e.amount == float(i * 1000)

    def test_mixed_status_outcomes(self, tmp_path):
        rows = [
            {"cashout_id": "C1", "complaint_id": "P1", "final_account": "A1",
             "zone_id": "Z1", "amount_cashed_out": 50000.0, "amount_frozen": 0.0,
             "amount_recovered": 0.0, "status": "COMPLETED",
             "event_timestamp": "2026-01-01T10:00:00"},
            {"cashout_id": "C2", "complaint_id": "P2", "final_account": "A2",
             "zone_id": "Z2", "amount_cashed_out": None, "amount_frozen": 0.0,
             "amount_recovered": 0.0, "status": "CENSORED",
             "event_timestamp": "2026-01-02T12:00:00"},
            {"cashout_id": "C3", "complaint_id": "P3", "final_account": "A3",
             "zone_id": "Z3", "amount_cashed_out": 0.0, "amount_frozen": 30000.0,
             "amount_recovered": 0.0, "status": "FROZEN",
             "event_timestamp": "2026-01-03T14:00:00"},
        ]
        path = _write_csv(str(tmp_path), "cashout_events.csv", rows)
        outcomes = adapter.parse_outcomes(path)
        assert len(outcomes) == 3
        completed, censored, frozen = outcomes[0], outcomes[1], outcomes[2]
        # COMPLETED
        assert completed.outcome_status == "COMPLETED"
        assert completed.cashout_location == "Z1"
        assert completed.metadata["event_observed"] is True
        # CENSORED — zone and lat/lng must be blocked
        assert censored.outcome_status == "CENSORED"
        assert censored.cashout_location is None
        assert censored.metadata["event_observed"] is False
        # FROZEN
        assert frozen.outcome_status == "FROZEN"
        assert frozen.metadata["amount_frozen"] == 30000.0

# ── SECTION 7: V1 real-data regression (100-row smoke test) ──────────────────

class TestV1RealDataRegression:
    """Smoke tests against actual V1 CSV files (100 rows each)."""

    @pytest.fixture(scope="class")
    def v1_slice(self, tmp_path_factory):
        tmp = str(tmp_path_factory.mktemp("v1"))
        for src, dst in [
            ("data/synthetic/hops.csv", "hops.csv"),
            ("data/synthetic/complaints.csv", "complaints.csv"),
            ("data/synthetic/cashout_events.csv", "cashout_events.csv"),
        ]:
            full = os.path.join(ROOT, src)
            if os.path.exists(full):
                pd.read_csv(full).head(100).to_csv(os.path.join(tmp, dst), index=False)
        return tmp

    def test_v1_transactions_parse(self, v1_slice):
        p = os.path.join(v1_slice, "hops.csv")
        if not os.path.exists(p): pytest.skip("V1 data not found")
        events = adapter.parse_transactions(p)
        assert len(events) > 0
        assert all(e.amount > 0 for e in events)
        assert all(e.available_time >= e.event_time for e in events)

    def test_v1_complaints_parse(self, v1_slice):
        p = os.path.join(v1_slice, "complaints.csv")
        if not os.path.exists(p): pytest.skip("V1 data not found")
        events = adapter.parse_complaints(p)
        assert len(events) > 0
        assert all(e.metadata.get("amount_inr", 0) > 0 for e in events)
        assert all(e.available_time >= e.event_time for e in events)

    def test_v1_outcomes_parse(self, v1_slice):
        p = os.path.join(v1_slice, "cashout_events.csv")
        if not os.path.exists(p): pytest.skip("V1 data not found")
        events = adapter.parse_outcomes(p)
        assert len(events) > 0
        # V1 has no CENSORED rows
        for o in events:
            assert o.outcome_status in {"COMPLETED", "FROZEN"}
        # V1 cashout_events has no available_timestamp: fallback must work
        assert all(o.available_time is not None for o in events)

# ── SECTION 8: V2 real-data regression (100-row smoke test) ──────────────────

class TestV2RealDataRegression:
    @pytest.fixture(scope="class")
    def v2_slice(self, tmp_path_factory):
        tmp = str(tmp_path_factory.mktemp("v2"))
        for src, dst in [
            ("data/synthetic_v2/hops.csv", "hops.csv"),
            ("data/synthetic_v2/complaints.csv", "complaints.csv"),
            ("data/synthetic_v2/cashout_events.csv", "cashout_events.csv"),
        ]:
            full = os.path.join(ROOT, src)
            if os.path.exists(full):
                pd.read_csv(full).head(200).to_csv(os.path.join(tmp, dst), index=False)
        return tmp

    def test_v2_transactions_parse(self, v2_slice):
        p = os.path.join(v2_slice, "hops.csv")
        if not os.path.exists(p): pytest.skip("V2 data not found")
        events = adapter.parse_transactions(p)
        assert len(events) > 0
        assert all(e.zone_id is None for e in events)
        assert all(e.available_time >= e.event_time for e in events)

    def test_v2_complaints_parse(self, v2_slice):
        p = os.path.join(v2_slice, "complaints.csv")
        if not os.path.exists(p): pytest.skip("V2 data not found")
        events = adapter.parse_complaints(p)
        assert len(events) > 0
        # V2 complaints have victim_zone_id
        zone_ids = [e.victim_context.get("victim_zone_id") for e in events]
        assert any(v is not None for v in zone_ids)
        # amount_inr in metadata
        assert all(e.metadata.get("amount_inr", 0) >= 0 for e in events)

    def test_v2_outcomes_parse_censored_isolation(self, v2_slice):
        p = os.path.join(v2_slice, "cashout_events.csv")
        if not os.path.exists(p): pytest.skip("V2 data not found")
        outcomes = adapter.parse_outcomes(p)
        assert len(outcomes) > 0
        # All valid statuses
        valid_statuses = {"COMPLETED", "FROZEN", "PARTIAL_FREEZE", "REVERSED", "CENSORED"}
        for o in outcomes:
            assert o.outcome_status in valid_statuses
        # CENSORED isolation
        censored = [o for o in outcomes if o.outcome_status == "CENSORED"]
        for o in censored:
            assert o.cashout_location is None, "CENSORED cashout_location must be None"
            assert o.metadata.get("lat") is None
            assert o.metadata.get("lng") is None
            assert o.metadata.get("event_observed") is False

    def test_v2_outcomes_completed_have_latlon(self, v2_slice):
        p = os.path.join(v2_slice, "cashout_events.csv")
        if not os.path.exists(p): pytest.skip("V2 data not found")
        outcomes = adapter.parse_outcomes(p)
        completed = [o for o in outcomes if o.outcome_status == "COMPLETED"]
        assert len(completed) > 0
        # At least 90% of completed should have lat/lng
        with_latlon = sum(1 for o in completed
                          if o.metadata.get("lat") is not None
                          and o.metadata.get("lng") is not None)
        assert with_latlon / len(completed) >= 0.90
