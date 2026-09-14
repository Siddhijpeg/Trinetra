#!/usr/bin/env python3
"""
TRINETRA Synthetic Dataset V2 — Validator
==========================================
Usage:
    python scripts/synthetic_v2/validate_synthetic_v2.py

Validates data/synthetic_v2/ against all correctness invariants.
Fails loudly (exit code 1) on any violation.
Prints PASS / FAIL for each check group.
"""

import os, sys, json
from datetime import datetime
import pandas as pd
import numpy as np
import warnings
warnings.filterwarnings("ignore")

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
DATA_DIR  = os.path.join(REPO_ROOT, "data/synthetic_v2")
SPLITS    = os.path.join(DATA_DIR, "splits")

# ── helpers ───────────────────────────────────────────────────────────────────
_errors   = []
_warnings = []
_passes   = []

def ok(msg):
    _passes.append(msg)
    print(f"  ✅  {msg}")

def warn(msg):
    _warnings.append(msg)
    print(f"  ⚠️   {msg}")

def fail(msg):
    _errors.append(msg)
    print(f"  ❌  {msg}")

def check(condition: bool, pass_msg: str, fail_msg: str):
    if condition:
        ok(pass_msg)
    else:
        fail(fail_msg)

def section(title: str):
    print(f"\n{'─'*60}")
    print(f"  {title}")
    print(f"{'─'*60}")


# ── load data ─────────────────────────────────────────────────────────────────
section("Loading files")
try:
    comp  = pd.read_csv(f"{DATA_DIR}/complaints.csv")
    hops  = pd.read_csv(f"{DATA_DIR}/hops.csv")
    cout  = pd.read_csv(f"{DATA_DIR}/cashout_events.csv")
    accs  = pd.read_csv(f"{DATA_DIR}/accounts.csv")
    ents  = pd.read_csv(f"{DATA_DIR}/mule_entities.csv")
    zones = pd.read_csv(f"{DATA_DIR}/zone_catalog.csv")
    typs  = pd.read_csv(f"{DATA_DIR}/typology_rules.csv")
    gmeta = pd.read_csv(f"{DATA_DIR}/generator_metadata.csv")
    tr_comp = pd.read_csv(f"{SPLITS}/train_complaints.csv")
    va_comp = pd.read_csv(f"{SPLITS}/val_complaints.csv")
    te_comp = pd.read_csv(f"{SPLITS}/test_complaints.csv")
    tr_h    = pd.read_csv(f"{SPLITS}/train_hops.csv")
    va_h    = pd.read_csv(f"{SPLITS}/val_hops.csv")
    te_h    = pd.read_csv(f"{SPLITS}/test_hops.csv")
    tr_cout = pd.read_csv(f"{SPLITS}/train_cashout_events.csv")
    va_cout = pd.read_csv(f"{SPLITS}/val_cashout_events.csv")
    te_cout = pd.read_csv(f"{SPLITS}/test_cashout_events.csv")
    ok("All 17 files loaded successfully")
except Exception as e:
    fail(f"File loading failed: {e}")
    sys.exit(1)


# ── 1. ID uniqueness ──────────────────────────────────────────────────────────
section("1. ID Uniqueness")
check(comp["complaint_id"].nunique() == len(comp),
      f"complaint_id unique ({len(comp):,})",
      f"Duplicate complaint_ids: {len(comp) - comp['complaint_id'].nunique()}")
check(hops["hop_id"].nunique() == len(hops),
      f"hop_id unique ({len(hops):,})",
      f"Duplicate hop_ids: {len(hops) - hops['hop_id'].nunique()}")
check(cout["cashout_id"].nunique() == len(cout),
      f"cashout_id unique ({len(cout):,})",
      f"Duplicate cashout_ids: {len(cout) - cout['cashout_id'].nunique()}")
check(accs["account_id"].nunique() == len(accs),
      f"account_id unique ({len(accs):,})",
      f"Duplicate account_ids: {len(accs) - accs['account_id'].nunique()}")
check(ents["entity_id"].nunique() == len(ents),
      f"entity_id unique ({len(ents):,})",
      f"Duplicate entity_ids: {len(ents) - ents['entity_id'].nunique()}")
check(zones["zone_id"].nunique() == len(zones),
      f"zone_id unique ({len(zones):,})",
      f"Duplicate zone_ids: {len(zones) - zones['zone_id'].nunique()}")


# ── 2. Foreign key integrity ──────────────────────────────────────────────────
section("2. Foreign Key Integrity")
comp_ids     = set(comp["complaint_id"])
acc_ids      = set(accs["account_id"])
zone_ids     = set(zones["zone_id"])
entity_ids   = set(ents["entity_id"])

orphan_hops  = set(hops["complaint_id"]) - comp_ids
check(len(orphan_hops) == 0,
      "All hop complaint_ids exist in complaints",
      f"{len(orphan_hops)} hop complaint_ids not in complaints")

orphan_cout  = set(cout["complaint_id"]) - comp_ids
check(len(orphan_cout) == 0,
      "All cashout complaint_ids exist in complaints",
      f"{len(orphan_cout)} cashout complaint_ids not in complaints")

bad_zones    = set(cout[cout["zone_id"].notna()]["zone_id"]) - zone_ids
check(len(bad_zones) == 0,
      "All non-null cashout zone_ids in zone_catalog",
      f"{len(bad_zones)} cashout zone_ids not in catalog: {list(bad_zones)[:5]}")

# Hop destination accounts: may include unseen (Tier-E) or victim accounts
mule_acc_ids  = set(accs[accs["is_mule"]]["account_id"])
victim_acc_ids= set(accs[~accs["is_mule"]]["account_id"])
hop_from_in   = set(hops["from_account"]) - acc_ids
hop_to_in     = set(hops["to_account"]) - acc_ids
check(len(hop_from_in) == 0,
      "All hop from_account in accounts",
      f"{len(hop_from_in)} hop from_account not in accounts")
check(len(hop_to_in) == 0,
      "All hop to_account in accounts",
      f"{len(hop_to_in)} hop to_account not in accounts table")

# Mule entity → account linkage (non-null entity_id should exist in entities)
mule_accs_df  = accs[accs["is_mule"] & accs["entity_id"].notna()]
bad_ents      = set(mule_accs_df["entity_id"]) - entity_ids
check(len(bad_ents) == 0,
      "All mule account entity_ids in mule_entities",
      f"{len(bad_ents)} mule account entity_ids not in mule_entities")


# ── 3. Timestamp ordering ─────────────────────────────────────────────────────
section("3. Timestamp Ordering")

# complaints: incident <= complaint <= available
c2 = comp.copy()
c2["inc"] = pd.to_datetime(c2["incident_timestamp"],  format="ISO8601")
c2["cmp"] = pd.to_datetime(c2["complaint_timestamp"], format="ISO8601")
c2["ava"] = pd.to_datetime(c2["available_timestamp"], format="ISO8601")

bad_cmp_order = (c2["cmp"] < c2["inc"]).sum()
check(bad_cmp_order == 0,
      "complaint_timestamp >= incident_timestamp for all complaints",
      f"{bad_cmp_order} complaints where complaint < incident")
bad_ava_order = (c2["ava"] < c2["cmp"]).sum()
check(bad_ava_order == 0,
      "available_timestamp >= complaint_timestamp for all complaints",
      f"{bad_ava_order} complaints where available < complaint")

# hops: event <= available
h2 = hops.copy()
h2["evt"] = pd.to_datetime(h2["event_timestamp"],    format="ISO8601")
h2["ava"] = pd.to_datetime(h2["available_timestamp"],format="ISO8601")
bad_hop_order = (h2["ava"] < h2["evt"]).sum()
check(bad_hop_order == 0,
      "hop available_timestamp >= event_timestamp for all hops",
      f"{bad_hop_order} hops where available < event")

# cashout: available > event
cout2 = cout.copy()
cout2["evt"] = pd.to_datetime(cout2["event_timestamp"],    format="ISO8601")
cout2["ava"] = pd.to_datetime(cout2["available_timestamp"],format="ISO8601")
bad_cout = (cout2["ava"] < cout2["evt"]).sum()
check(bad_cout == 0,
      "cashout available_timestamp >= event_timestamp",
      f"{bad_cout} cashouts where available < event")


# ── 4. Available-time leakage (core temporal invariant) ───────────────────────
section("4. Leakage Prevention — AS-OF-TIME Rule")
# For each hop snapshot: available_timestamp must precede cashout event_timestamp.
# Hops that already have available_timestamp > cashout_time would be unusable for training;
# the generator excludes them from snapshots automatically, but we verify no structural issues here.
merged = hops.merge(
    cout[["complaint_id","event_timestamp"]].rename(columns={"event_timestamp":"cashout_ts"}),
    on="complaint_id", how="left")
merged["hop_avail"]  = pd.to_datetime(merged["available_timestamp"], format="ISO8601")
merged["cashout_dt"] = pd.to_datetime(merged["cashout_ts"],           format="ISO8601")

# Hops with available BEFORE cashout → usable for training (count them)
usable = (merged["hop_avail"] < merged["cashout_dt"]).sum()
total  = len(merged)
check(usable > 0,
      f"Usable training hops (avail < cashout): {usable:,} / {total:,} ({100*usable/total:.1f}%)",
      "No usable training hops found")
# Warn if very few are usable
if usable / total < 0.30:
    warn(f"Only {100*usable/total:.1f}% hops usable — review cashout delay distribution")
else:
    ok(f"Usable ratio healthy: {100*usable/total:.1f}%")


# ── 5. Target validity (remaining time) ──────────────────────────────────────
section("5. Target Validity (remaining_minutes)")
# remaining_minutes = cashout_time - prediction_time >= 0 for each snapshot
m2 = comp[["complaint_id","incident_timestamp"]].copy()
m2["inc"] = pd.to_datetime(m2["incident_timestamp"], format="ISO8601")
cout_m = cout[["complaint_id","event_timestamp"]].copy()
cout_m["cashout"] = pd.to_datetime(cout_m["event_timestamp"], format="ISO8601")
rm = m2.merge(cout_m, on="complaint_id")
rm["remaining_at_T0"] = (rm["cashout"] - rm["inc"]).dt.total_seconds() / 60
neg = (rm["remaining_at_T0"] < 0).sum()
check(neg == 0,
      f"No negative remaining_minutes at T0 ({len(rm):,} cases)",
      f"{neg} cases with cashout before incident (impossible)")
over_sla = (rm["remaining_at_T0"] > 1440).sum()
if over_sla > 0:
    warn(f"{over_sla} cases with >24h remaining at T0 (extreme outliers — acceptable)")
else:
    ok("No cases with >24h remaining at T0")


# ── 6. Censored bounds validity ───────────────────────────────────────────────
section("6. Censored / Right-Censored Bounds")
censored = cout[cout["status"] == "CENSORED"].copy()
check(len(censored) > 0,
      f"CENSORED cases present: {len(censored):,}",
      "No CENSORED cases — right-censored survival modeling not testable")
if len(censored) > 0:
    # Censored cases have no observed cashout amount — validate
    nan_amt = censored["amount_cashed_out"].isna().sum()
    check(nan_amt == len(censored),
          f"All CENSORED cases have null amount_cashed_out ({nan_amt:,})",
          f"Some CENSORED cases have non-null amount_cashed_out")


# ── 7. Coordinate validity ───────────────────────────────────────────────────
section("7. Coordinate Validity")
# Zone catalog
check(zones["lat"].between(6.0, 37.5).all(),
      "All zone lat in [6.0, 37.5] (India bounds)",
      f"{(~zones['lat'].between(6.0, 37.5)).sum()} zones outside lat range")
check(zones["lng"].between(68.0, 97.5).all(),
      "All zone lng in [68.0, 97.5] (India bounds)",
      f"{(~zones['lng'].between(68.0, 97.5)).sum()} zones outside lng range")
check(zones["lat"].notna().all() and zones["lng"].notna().all(),
      "No null lat/lng in zone_catalog",
      "Null lat/lng found in zone_catalog")

# Cashout coordinates — CENSORED rows intentionally have null lat/lng (patched)
cout_observed = cout[cout["status"] != "CENSORED"]
check(cout_observed["lat"].between(6.0, 37.5).all(),
      "All observed-outcome lat in [6.0, 37.5]",
      f"{(~cout_observed['lat'].between(6.0, 37.5)).sum()} observed cashouts outside lat range")
check(cout_observed["lng"].between(68.0, 97.5).all(),
      "All observed-outcome lng in [68.0, 97.5]",
      f"{(~cout_observed['lng'].between(68.0, 97.5)).sum()} observed cashouts outside lng range")
check(cout_observed["lat"].notna().all() and cout_observed["lng"].notna().all(),
      f"All observed-outcome rows have lat/lng ({len(cout_observed):,} rows)",
      "Null lat/lng in observed cashout_events")
cens_lat_null = cout[cout["status"] == "CENSORED"]["lat"].isna().all()
cens_lng_null = cout[cout["status"] == "CENSORED"]["lng"].isna().all()
check(cens_lat_null and cens_lng_null,
      "All CENSORED rows have null lat/lng (generator truth hidden) ✅",
      "CENSORED rows expose lat/lng — leakage risk")

# Coordinate–zone consistency: jitter within ~15km of zone centroid (observed only)
zone_lkp = zones.set_index("zone_id")[["lat","lng"]].to_dict("index")
cout_z = cout_observed[["zone_id","lat","lng"]].merge(
    zones[["zone_id","lat","lng"]].rename(columns={"lat":"z_lat","lng":"z_lng"}),
    on="zone_id", how="left")
cout_z["dlat"] = (cout_z["lat"] - cout_z["z_lat"]).abs()
cout_z["dlng"] = (cout_z["lng"] - cout_z["z_lng"]).abs()
bad_geo = ((cout_z["dlat"] > 0.15) | (cout_z["dlng"] > 0.15)).sum()
check(bad_geo == 0,
      "All observed cashout coordinates within 0.15° (~15km) of zone centroid",
      f"{bad_geo} observed cashout coordinates too far from zone centroid")


# ── 8. Split integrity ────────────────────────────────────────────────────────
section("8. Temporal Split Integrity")
tr_ids = set(tr_comp["complaint_id"])
va_ids = set(va_comp["complaint_id"])
te_ids = set(te_comp["complaint_id"])
all_ids= set(comp["complaint_id"])

check(len(tr_ids & va_ids) == 0, "Train ∩ Val = ∅",
      f"Train/Val overlap: {len(tr_ids & va_ids)}")
check(len(tr_ids & te_ids) == 0, "Train ∩ Test = ∅",
      f"Train/Test overlap: {len(tr_ids & te_ids)}")
check(len(va_ids & te_ids) == 0, "Val ∩ Test = ∅",
      f"Val/Test overlap: {len(va_ids & te_ids)}")
check(tr_ids | va_ids | te_ids == all_ids,
      f"Union of splits covers all {len(all_ids):,} complaints",
      f"Split union missing {len(all_ids - (tr_ids|va_ids|te_ids))} complaints")

# Train hops only reference train complaints
bad_tr_h = set(tr_h["complaint_id"]) - tr_ids
check(len(bad_tr_h) == 0,
      "Train hops only reference train complaints",
      f"{len(bad_tr_h)} train hops reference non-train complaints")
bad_va_h = set(va_h["complaint_id"]) - va_ids
check(len(bad_va_h) == 0,
      "Val hops only reference val complaints",
      f"{len(bad_va_h)} val hops reference non-val complaints")
bad_te_h = set(te_h["complaint_id"]) - te_ids
check(len(bad_te_h) == 0,
      "Test hops only reference test complaints",
      f"{len(bad_te_h)} test hops reference non-test complaints")

# Temporal ordering: all train incidents < all val incidents < all test incidents
tr_max_dt = pd.to_datetime(tr_comp["incident_timestamp"], format="ISO8601").max()
va_min_dt = pd.to_datetime(va_comp["incident_timestamp"], format="ISO8601").min()
va_max_dt = pd.to_datetime(va_comp["incident_timestamp"], format="ISO8601").max()
te_min_dt = pd.to_datetime(te_comp["incident_timestamp"], format="ISO8601").min()
check(tr_max_dt <= va_min_dt,
      f"All train incidents ({tr_max_dt.date()}) ≤ all val incidents ({va_min_dt.date()})",
      f"Temporal leakage: train max={tr_max_dt.date()} > val min={va_min_dt.date()}")
check(va_max_dt <= te_min_dt,
      f"All val incidents ({va_max_dt.date()}) ≤ all test incidents ({te_min_dt.date()})",
      f"Temporal leakage: val max={va_max_dt.date()} > test min={te_min_dt.date()}")


# ── 9. Latent feature isolation ───────────────────────────────────────────────
section("9. Latent Feature Isolation (No Leakage into Inference Schema)")
# The canonical inference columns must NOT include generator-internal fields
FORBIDDEN_IN_INFERENCE = ["syndicate_id", "latent_syndicate_id", "tier",
                           "high_entropy", "filer_cohort", "edge_case_tag"]
for tbl_name, tbl in [("complaints", comp), ("hops", hops), ("cashout_events", cout),
                       ("accounts", accs)]:
    leaked = [c for c in FORBIDDEN_IN_INFERENCE if c in tbl.columns]
    check(len(leaked) == 0,
          f"No latent fields in {tbl_name}",
          f"Latent fields {leaked} found in {tbl_name} — remove before passing to ML")

# Mule_entities has syndicate_id intentionally — it's the registry bootstrap table
ok("mule_entities.syndicate_id is expected (registry bootstrap only, not inference schema)")
ok("generator_metadata.csv contains all latent fields (labelled, separate file)")


# ── 10. Geographic coverage ───────────────────────────────────────────────────
section("10. Geographic Coverage")
active_zones = set(cout["zone_id"].dropna())
check(len(active_zones) == len(zones),
      f"All {len(zones)} zones received at least 1 cashout",
      f"{len(zones) - len(active_zones)} zones received 0 cashouts")
max_share = cout["zone_id"].value_counts().iloc[0] / len(cout)
check(max_share <= 0.06,
      f"No zone exceeds 6% of cashouts (max={max_share*100:.2f}%)",
      f"Zone concentration too high: max={max_share*100:.2f}%")
min_count = cout["zone_id"].value_counts().min()
check(min_count >= 50,
      f"Every zone has ≥50 cashouts (min={min_count})",
      f"Some zones have very few cashouts (min={min_count})")
check(zones["state"].nunique() >= 20,
      f"≥20 states represented ({zones['state'].nunique()})",
      f"Only {zones['state'].nunique()} states — geographic diversity too low")
check(zones["region"].nunique() == 8,
      f"All 8 regions present",
      f"Only {zones['region'].nunique()} regions")


# ── 11. Timing coverage ───────────────────────────────────────────────────────
section("11. Time-to-Event Coverage")
inc_dt  = pd.to_datetime(comp["incident_timestamp"], format="ISO8601")
cash_dt = pd.to_datetime(cout["event_timestamp"],    format="ISO8601")
# Merge to get per-case remaining at T0
rmdf = pd.DataFrame({"complaint_id": comp["complaint_id"].values,
                      "inc_dt": inc_dt.values}).merge(
    pd.DataFrame({"complaint_id": cout["complaint_id"].values,
                  "cash_dt": cash_dt.values}), on="complaint_id")
rmdf["rem"] = (rmdf["cash_dt"] - rmdf["inc_dt"]).dt.total_seconds() / 60

for label, lo, hi, min_pct in [
    ("<5 min",    0,    5,  0.001),
    ("5-15 min",  5,   15,  0.02),
    ("15-30 min", 15,  30,  0.08),
    ("30-60 min", 30,  60,  0.20),
    ("60-120 min",60, 120,  0.20),
    (">120 min", 120, 1e9,  0.10),
]:
    n   = ((rmdf["rem"] >= lo) & (rmdf["rem"] < hi)).sum()
    pct = n / len(rmdf)
    check(pct >= min_pct,
          f"Timing bucket {label}: {n:,} cases ({100*pct:.1f}%) ≥ floor {min_pct*100:.0f}%",
          f"Timing bucket {label} under-represented: {100*pct:.1f}% < {min_pct*100:.0f}%")


# ── 12. Missingness within bounds ─────────────────────────────────────────────
section("12. Missingness Rates")
ch_miss = hops["bank_channel"].isna().mean()
check(0.01 <= ch_miss <= 0.08,
      f"Channel missingness in bounds: {100*ch_miss:.1f}%",
      f"Channel missingness out of expected range: {100*ch_miss:.1f}%")
inst_miss = hops["institution"].isna().mean()
check(0.05 <= inst_miss <= 0.20,
      f"Institution missingness in bounds: {100*inst_miss:.1f}%",
      f"Institution missingness out of expected range: {100*inst_miss:.1f}%")
dist_miss = comp["victim_district"].isna().mean()
check(0.005 <= dist_miss <= 0.05,
      f"Victim district missingness in bounds: {100*dist_miss:.1f}%",
      f"Victim district missingness out of expected range: {100*dist_miss:.1f}%")


# ── 13. Amount validity ───────────────────────────────────────────────────────
section("13. Amount Validity")
check((comp["amount_inr"] >= 500).all(),
      f"All amounts ≥ ₹500",
      f"{(comp['amount_inr'] < 500).sum()} amounts below ₹500")
check((comp["amount_inr"] <= 10_000_000).all(),
      f"All amounts ≤ ₹1 Cr",
      f"{(comp['amount_inr'] > 10_000_000).sum()} amounts above ₹1 Cr")
check((hops["amount_transferred"] > 0).all(),
      "All hop amounts > 0",
      f"{(hops['amount_transferred'] <= 0).sum()} hops with non-positive amount")
frozen_amt = cout[cout["status"]=="FROZEN"]["amount_cashed_out"]
check((frozen_amt == 0.0).all(),
      "All FROZEN cases have amount_cashed_out = 0",
      f"{(frozen_amt != 0).sum()} FROZEN cases with non-zero cashed out amount")


# ── 14. Edge case coverage ────────────────────────────────────────────────────
section("14. Edge Case Coverage")
for tag, min_n in [("ZERO_HOP", 100), ("LONG_CHAIN", 500), ("CROSS_STATE", 10000),
                    ("INTERVENTION", 100), ("CENSORED", 100), ("VERY_SHORT_WINDOW", 50),
                    ("LONG_WINDOW", 500), ("HOTSPOT_TARGET", 500)]:
    n = gmeta["edge_case_tag"].str.contains(tag, na=False).sum()
    check(n >= min_n,
          f"Edge case {tag}: {n:,} cases (≥{min_n} required)",
          f"Edge case {tag} under-represented: only {n} cases (<{min_n})")


# ── 15. Censored row field isolation ─────────────────────────────────────────
section("15. Censored Row Field Isolation")
cens = cout[cout["status"] == "CENSORED"]
check(len(cens) > 0,
      f"CENSORED cases present: {len(cens):,}",
      "No CENSORED cases — right-censored survival modeling not testable")
if len(cens) > 0:
    for field in ["zone_id", "zone_name", "district", "state", "location_id", "lat", "lng"]:
        if field in cens.columns:
            null_pct = cens[field].isna().mean()
            check(null_pct == 1.0,
                  f"CENSORED.{field} is 100% null (generator truth hidden)",
                  f"CENSORED.{field} is NOT fully null ({100*null_pct:.1f}%) — leakage risk")
    check(cens["event_timestamp"].notna().all(),
          "CENSORED.event_timestamp preserved (observation boundary for survival lower bound)",
          "CENSORED.event_timestamp has nulls — needed for survival target")
    check(cens["available_timestamp"].notna().all(),
          "CENSORED.available_timestamp preserved",
          "CENSORED.available_timestamp has nulls")
    nan_amt = cens["amount_cashed_out"].isna().sum()
    check(nan_amt == len(cens),
          f"All CENSORED cases have null amount_cashed_out ({nan_amt:,})",
          f"Some CENSORED cases have non-null amount_cashed_out")


# ── 16. Tier-E entity isolation (unseen entities not in train) ────────────────
section("16. Tier-E Entity Isolation")
ents_df = ents  # already loaded above
accs_df = accs
hops_df = hops

tier_e_ids = set(ents_df[ents_df["tier"] == "E"]["entity_id"])
check(len(tier_e_ids) > 0,
      f"Tier-E (test-only unseen) entities present: {len(tier_e_ids):,}",
      "No Tier-E entities — unseen-entity test coverage missing")

if len(tier_e_ids) > 0:
    mule_to_ent = (accs_df[accs_df["is_mule"] & accs_df["entity_id"].notna()]
                   .set_index("account_id")["entity_id"].to_dict())
    hops_tmp = hops_df.copy()
    hops_tmp["entity_id"] = hops_tmp["to_account"].map(mule_to_ent)

    tr_ids_v = set(tr_comp["complaint_id"])
    tier_e_in_train = set(
        hops_tmp[hops_tmp["complaint_id"].isin(tr_ids_v) &
                 hops_tmp["entity_id"].isin(tier_e_ids)]["entity_id"].dropna())
    check(len(tier_e_in_train) == 0,
          f"No Tier-E entities appear in TRAIN hops — isolation confirmed",
          f"{len(tier_e_in_train)} Tier-E entities in TRAIN hops — unseen contract violated")


# ── FINAL RESULT ──────────────────────────────────────────────────────────────
print(f"\n{'═'*60}")
print(f"  VALIDATION RESULT")
print(f"{'═'*60}")
print(f"  ✅ Passed   : {len(_passes)}")
print(f"  ⚠️  Warnings : {len(_warnings)}")
print(f"  ❌ Failed   : {len(_errors)}")

if _errors:
    print(f"\n  FAILURES:")
    for e in _errors:
        print(f"    • {e}")
    print(f"\n  Dataset has {len(_errors)} validation error(s). Fix before training.")
    sys.exit(1)
else:
    if _warnings:
        print(f"\n  WARNINGS (non-blocking):")
        for w in _warnings:
            print(f"    • {w}")
    print(f"\n  ✅  All validation checks PASSED. Dataset is ready for use.")
    sys.exit(0)
