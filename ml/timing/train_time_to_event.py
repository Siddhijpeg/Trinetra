"""
TRINETRA — Time-to-Event Engine Training Pipeline
===================================================

Vectorized training pipeline for the schema-first Time-to-Event Engine.

Data flow (training):
  Synthetic CSVs
      → Vectorized pandas joins (fast path)
      → Canonical feature representation (same logic as TimeToEventFeatureBuilder)
      → Person-period / quantile labels
      → Train Hazard, AFT, Quantile models
      → Calibrate on Month 5
      → Evaluate on untouched Month 6

The schema/adapter canonical path is separately validated by smoke tests.
Training uses the same feature definitions; vectorized for performance.
"""

import os
import sys
import json
import pickle
import numpy as np
import pandas as pd
from datetime import timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from ml.timing.models.dynamic_hazard import DynamicHazardModel
from ml.timing.models.aft_model import AFTModel
from ml.timing.models.quantile_model import QuantileModel

# ─── Config ───────────────────────────────────────────────────────────────────
BIN_WIDTH_MINUTES = 30.0
MAX_MINUTES       = 480.0   # 8 hours — operationally relevant intervention window
MAX_SNAPSHOTS     = 3       # T0, after Hop1, after Hop2

ARTIFACTS_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../artifacts/models/timing_v2'))
METRICS_DIR   = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../artifacts/metrics/timing_v2'))
SPLITS_DIR    = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../data/synthetic_v2/splits'))

# ─── Feature columns (matches TimeToEventFeatureBuilder.get_feature_names()) ──
# Features that can be computed from the CSVs in the same logical way as from
# PredictionContext. Named identically so the same model weights apply at inference.
FEATURE_COLS = [
    "hop_count",
    "cumulative_amount",
    "current_txn_amount",
    "elapsed_since_first_txn",
    "elapsed_since_prev_txn",
    "prediction_hour",
    "prediction_dayofweek",
    "has_complaint",
    "elapsed_since_incident",
    "amount_retained_ratio",
]

# ─── Data loading ─────────────────────────────────────────────────────────────

def load_split(prefix: str):
    """Load one temporal split — complaints, hops, cashouts."""
    cmps  = pd.read_csv(os.path.join(SPLITS_DIR, f"{prefix}_complaints.csv"),
                         parse_dates=["incident_timestamp", "complaint_timestamp", "available_timestamp"])
    hops  = pd.read_csv(os.path.join(SPLITS_DIR, f"{prefix}_hops.csv"),
                         parse_dates=["event_timestamp", "available_timestamp"])
    couts_raw = pd.read_csv(os.path.join(SPLITS_DIR, f"{prefix}_cashout_events.csv"),
                             parse_dates=["event_timestamp"])
    # V2: timestamps may include microseconds — ensure ISO8601 parsing
    for df, cols in [(cmps, ["incident_timestamp","complaint_timestamp","available_timestamp"]),
                     (hops, ["event_timestamp","available_timestamp"]),
                     (couts_raw, ["event_timestamp"])]:
        for c in cols:
            if c in df.columns and df[c].dtype == object:
                df[c] = pd.to_datetime(df[c], format="ISO8601")
    return cmps, hops, couts_raw

# ─── Snapshot builder (vectorized) ────────────────────────────────────────────

def build_snapshots(cmps: pd.DataFrame, hops: pd.DataFrame, couts: pd.DataFrame) -> pd.DataFrame:
    """
    Create multiple as-of-time snapshots per case, enforcing
    available_time <= prediction_time (leakage prevention).

    Snapshot times:
      T0  : 10 minutes before the first hop's event_timestamp
      T1  : 1 second after hop 1's available_timestamp
      T2  : 1 second after hop 2's available_timestamp (if exists)
      T3  : 1 second after hop 3's available_timestamp (if exists)

    Censored cases (status == "CENSORED"):
      - event_observed = False
      - lower_bound_minutes = observed follow-up duration (event_timestamp - prediction_time)
      - upper_bound_minutes = +inf
      - exact_minutes = NaN (no confirmed cashout)
      - These cases produce person-period rows all labelled 0 for Dynamic Hazard.
      - AFT receives lower/upper bounds correctly (event_observed=False → upper=inf).
      - Quantile model excludes them (trains only on event_observed=True).

    Zero-hop cases:
      - T0 is derived from incident_timestamp - 10min rather than first hop.
      - hop_count = 0 at T0.
    """
    # ── Separate observed and censored cashouts ──────────────────────────────
    # V2 cashout_events.csv has a 'status' column
    has_status = "status" in couts.columns
    if has_status:
        couts_obs  = couts[couts["status"] != "CENSORED"].copy()
        couts_cens = couts[couts["status"] == "CENSORED"].copy()
    else:
        couts_obs  = couts.copy()
        couts_cens = pd.DataFrame(columns=couts.columns)

    # ── OBSERVED snapshots ────────────────────────────────────────────────────
    def _make_snaps(couts_sub):
        if len(couts_sub) == 0:
            return pd.DataFrame()

        # 1. Hop snapshot candidate times: available_timestamp + 1s (where pred < cashout)
        hops_m = hops.merge(couts_sub[["complaint_id", "event_timestamp"]].rename(
            columns={"event_timestamp": "cashout_time"}), on="complaint_id")
        if len(hops_m) == 0:
            hop_snaps = pd.DataFrame(columns=["complaint_id","prediction_time","cashout_time"])
        else:
            hops_m["prediction_time"] = hops_m["available_timestamp"] + timedelta(seconds=1)
            hops_m["cashout_time"] = pd.to_datetime(hops_m["cashout_time"])
            hops_m = hops_m[hops_m["prediction_time"] < hops_m["cashout_time"]].copy()
            hops_m = hops_m.sort_values(["complaint_id", "available_timestamp"])
            hops_m["snap_order"] = hops_m.groupby("complaint_id").cumcount() + 1
            hop_snaps = hops_m[hops_m["snap_order"] <= MAX_SNAPSHOTS][
                ["complaint_id", "prediction_time", "cashout_time"]].copy()

        # 2. T0 snapshot: min(event_timestamp) - 10m for cases WITH hops
        t0_with_hops = hops.groupby("complaint_id")["event_timestamp"].min().reset_index()
        t0_with_hops = t0_with_hops.merge(couts_sub[["complaint_id", "event_timestamp"]].rename(
            columns={"event_timestamp": "cashout_time"}), on="complaint_id")
        if len(t0_with_hops) > 0:
            t0_with_hops["cashout_time"] = pd.to_datetime(t0_with_hops["cashout_time"])
            t0_with_hops["prediction_time"] = t0_with_hops["event_timestamp"] - timedelta(minutes=10)
            t0_with_hops = t0_with_hops[t0_with_hops["prediction_time"] < t0_with_hops["cashout_time"]][
                ["complaint_id", "prediction_time", "cashout_time"]].copy()
        else:
            t0_with_hops = pd.DataFrame(columns=["complaint_id","prediction_time","cashout_time"])

        # 3. T0 snapshot: incident_timestamp - 10m for zero-hop cases
        no_hop_ids = set(couts_sub["complaint_id"]) - set(hops["complaint_id"])
        if no_hop_ids:
            zh = cmps[cmps["complaint_id"].isin(no_hop_ids)][
                ["complaint_id", "incident_timestamp"]].copy()
            zh = zh.merge(couts_sub[["complaint_id", "event_timestamp"]].rename(
                columns={"event_timestamp": "cashout_time"}), on="complaint_id", how="inner")
            zh["cashout_time"] = pd.to_datetime(zh["cashout_time"])
            zh["prediction_time"] = pd.to_datetime(zh["incident_timestamp"]) - pd.Timedelta(minutes=10)
            zh = zh[zh["prediction_time"] < zh["cashout_time"]][
                ["complaint_id", "prediction_time", "cashout_time"]].copy()
            # Ensure consistent dtypes before concat
            for col in ["prediction_time", "cashout_time"]:
                t0_with_hops[col] = pd.to_datetime(t0_with_hops[col]) if len(t0_with_hops) > 0 else t0_with_hops[col]
            t0_all = pd.concat([t0_with_hops, zh], ignore_index=True)
        else:
            t0_all = t0_with_hops

        snaps = pd.concat([t0_all, hop_snaps], ignore_index=True).drop_duplicates(
            subset=["complaint_id", "prediction_time"])
        return snaps

    snaps_obs  = _make_snaps(couts_obs)
    snaps_cens = _make_snaps(couts_cens)

    # ── Feature join (same for both) ──────────────────────────────────────────
    def _add_hop_features(snaps):
        if len(snaps) == 0:
            return snaps

        # Ensure datetimes are typed correctly before joins
        snaps = snaps.copy()
        for col in ["prediction_time", "cashout_time"]:
            if col in snaps.columns:
                snaps[col] = pd.to_datetime(snaps[col])

        merged = snaps.merge(
            hops[["complaint_id", "event_timestamp", "available_timestamp", "amount_transferred"]],
            on="complaint_id", how="left"
        )
        # Cast joined datetime columns (may be object/float if hops had no rows)
        for col in ["event_timestamp", "available_timestamp"]:
            if col in merged.columns:
                merged[col] = pd.to_datetime(merged[col], errors="coerce")

        avail_hops = merged[merged["available_timestamp"] <= merged["prediction_time"]].copy()

        if not avail_hops.empty:
            avail_hops = avail_hops.sort_values(["complaint_id", "prediction_time", "event_timestamp"])
            grp = avail_hops.groupby(["complaint_id", "prediction_time"])
            avail_hops["hop_count"] = grp.cumcount() + 1
            avail_hops["cumulative_amount"] = grp["amount_transferred"].cumsum()
            avail_hops["first_event_timestamp"] = grp["event_timestamp"].transform("first")
            avail_hops["prev_event_timestamp"] = grp["event_timestamp"].shift(1)
            avail_hops.loc[avail_hops["hop_count"] == 1, "prev_event_timestamp"] = pd.NaT

            snap_hop_feats = avail_hops.groupby(["complaint_id", "prediction_time"]).last().reset_index()
            res = snaps.merge(
                snap_hop_feats[[
                    "complaint_id", "prediction_time", "hop_count", "cumulative_amount",
                    "amount_transferred", "event_timestamp", "first_event_timestamp", "prev_event_timestamp"
                ]],
                on=["complaint_id", "prediction_time"], how="left"
            )
        else:
            res = snaps.copy()
            for c in ["hop_count", "cumulative_amount", "amount_transferred",
                      "event_timestamp", "first_event_timestamp", "prev_event_timestamp"]:
                res[c] = np.nan

        res["hop_count"] = res["hop_count"].fillna(0.0)
        res["cumulative_amount"] = res["cumulative_amount"].fillna(0.0)
        res["current_txn_amount"] = res["amount_transferred"].fillna(0.0)

        # Cast timestamp cols that may be float (from empty-hops merge)
        for ts_col in ["first_event_timestamp", "prev_event_timestamp", "event_timestamp"]:
            if ts_col in res.columns:
                res[ts_col] = pd.to_datetime(res[ts_col], errors="coerce")

        res["elapsed_since_first_txn"] = np.where(
            res["first_event_timestamp"].notna(),
            (res["prediction_time"] - res["first_event_timestamp"]).dt.total_seconds() / 60.0, 0.0
        )
        res["elapsed_since_prev_txn"] = np.where(
            res["prev_event_timestamp"].notna(),
            (res["event_timestamp"] - res["prev_event_timestamp"]).dt.total_seconds() / 60.0, 0.0
        )
        res["prediction_hour"]      = res["prediction_time"].dt.hour.astype(float)
        res["prediction_dayofweek"] = res["prediction_time"].dt.dayofweek.astype(float)

        # Complaint features (as-of-time)
        cmps_slim = cmps[["complaint_id", "incident_timestamp", "available_timestamp", "amount_inr"]].rename(
            columns={"available_timestamp": "cmp_available_timestamp"}).copy()
        res = res.merge(cmps_slim, on="complaint_id", how="left")
        cmp_avail = (res["prediction_time"] >= res["cmp_available_timestamp"]) & res["cmp_available_timestamp"].notna()
        res["has_complaint"] = cmp_avail.astype(float)
        res["elapsed_since_incident"] = np.where(
            cmp_avail,
            (res["prediction_time"] - res["incident_timestamp"]).dt.total_seconds() / 60.0, 0.0
        )
        res["amount_retained_ratio"] = np.where(
            cmp_avail & (res["amount_inr"] > 0),
            res["current_txn_amount"] / (res["amount_inr"] + 1e-5), 0.0
        )
        res[FEATURE_COLS] = res[FEATURE_COLS].fillna(0.0)
        return res

    snaps_obs  = _add_hop_features(snaps_obs)
    snaps_cens = _add_hop_features(snaps_cens)

    # ── Targets ───────────────────────────────────────────────────────────────
    # Observed: event occurred — exact time known
    if len(snaps_obs) > 0:
        snaps_obs["remaining_minutes"] = (
            snaps_obs["cashout_time"] - snaps_obs["prediction_time"]
        ).dt.total_seconds() / 60.0
        snaps_obs["event_observed"]      = True
        snaps_obs["lower_bound_minutes"] = snaps_obs["remaining_minutes"].clip(lower=0.0)
        snaps_obs["upper_bound_minutes"] = snaps_obs["lower_bound_minutes"]
        snaps_obs["exact_minutes"]       = snaps_obs["lower_bound_minutes"]

    # Censored: observation boundary — cashout did not happen by event_timestamp
    #   lower_bound = observation duration (how long we watched without event)
    #   upper_bound = +infinity (we don't know when/if it will happen)
    #   event_observed = False
    if len(snaps_cens) > 0:
        snaps_cens["remaining_minutes"] = (
            snaps_cens["cashout_time"] - snaps_cens["prediction_time"]
        ).dt.total_seconds() / 60.0
        snaps_cens["event_observed"]      = False
        snaps_cens["lower_bound_minutes"] = snaps_cens["remaining_minutes"].clip(lower=0.0)
        snaps_cens["upper_bound_minutes"] = float('inf')
        snaps_cens["exact_minutes"]       = np.nan   # no confirmed event time

    # ── Combine and clean ─────────────────────────────────────────────────────
    all_cols = ["complaint_id", "prediction_time"] + FEATURE_COLS + [
        "remaining_minutes", "event_observed", "lower_bound_minutes", "upper_bound_minutes", "exact_minutes"
    ]

    parts = []
    if len(snaps_obs) > 0:
        snaps_obs_clean = snaps_obs[all_cols].copy()
        snaps_obs_clean = snaps_obs_clean.dropna(subset=["remaining_minutes"])
        snaps_obs_clean = snaps_obs_clean[snaps_obs_clean["remaining_minutes"] >= 0]
        parts.append(snaps_obs_clean)

    if len(snaps_cens) > 0:
        snaps_cens_clean = snaps_cens[all_cols].copy()
        snaps_cens_clean = snaps_cens_clean[snaps_cens_clean["remaining_minutes"] >= 0]
        # exact_minutes is NaN for censored — that is correct
        parts.append(snaps_cens_clean)

    if not parts:
        return pd.DataFrame(columns=all_cols)

    combined = pd.concat(parts, ignore_index=True)
    combined[FEATURE_COLS] = combined[FEATURE_COLS].fillna(0.0)
    return combined

# ─── Build targets list for model APIs ────────────────────────────────────────

def df_to_targets(df: pd.DataFrame):
    return [
        {
            "event_observed": bool(row["event_observed"]),
            "lower_bound_minutes": float(row["lower_bound_minutes"]),
            "upper_bound_minutes": float(row["upper_bound_minutes"]),
            "exact_minutes": float(row["exact_minutes"]),
        }
        for _, row in df.iterrows()
    ]

# ─── Evaluation helpers ────────────────────────────────────────────────────────

def eval_point(preds, actuals, name=""):
    mae    = np.mean(np.abs(preds - actuals))
    med_ae = np.median(np.abs(preds - actuals))
    p75_ae = np.percentile(np.abs(preds - actuals), 75)
    print(f"  [{name}] MAE={mae:.1f}m  MedAE={med_ae:.1f}m  P75_AE={p75_ae:.1f}m")
    return {"mae": mae, "median_ae": med_ae, "p75_ae": p75_ae}

def brier_at(hazard_model, X, actuals_series, threshold_min):
    """Brier score for P(T > threshold) using survival curve."""
    curves = hazard_model.predict_survival_curve(X)
    probs = []
    for curve in curves:
        prob = 0.0
        for pt in reversed(curve):
            if pt["minutes"] <= threshold_min:
                prob = pt["probability_remaining"]
                break
        probs.append(prob)
    y_true = (actuals_series > threshold_min).astype(float).values
    y_pred = np.array(probs)
    brier = float(np.mean((y_pred - y_true) ** 2))
    print(f"  Brier Score P(T>{threshold_min}m): {brier:.4f}")
    return brier

# ─── Main pipeline ─────────────────────────────────────────────────────────────

def run(subset_n: int = None):
    """
    subset_n: if given, use only this many complaints from train (smoke test mode).
    None = full training run.
    """
    os.makedirs(ARTIFACTS_DIR, exist_ok=True)
    os.makedirs(METRICS_DIR, exist_ok=True)

    metrics = {}

    # ── 1. Load data ──
    print("Loading train split (Months 1-4)...")
    tr_cmps, tr_hops, tr_outs = load_split("train")
    if subset_n:
        ids = tr_cmps["complaint_id"].unique()[:subset_n]
        tr_cmps = tr_cmps[tr_cmps["complaint_id"].isin(ids)]
        tr_hops = tr_hops[tr_hops["complaint_id"].isin(ids)]
        tr_outs = tr_outs[tr_outs["complaint_id"].isin(ids)]
    print(f"  Train Complaints Available: {len(tr_cmps)}")

    # ── 1b. Feature Equivalence Check ──
    from ml.timing.feature_builder import TimeToEventFeatureBuilder
    from core.canonical.events import TransactionEvent
    from core.canonical.schemas import PredictionContext
    fb = TimeToEventFeatureBuilder()
    assert fb.get_feature_names() == FEATURE_COLS, "Train/Inference feature list drift detected!"

    # ── 2. Build snapshots ──
    print("Building dynamic training snapshots...")
    train_df = build_snapshots(tr_cmps, tr_hops, tr_outs)
    print(f"  Valid Train Cases: {train_df['complaint_id'].nunique()}")
    print(f"  Snapshots: {len(train_df)} (Max {MAX_SNAPSHOTS+1} per case)")

    X_train = train_df[FEATURE_COLS]
    y_train = df_to_targets(train_df)
    y_exact = train_df["exact_minutes"].values

    # ── 3. Train models ──
    print("\nTraining Dynamic Hazard Model...")
    hazard = DynamicHazardModel(bin_width_minutes=BIN_WIDTH_MINUTES, max_minutes=MAX_MINUTES,
                                n_estimators=100, max_depth=4, learning_rate=0.1,
                                objective='binary:logistic', random_state=42)
    hazard.fit(X_train, y_train)
    print("  ✓ Hazard model trained")

    print("Training AFT Model...")
    aft = AFTModel(n_estimators=100, max_depth=4, learning_rate=0.1,
                   objective='survival:aft', eval_metric='aft-nloglik',
                   aft_loss_distribution='normal', random_state=42)
    aft.fit(X_train, y_train)
    print("  ✓ AFT model trained")

    print("Training Quantile Models...")
    qm = QuantileModel(quantiles=[0.25, 0.50, 0.75],
                       n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42)
    qm.fit(X_train, y_train)
    print("  ✓ Quantile models trained")

    # ── 4. Validation / Calibration (Month 5) ──
    print("\nLoading validation split (Month 5)...")
    val_cmps, val_hops, val_outs = load_split("val")
    val_df = build_snapshots(val_cmps, val_hops, val_outs)
    X_val  = val_df[FEATURE_COLS]
    y_val  = df_to_targets(val_df)
    
    print("\nFitting Isotonic Calibration on Month 5...")
    from sklearn.isotonic import IsotonicRegression
    # Expand validation set to person-period to calibrate the hazard explicitly
    X_val_exp, y_val_exp = hazard._create_person_period_data(X_val, y_val)
    raw_val_preds = hazard.model.predict_proba(X_val_exp)[:, 1]
    
    calibrator = IsotonicRegression(out_of_bounds='clip', y_min=0.0, y_max=1.0)
    calibrator.fit(raw_val_preds, y_val_exp)
    hazard.calibrator = calibrator
    print("  ✓ Calibration layer fitted (Monotonicity preserved)")

    print("\n=== Validation Metrics (Post-Calibration) ===")
    val_actual = val_df["exact_minutes"].values

    # AFT point
    aft_val_preds = aft.predict(X_val)
    m_aft_val = eval_point(aft_val_preds, val_actual, "AFT")
    metrics["val_aft"] = m_aft_val

    # Quantile
    qpreds_val = qm.predict(X_val)
    m_q_val = eval_point(qpreds_val[0.50], val_actual, "Quantile Median")
    metrics["val_quantile_median"] = m_q_val

    # Coverage check
    p25_val = qpreds_val[0.25]
    p75_val = qpreds_val[0.75]
    coverage = np.mean((val_actual >= p25_val) & (val_actual <= p75_val))
    print(f"  [Quantile P25-P75 Coverage]: {coverage*100:.1f}% (ideal ~50%)")
    metrics["val_quantile_coverage"] = float(coverage)

    # Brier scores
    b30 = brier_at(hazard, X_val, val_df["exact_minutes"], 30)
    b60 = brier_at(hazard, X_val, val_df["exact_minutes"], 60)
    b120 = brier_at(hazard, X_val, val_df["exact_minutes"], 120)
    metrics["val_brier"] = {"t30": b30, "t60": b60, "t120": b120}

    # Monotonicity check
    sample_curves = hazard.predict_survival_curve(X_val.head(10))
    monotone_ok = all(
        all(sample_curves[i][j]["probability_remaining"] >= sample_curves[i][j+1]["probability_remaining"]
            for j in range(len(sample_curves[i])-1))
        for i in range(len(sample_curves))
    )
    print(f"  [Survival Curve Monotonic]: {'✓ PASS' if monotone_ok else '✗ FAIL'}")
    metrics["val_survival_monotonic"] = monotone_ok

    # Quantile ordering
    crossing = np.mean(p25_val > p75_val)
    print(f"  [Quantile Crossing Rate]: {crossing*100:.1f}% (after correction should be 0%)")
    metrics["val_quantile_crossing"] = float(crossing)

    # ── 5. Final Test Evaluation (Month 6 — touch once) ──
    print("\nLoading FINAL test split (Month 6) — touching once...")
    test_cmps, test_hops, test_outs = load_split("test")
    test_df = build_snapshots(test_cmps, test_hops, test_outs)
    X_test  = test_df[FEATURE_COLS]
    print(f"  Test snapshots: {len(test_df)}")

    print("\n=== Final Test Metrics ===")
    test_actual = test_df["exact_minutes"].values

    aft_test_preds = aft.predict(X_test)
    m_aft_test = eval_point(aft_test_preds, test_actual, "AFT")
    metrics["test_aft"] = m_aft_test

    qpreds_test = qm.predict(X_test)
    m_q_test = eval_point(qpreds_test[0.50], test_actual, "Quantile Median")
    metrics["test_quantile_median"] = m_q_test

    p25_test = qpreds_test[0.25]
    p75_test = qpreds_test[0.75]
    cov_test = np.mean((test_actual >= p25_test) & (test_actual <= p75_test))
    print(f"  [Test P25-P75 Coverage]: {cov_test*100:.1f}%")
    metrics["test_quantile_coverage"] = float(cov_test)

    b30_t  = brier_at(hazard, X_test, test_df["exact_minutes"], 30)
    b60_t  = brier_at(hazard, X_test, test_df["exact_minutes"], 60)
    b120_t = brier_at(hazard, X_test, test_df["exact_minutes"], 120)
    metrics["test_brier"] = {"t30": b30_t, "t60": b60_t, "t120": b120_t}

    # ── 6. Serialize artifacts ──
    print("\nSaving artifacts...")
    with open(os.path.join(ARTIFACTS_DIR, "dynamic_hazard.pkl"), "wb") as f: pickle.dump(hazard, f)
    with open(os.path.join(ARTIFACTS_DIR, "aft_model.pkl"),      "wb") as f: pickle.dump(aft, f)
    with open(os.path.join(ARTIFACTS_DIR, "quantile_model.pkl"), "wb") as f: pickle.dump(qm, f)

    config = {
        "bin_width_minutes": BIN_WIDTH_MINUTES,
        "max_minutes": MAX_MINUTES,
        "feature_cols": FEATURE_COLS,
        "prototype_status": "SYNTHETICALLY_VALIDATED_TIME_TO_EVENT_ENGINE",
        "temporal_splits": {
            "train": "Months 1-4",
            "val":   "Month 5",
            "test":  "Month 6 (touched once)"
        }
    }
    with open(os.path.join(ARTIFACTS_DIR, "timing_config.json"), "w") as f:
        json.dump(config, f, indent=2)

    with open(os.path.join(METRICS_DIR, "timing_evaluation.json"), "w") as f:
        json.dump(metrics, f, indent=2)

    print("\n✓ All artifacts saved.")
    print(f"  Models   → {ARTIFACTS_DIR}")
    print(f"  Metrics  → {METRICS_DIR}")
    return metrics

if __name__ == "__main__":
    subset = None
    if "--subset" in sys.argv:
        idx = sys.argv.index("--subset")
        subset = int(sys.argv[idx + 1])

    run(subset_n=subset)
