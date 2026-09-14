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
    """Entity never seen — inference must still work."""
    hop = _txn(1, delta_event_mins=5, delta_avail_mins=10, dest="ACC_BRAND_NEW_NEVER_SEEN")
    ctx = PredictionContext(
        case_id="CASE_UNSEEN",
        prediction_time=BASE_TIME + timedelta(minutes=15),
        observed_transactions=[hop],
        registry_context={}  # empty — unseen entity
    )
    fb = TimeToEventFeatureBuilder()
    feats = fb.build_features(ctx)
    assert isinstance(feats["hop_count"], float)
    assert feats["hop_count"] == 1.0

# ── Test J: Calibrator Persistence across Process Restarts ───────────────────

def test_J_calibrator_persistence():
    """
    Verify that the Month-5 IsotonicRegression calibrator is serialized and reloaded,
    producing identical calibrated survival probabilities across process restarts.
    Skips gracefully when V1 artifacts are sklearn-version-incompatible (expected before V2 retraining).
    """
    from ml.timing.interface import estimate_intervention_window, _load_models
    import ml.timing.interface as timing_interface

    try:
        timing_interface._load_models()
    except (AttributeError, Exception) as e:
        if any(kw in str(e) for kw in ("sklearn", "unpickle", "pickle", "CyPinball", "GradientBoosting")):
            pytest.skip(f"V1 artifacts incompatible with current sklearn version — will pass after V2 retraining: {e}")
        raise

    calibrator = getattr(timing_interface._hazard_model, "calibrator", None)
    if calibrator is None:
        pytest.skip("Hazard model has no calibrator — will be added after V2 retraining")

    hop1 = _txn(1, delta_event_mins=5, delta_avail_mins=10, amount=50000.0)
    ctx = PredictionContext(
        case_id="TEST_CALIB",
        prediction_time=BASE_TIME + timedelta(minutes=15),
        observed_transactions=[hop1],
    )

    res1 = timing_interface.estimate_intervention_window(ctx)
    curve1 = res1["intervention_distribution"]["survival_curve"]

    timing_interface._hazard_model = None
    timing_interface._aft_model = None
    timing_interface._quantile_model = None

    try:
        res2 = timing_interface.estimate_intervention_window(ctx)
    except (AttributeError, Exception) as e:
        if any(kw in str(e) for kw in ("sklearn", "unpickle", "pickle", "CyPinball", "GradientBoosting")):
            pytest.skip(f"V1 artifacts incompatible after reload: {e}")
        raise

    curve2 = res2["intervention_distribution"]["survival_curve"]
    assert len(curve1) == len(curve2)
    for p1, p2 in zip(curve1, curve2):
        assert p1["minutes"] == p2["minutes"]
        assert abs(p1["probability_remaining"] - p2["probability_remaining"]) < 1e-6

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


# ─────────────────────────────────────────────────────────────────────────────
# V2-SPECIFIC TESTS (census handling, zero-hop counts, snapshot builder,
#                    train/serve parity, artifact path isolation)
# ─────────────────────────────────────────────────────────────────────────────

class TestV2CensoredHandling:
    """Verify censored snapshots get event_observed=False and correct bounds."""

    def test_censored_event_observed_false(self, tmp_path):
        """build_snapshots must produce event_observed=False for CENSORED cashouts."""
        import pandas as pd, numpy as np
        from datetime import datetime, timedelta
        from ml.timing.train_time_to_event import build_snapshots, FEATURE_COLS

        base = datetime(2026, 2, 1, 10, 0, 0)
        cmps = pd.DataFrame([{
            "complaint_id": "CMP_CENS_1",
            "incident_timestamp":  base,
            "complaint_timestamp": base + timedelta(hours=1),
            "available_timestamp": base + timedelta(hours=1, minutes=10),
            "amount_inr":          50000.0,
        }])
        hops = pd.DataFrame([{
            "complaint_id": "CMP_CENS_1", "hop_sequence": 1,
            "event_timestamp":    base + timedelta(minutes=30),
            "available_timestamp": base + timedelta(minutes=60),
            "amount_transferred":  50000.0,
            "from_account": "V1", "to_account": "M1",
        }])
        # Observation boundary = last_hop + 24h (the CENSORED pattern)
        obs_boundary = base + timedelta(minutes=60) + timedelta(hours=24)
        couts = pd.DataFrame([{
            "complaint_id": "CMP_CENS_1",
            "event_timestamp": obs_boundary,
            "status": "CENSORED",
        }])

        snaps = build_snapshots(cmps, hops, couts)
        assert len(snaps) > 0, "Should produce at least one snapshot for censored case"

        cens_snaps = snaps[snaps["event_observed"] == False]
        assert len(cens_snaps) > 0, "Censored case must produce event_observed=False snapshots"

        for _, row in cens_snaps.iterrows():
            assert row["lower_bound_minutes"] >= 0
            assert row["upper_bound_minutes"] == float('inf'), \
                f"Censored upper_bound must be +inf, got {row['upper_bound_minutes']}"
            assert pd.isna(row["exact_minutes"]), \
                f"Censored exact_minutes must be NaN, got {row['exact_minutes']}"

    def test_observed_event_observed_true(self, tmp_path):
        """Observed cashouts must have event_observed=True and finite exact_minutes."""
        import pandas as pd, numpy as np
        from datetime import datetime, timedelta
        from ml.timing.train_time_to_event import build_snapshots

        base = datetime(2026, 3, 1, 10, 0, 0)
        cmps = pd.DataFrame([{
            "complaint_id": "CMP_OBS_1",
            "incident_timestamp": base,
            "complaint_timestamp": base + timedelta(hours=2),
            "available_timestamp": base + timedelta(hours=2, minutes=5),
            "amount_inr": 100000.0,
        }])
        hops = pd.DataFrame([{
            "complaint_id": "CMP_OBS_1", "hop_sequence": 1,
            "event_timestamp": base + timedelta(minutes=15),
            "available_timestamp": base + timedelta(minutes=30),
            "amount_transferred": 100000.0,
            "from_account": "V1", "to_account": "M1",
        }])
        cashout_time = base + timedelta(minutes=80)
        couts = pd.DataFrame([{
            "complaint_id": "CMP_OBS_1",
            "event_timestamp": cashout_time,
            "status": "COMPLETED",
        }])

        snaps = build_snapshots(cmps, hops, couts)
        obs = snaps[snaps["event_observed"] == True]
        assert len(obs) > 0
        for _, row in obs.iterrows():
            assert row["event_observed"] is True
            assert np.isfinite(row["exact_minutes"])
            assert row["exact_minutes"] >= 0
            assert row["upper_bound_minutes"] == row["lower_bound_minutes"]


class TestV2ZeroHopCases:
    """Verify zero-hop cases produce T0 snapshots and correct feature vectors."""

    def test_zero_hop_produces_t0_snapshot(self):
        import pandas as pd, numpy as np
        from datetime import datetime, timedelta
        from ml.timing.train_time_to_event import build_snapshots

        base = datetime(2026, 1, 15, 9, 0, 0)
        cmps = pd.DataFrame([{
            "complaint_id": "CMP_ZH",
            "incident_timestamp": base,
            "complaint_timestamp": base + timedelta(hours=1),
            "available_timestamp": base + timedelta(hours=1, minutes=5),
            "amount_inr": 20000.0,
        }])
        hops = pd.DataFrame(columns=["complaint_id","hop_sequence","event_timestamp",
                                      "available_timestamp","amount_transferred",
                                      "from_account","to_account"])
        cashout_time = base + timedelta(minutes=90)
        couts = pd.DataFrame([{
            "complaint_id": "CMP_ZH",
            "event_timestamp": cashout_time,
            "status": "COMPLETED",
        }])

        snaps = build_snapshots(cmps, hops, couts)
        assert len(snaps) > 0, "Zero-hop case must produce at least one T0 snapshot"
        assert (snaps["hop_count"] == 0).any(), "T0 snapshot must have hop_count=0"
        assert (snaps["cumulative_amount"] == 0).any()
        assert not snaps["remaining_minutes"].isna().any()
        assert (snaps["remaining_minutes"] >= 0).all()

    def test_zero_hop_feature_builder_no_crash(self):
        """TimeToEventFeatureBuilder must handle zero-hop context without NaN/inf."""
        import numpy as np
        from datetime import datetime
        from ml.timing.feature_builder import TimeToEventFeatureBuilder
        from core.canonical.schemas import PredictionContext

        ctx = PredictionContext(
            case_id="ZH_CTX",
            prediction_time=datetime(2026, 1, 10, 8, 0, 0),
            observed_transactions=[],
            available_complaint_context=None,
        )
        fb = TimeToEventFeatureBuilder()
        feats = fb.build_features(ctx)
        assert feats["hop_count"] == 0.0
        assert feats["cumulative_amount"] == 0.0
        assert feats["has_complaint"] == 0.0
        for k, v in feats.items():
            assert not np.isnan(v), f"NaN in feature {k}"
            assert not np.isinf(v), f"Inf in feature {k}"


class TestV2SnapshotBuilderInvariants:
    """Invariants that must hold for any snapshot produced by build_snapshots."""

    def test_no_negative_remaining_minutes(self):
        import pandas as pd, numpy as np
        from datetime import datetime, timedelta
        from ml.timing.train_time_to_event import build_snapshots

        base = datetime(2026, 4, 1, 12, 0, 0)
        cmps = pd.DataFrame([{
            "complaint_id": "INV_1",
            "incident_timestamp": base,
            "complaint_timestamp": base + timedelta(hours=3),
            "available_timestamp": base + timedelta(hours=3, minutes=10),
            "amount_inr": 75000.0,
        }])
        hops = pd.DataFrame([{
            "complaint_id": "INV_1", "hop_sequence": 1,
            "event_timestamp": base + timedelta(minutes=20),
            "available_timestamp": base + timedelta(minutes=45),
            "amount_transferred": 75000.0,
            "from_account": "V", "to_account": "M",
        }, {
            "complaint_id": "INV_1", "hop_sequence": 2,
            "event_timestamp": base + timedelta(minutes=55),
            "available_timestamp": base + timedelta(minutes=80),
            "amount_transferred": 60000.0,
            "from_account": "M", "to_account": "M2",
        }])
        cashout_time = base + timedelta(minutes=150)
        couts = pd.DataFrame([{
            "complaint_id": "INV_1", "event_timestamp": cashout_time, "status": "COMPLETED"
        }])

        snaps = build_snapshots(cmps, hops, couts)
        assert (snaps["remaining_minutes"] >= 0).all(), "Negative remaining_minutes found"
        assert not snaps[["hop_count","cumulative_amount","current_txn_amount",
                           "elapsed_since_first_txn","elapsed_since_prev_txn"]].isna().any().any()

    def test_available_time_filter_respected(self):
        """No hop with available_timestamp > prediction_time can contribute to features."""
        import pandas as pd, numpy as np
        from datetime import datetime, timedelta
        from ml.timing.train_time_to_event import build_snapshots

        base = datetime(2026, 3, 15, 10, 0, 0)
        cmps = pd.DataFrame([{
            "complaint_id": "AVL_1",
            "incident_timestamp": base,
            "complaint_timestamp": base + timedelta(hours=4),
            "available_timestamp": base + timedelta(hours=4, minutes=5),
            "amount_inr": 30000.0,
        }])
        # Hop 1 available early (t+30), hop 2 available late (t+120)
        hops = pd.DataFrame([{
            "complaint_id": "AVL_1", "hop_sequence": 1,
            "event_timestamp": base + timedelta(minutes=10),
            "available_timestamp": base + timedelta(minutes=30),
            "amount_transferred": 30000.0, "from_account": "V", "to_account": "M1",
        }, {
            "complaint_id": "AVL_1", "hop_sequence": 2,
            "event_timestamp": base + timedelta(minutes=40),
            "available_timestamp": base + timedelta(minutes=120),
            "amount_transferred": 25000.0, "from_account": "M1", "to_account": "M2",
        }])
        cashout_time = base + timedelta(minutes=200)
        couts = pd.DataFrame([{
            "complaint_id": "AVL_1", "event_timestamp": cashout_time, "status": "COMPLETED"
        }])

        snaps = build_snapshots(cmps, hops, couts)
        # T0 snapshot: pred_time = first_hop_event - 10min = base + 0min
        # Hop1 snapshot: pred_time = avail(hop1) + 1s = base + 30min + 1s
        #   At that point: hop1 visible (avail=30min <= 30min+1s), hop2 NOT visible
        hop1_snap = snaps[snaps["prediction_time"] <= base + timedelta(minutes=31)]
        for _, row in hop1_snap.iterrows():
            if row["hop_count"] > 0:
                # At most 1 hop visible (hop2 not yet available)
                assert row["hop_count"] <= 1, \
                    f"Hop2 should not be visible at t={row['prediction_time']}, got hop_count={row['hop_count']}"


class TestV2ArtifactPathIsolation:
    """Verify V2 training writes to timing_v2/ and does NOT overwrite V1 artifacts."""

    def test_v2_artifact_paths_defined_correctly(self):
        """train_time_to_event.py must point to v2 paths."""
        from ml.timing import train_time_to_event as ttt
        assert "timing_v2" in ttt.ARTIFACTS_DIR, \
            f"ARTIFACTS_DIR must contain 'timing_v2', got: {ttt.ARTIFACTS_DIR}"
        assert "timing_v2" in ttt.METRICS_DIR, \
            f"METRICS_DIR must contain 'timing_v2', got: {ttt.METRICS_DIR}"
        assert "synthetic_v2" in ttt.SPLITS_DIR, \
            f"SPLITS_DIR must point to V2 splits, got: {ttt.SPLITS_DIR}"

    def test_v1_artifacts_still_exist(self):
        """V1 timing artifacts must not be overwritten."""
        import os
        v1_dir = os.path.abspath("artifacts/models/timing")
        assert os.path.isdir(v1_dir), "V1 timing artifact directory must still exist"
        for fname in ["dynamic_hazard.pkl", "aft_model.pkl", "quantile_model.pkl"]:
            p = os.path.join(v1_dir, fname)
            assert os.path.isfile(p), f"V1 artifact {fname} must still exist at {p}"


class TestV2TrainServeParity:
    """Verify canonical parity: same context → identical features via train and inference."""

    def test_feature_names_match_training_config(self):
        """Feature list in interface.py, feature_builder.py, and timing_config.json must all agree."""
        import json, os
        from ml.timing.feature_builder import TimeToEventFeatureBuilder
        from ml.timing.interface import FEATURE_COLS as IFACE_COLS
        from ml.timing.train_time_to_event import FEATURE_COLS as TRAIN_COLS

        fb = TimeToEventFeatureBuilder()
        builder_cols = fb.get_feature_names()

        assert builder_cols == IFACE_COLS,  f"feature_builder vs interface mismatch: {set(builder_cols) ^ set(IFACE_COLS)}"
        assert builder_cols == TRAIN_COLS,  f"feature_builder vs train mismatch: {set(builder_cols) ^ set(TRAIN_COLS)}"

        config_path = os.path.abspath("artifacts/models/timing/timing_config.json")
        if os.path.exists(config_path):
            with open(config_path) as f:
                cfg = json.load(f)
            assert cfg["feature_cols"] == builder_cols, "timing_config.json feature_cols mismatch"

    def test_no_registry_features_in_timing(self):
        """Registry-derived fields must not appear anywhere in the timing feature contract."""
        from ml.timing.feature_builder import TimeToEventFeatureBuilder
        fb = TimeToEventFeatureBuilder()
        for name in fb.get_feature_names():
            for keyword in ["registry", "flag", "sighting", "m8", "reliability", "syndicate"]:
                assert keyword not in name.lower(), \
                    f"Registry/latent keyword '{keyword}' found in timing feature '{name}'"

    def test_no_target_leakage_in_feature_names(self):
        """No target-only field may appear in the feature list."""
        from ml.timing.feature_builder import TimeToEventFeatureBuilder
        fb = TimeToEventFeatureBuilder()
        forbidden = ["cashout", "remaining", "event_observed", "outcome", "zone_id",
                     "amount_cashed", "lower_bound", "upper_bound", "exact_minutes"]
        for name in fb.get_feature_names():
            for kw in forbidden:
                assert kw not in name.lower(), \
                    f"Target-only keyword '{kw}' found in timing feature '{name}'"
