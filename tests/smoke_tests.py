"""
Smoke tests for TRINETRA core components.
Run from repository root: python3 tests/smoke_tests.py
"""
import sys
import os
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

# ─── Test 1: Canonical Event Construction ─────────────────────────────────────
from core.canonical.entities import EntityReference
from core.canonical.events import TransactionEvent, ComplaintEvent, OutcomeEvent
from core.canonical.schemas import PredictionContext

t = TransactionEvent(
    event_id="hop-001",
    case_id="CMP-001",
    event_time=datetime(2025, 4, 1, 10, 0),
    available_time=datetime(2025, 4, 1, 10, 5),
    source="BankFeed",
    amount=50000.0,
    channel="UPI",
    destination_entity=EntityReference(entity_id="ACC-X", entity_type="ACCOUNT")
)
assert t.event_id == "hop-001"
assert t.zone_id is None  # Optional field
print("✓ TransactionEvent construction OK")

c = ComplaintEvent(
    event_id="cmp-001",
    case_id="CMP-001",
    event_time=datetime(2025, 4, 5, 9, 0),     # Incident
    available_time=datetime(2025, 4, 6, 12, 0), # Complaint filed AFTER cashout
    source="NCRP",
    typology="OTP Fraud"
)
assert c.available_time > t.available_time
print("✓ ComplaintEvent construction OK (post-cashout timing validated)")

# ─── Test 2: As-Of-Time Event Store (Leakage Test) ───────────────────────────
from core.event_store.store import LocalEventStore

store = LocalEventStore()
store.append_transaction(t)
store.append_complaint(c)

# Predict AT T=10:00 on Apr 1 — the complaint (Apr 6) should NOT be visible
prediction_time = datetime(2025, 4, 1, 10, 30)
visible = store.get_events_as_of("CMP-001", prediction_time)

assert len(visible["transactions"]) == 1, "Transaction should be visible"
assert len(visible["complaints"]) == 0, "LEAKAGE DETECTED: Complaint must not be visible at prediction time"
print("✓ As-of-time leakage test PASSED: Future complaint correctly hidden")

# Predict after complaint is filed — it should now be visible
post_complaint_time = datetime(2025, 4, 7, 12, 0)
visible_later = store.get_events_as_of("CMP-001", post_complaint_time)
assert len(visible_later["complaints"]) == 1
print("✓ As-of-time test PASSED: Complaint visible after available_time")

# ─── Test 3: Synthetic Adapter (Schema Smoke Test) ──────────────────────────
from core.adapters.synthetic_adapter import SyntheticAdapter
adapter = SyntheticAdapter()
HOPS_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'synthetic', 'hops.csv')
if os.path.exists(HOPS_PATH):
    txns = adapter.parse_transactions(HOPS_PATH)
    assert len(txns) > 0
    assert hasattr(txns[0], 'event_id')
    assert hasattr(txns[0], 'available_time')
    print(f"✓ SyntheticAdapter parsed {len(txns)} transactions from hops.csv")
else:
    print("⚠ SKIP: data/synthetic/hops.csv not found (run from repo root)")

# ─── Test 4: Geographic Interface (Stub Check) ───────────────────────────────
from ml.geographic.interface import predict_geography
ctx = PredictionContext(case_id="CMP-001", prediction_time=prediction_time)
result = predict_geography(ctx)
assert "ranked_zones" in result
assert result["model_version"] == "M8_Reliability_Aware_Frozen"
print("✓ predict_geography interface returns correct shape")

# ─── Test 5: Timing Interface (Stub Check) ───────────────────────────────────
from ml.timing.interface import estimate_intervention_window
t_result = estimate_intervention_window(ctx)
assert "estimated_median_minutes" in t_result
assert "survival_probability_30m" in t_result
assert "R2_Experimental_Synthetic_Prototype" in t_result["model_version"]
print("✓ estimate_intervention_window interface returns correct shape")

print("\n=== ALL SMOKE TESTS PASSED ===")
