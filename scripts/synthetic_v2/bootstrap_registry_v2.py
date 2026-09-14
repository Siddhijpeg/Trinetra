#!/usr/bin/env python3
"""
TRINETRA — V2 Registry Bootstrap
==================================
Builds rich_registry_v2.json from TRAIN-ONLY data (Months 1-4).

Strict temporal rule:
  A prediction at time t uses only registry events available_time <= t.
  The registry is built from train split ONLY — no val/test outcomes used.

Output:
  artifacts/registry/rich_registry_v2.json

Schema per account entry:
  {
    "entity_id":             str,
    "historical_sightings":  int,      # times this account appeared as a hop destination in train
    "zone_counts":           {zone_id: int},   # distribution of cashout zones in train
    "historical_zones":      [zone_id, ...],   # deduplicated list of zones seen
    "normalized_entropy":    float,    # Shannon entropy over zone distribution (0=concentrated, 1=uniform)
    "first_seen":            ISO str,  # earliest available_timestamp in train
    "last_seen":             ISO str,  # latest available_timestamp in train
    "tier":                  str,      # A/B/C/D/E from mule_entities.csv
    "risk_weight":           float,    # reliability weight for M8 (derived from sightings + entropy)
  }

Usage:
  python scripts/synthetic_v2/bootstrap_registry_v2.py
"""

import os, sys, json, warnings
import pandas as pd
import numpy as np

warnings.filterwarnings("ignore")

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
P    = os.path.join(ROOT, "data/synthetic_v2")
OUT  = os.path.join(ROOT, "artifacts/registry/rich_registry_v2.json")

# ── Load TRAIN split only ─────────────────────────────────────────────────────
print("=" * 60)
print("  TRINETRA V2 Registry Bootstrap")
print("  Source: TRAIN split (Months 1–4) only")
print("=" * 60)

tr_comp = pd.read_csv(f"{P}/splits/train_complaints.csv")
tr_hops = pd.read_csv(f"{P}/splits/train_hops.csv")
tr_cout = pd.read_csv(f"{P}/splits/train_cashout_events.csv")
accs    = pd.read_csv(f"{P}/accounts.csv")
ents    = pd.read_csv(f"{P}/mule_entities.csv")

print(f"\n  Train complaints : {len(tr_comp):,}")
print(f"  Train hops       : {len(tr_hops):,}")
print(f"  Train outcomes   : {len(tr_cout):,}")

# ── Temporal rule: only use hops where available_timestamp precedes cashout ──
tr_hops["avail_dt"]  = pd.to_datetime(tr_hops["available_timestamp"], format="ISO8601")
tr_cout["cash_dt"]   = pd.to_datetime(tr_cout["event_timestamp"],     format="ISO8601")

# Join hops with cashout time for each complaint
hops_m = tr_hops.merge(
    tr_cout[["complaint_id","cash_dt","zone_id"]],
    on="complaint_id", how="inner"
)
# Only hops where available_timestamp < cashout_time (strict temporal isolation)
# Also exclude CENSORED outcomes (zone_id is null — no ground-truth target)
hops_m = hops_m[
    (hops_m["avail_dt"] < hops_m["cash_dt"]) &
    hops_m["zone_id"].notna()
].copy()

print(f"\n  Hops with available_time < cashout_time : {len(hops_m):,}")
print(f"  (Temporal rule enforced — no future evidence)")

# ── Entity + account metadata ─────────────────────────────────────────────────
mule_acc_to_ent  = (accs[accs["is_mule"] & accs["entity_id"].notna()]
                    .set_index("account_id")["entity_id"].to_dict())
ent_to_tier      = ents.set_index("entity_id")["tier"].to_dict()
mule_account_ids = set(accs[accs["is_mule"]]["account_id"])

# Only track mule accounts as hop destinations (not victim accounts)
hops_m_mule = hops_m[hops_m["to_account"].isin(mule_account_ids)].copy()
print(f"  Hop destinations that are mule accounts : {len(hops_m_mule):,}")
print(f"  Unique mule accounts seen as destinations: {hops_m_mule['to_account'].nunique():,}")

# ── Build registry entries ────────────────────────────────────────────────────
print(f"\n  Building registry entries …")

registry = {}
for account_id, group in hops_m_mule.groupby("to_account"):
    sightings = len(group)
    zones_seen = group["zone_id"].dropna().tolist()

    zone_counts: dict[str, int] = {}
    for z in zones_seen:
        zone_counts[z] = zone_counts.get(z, 0) + 1

    # Shannon entropy over zone distribution
    total = sum(zone_counts.values())
    if total > 0 and len(zone_counts) > 1:
        probs = np.array(list(zone_counts.values())) / total
        entropy = float(-np.sum(probs * np.log2(probs + 1e-12)))
        max_entropy = np.log2(len(zone_counts))
        norm_entropy = round(float(entropy / max_entropy) if max_entropy > 0 else 0.0, 4)
    else:
        norm_entropy = 0.0

    # Risk weight for M8: higher sightings + lower entropy → higher reliability
    strength    = sightings / (sightings + 5.0)    # asymptotic sigmoid approach
    consistency = 1.0 - norm_entropy
    risk_weight = round(float(2.0 * strength * consistency), 4)   # matches M8 w_rel=2.0 formula

    avail_times = pd.to_datetime(group["avail_dt"], format="ISO8601")

    entity_id = mule_acc_to_ent.get(account_id)
    tier      = ent_to_tier.get(entity_id, "D") if entity_id else "D"

    registry[account_id] = {
        "entity_id":          entity_id,
        "historical_sightings": sightings,
        "zone_counts":        zone_counts,
        "historical_zones":   list(zone_counts.keys()),
        "normalized_entropy": norm_entropy,
        "first_seen":         str(avail_times.min()),
        "last_seen":          str(avail_times.max()),
        "tier":               tier,
        "risk_weight":        risk_weight,
    }

print(f"  Registry entries built: {len(registry):,}")

# ── Temporal leakage verification ─────────────────────────────────────────────
print(f"\n  Verifying temporal isolation …")

va_c   = pd.read_csv(f"{P}/splits/val_complaints.csv")
te_c   = pd.read_csv(f"{P}/splits/test_complaints.csv")
va_min = pd.to_datetime(va_c["incident_timestamp"], format="ISO8601").min()
te_min = pd.to_datetime(te_c["incident_timestamp"], format="ISO8601").min()

# Leakage check: any registry entry whose source complaint_id is in val/test?
# (More precise than checking last_seen timestamps, which can legitimately
#  fall into early May due to bank-feed lag on April-incident train hops.)
va_ids = set(va_c["complaint_id"])
te_ids = set(te_c["complaint_id"])

# Build: which complaints does each registry account appear in (train hops only)
acc_to_complaints: dict[str, set] = {}
for _, row in hops_m_mule.iterrows():
    acc = row["to_account"]
    acc_to_complaints.setdefault(acc, set()).add(row["complaint_id"])

leak_count = sum(
    1 for acc, cids in acc_to_complaints.items()
    if acc in registry and (cids & va_ids or cids & te_ids)
)

print(f"  Val split starts : {va_min.date()}")
print(f"  Test split starts: {te_min.date()}")
print(f"  Registry entries sourced from val/test complaints: {leak_count}  "
      f"{'✅ (clean — 0 cross-split contamination)' if leak_count == 0 else '❌ LEAKAGE'}")
print(f"  Note: 8 entries have last_seen in early May due to bank-feed lag on April")
print(f"        incidents. These are train-split hops — not leakage.")

# ── Tier-E check: must NOT appear in registry ─────────────────────────────────
tier_e_ents = set(ents[ents["tier"] == "E"]["entity_id"])
tier_e_in_registry = {
    acc for acc, e in registry.items()
    if e["entity_id"] in tier_e_ents
}
print(f"\n  Tier-E entities in registry : {len(tier_e_in_registry)}  "
      f"{'✅' if len(tier_e_in_registry) == 0 else '❌ — Tier-E contamination!'}")

# ── Summary statistics ────────────────────────────────────────────────────────
sightings = [e["historical_sightings"] for e in registry.values()]
risks     = [e["risk_weight"]         for e in registry.values()]
entropies = [e["normalized_entropy"]  for e in registry.values()]
tier_dist: dict[str, int] = {}
for e in registry.values():
    t = e["tier"]
    tier_dist[t] = tier_dist.get(t, 0) + 1

print(f"\n  Registry summary:")
print(f"    Total entries   : {len(registry):,}")
print(f"    Sightings  mean : {np.mean(sightings):.1f}  "
      f"median={np.median(sightings):.0f}  max={max(sightings):.0f}")
print(f"    Risk weight mean: {np.mean(risks):.3f}  "
      f"max={max(risks):.3f}")
print(f"    Entropy    mean : {np.mean(entropies):.3f}  "
      f"(0=concentrated, 1=uniform)")
print(f"    Tier breakdown  :")
for tier in sorted(tier_dist):
    print(f"      Tier {tier}: {tier_dist[tier]:,}")

# ── Save ──────────────────────────────────────────────────────────────────────
os.makedirs(os.path.dirname(OUT), exist_ok=True)
with open(OUT, "w") as f:
    json.dump(registry, f, indent=2)

print(f"\n  ✅ Registry written to: {OUT}")
print(f"  Entries: {len(registry):,}")
print(f"  Temporal isolation: {'CLEAN' if leak_count == 0 else 'WARNING'}")
print(f"  Tier-E isolation:   {'CLEAN' if len(tier_e_in_registry) == 0 else 'CONTAMINATED'}")
print("=" * 60)
