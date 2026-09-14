import pandas as pd
import numpy as np
import os
import sys
import json
import requests
from datetime import datetime, timedelta
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

SPLITS_DIR = 'data/synthetic/splits'

# 1. Dataset Counts
print("=== 1. DATASET COUNTS ===")
def get_complaint_ids(prefix):
    return set(pd.read_csv(f"{SPLITS_DIR}/{prefix}_complaints.csv")["complaint_id"])
train_cmps = get_complaint_ids("train")
val_cmps = get_complaint_ids("val")
test_cmps = get_complaint_ids("test")
total_cmps = len(train_cmps) + len(val_cmps) + len(test_cmps)
print(f"Total processed complaints: {total_cmps} (Train: {len(train_cmps)}, Val: {len(val_cmps)}, Test: {len(test_cmps)})")

# Reconcile exclusions
# In synthetic_adapter or train_time_to_event.py, what excludes cases?
all_hops = pd.concat([pd.read_csv(f"{SPLITS_DIR}/{p}_hops.csv") for p in ["train", "val", "test"]])
all_cmps = pd.concat([pd.read_csv(f"{SPLITS_DIR}/{p}_complaints.csv") for p in ["train", "val", "test"]])
all_couts = pd.concat([pd.read_csv(f"{SPLITS_DIR}/{p}_cashout_events.csv") for p in ["train", "val", "test"]])

# We can see the exclusions by reproducing the snapshot logic
print(f"Total hops: {len(all_hops)}")
print(f"Total complaints: {len(all_cmps)}")
print(f"Total cashouts: {len(all_couts)}")
# Intersection
cmps_with_hops = set(all_hops["complaint_id"])
cmps_with_couts = set(all_couts["complaint_id"])
cmps_both = cmps_with_hops.intersection(cmps_with_couts)
print(f"Cases with both hops and cashouts: {len(cmps_both)}")


# 2. Dynamic Snapshot Construction
print("\n=== 2. SNAPSHOT DISTRIBUTION (TRAIN) ===")
# Simulate build_snapshots logic for train
tr_cmps = pd.read_csv(f"{SPLITS_DIR}/train_complaints.csv", parse_dates=["incident_timestamp", "complaint_timestamp", "available_timestamp"])
tr_hops = pd.read_csv(f"{SPLITS_DIR}/train_hops.csv", parse_dates=["event_timestamp", "available_timestamp"])
tr_couts = pd.read_csv(f"{SPLITS_DIR}/train_cashout_events.csv", parse_dates=["event_timestamp"])

hops = tr_hops.sort_values(["complaint_id", "available_timestamp"])
hops["hop_count"] = hops.groupby("complaint_id").cumcount() + 1
hops["first_event_timestamp"] = hops.groupby("complaint_id")["event_timestamp"].transform("first")
hops = hops.merge(tr_couts[["complaint_id", "event_timestamp"]].rename(columns={"event_timestamp": "cashout_time"}), on="complaint_id", how="left")
snap_time = hops["available_timestamp"] + timedelta(seconds=1)
hops = hops[snap_time < hops["cashout_time"]].copy()

t0 = hops.groupby("complaint_id").first().reset_index()
t0["prediction_time"] = t0["first_event_timestamp"] - timedelta(minutes=10)
t0 = t0[t0["prediction_time"] < t0["cashout_time"]].copy()
t0["hop_count"] = 0.0

hops["prediction_time"] = snap_time[hops.index]
hops = hops[hops["hop_count"] <= 3].copy()
combined = pd.concat([t0, hops], ignore_index=True)

counts = combined.groupby("complaint_id").size()
print(f"Snapshots per case distribution:")
print(f"Mean: {counts.mean():.3f}")
print(f"Median: {counts.median()}")
print(f"P75: {counts.quantile(0.75)}")
print(f"P90: {counts.quantile(0.90)}")
print(f"Max: {counts.max()}")
print("Counts breakdown:")
print(counts.value_counts().sort_index())

print("\nExamples with 3+ hops:")
multi_hop_cases = counts[counts >= 3].index[:2]
for case_id in multi_hop_cases:
    print(f"Case: {case_id}")
    case_snaps = combined[combined["complaint_id"] == case_id].sort_values("prediction_time")
    for _, row in case_snaps.iterrows():
        print(f"  Snapshot {row['hop_count']}: Pred Time {row['prediction_time']}, Cashout Time {row['cashout_time']}, Remaining Mins {(row['cashout_time']-row['prediction_time']).total_seconds()/60:.1f}")
        # Events visible?
        case_hops = tr_hops[tr_hops["complaint_id"] == case_id]
        visible = case_hops[case_hops["available_timestamp"] <= row['prediction_time']]
        print(f"    Visible hops: {len(visible)} / {len(case_hops)}")

# 4. Overlaps
print("\n=== 4. SPLIT OVERLAPS ===")
overlap1 = train_cmps.intersection(val_cmps)
overlap2 = train_cmps.intersection(test_cmps)
overlap3 = val_cmps.intersection(test_cmps)
print(f"Train/Val overlap: {len(overlap1)}")
print(f"Train/Test overlap: {len(overlap2)}")
print(f"Val/Test overlap: {len(overlap3)}")


# 9. Coverage and Interval Width
print("\n=== 9. COVERAGE INTERVAL WIDTH ===")
with open("artifacts/metrics/timing/timing_evaluation.json") as f:
    eval_metrics = json.load(f)
print(f"Test Coverage P25-P75: {eval_metrics.get('test_quantile_coverage', 0) * 100:.2f}%")

# Generate widths for a sample of Test
te_cmps = pd.read_csv(f"{SPLITS_DIR}/test_complaints.csv", parse_dates=["incident_timestamp", "complaint_timestamp", "available_timestamp"])
te_hops = pd.read_csv(f"{SPLITS_DIR}/test_hops.csv", parse_dates=["event_timestamp", "available_timestamp"])
te_couts = pd.read_csv(f"{SPLITS_DIR}/test_cashout_events.csv", parse_dates=["event_timestamp"])
from ml.timing.train_time_to_event import build_snapshots, FEATURE_COLS
test_df = build_snapshots(te_cmps, te_hops, te_couts)
X_test = test_df[FEATURE_COLS]
import pickle
with open("artifacts/models/timing/quantile_model.pkl", "rb") as f:
    qm = pickle.load(f)
qpreds = qm.predict(X_test)
widths = qpreds[0.75] - qpreds[0.25]
print(f"Direct Quantile P25-P75 Interval Widths:")
print(f"  Mean: {np.mean(widths):.1f}m")
print(f"  Median: {np.median(widths):.1f}m")
print(f"  P75: {np.percentile(widths, 75):.1f}m")

# 15. API Audit
print("\n=== 15. API OUTPUT AUDIT ===")
url = "http://localhost:8001/api/v1/predict"
def test_api(name, payload):
    try:
        r = requests.post(url, json=payload)
        print(f"Test: {name}")
        print(f"  Status: {r.status_code}")
        if r.status_code == 200:
            data = r.json()
            tte = data["time_to_event"]
            print(f"  P25: {tte['intervention_distribution']['p25_minutes']}")
            print(f"  AFT: {tte['companion_estimates']['aft']['expected_minutes']}")
            print(f"  Uncertainty Method: {tte['uncertainty']['method']}")
            if "operational_sla" in tte:
                print(f"  SLA Prob: {tte['operational_sla']['probability_remaining_beyond_sla']}")
        else:
            print(f"  Error: {r.text}")
    except Exception as e:
        print(f"  Error connecting: {e}")

test_api("Normal", {
    "case_id": "API_1",
    "prediction_time": "2025-06-01T10:00:00",
    "hops": [{"event_time": "2025-06-01T09:00:00", "available_time": "2025-06-01T09:00:00", "amount": 100, "destination_account": "ACC_1"}],
    "complaint": {"incident_time": "2025-06-01T08:00:00", "amount_inr": 100},
    "sla_minutes": 60
})

test_api("Minimal Canonical", {
    "case_id": "API_2",
    "prediction_time": "2025-06-01T10:00:00",
    "hops": [{"event_time": "2025-06-01T09:00:00"}],
    "complaint": None,
    "sla_minutes": None
})
