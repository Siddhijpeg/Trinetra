#!/usr/bin/env python3
"""
TRINETRA Synthetic Dataset V2 — Main Generator
================================================
Usage:
    python scripts/synthetic_v2/generate_synthetic_v2.py
    python scripts/synthetic_v2/generate_synthetic_v2.py --config config/synthetic_v2.yaml
    python scripts/synthetic_v2/generate_synthetic_v2.py --num_complaints 5000  # smoke test

Produces data/synthetic_v2/:
    zone_catalog.csv         120-zone catalog with full geographic hierarchy + lat/lng
    typology_rules.csv       10 typologies with metadata
    accounts.csv             All accounts (mule + victim) with entity linkage
    mule_entities.csv        Mule actor clusters + zone affinity
    complaints.csv           60k complaint events with corrected column names
    hops.csv                 ~180k transaction hops with channel + institution
    cashout_events.csv       Outcomes: COMPLETED / FROZEN / PARTIAL_FREEZE / REVERSED / CENSORED
                             Includes available_timestamp and lat/lng on cashout location
    splits/                  Temporal train / val / test splits

All latent generator constructs (syndicate_id, tier, edge_case_tag) are
stored ONLY in generator-internal tables and in a separate
    generator_metadata.csv   (generator-only — NOT part of canonical inference schema)

DO NOT pass generator_metadata.csv to any ML training or inference pipeline.
"""

import os, sys, math, random, argparse, json
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional, Tuple

import numpy as np
import pandas as pd
import yaml

# ── Path setup ────────────────────────────────────────────────────────────────
REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
sys.path.insert(0, os.path.join(REPO_ROOT, "scripts/synthetic_v2"))
from zone_catalog import get_zone_df, get_zone_lookup, get_zone_preferred_typologies

# ── Config loading ────────────────────────────────────────────────────────────

def load_config(path: str) -> Dict[str, Any]:
    with open(path) as f:
        return yaml.safe_load(f)


# ─────────────────────────────────────────────────────────────────────────────
# TYPOLOGY TABLE (must match config typologies section)
# ─────────────────────────────────────────────────────────────────────────────

TYPOLOGY_RECORDS = [
    {"typology_id": "TYP_01", "name": "OTP / KYC Fraud",                "avg_amount": 25000,  "lognormal_sigma": 0.75, "complaint_lag_hours_median": 1.5,  "share": 0.14},
    {"typology_id": "TYP_02", "name": "Fake Loan App",                   "avg_amount": 15000,  "lognormal_sigma": 0.70, "complaint_lag_hours_median": 4.0,  "share": 0.11},
    {"typology_id": "TYP_03", "name": "Part-Time Job Scam",              "avg_amount": 120000, "lognormal_sigma": 0.85, "complaint_lag_hours_median": 6.0,  "share": 0.11},
    {"typology_id": "TYP_04", "name": "Investment / Crypto Scam",        "avg_amount": 500000, "lognormal_sigma": 0.90, "complaint_lag_hours_median": 12.0, "share": 0.12},
    {"typology_id": "TYP_05", "name": "Sextortion",                      "avg_amount": 40000,  "lognormal_sigma": 0.80, "complaint_lag_hours_median": 24.0, "share": 0.08},
    {"typology_id": "TYP_06", "name": "Marketplace / OLX Fraud",         "avg_amount": 10000,  "lognormal_sigma": 0.70, "complaint_lag_hours_median": 2.0,  "share": 0.12},
    {"typology_id": "TYP_07", "name": "Digital Arrest",                  "avg_amount": 300000, "lognormal_sigma": 0.85, "complaint_lag_hours_median": 8.0,  "share": 0.12},
    {"typology_id": "TYP_08", "name": "SIM Swap / Account Takeover",     "avg_amount": 85000,  "lognormal_sigma": 0.80, "complaint_lag_hours_median": 2.5,  "share": 0.08},
    {"typology_id": "TYP_09", "name": "Romance / Honey Trap Scam",       "avg_amount": 180000, "lognormal_sigma": 0.95, "complaint_lag_hours_median": 48.0, "share": 0.07},
    {"typology_id": "TYP_10", "name": "Courier / Parcel Scam",           "avg_amount": 35000,  "lognormal_sigma": 0.75, "complaint_lag_hours_median": 3.0,  "share": 0.05},
]
TYPOLOGY_IDS  = [t["typology_id"] for t in TYPOLOGY_RECORDS]
TYP_BY_ID     = {t["typology_id"]: t for t in TYPOLOGY_RECORDS}
TYP_SHARES    = np.array([t["share"] for t in TYPOLOGY_RECORDS])
TYP_SHARES   /= TYP_SHARES.sum()  # normalise

BANKS_MULE   = ["HDFC", "SBI", "ICICI", "Axis", "Kotak", "PNB", "Paytm PB", "Yes Bank", "IndusInd"]
BANKS_VICTIM = ["HDFC", "SBI", "ICICI", "Axis", "Kotak", "Bank of Baroda", "Canara Bank"]
CHANNELS_PROB = {"UPI": 0.62, "IMPS": 0.24, "NEFT": 0.10, "RTGS": 0.04}

# ─────────────────────────────────────────────────────────────────────────────
# HELPER UTILITIES
# ─────────────────────────────────────────────────────────────────────────────

def rng_lognormal(mean_log: float, sigma_log: float,
                  lo: float = 0.0, hi: float = 1e12) -> float:
    v = float(np.random.lognormal(mean_log, sigma_log))
    return max(lo, min(hi, v))


def sample_hour(cfg_temporal: Dict) -> int:
    t = cfg_temporal
    r = random.random()
    if r < t["weekday_weight"] * t["hour_peak1_weight"] + t["weekend_weight"] * t["hour_peak1_weight"]:
        h = int(np.random.normal(t["hour_peak1_mean"], t["hour_peak1_std"])) % 24
    elif r < (t["hour_peak1_weight"] + t["hour_peak2_weight"]):
        h = int(np.random.normal(t["hour_peak2_mean"], t["hour_peak2_std"])) % 24
    else:
        h = random.randint(0, 23)
    return max(0, min(23, h))


def sample_channel(amount: float) -> str:
    if amount > 200000 and random.random() < 0.3:
        return "RTGS"
    p = CHANNELS_PROB
    return random.choices(list(p.keys()), weights=list(p.values()), k=1)[0]


def clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def build_hop_count_dist(hop_cfg: Dict) -> Tuple[List[int], List[float]]:
    hops_raw = {int(k): float(v) for k, v in hop_cfg["hop_distribution"].items()}
    total = sum(hops_raw.values())
    counts = sorted(hops_raw.keys())
    probs  = [hops_raw[k] / total for k in counts]
    return counts, probs


# ─────────────────────────────────────────────────────────────────────────────
# ZONE WEIGHT TABLE
# ─────────────────────────────────────────────────────────────────────────────

def build_zone_weights(zone_df: pd.DataFrame, num_complaints: int) -> Dict[str, float]:
    """
    Assign a raw cashout weight per zone that:
      - Respects min_share floor and max_share cap
      - Gives higher base weight to Metro/Hotspot zones
      - Spreads remaining mass across Tier2/Tier3/Rural/Coastal
    Returns dict zone_id → weight (unnormalised).
    """
    type_base = {"Metro": 4.0, "Hotspot": 3.0, "Tier2City": 2.0,
                 "Tier3City": 1.2, "Transit": 1.5, "Coastal": 1.0, "Rural": 0.8}
    weights = {}
    for _, row in zone_df.iterrows():
        base   = type_base.get(row["zone_type"], 1.0)
        # Add controlled noise so metros don't all share equally
        noise  = np.random.uniform(0.7, 1.3)
        w      = base * noise
        # Clamp to [min_share, max_share] proportional space
        # We'll renormalise later; here we just ensure relative ordering
        weights[row["zone_id"]] = w
    # Normalise
    total = sum(weights.values())
    for k in weights:
        weights[k] /= total
    # Enforce min/max share caps iteratively (3 passes)
    for _ in range(5):
        for _, row in zone_df.iterrows():
            zid  = row["zone_id"]
            mn   = float(row["min_share"])
            mx   = float(row["max_share"])
            weights[zid] = clamp(weights[zid], mn, mx)
        total = sum(weights.values())
        if total > 0:
            for k in weights:
                weights[k] /= total
    return weights


# ─────────────────────────────────────────────────────────────────────────────
# SYNDICATE / MULE INFRASTRUCTURE
# ─────────────────────────────────────────────────────────────────────────────

def build_entity_tiers(cfg_entities: Dict, zone_ids: List[str],
                       zone_pref: Dict[str, List[str]]) -> Dict[str, Dict]:
    """
    Returns a dict: entity_id → {
        tier, accounts: [account_id, ...], home_zones: [...],
        high_entropy: bool, syndicate_id (latent only)
    }
    """
    num_entities   = cfg_entities["num_mule_entities"]
    tier_a_frac    = cfg_entities["tier_a_fraction"]
    tier_b_frac    = cfg_entities["tier_b_fraction"]
    tier_c_frac    = cfg_entities["tier_c_fraction"]
    tier_d_frac    = cfg_entities["tier_d_fraction"]
    tier_e_frac    = cfg_entities["tier_e_fraction"]
    zipf_exp       = cfg_entities["accounts_per_entity_zipf_exponent"]
    max_accs       = cfg_entities["accounts_per_entity_max"]

    # Tier boundaries
    tiers_n = {
        "A": max(1, int(num_entities * tier_a_frac)),
        "B": max(1, int(num_entities * tier_b_frac)),
        "C": max(1, int(num_entities * tier_c_frac)),
        "D": max(1, int(num_entities * tier_d_frac)),
        "E": max(1, int(num_entities * tier_e_frac)),
    }

    entities      = {}
    account_rows  = []
    acc_ctr       = 1
    ent_ctr       = 1

    tier_to_num_zones = {"A": (3, 6), "B": (2, 4), "C": (1, 3), "D": (1, 2), "E": (1, 2)}
    high_ent_frac     = {"A": cfg_entities["tier_a_high_entropy_fraction"],
                         "B": cfg_entities["tier_b_high_entropy_fraction"],
                         "C": 0.05, "D": 0.0, "E": 0.10}

    syn_ctr = 1
    for tier, n in tiers_n.items():
        # group entities in syndicates of 5–30
        syn_size = random.randint(5, 30)
        for i in range(n):
            if i % syn_size == 0:
                syn_id = f"LSYN_{syn_ctr:04d}"
                # pick this syndicate's home zone(s)
                num_home = random.randint(2, 5)
                syn_home_zones = random.sample(zone_ids, min(num_home, len(zone_ids)))
                syn_ctr += 1

            e_id   = f"ENT_V2_{ent_ctr:06d}"
            ent_ctr += 1

            # Home zones: from syndicate pool, possibly one extra
            min_z, max_z = tier_to_num_zones[tier]
            num_home_e = random.randint(min_z, max_z)
            high_ent = random.random() < high_ent_frac[tier]
            if high_ent:
                # scatter across many zones
                home_zones = random.sample(zone_ids, min(random.randint(4, 8), len(zone_ids)))
            else:
                home_zones = random.sample(
                    syn_home_zones + [random.choice(zone_ids)],
                    min(num_home_e, len(syn_home_zones) + 1)
                )

            # Accounts for this entity
            num_accs = min(max_accs, max(1, int(np.random.zipf(zipf_exp))))
            accs = []
            for _ in range(num_accs):
                a_id = f"ACCV2_{acc_ctr:07d}"
                acc_ctr += 1
                bank = random.choice(BANKS_MULE)
                created = (datetime(2025, 1, 1) - timedelta(days=random.randint(30, 730))).isoformat()
                account_rows.append({
                    "account_id": a_id, "bank_name": bank, "is_mule": True,
                    "entity_id": e_id, "created_timestamp": created,
                })
                accs.append(a_id)

            entities[e_id] = {
                "tier": tier, "syndicate_id": syn_id,
                "accounts": accs, "home_zones": home_zones,
                "high_entropy": high_ent,
            }

    return entities, account_rows, acc_ctr


def build_syndicate_pools(entities: Dict) -> Dict[str, Dict]:
    """
    Group entities into syndicates; precompute per-syndicate mule account pool
    and cashout zone pool.
    """
    syndicates = {}
    for e_id, e in entities.items():
        syn_id = e["syndicate_id"]
        if syn_id not in syndicates:
            syndicates[syn_id] = {"entities": [], "accounts": [], "cashout_zones": set()}
        syndicates[syn_id]["entities"].append(e_id)
        syndicates[syn_id]["accounts"].extend(e["accounts"])
        for z in e["home_zones"]:
            syndicates[syn_id]["cashout_zones"].add(z)
    for s in syndicates.values():
        s["cashout_zones"] = list(s["cashout_zones"])
    return syndicates


# ─────────────────────────────────────────────────────────────────────────────
# INCIDENT TIMING
# ─────────────────────────────────────────────────────────────────────────────

def sample_incident_time(base_date: datetime, month_idx: int,
                         cfg: Dict) -> datetime:
    """Sample incident_time within a given month, respecting temporal config."""
    t = cfg["temporal"]
    # Month offset: Jan=0, Feb=1, …
    days_in_month = [31, 28, 31, 30, 31, 30][month_idx]
    day_offset    = random.randint(0, days_in_month - 1)
    hour          = sample_hour(t)
    minute        = random.randint(0, 59)
    second        = random.randint(0, 59)
    month_start   = base_date.replace(month=base_date.month + month_idx)
    try:
        dt = month_start + timedelta(days=day_offset)
        return dt.replace(hour=hour, minute=minute, second=second)
    except ValueError:
        return month_start.replace(hour=hour, minute=minute, second=second)


# ─────────────────────────────────────────────────────────────────────────────
# MAIN GENERATOR
# ─────────────────────────────────────────────────────────────────────────────

def run_generator(cfg: Dict, num_complaints_override: Optional[int] = None):
    gen_cfg      = cfg["generation"]
    num_comp     = num_complaints_override or gen_cfg["num_complaints"]
    seed         = gen_cfg["seed"]
    base_date    = datetime.fromisoformat(gen_cfg["base_date"])
    out_dir      = os.path.join(REPO_ROOT, gen_cfg["out_dir"])
    prefix       = gen_cfg["case_id_prefix"]

    np.random.seed(seed)
    random.seed(seed)

    os.makedirs(out_dir, exist_ok=True)
    os.makedirs(os.path.join(out_dir, "splits"), exist_ok=True)

    print(f"═══════════════════════════════════════════════════")
    print(f"  TRINETRA Synthetic V2 Generator")
    print(f"  Target complaints : {num_comp:,}")
    print(f"  Output            : {out_dir}")
    print(f"  Seed              : {seed}")
    print(f"═══════════════════════════════════════════════════")

    # ── 1. Zone catalog ───────────────────────────────────────────────────────
    print("\n[1/8] Loading zone catalog…")
    zone_df   = get_zone_df()
    zone_lkp  = get_zone_lookup()
    zone_pref = get_zone_preferred_typologies()
    zone_ids  = list(zone_lkp.keys())

    zone_df.to_csv(os.path.join(out_dir, "zone_catalog.csv"), index=False)
    print(f"      {len(zone_df)} zones across {zone_df['state'].nunique()} states")

    # ── 2. Typology table ─────────────────────────────────────────────────────
    print("[2/8] Building typology table…")
    pd.DataFrame(TYPOLOGY_RECORDS).to_csv(
        os.path.join(out_dir, "typology_rules.csv"), index=False)

    # ── 3. Mule infrastructure ────────────────────────────────────────────────
    print("[3/8] Building mule entity infrastructure…")
    entities, mule_acc_rows, acc_ctr = build_entity_tiers(
        cfg["entities"], zone_ids, zone_pref)
    syndicates = build_syndicate_pools(entities)
    print(f"      {len(entities):,} mule entities | "
          f"{sum(len(e['accounts']) for e in entities.values()):,} mule accounts | "
          f"{len(syndicates):,} latent syndicates")

    # Pool for Tier-E (test-only unseen entities) — note their account IDs
    tier_e_entity_ids = {eid for eid, e in entities.items() if e["tier"] == "E"}
    tier_e_accounts   = set()
    for eid in tier_e_entity_ids:
        tier_e_accounts.update(entities[eid]["accounts"])

    # Per-syndicate account pool lists (for Zipf-reuse sampling)
    syn_account_pool: Dict[str, List[str]] = {
        sid: list(s["accounts"]) for sid, s in syndicates.items()
    }
    syn_list = list(syndicates.keys())

    # ── 4. Zone weight table ──────────────────────────────────────────────────
    print("[4/8] Computing zone weight table…")
    zone_weights = build_zone_weights(zone_df, num_comp)
    zone_weight_arr = np.array([zone_weights[zid] for zid in zone_ids])

    # ── 5. Hop count distribution ─────────────────────────────────────────────
    hop_counts, hop_probs = build_hop_count_dist(cfg["hops"])

    # ── 6. Generate complaints + hops + cashouts ──────────────────────────────
    print("[5/8] Generating complaints, hops, cashouts…")

    # Pre-allocate monthly case share (with mild ramp-up)
    growth = cfg["temporal"]["monthly_growth_rate"]
    month_weights = np.array([
        1.0 * (1 + growth) ** m for m in range(6)])
    month_weights /= month_weights.sum()
    month_counts  = np.random.multinomial(num_comp, month_weights).tolist()

    complaints_rows    = []
    hops_rows          = []
    cashout_rows       = []
    victim_acc_rows    = []
    gen_metadata_rows  = []

    case_ctr   = 1
    vic_ctr    = acc_ctr      # continues from entity acc counter

    complaint_cfg = cfg["complaint"]
    outcome_cfg   = cfg["outcomes"]
    timing_cfg    = cfg["timing"]
    hops_cfg      = cfg["hops"]
    missingness   = cfg["missingness"]
    amounts_cfg   = cfg["amounts"]

    for month_idx in range(6):
        n_month = month_counts[month_idx]
        for _ in range(n_month):
            if case_ctr % 5000 == 0:
                print(f"      {case_ctr:,} / {num_comp:,} …")

            c_id = f"{prefix}_{case_ctr:07d}"
            case_ctr += 1

            # ── Typology ─────────────────────────────────────────────────────
            typ_id  = np.random.choice(TYPOLOGY_IDS, p=TYP_SHARES)
            typ_rec = TYP_BY_ID[typ_id]

            # ── Amount ───────────────────────────────────────────────────────
            avg_amt  = typ_rec["avg_amount"]
            # High-value injection
            if random.random() < amounts_cfg["high_value_fraction"]:
                amount = float(np.random.uniform(
                    amounts_cfg["high_value_min_inr"],
                    amounts_cfg["high_value_max_inr"]))
            else:
                amount = rng_lognormal(
                    math.log(avg_amt), typ_rec["lognormal_sigma"],
                    lo=float(amounts_cfg["global_min_inr"]),
                    hi=float(amounts_cfg["global_max_inr"]))
            amount = round(amount, 2)

            # ── Incident time ─────────────────────────────────────────────────
            incident_time = sample_incident_time(base_date, month_idx, cfg)

            # ── Complaint timing cohort ───────────────────────────────────────
            r_cohort = random.random()
            if r_cohort < float(complaint_cfg["fast_filer_fraction"]):
                cmp_lag_h = rng_lognormal(
                    float(complaint_cfg["fast_filer_lag_mean_log"]),
                    float(complaint_cfg["fast_filer_lag_sigma_log"]),
                    lo=0.1, hi=6.0)
                cohort = "fast"
            elif r_cohort < float(complaint_cfg["fast_filer_fraction"]) + float(complaint_cfg["normal_filer_fraction"]):
                med_h = typ_rec["complaint_lag_hours_median"]
                cmp_lag_h = rng_lognormal(math.log(max(0.5, med_h)), 0.75, lo=0.5)
                cohort = "normal"
            else:
                cmp_lag_h = rng_lognormal(
                    float(complaint_cfg["slow_filer_lag_mean_log"]),
                    float(complaint_cfg["slow_filer_lag_sigma_log"]),
                    lo=6.0)
                cohort = "slow"

            complaint_time = incident_time + timedelta(hours=cmp_lag_h)
            avail_lag_min  = random.randint(
                int(complaint_cfg["available_lag_min_minutes"]),
                int(complaint_cfg["available_lag_max_minutes"]))
            cmp_available  = complaint_time + timedelta(minutes=max(5, avail_lag_min))

            # ── Victim account ────────────────────────────────────────────────
            vic_acc_id  = f"VICT_{vic_ctr:07d}"
            vic_ctr    += 1
            vic_bank    = random.choice(BANKS_VICTIM)
            vic_created = (incident_time - timedelta(days=random.randint(365, 3650))).isoformat()
            victim_acc_rows.append({
                "account_id": vic_acc_id, "bank_name": vic_bank, "is_mule": False,
                "entity_id": None, "created_timestamp": vic_created,
            })

            # ── Victim geography (state / district from a zone lookup) ────────
            # Pick a victim zone different from typical cashout zones
            victim_zone_id  = np.random.choice(zone_ids,
                p=np.ones(len(zone_ids))/len(zone_ids))
            vz = zone_lkp[victim_zone_id]
            victim_state    = vz["state"]
            victim_district = vz["district"]
            # Apply 2% missingness on victim_district
            if random.random() < float(missingness["missing_victim_district"]):
                victim_district = None

            # ── Hop count ─────────────────────────────────────────────────────
            n_hops = random.choices(hop_counts, weights=hop_probs, k=1)[0]

            # Pick syndicate (choose one whose cashout zones exist)
            syn_id = random.choice(syn_list)
            syn    = syndicates[syn_id]
            pool   = syn_account_pool[syn_id]

            # ── Cashout zone selection ────────────────────────────────────────
            # 85% syndicate-preferred zones; 15% noise from full distribution
            cashout_zone_candidates = syn["cashout_zones"]
            if cashout_zone_candidates and random.random() < 0.85:
                co_zone_id = random.choice(cashout_zone_candidates)
                # Prefer typology-preferred zones with 60% probability
                typ_pref_zones = [z for z in cashout_zone_candidates
                                  if typ_id in zone_pref.get(z, [])]
                if typ_pref_zones and random.random() < 0.60:
                    co_zone_id = random.choice(typ_pref_zones)
            else:
                co_zone_id = np.random.choice(zone_ids, p=zone_weight_arr)

            co_zone = zone_lkp[co_zone_id]

            # ── Generate hops ─────────────────────────────────────────────────
            hop_records   = []
            current_time  = incident_time
            current_amount = amount
            prev_acc       = vic_acc_id

            for h_idx in range(n_hops):
                # Select destination mule account
                is_unseen_entity = random.random() < float(missingness["unknown_entity_fraction"])
                if is_unseen_entity and tier_e_accounts:
                    to_acc = random.choice(list(tier_e_accounts))
                elif pool:
                    # Zipf-biased index for high-reuse accounts
                    idx    = min(len(pool) - 1, max(0, int(np.random.zipf(1.6)) - 1))
                    to_acc = pool[idx]
                else:
                    to_acc = random.choice(mule_acc_rows)["account_id"] if mule_acc_rows else vic_acc_id

                # Hop delay
                delay_min = rng_lognormal(
                    float(hops_cfg["inter_hop_delay_mean_log"]),
                    float(hops_cfg["inter_hop_delay_sigma_log"]),
                    lo=1.0, hi=480.0)
                current_time += timedelta(minutes=delay_min)

                # Bank feed lag
                feed_lag = random.randint(
                    int(hops_cfg["bank_feed_lag_min_minutes"]),
                    int(hops_cfg["bank_feed_lag_max_minutes"]))
                hop_available = current_time + timedelta(minutes=feed_lag)

                # Amount
                is_last_hop    = (h_idx == n_hops - 1)
                retain          = 1.0 if is_last_hop else random.uniform(
                    float(hops_cfg["amount_retention_min"]),
                    float(hops_cfg["amount_retention_max"]))
                hop_amount      = round(current_amount * retain, 2)

                # Channel (RTGS for large last-hop amounts)
                channel = sample_channel(hop_amount) if not is_last_hop else sample_channel(current_amount)
                if random.random() < float(missingness["missing_channel_fraction"]):
                    channel = None

                # Institution
                institution = vic_bank if h_idx == 0 else (
                    random.choice(BANKS_MULE) if to_acc.startswith("ACCV2_") else None)
                if random.random() < float(missingness["missing_institution_fraction"]):
                    institution = None

                hop_records.append({
                    "hop_id":              f"HOP_{c_id}_{h_idx + 1}",
                    "complaint_id":        c_id,
                    "hop_sequence":        h_idx + 1,
                    "from_account":        prev_acc,
                    "to_account":          to_acc,
                    "amount_transferred":  hop_amount,
                    "bank_channel":        channel,
                    "institution":         institution,
                    "event_timestamp":     current_time.isoformat(),
                    "available_timestamp": hop_available.isoformat(),
                })

                prev_acc       = to_acc
                current_amount = hop_amount

            hops_rows.extend(hop_records)

            # ── Cashout timing ────────────────────────────────────────────────
            cashout_delay = rng_lognormal(
                float(timing_cfg["cashout_delay_mean_log"]),
                float(timing_cfg["cashout_delay_sigma_log"]),
                lo=float(timing_cfg["cashout_delay_min_minutes"]),
                hi=float(timing_cfg["cashout_delay_max_minutes"]))
            cashout_time = current_time + timedelta(minutes=cashout_delay)

            # ── Outcome determination ─────────────────────────────────────────
            # Eligible for freeze if complaint IS available before cashout
            cmp_before_cashout = (cmp_available < cashout_time)

            if cmp_before_cashout and random.random() < float(outcome_cfg["freeze_probability_when_complaint_before_cashout"]):
                status            = "FROZEN"
                amount_cashed_out = 0.0
                amount_frozen     = current_amount
                amount_recovered  = 0.0
            elif random.random() < float(outcome_cfg["partial_freeze_probability"]):
                status            = "PARTIAL_FREEZE"
                frozen_frac       = random.uniform(0.3, 0.8)
                amount_cashed_out = round(current_amount * (1 - frozen_frac), 2)
                amount_frozen     = round(current_amount * frozen_frac, 2)
                amount_recovered  = 0.0
            elif random.random() < float(outcome_cfg["censored_fraction"]):
                status            = "CENSORED"
                amount_cashed_out = None
                amount_frozen     = 0.0
                amount_recovered  = 0.0
                # For censored cases we don't know exact cashout time — use observation window end
                cashout_time      = current_time + timedelta(hours=24)
            else:
                status = "COMPLETED"
                # Check for post-completion reversal
                if random.random() < float(outcome_cfg["reversed_probability"]):
                    status        = "REVERSED"
                    amount_recovered = current_amount
                else:
                    amount_recovered = 0.0
                amount_cashed_out = current_amount
                amount_frozen     = 0.0

            # Outcome available_timestamp
            out_avail_lag = random.randint(
                int(outcome_cfg["outcome_available_lag_min_minutes"]),
                int(outcome_cfg["outcome_available_lag_max_minutes"]))
            outcome_available = cashout_time + timedelta(minutes=out_avail_lag)

            # ATM lat/lng: zone centroid ± small jitter (represents ATM location within zone)
            atm_lat = co_zone["lat"] + np.random.uniform(-0.08, 0.08)
            atm_lng = co_zone["lng"] + np.random.uniform(-0.08, 0.08)

            # ── Complaint record ──────────────────────────────────────────────
            # 4% of cases: complaint not available at prediction time
            # (represented as very-late available_timestamp)
            if random.random() < float(missingness["missing_complaint_fraction"]):
                # Set available to well after cashout, but never before complaint_time
                late_base = max(cashout_time, complaint_time)
                cmp_available = late_base + timedelta(hours=48)

            complaints_rows.append({
                "complaint_id":        c_id,
                "typology_id":         typ_id,
                "typology_name":       typ_rec["name"],
                "amount_inr":          amount,
                "victim_state":        victim_state,
                "victim_district":     victim_district,
                "victim_zone_id":      victim_zone_id,
                "incident_timestamp":  incident_time.isoformat(),
                "complaint_timestamp": complaint_time.isoformat(),
                "available_timestamp": cmp_available.isoformat(),
            })

            cashout_rows.append({
                "cashout_id":            f"CSH_{c_id}",
                "complaint_id":          c_id,
                "final_account":         prev_acc,
                "zone_id":               co_zone_id,
                "zone_name":             co_zone["zone_name"],
                "district":              co_zone["district"],
                "state":                 co_zone["state"],
                "location_id":           f"ATM_{co_zone_id}_{random.randint(1, 80):03d}",
                "lat":                   round(atm_lat, 6),
                "lng":                   round(atm_lng, 6),
                "amount_cashed_out":     amount_cashed_out,
                "amount_frozen":         amount_frozen,
                "amount_recovered":      amount_recovered,
                "status":                status,
                "event_timestamp":       cashout_time.isoformat(),
                "available_timestamp":   outcome_available.isoformat(),
            })

            # Generator-only metadata (NEVER use in ML inference)
            gen_metadata_rows.append({
                "complaint_id":          c_id,
                "latent_syndicate_id":   syn_id,       # LATENT — NOT for inference
                "filer_cohort":          cohort,        # fast/normal/slow — NOT for inference
                "hop_count_actual":      n_hops,
                "cashout_zone_id":       co_zone_id,
                "cmp_before_cashout":    cmp_before_cashout,
                "edge_case_tag":         _tag_edge_case(
                    n_hops, co_zone, vz, cmp_before_cashout, status,
                    cashout_delay, victim_zone_id, co_zone_id),
            })

    print(f"      Generated {len(complaints_rows):,} complaints, "
          f"{len(hops_rows):,} hops, {len(cashout_rows):,} cashout events")

    # ── 7. Build accounts table ───────────────────────────────────────────────
    print("[6/8] Building accounts table…")
    all_acc_rows = mule_acc_rows + victim_acc_rows
    df_accounts  = pd.DataFrame(all_acc_rows)
    print(f"      {len(df_accounts):,} total accounts "
          f"({df_accounts['is_mule'].sum():,} mule, "
          f"{(~df_accounts['is_mule']).sum():,} victim)")

    # Mule entities table (latent syndicate_id included here intentionally
    # to allow future registry bootstrap — but NOT part of canonical inference)
    mule_ent_rows = []
    for e_id, e in entities.items():
        mule_ent_rows.append({
            "entity_id":          e_id,
            "syndicate_id":       e["syndicate_id"],   # latent label
            "tier":               e["tier"],
            "operating_zone_ids": ",".join(e["home_zones"]),
            "high_entropy":       e["high_entropy"],
            "num_accounts":       len(e["accounts"]),
        })

    # ── 8. Save all tables ────────────────────────────────────────────────────
    print("[7/8] Saving CSVs…")

    df_comp  = pd.DataFrame(complaints_rows)
    df_hops  = pd.DataFrame(hops_rows)
    df_cout  = pd.DataFrame(cashout_rows)
    df_ents  = pd.DataFrame(mule_ent_rows)
    df_meta  = pd.DataFrame(gen_metadata_rows)

    df_comp.to_csv(os.path.join(out_dir, "complaints.csv"), index=False)
    df_hops.to_csv(os.path.join(out_dir, "hops.csv"), index=False)
    df_cout.to_csv(os.path.join(out_dir, "cashout_events.csv"), index=False)
    df_accounts.to_csv(os.path.join(out_dir, "accounts.csv"), index=False)
    df_ents.to_csv(os.path.join(out_dir, "mule_entities.csv"), index=False)
    df_meta.to_csv(os.path.join(out_dir, "generator_metadata.csv"), index=False)

    # ── 9. Temporal splits ────────────────────────────────────────────────────
    print("[8/8] Building temporal splits…")
    df_comp["incident_dt"] = pd.to_datetime(df_comp["incident_timestamp"])
    df_comp["month"]       = df_comp["incident_dt"].dt.month

    split_cfg      = cfg["splits"]
    train_months   = set(split_cfg["train_months"])
    val_months     = set(split_cfg["val_month"])
    test_months    = set(split_cfg["test_month"])

    train_ids = df_comp[df_comp["month"].isin(train_months)]["complaint_id"].values
    val_ids   = df_comp[df_comp["month"].isin(val_months)]["complaint_id"].values
    test_ids  = df_comp[df_comp["month"].isin(test_months)]["complaint_id"].values

    splits_dir = os.path.join(out_dir, "splits")
    for split_name, ids in [("train", train_ids), ("val", val_ids), ("test", test_ids)]:
        id_set = set(ids)
        df_comp[df_comp["complaint_id"].isin(id_set)].drop(
            columns=["incident_dt", "month"]).to_csv(
            os.path.join(splits_dir, f"{split_name}_complaints.csv"), index=False)
        df_hops[df_hops["complaint_id"].isin(id_set)].to_csv(
            os.path.join(splits_dir, f"{split_name}_hops.csv"), index=False)
        df_cout[df_cout["complaint_id"].isin(id_set)].to_csv(
            os.path.join(splits_dir, f"{split_name}_cashout_events.csv"), index=False)

    # Clean up temp column
    df_comp.drop(columns=["incident_dt", "month"], inplace=True, errors="ignore")

    # ── Summary statistics ────────────────────────────────────────────────────
    _print_summary(df_comp, df_hops, df_cout, df_accounts, df_ents,
                   train_ids, val_ids, test_ids, out_dir)
    return out_dir


# ─────────────────────────────────────────────────────────────────────────────
# EDGE CASE TAGGER
# ─────────────────────────────────────────────────────────────────────────────

def _tag_edge_case(n_hops: int, co_zone: Dict, victim_zone: Dict,
                   cmp_before: bool, status: str,
                   cashout_delay: float, victim_zid: str, co_zid: str) -> str:
    tags = []
    if n_hops == 0:
        tags.append("ZERO_HOP")
    if n_hops >= 6:
        tags.append("LONG_CHAIN")
    if victim_zone.get("state") == co_zone.get("state"):
        tags.append("SAME_STATE")
    else:
        tags.append("CROSS_STATE")
    if victim_zone.get("region") != co_zone.get("region"):
        tags.append("CROSS_REGION")
    if victim_zid == co_zid:
        tags.append("SAME_ZONE")
    if cmp_before and status == "FROZEN":
        tags.append("INTERVENTION")
    if status == "CENSORED":
        tags.append("CENSORED")
    if cashout_delay < 5.0:
        tags.append("VERY_SHORT_WINDOW")
    elif cashout_delay < 15.0:
        tags.append("SHORT_WINDOW")
    elif cashout_delay > 120.0:
        tags.append("LONG_WINDOW")
    if co_zone.get("zone_type") in ("Hotspot",):
        tags.append("HOTSPOT_TARGET")
    return "|".join(tags) if tags else "NORMAL"


# ─────────────────────────────────────────────────────────────────────────────
# SUMMARY PRINTER
# ─────────────────────────────────────────────────────────────────────────────

def _print_summary(df_comp, df_hops, df_cout, df_accounts, df_ents,
                   train_ids, val_ids, test_ids, out_dir):
    print("\n" + "═" * 55)
    print("  GENERATION SUMMARY")
    print("═" * 55)
    print(f"  Complaints     : {len(df_comp):>8,}")
    print(f"  Hops           : {len(df_hops):>8,}")
    print(f"  Cashout events : {len(df_cout):>8,}")
    print(f"  Accounts total : {len(df_accounts):>8,}")
    print(f"    Mule         : {df_accounts['is_mule'].sum():>8,}")
    print(f"    Victim       : {(~df_accounts['is_mule']).sum():>8,}")
    print(f"  Mule entities  : {len(df_ents):>8,}")
    print(f"  Splits         : train={len(train_ids):,} "
          f"val={len(val_ids):,} test={len(test_ids):,}")
    print()

    # Status distribution
    print("  Outcome status:")
    for s, n in df_cout["status"].value_counts().items():
        print(f"    {s:<18}: {n:>8,}  ({100*n/len(df_cout):.1f}%)")
    print()

    # Hop distribution
    hc = df_hops.groupby("complaint_id").size()
    all_ids = set(df_comp["complaint_id"])
    zero_hop = len(all_ids) - len(hc)
    print(f"  Hop count  mean={hc.mean():.2f}  median={hc.median():.0f}  "
          f"max={hc.max():.0f}  0-hop={zero_hop:,}")

    # Complaint before cashout
    df_comp2 = df_comp.merge(
        df_cout[["complaint_id", "event_timestamp"]].rename(
            columns={"event_timestamp": "cashout_ts"}), on="complaint_id")
    before = (pd.to_datetime(df_comp2["available_timestamp"], format="ISO8601") <
              pd.to_datetime(df_comp2["cashout_ts"], format="ISO8601")).sum()
    print(f"  Complaint before cashout: {before:,} ({100*before/len(df_comp):.1f}%)")

    # Top 5 cashout zones
    print("\n  Top 5 cashout zones:")
    top5 = df_cout["zone_id"].value_counts().head(5)
    for zid, cnt in top5.items():
        print(f"    {zid:<15} {cnt:>6,}  ({100*cnt/len(df_cout):.1f}%)")

    # Timing
    df_cout2 = df_cout[df_cout["status"] != "CENSORED"].copy()
    if len(df_cout2):
        df_cout2 = df_cout2.merge(
            df_hops.groupby("complaint_id")["event_timestamp"].max().reset_index()
            .rename(columns={"event_timestamp": "last_hop_ts"}), on="complaint_id", how="left")
        df_comp3 = df_comp[["complaint_id", "incident_timestamp"]].copy()
        df_cout2 = df_cout2.merge(df_comp3, on="complaint_id", how="left")
        inc_to_cashout = ((pd.to_datetime(df_cout2["event_timestamp"], format="ISO8601") -
                           pd.to_datetime(df_cout2["incident_timestamp"], format="ISO8601"))
                          .dt.total_seconds() / 60).dropna()
        print(f"\n  Inc→cashout (min): "
              f"P25={inc_to_cashout.quantile(0.25):.0f}  "
              f"P50={inc_to_cashout.quantile(0.50):.0f}  "
              f"P75={inc_to_cashout.quantile(0.75):.0f}  "
              f"P95={inc_to_cashout.quantile(0.95):.0f}")

    print(f"\n  Output directory : {out_dir}")
    print("═" * 55)


# ─────────────────────────────────────────────────────────────────────────────
# ENTRY POINT
# ─────────────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="TRINETRA Synthetic V2 Generator")
    parser.add_argument("--config", default=os.path.join(REPO_ROOT, "config/synthetic_v2.yaml"))
    parser.add_argument("--num_complaints", type=int, default=None,
                        help="Override num_complaints from config (for smoke tests)")
    args = parser.parse_args()

    cfg = load_config(args.config)
    run_generator(cfg, num_complaints_override=args.num_complaints)


if __name__ == "__main__":
    main()
