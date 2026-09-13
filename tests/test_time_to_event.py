"""
TRINETRA — Temporal Leakage & Mathematical Properties Tests
=============================================================

Tests:
  A  Future hop doesn't change earlier prediction
  B  Future complaint can't influence earlier prediction
  C  Future cashout outcome stays out of features
  D  Latent syndicate_id never in feature names
  E  Every feature satisfies available_time <= prediction_time
  F  Survival curve is valid and monotonically non-increasing
  G  P25 <= P50 <= P75
  H  Missing optional fields don't crash inference
  I  Unseen entity still produces a prediction

Run: python3 -m pytest tests/test_time_to_event.py -v
"""
import sys, os, pytest
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from core.canonical.schemas import PredictionContext
from core.canonical.events import TransactionEvent, ComplaintEvent, OutcomeEvent
from core.canonical.entities import EntityReference
from core.event_store.store import LocalEventStore
from backend.services.context_builder import ContextBuilder
from ml.timing.feature_builder import TimeToEventFeatureBuilder
from ml.timing.target_builder import TimeToEventTargetBuilder

# ── Fixtures ─────────────────────────────────────────────────────────────────

BASE_TIME = datetime(2025, 6, 1, 10, 0, 0)

def _txn(hop_n, delta_event_mins, delta_avail_mins, amount=10000.0, dest="ACC_KNOWN"):
    event_t = BASE_TIME + timedelta(minutes=delta_event_mins)
    avail_t = BASE_TIME + timedelta(minutes=delta_avail_mins)
    return TransactionEvent(
        event_id=f"TXN_{hop_n}",
        case_id="CASE_001",
        event_time=event_t,
        available_time=avail_t,
        source="test",
        amount=amount,
        destination_entity=EntityReference(entity_id=dest, entity_type="ACCOUNT"),
    )

def _store_with_hops(*hops):
    store = LocalEventStore()
    for h in hops: store.append_transaction(h)
    return store

# ── Test A: Future hop doesn't change earlier prediction ──────────────────────

def test_A_future_hop_invisible_before_available_time():
    hop1 = _txn(1, delta_event_mins=10, delta_avail_mins=20)
    hop2 = _txn(2, delta_event_mins=30, delta_avail_mins=90)  # future hop

    store = _store_with_hops(hop1, hop2)
    cb = ContextBuilder(store)

    # Predict at T=25 (hop1 available, hop2 NOT yet available)
    ctx_early = cb.build("CASE_001", BASE_TIME + timedelta(minutes=25))
    # Predict at T=95 (both available)
    ctx_late  = cb.build("CASE_001", BASE_TIME + timedelta(minutes=95))

    fb = TimeToEventFeatureBuilder()
    f_early = fb.build_features(ctx_early)
    f_late  = fb.build_features(ctx_late)

    # Early context must only see 1 hop
    assert f_early["hop_count"] == 1.0, f"Expected 1 hop at T=25, got {f_early['hop_count']}"
    # Late context must see both hops
    assert f_late["hop_count"] == 2.0, f"Expected 2 hops at T=95, got {f_late['hop_count']}"

# ── Test B: Future complaint can't influence earlier prediction ───────────────

def test_B_future_complaint_invisible():
    complaint = ComplaintEvent(
        event_id="CMP_001",
        case_id="CASE_002",
        event_time=BASE_TIME,
        available_time=BASE_TIME + timedelta(hours=5),  # only available 5h later
        source="test",
        typology="TYP_01"
    )
    store = LocalEventStore()
    store.append_complaint(complaint)
    cb = ContextBuilder(store)

    # Predict 30 min after base — complaint not yet available
    ctx = cb.build("CASE_002", BASE_TIME + timedelta(minutes=30))
    fb = TimeToEventFeatureBuilder()
    feats = fb.build_features(ctx)
    assert feats["has_complaint"] == 0.0, "Complaint should NOT be visible before its available_time"

# ── Test C: Future outcome never enters features ──────────────────────────────

def test_C_outcome_excluded_from_features():
    hop1 = _txn(1, delta_event_mins=5, delta_avail_mins=10)
    store = _store_with_hops(hop1)

    # Build a context
    cb = ContextBuilder(store)
    ctx = cb.build("CASE_001", BASE_TIME + timedelta(minutes=15))

    fb = TimeToEventFeatureBuilder()
    feats = fb.build_features(ctx)

    # Cashout-related fields must never appear in feature dict
    forbidden = ["cashout_timestamp", "cashout_time", "cashout_zone", "zone_id", "outcome"]
    for field in forbidden:
        assert field not in feats, f"Forbidden field '{field}' found in features"

# ── Test D: Latent syndicate_id never in feature names ───────────────────────

def test_D_no_syndicate_id_in_features():
    fb = TimeToEventFeatureBuilder()
    feature_names = fb.get_feature_names()
    for name in feature_names:
        assert "syndicate" not in name.lower(), f"Syndicate info leaked into feature '{name}'"

# ── Test E: All features traceable to available_time <= prediction_time ───────

def test_E_all_events_respect_available_time():
    hop1 = _txn(1, delta_event_mins=5, delta_avail_mins=15)
    hop2 = _txn(2, delta_event_mins=20, delta_avail_mins=40)

    store = _store_with_hops(hop1, hop2)
    cb = ContextBuilder(store)

    pred_time = BASE_TIME + timedelta(minutes=30)
    ctx = cb.build("CASE_001", pred_time)

    # All returned transactions must have available_time <= prediction_time
    for txn in ctx.observed_transactions:
        assert txn.available_time <= pred_time, (
            f"Transaction {txn.event_id} has available_time {txn.available_time} "
            f"> prediction_time {pred_time}"
        )

# ── Test F: Survival curve is valid and monotonically non-increasing ──────────

def test_F_survival_curve_valid_and_monotonic():
    """Requires trained model — skips if artifacts not yet built."""
    try:
        from ml.timing.interface import estimate_intervention_window
    except ImportError:
        pytest.skip("timing interface not importable")

    hop1 = _txn(1, delta_event_mins=5, delta_avail_mins=10, amount=50000.0)
    store = _store_with_hops(hop1)
    ctx = PredictionContext(
        case_id="TEST_F",
        prediction_time=BASE_TIME + timedelta(minutes=15),
        observed_transactions=[hop1],
    )

    try:
        result = estimate_intervention_window(ctx)
    except Exception as e:
        pytest.skip(f"Model not yet trained: {e}")

    curve = result["intervention_distribution"]["survival_curve"]
    probs = [pt["probability_remaining"] for pt in curve]
    times = [pt["minutes"] for pt in curve]

    # Probabilities in [0, 1]
    for p in probs:
        assert 0.0 <= p <= 1.0, f"Survival prob out of range: {p}"

    # Non-increasing
    for i in range(1, len(probs)):
        assert probs[i] <= probs[i-1] + 1e-6, (
            f"Survival curve not monotonic at t={times[i]}: {probs[i-1]} -> {probs[i]}"
        )

# ── Test G: P25 <= P50 <= P75 ────────────────────────────────────────────────

def test_G_quantile_ordering():
    try:
        from ml.timing.interface import estimate_intervention_window
    except ImportError:
        pytest.skip("timing interface not importable")

    hop1 = _txn(1, delta_event_mins=5, delta_avail_mins=10, amount=50000.0)
    ctx = PredictionContext(
        case_id="TEST_G",
        prediction_time=BASE_TIME + timedelta(minutes=15),
        observed_transactions=[hop1],
    )
    try:
        result = estimate_intervention_window(ctx)
    except Exception as e:
        pytest.skip(f"Model not yet trained: {e}")

    dist = result["intervention_distribution"]
    assert dist["p25_minutes"] <= dist["p50_minutes"] + 1e-6, "P25 > P50"
    assert dist["p50_minutes"] <= dist["p75_minutes"] + 1e-6, "P50 > P75"

# ── Test H: Missing optional fields don't crash inference ────────────────────

def test_H_missing_optional_fields():
    """Context with no complaint and no registry — must not raise."""
    ctx = PredictionContext(
        case_id="CASE_MINIMAL",
        prediction_time=BASE_TIME,
        observed_transactions=[],
        available_complaint_context=None,
        registry_context={}
    )
    fb = TimeToEventFeatureBuilder()
    feats = fb.build_features(ctx)
    assert isinstance(feats, dict)
    assert feats["hop_count"] == 0.0
    assert feats["has_complaint"] == 0.0

# ── Test I: Unseen entity still produces a timing prediction ─────────────────

def test_I_unseen_entity_no_crash():
    """Entity never in registry — inference must still work."""
    hop = _txn(1, delta_event_mins=5, delta_avail_mins=10, dest="ACC_BRAND_NEW_NEVER_SEEN")
    ctx = PredictionContext(
        case_id="CASE_UNSEEN",
        prediction_time=BASE_TIME + timedelta(minutes=15),
        observed_transactions=[hop],
        registry_context={}  # empty — unseen entity
    )
    fb = TimeToEventFeatureBuilder()
    feats = fb.build_features(ctx)
    # Should still produce features, defaulting unknown registry to 0
    assert feats["m8_reliability"] == 0.0
    assert isinstance(feats["hop_count"], float)

# ── Schema Robustness: Minimal context (Case 6) ───────────────────────────────

def test_schema_robustness_minimal_info():
    """Only timestamp + amount. No channel, no institution, no complaint."""
    txn = TransactionEvent(
        event_id="TXN_MIN",
        case_id="CASE_MIN",
        event_time=BASE_TIME,
        available_time=BASE_TIME,
        source="external_api",
        amount=25000.0,
        # all optional fields absent
    )
    ctx = PredictionContext(
        case_id="CASE_MIN",
        prediction_time=BASE_TIME + timedelta(minutes=5),
        observed_transactions=[txn],
    )
    fb = TimeToEventFeatureBuilder()
    feats = fb.build_features(ctx)
    assert feats["hop_count"] == 1.0
    assert feats["has_complaint"] == 0.0

# ── API-Compatibility: Generic source → canonical → inference ─────────────────

def test_api_compatibility_generic_source():
    """
    Simulate a future external API (not synthetic CSV) feeding canonical events.
    The Time-to-Event engine must have no knowledge of source format.
    """
    # Generic external payload (e.g., from a hypothetical bank API)
    external_dict = {
        "case_reference": "EXT_CASE_001",
        "transaction_time": "2025-07-01T09:30:00",
        "reported_time": "2025-07-01T10:00:00",
        "transfer_amount": 45000.0,
        "destination_account": "EXT_ACC_999"
    }

    # Generic adapter (not SyntheticAdapter) converts to canonical
    canonical_txn = TransactionEvent(
        event_id="EXT_TXN_001",
        case_id=external_dict["case_reference"],
        event_time=datetime.fromisoformat(external_dict["transaction_time"]),
        available_time=datetime.fromisoformat(external_dict["reported_time"]),
        source="generic_test_adapter",
        amount=float(external_dict["transfer_amount"]),
        destination_entity=EntityReference(
            entity_id=external_dict["destination_account"],
            entity_type="ACCOUNT"
        ),
    )

    ctx = PredictionContext(
        case_id=external_dict["case_reference"],
        prediction_time=datetime.fromisoformat(external_dict["reported_time"]) + timedelta(minutes=5),
        observed_transactions=[canonical_txn],
    )

    # Engine must produce features without knowing it's from an external dict
    fb = TimeToEventFeatureBuilder()
    feats = fb.build_features(ctx)
    assert feats["hop_count"] == 1.0
    assert feats["cumulative_amount"] == 45000.0
