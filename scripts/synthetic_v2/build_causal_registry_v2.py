#!/usr/bin/env python3
"""
TRINETRA — V2 Causal Registry Builder
========================================
Builds a per-complaint as-of-time registry snapshot for every training example.

Problem with the static registry (rich_registry_v2.json):
  A January snapshot at prediction_time=Jan-5 uses a registry built from
  the ENTIRE 4-month train period. The zone_counts for account X include
  hops from February, March, and April — none of which were available at
  prediction_time=Jan-5. This is within-train temporal leakage.

This script produces:
  artifacts/registry/causal_registry_v2.parquet
  artifacts/registry/causal_registry_v2_metadata.json

The artifact is a long-format table keyed by (complaint_id, account_id) with
the causal registry state for each training snapshot.

Schema:
  complaint_id          FK → training complaint
  prediction_time       ISO timestamp (T0 = incident_time)
  account_id            destination mule account
  causal_sightings      # times account appeared as hop dest with avail_dt < pred_time
  causal_zone_counts    JSON string: {zone_id: count}, build from avail_dt < pred_time hops
  causal_entropy        Shannon entropy over causal zone distribution
  causal_risk_weight    2.0 × strength × consistency (M8 formula)
  causal_in_registry    bool: causal_sightings > 0

Usage:
  python scripts/synthetic_v2/build_causal_registry_v2.py

Notes:
  - Only train-split data is used (Months 1–4)
  - Only hops with available_timestamp < prediction_time contribute
  - Only hops with zone_id not null contribute (non-censored cashout outcomes)
  - This does NOT replace rich_registry_v2.json (which remains the deployment-time
    final-state artifact for production inference)
  - This causal table is used DURING TRAINING only, so each complaint's M8
    evidence update uses only history available before that prediction time

Runtime: ~60–120 seconds for 39,220 training complaints
"""

import os, sys, json, warnings
import pandas as pd
import numpy as np

warnings.filterwarnings("ignore")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
P    = os.path.join(ROOT, "data/synthetic_v2")
OUT  = os.path.join(ROOT, "artifacts/registry/causal_registry_v2.parquet")
META = os.path.join(ROOT, "artifacts/registry/causal_registry_v2_metadata.json")

print("=" * 65)
print("  TRINETRA V2 Causal Registry Builder")
print("  Produces per-snapshot as-of-time registry for M8 training")
print("=" * 65)

# ── Load ───────────────────────────────────────────────────────────────────────
tr_comp = pd.read_csv(f"{P}/splits/train_complaints.csv")
tr_hops = pd.read_csv(f"{P}/splits/train_hops.csv")
tr_cout = pd.read_csv(f"{P}/splits/train_cashout_events.csv")
accs    = pd.read_csv(f"{P}/accounts.csv")
ents    = pd.read_csv(f"{P}/mule_entities.csv")

tr_hops["avail_dt"] = pd.to_datetime(tr_hops["available_timestamp"], format="ISO8601")
tr_comp["inc_dt"]   = pd.to_datetime(tr_comp["incident_timestamp"],  format="ISO8601")
tr_cout["cash_dt"]  = pd.to_datetime(tr_cout["event_timestamp"],     format="ISO8601")

mule_ids      = set(accs[accs["is_mule"]]["account_id"])
ent_to_tier   = ents.set_index("entity_id")["tier"].to_dict()
acc_to_ent    = (accs[accs["is_mule"] & accs["entity_id"].notna()]
                 .set_index("account_id")["entity_id"].to_dict())

print(f"\n  Train complaints : {len(tr_comp):,}")
print(f"  Train hops       : {len(tr_hops):,}")

# ── Pre-filter: only usable hops (avail < cashout, zone known) ────────────────
hops_valid = tr_hops.merge(
    tr_cout[["complaint_id","cash_dt","zone_id"]],
    on="complaint_id", how="inner"
)
hops_valid = hops_valid[
    (hops_valid["avail_dt"] < hops_valid["cash_dt"]) &
    hops_valid["zone_id"].notna() &
    hops_valid["to_account"].isin(mule_ids)
].copy()

print(f"  Usable hops (avail < cashout, non-censored, mule dest): {len(hops_valid):,}")

# ── Sort ALL usable hops by avail_dt once ─────────────────────────────────────
hops_sorted = hops_valid[["complaint_id","to_account","avail_dt","zone_id"]].sort_values("avail_dt")
print(f"\n  Building causal registry snapshots …")

# ── For each training complaint: compute causal registry at its prediction time ─
# T0 = incident_time  (the training pipeline uses T0 = inc_time - 10min, but the
# strict causal bound is: all hops with avail_dt < inc_time are safe to include)
records = []

complaints = tr_comp[["complaint_id","inc_dt"]].copy()
complaints = complaints.sort_values("inc_dt")

# Build incrementally: maintain a running hop table sorted by avail_dt
# For each prediction_time t, all hops with avail_dt < t are the causal history
# Group hops by account on-the-fly using a sort + scan

# Pre-group valid hops by account for fast per-account lookup
acc_hop_list = {}  # acc → sorted list of (avail_dt, zone_id)
for _, row in hops_sorted.iterrows():
    acc = row["to_account"]
    if acc not in acc_hop_list:
        acc_hop_list[acc] = []
    acc_hop_list[acc].append((row["avail_dt"], row["zone_id"]))
# Pre-sorted by avail_dt (hops_sorted is already sorted)

def compute_causal_entry(account_id: str, pred_time: pd.Timestamp) -> dict:
    """Compute registry state for account_id as of pred_time."""
    hops = acc_hop_list.get(account_id, [])
    # Only hops available before pred_time (hops list is sorted by avail_dt)
    zone_counts: dict[str, int] = {}
    causal_n = 0
    for (avail_dt, zone_id) in hops:
        if avail_dt >= pred_time:
            break  # sorted — no need to check further
        causal_n += 1
        zone_counts[zone_id] = zone_counts.get(zone_id, 0) + 1

    if causal_n == 0:
        return {"causal_sightings": 0, "causal_zone_counts": "{}", "causal_entropy": 0.0,
                "causal_risk_weight": 0.0, "causal_in_registry": False}

    # Entropy
    total = sum(zone_counts.values())
    if total > 1 and len(zone_counts) > 1:
        probs = np.array(list(zone_counts.values())) / total
        entropy = float(-np.sum(probs * np.log2(probs + 1e-12)))
        max_ent = np.log2(len(zone_counts))
        norm_entropy = float(entropy / max_ent) if max_ent > 0 else 0.0
    else:
        norm_entropy = 0.0

    strength    = causal_n / (causal_n + 5.0)
    consistency = 1.0 - norm_entropy
    risk_weight = float(2.0 * strength * consistency)

    return {
        "causal_sightings":   causal_n,
        "causal_zone_counts": json.dumps(zone_counts),
        "causal_entropy":     round(norm_entropy, 4),
        "causal_risk_weight": round(risk_weight, 4),
        "causal_in_registry": True,
    }


# Process each complaint's destination accounts
n_total = len(tr_comp)
for i, (_, comp_row) in enumerate(complaints.iterrows()):
    if i % 5000 == 0:
        print(f"    {i:>6,} / {n_total:,} complaints …")

    cid       = comp_row["complaint_id"]
    pred_time = comp_row["inc_dt"]

    # Get destination accounts for this complaint's hops
    case_hops = tr_hops[tr_hops["complaint_id"] == cid]
    dest_accs = [a for a in case_hops["to_account"].unique() if a in mule_ids]

    for acc in dest_accs:
        entry = compute_causal_entry(acc, pred_time)
        entry["complaint_id"]    = cid
        entry["prediction_time"] = pred_time.isoformat()
        entry["account_id"]      = acc
        records.append(entry)

print(f"  Total (complaint, account) snapshot pairs: {len(records):,}")

# ── Build DataFrame ────────────────────────────────────────────────────────────
df = pd.DataFrame(records, columns=[
    "complaint_id", "prediction_time", "account_id",
    "causal_sightings", "causal_zone_counts",
    "causal_entropy", "causal_risk_weight", "causal_in_registry"
])

# ── Verify leakage-free ────────────────────────────────────────────────────────
print(f"\n  Verifying causal isolation on 50 random snapshots …")
sample = df[df["causal_in_registry"]].sample(min(50, len(df)), random_state=42)
violations = 0
for _, row in sample.iterrows():
    pred_dt = pd.to_datetime(row["prediction_time"], format="ISO8601")
    acc     = row["account_id"]
    hops_in_reg = acc_hop_list.get(acc, [])
    for (avail_dt, _) in hops_in_reg:
        if avail_dt < pred_dt:
            pass  # correct — this hop IS in the causal window
        # No hop after pred_dt should be counted
    n_after = sum(1 for (avail_dt, _) in hops_in_reg if avail_dt >= pred_dt)
    n_counted = row["causal_sightings"]
    n_expected = sum(1 for (avail_dt, _) in hops_in_reg if avail_dt < pred_dt)
    if n_counted != n_expected:
        violations += 1

print(f"  Leakage violations: {violations} / 50  "
      f"{'✅ CLEAN' if violations == 0 else '❌ FAIL'}")

# ── Save ───────────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(OUT), exist_ok=True)
df.to_parquet(OUT, index=False)

meta = {
    "total_snapshot_pairs":  len(df),
    "complaints_covered":    df["complaint_id"].nunique(),
    "accounts_covered":      df["account_id"].nunique(),
    "in_registry_pct":       round(100 * df["causal_in_registry"].mean(), 2),
    "zero_history_pct":      round(100 * (~df["causal_in_registry"]).mean(), 2),
    "mean_causal_sightings": round(df["causal_sightings"].mean(), 2),
    "source":                "TRAIN split (Months 1-4) only",
    "causal_rule":           "avail_dt < complaint.incident_timestamp",
    "output_file":           OUT,
    "leakage_violations":    violations,
}
with open(META, "w") as f:
    json.dump(meta, f, indent=2)

print(f"\n  ✅ Causal registry written to: {OUT}")
print(f"     {len(df):,} rows  ({df['complaint_id'].nunique():,} complaints, "
      f"{df['account_id'].nunique():,} unique accounts)")
print(f"  ✅ Metadata: {META}")
print(f"\n  Coverage: {meta['in_registry_pct']}% of snapshots have causal history")
print(f"  No-history: {meta['zero_history_pct']}% have 0 prior sightings at pred_time")
print(f"  Mean causal sightings: {meta['mean_causal_sightings']}")
print("=" * 65)
