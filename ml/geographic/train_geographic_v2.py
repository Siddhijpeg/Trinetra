#!/usr/bin/env python3
"""
TRINETRA — Geographic Engine V2 Training Pipeline
===================================================

Trains the M8 Reliability-Aware Geographic Model on V2 synthetic data.

Key differences from V1 train_engine.py:
  1. 120 V2 zone_ids (V2_ZID_001 … V2_ZID_120) instead of 75
  2. 10 typologies (TYP_01–TYP_10) instead of 6
  3. Causal registry: each training snapshot uses ONLY registry history
     available before that snapshot's prediction_time.
     Source: artifacts/registry/causal_registry_v2.parquet
  4. Training target = cashout zone_id (observed only; censored excluded)
  5. Global prior / typology prior / mule_zone_likelihoods built from train split
  6. Calibration (temperature scaling) fit on Month-5 ONLY
  7. Artifacts saved to artifacts/models/geographic_v2/ — V1 untouched

M8 frozen parameters (same as V1):
  lambda = 0.5   k = 5.0   w_rel = 2.0   T fitted on Month-5

Usage:
  python ml/geographic/train_geographic_v2.py
"""

import os, sys, json, warnings
import numpy as np
import pandas as pd
from scipy.optimize import minimize_scalar
from datetime import datetime

warnings.filterwarnings("ignore")
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "../..")))

# ── Paths ─────────────────────────────────────────────────────────────────────
ROOT        = os.path.abspath(os.path.join(os.path.dirname(__file__), "../.."))
SPLITS_DIR  = os.path.join(ROOT, "data/synthetic_v2/splits")
ZONES_CSV   = os.path.join(ROOT, "data/synthetic_v2/zone_catalog.csv")
CAUSAL_REG  = os.path.join(ROOT, "artifacts/registry/causal_registry_v2.parquet")
ART_DIR     = os.path.join(ROOT, "artifacts/models/geographic_v2")
MET_DIR     = os.path.join(ROOT, "artifacts/metrics/geographic_v2")
os.makedirs(ART_DIR, exist_ok=True)
os.makedirs(MET_DIR, exist_ok=True)

# ── Frozen M8 parameters ──────────────────────────────────────────────────────
M8_LAMBDA = 0.5
M8_K      = 5.0
M8_W_REL  = 2.0

# ── Helpers ───────────────────────────────────────────────────────────────────

def load_split(prefix):
    """Load complaints, hops, cashouts for one temporal split."""
    c = pd.read_csv(f"{SPLITS_DIR}/{prefix}_complaints.csv")
    h = pd.read_csv(f"{SPLITS_DIR}/{prefix}_hops.csv",
                    parse_dates=["event_timestamp","available_timestamp"])
    o = pd.read_csv(f"{SPLITS_DIR}/{prefix}_cashout_events.csv")
    for col in ["incident_timestamp","complaint_timestamp","available_timestamp"]:
        if col in c.columns:
            c[col] = pd.to_datetime(c[col], format="ISO8601")
    return c, h, o


def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)
    a = np.sin(dlat/2)**2 + np.cos(np.radians(lat1))*np.cos(np.radians(lat2))*np.sin(dlon/2)**2
    return 2 * R * np.arcsin(np.sqrt(np.clip(a, 0, 1)))


def softmax_temp(logits, T):
    s = logits / T
    s = s - np.max(s)
    e = np.exp(s)
    return e / (e.sum() + 1e-12)


# ── PHASE 1: Build training artifacts from TRAIN split ───────────────────────

def build_training_artifacts(tr_comp, tr_hops, tr_cout, zone_list, causal_reg_df):
    """
    Build:
      global_prior           : P(zone | all train obs)
      typology_priors        : P(zone | typology, all train obs)
      mule_zone_likelihoods  : P(account | zone) — from train hops linked to observed cashouts
      node_risk_registry     : per-account count/weight from CAUSAL registry (T0 view)
    """
    print("[1] Building global and typology priors …")
    # Only use observed cashout labels (non-censored, non-null zone_id)
    obs = tr_cout[tr_cout["zone_id"].notna()].copy()
    obs = obs.merge(tr_comp[["complaint_id","typology_id"]], on="complaint_id", how="left")

    total_obs = len(obs)
    n_zones   = len(zone_list)

    # Global prior P(z) with Laplace smoothing
    zone_counts = obs["zone_id"].value_counts().to_dict()
    global_prior = {z: (zone_counts.get(z, 0) + 1) / (total_obs + n_zones)
                    for z in zone_list}

    # Typology-conditioned prior P(z | typology)
    typology_priors = {}
    for typ in obs["typology_id"].dropna().unique():
        typ_obs = obs[obs["typology_id"] == typ]
        t_counts = typ_obs["zone_id"].value_counts().to_dict()
        typology_priors[typ] = {
            z: (t_counts.get(z, 0) + 1) / (len(typ_obs) + n_zones)
            for z in zone_list
        }

    print(f"   global_prior: {n_zones} zones  typology_priors: {len(typology_priors)} typologies")

    # ── Mule-Zone likelihoods P(account | zone) ──────────────────────────────
    print("[2] Building mule-zone likelihoods …")
    # Join: each observed cashout → its zone; each hop in that complaint → destination account
    hop_to_zone = obs.set_index("complaint_id")["zone_id"].to_dict()
    tr_hops_obs = tr_hops[tr_hops["complaint_id"].isin(hop_to_zone)].copy()
    tr_hops_obs["cashout_zone"] = tr_hops_obs["complaint_id"].map(hop_to_zone)
    tr_hops_obs = tr_hops_obs[tr_hops_obs["cashout_zone"].notna()]

    mule_zone_likelihoods = {}  # zone_id → {account_id: P(account|zone)}
    for z in zone_list:
        z_hops = tr_hops_obs[tr_hops_obs["cashout_zone"] == z]
        if len(z_hops) == 0:
            mule_zone_likelihoods[z] = {}
            continue
        acc_counts = z_hops["to_account"].value_counts().to_dict()
        total_z    = len(z_hops)
        mule_zone_likelihoods[z] = {
            acc: (cnt + 0.1) / (total_z + 1)
            for acc, cnt in acc_counts.items()
        }
    n_acc_total = sum(len(v) for v in mule_zone_likelihoods.values())
    print(f"   mule_zone_likelihoods: {n_acc_total} (zone,account) pairs")

    # ── Node risk registry from CAUSAL T0 view ────────────────────────────────
    # For each account that appears in the causal registry, take the MAXIMUM
    # causal sightings seen at any T0 prediction_time in train.
    # This gives the "best available causal prior" for M8 weight at training time.
    # At inference time, the static rich_registry_v2.json provides the full-train-period view.
    print("[3] Building node_risk_registry from causal snapshots …")
    if causal_reg_df is not None and len(causal_reg_df) > 0:
        # Use max causal sightings per account across all train prediction snapshots
        acc_max = causal_reg_df.groupby("account_id")["causal_sightings"].max().reset_index()
        node_risk_registry = {}
        for _, row in acc_max.iterrows():
            n = int(row["causal_sightings"])
            node_risk_registry[row["account_id"]] = {
                "historical_count": n,
                "risk_weight": min(2.0, 1.0 + n * 0.1)
            }
    else:
        node_risk_registry = {}
    print(f"   node_risk_registry: {len(node_risk_registry)} accounts")

    return global_prior, typology_priors, mule_zone_likelihoods, node_risk_registry


# ── PHASE 2: Build causal-aware rich registry for TRAIN evaluation ───────────

def build_train_rich_registry(causal_reg_df, zone_list, global_prior):
    """
    Build a per-complaint rich registry for TRAINING snapshot evaluation.
    Each entry = causal state at T0 prediction_time for that complaint.
    Used during training-side M8 evidence update.
    Returns dict: complaint_id → {account_id → registry_entry}
    """
    if causal_reg_df is None or len(causal_reg_df) == 0:
        return {}

    # For each complaint, take T0 snapshot (earliest prediction_time in causal registry)
    causal_reg_df["prediction_time"] = pd.to_datetime(
        causal_reg_df["prediction_time"], format="ISO8601")
    t0_snap = causal_reg_df.sort_values("prediction_time").groupby("complaint_id").first().reset_index()

    # Build per-complaint registry dict
    comp_registry = {}
    for _, row in t0_snap.iterrows():
        cid = row["complaint_id"]
        if not row["causal_in_registry"]:
            continue
        # Parse zone_counts from JSON string
        try:
            zone_counts = json.loads(row["causal_zone_counts"]) if isinstance(row["causal_zone_counts"], str) else {}
        except Exception:
            zone_counts = {}
        n_a = int(row["causal_sightings"])
        if n_a == 0:
            continue

        # Compute q_a(z) — Dirichlet smoothed
        total = n_a
        q_a = {}
        for z in zone_list:
            n_az = zone_counts.get(z, 0)
            p_prior = global_prior.get(z, 1e-6)
            q_a[z] = (n_az + M8_LAMBDA * p_prior) / (total + M8_LAMBDA)

        # Entropy
        probs = np.array(list(q_a.values()))
        probs = probs / (probs.sum() + 1e-12)
        entropy = float(-np.sum(probs * np.log2(probs + 1e-12)))
        max_ent = np.log2(len(zone_list))
        norm_entropy = float(entropy / max_ent) if max_ent > 0 else 0.0

        strength    = n_a / (n_a + M8_K)
        consistency = 1.0 - norm_entropy
        reliability = strength * consistency

        entry = {
            "historical_sightings": n_a,
            "zone_counts": zone_counts,
            "q_a": q_a,
            "normalized_entropy": norm_entropy,
            "reliability": reliability,
        }
        if cid not in comp_registry:
            comp_registry[cid] = {}
        comp_registry[cid][row["account_id"]] = entry

    return comp_registry


# ── PHASE 3: Compute log-posteriors for a split ───────────────────────────────

def compute_log_posteriors(comp_df, hops_df, cout_df, zone_list, global_prior,
                           typology_priors, mule_zone_likelihoods,
                           comp_registry, global_log_prior):
    """
    For each complaint in comp_df:
      1. Start from typology-conditioned prior
      2. For each observed hop: update log-posterior with M3 (sequential Bayesian)
         and M8 (causal-registry-aware reliability update)
      Returns dict: complaint_id → (log_post_m3, log_post_m8)
    """
    m3_logits = {}  # sequential-only (no registry)
    m8_logits = {}  # sequential + causal registry

    obs_ids = set(cout_df[cout_df["zone_id"].notna()]["complaint_id"])

    for _, crow in comp_df.iterrows():
        cid = crow["complaint_id"]
        if cid not in obs_ids:
            continue  # skip censored / unknown-outcome

        typ = crow.get("typology_id")
        base_prior = typology_priors.get(typ, global_prior) if typ else global_prior
        l_prior = np.array([np.log(base_prior.get(z, 1e-9)) for z in zone_list])

        l_post3 = l_prior.copy()
        l_post8 = l_prior.copy()

        case_hops = hops_df[hops_df["complaint_id"] == cid].sort_values("hop_sequence")
        c_reg = comp_registry.get(cid, {})  # causal registry at T0 for this complaint

        for _, hop in case_hops.iterrows():
            acc = hop["to_account"]

            # M3: sequential Bayesian from mule_zone_likelihoods
            lh_array = np.array([
                np.log(mule_zone_likelihoods.get(z, {}).get(acc, 0.01))
                for z in zone_list
            ])
            l_post3 += lh_array

            # M8: same sequential update PLUS causal registry reliability
            l_post8 += lh_array
            if acc in c_reg:
                reg = c_reg[acc]
                q_a_arr = np.array([reg["q_a"].get(z, 1e-9) for z in zone_list])
                log_q_a = np.log(q_a_arr + 1e-12)
                reliability = reg["reliability"]
                evidence = log_q_a - global_log_prior
                l_post8 += M8_W_REL * reliability * evidence

        m3_logits[cid] = l_post3
        m8_logits[cid] = l_post8

    return m3_logits, m8_logits


# ── PHASE 4: Temperature calibration ─────────────────────────────────────────

def fit_temperature(logits_dict, targets_df, zone_idx_map):
    """Fit scalar temperature T minimising NLL on targets_df."""
    cids   = [c for c in targets_df["complaint_id"] if c in logits_dict]
    logits = np.array([logits_dict[c] for c in cids])
    labels = np.array([zone_idx_map[targets_df.loc[targets_df["complaint_id"]==c,"zone_id"].values[0]]
                       for c in cids])

    def nll(T):
        T = max(float(T), 0.01)
        scaled = logits / T
        scaled -= scaled.max(axis=1, keepdims=True)
        exp_l  = np.exp(scaled)
        probs  = exp_l / exp_l.sum(axis=1, keepdims=True)
        probs  = np.clip(probs, 1e-12, 1.0)
        return -np.mean(np.log(probs[np.arange(len(labels)), labels]))

    result = minimize_scalar(nll, bounds=(0.1, 20.0), method="bounded")
    return float(result.x)


# ── PHASE 5: Evaluation ───────────────────────────────────────────────────────

def evaluate(probs_dict, targets_df, zone_idx_map, zone_list, zones_df, label=""):
    """Compute Top-1/3/5, MRR, NLL, Brier, Geo-error."""
    valid = targets_df[targets_df["zone_id"].notna() &
                       targets_df["complaint_id"].isin(probs_dict)]
    n = len(valid)
    if n == 0:
        return {}

    top1 = top3 = top5 = mrr_sum = nll = brier = 0.0
    geo_errors = []

    zone_lat = dict(zip(zones_df["zone_id"], zones_df["lat"]))
    zone_lng = dict(zip(zones_df["zone_id"], zones_df["lng"]))

    for _, row in valid.iterrows():
        cid    = row["complaint_id"]
        actual = row["zone_id"]
        if actual not in zone_idx_map:
            continue
        ai = zone_idx_map[actual]
        probs = probs_dict[cid]
        sorted_idx = np.argsort(probs)[::-1]
        rank = int(np.where(sorted_idx == ai)[0][0]) + 1

        if rank == 1: top1 += 1
        if rank <= 3: top3 += 1
        if rank <= 5: top5 += 1
        mrr_sum += 1.0 / rank
        nll     -= np.log(probs[ai] + 1e-12)
        y_true   = np.zeros_like(probs); y_true[ai] = 1.0
        brier   += float(np.mean((probs - y_true)**2))

        pred_zone = zone_list[sorted_idx[0]]
        if (pred_zone in zone_lat and actual in zone_lat and
                zone_lat[pred_zone] and zone_lat[actual]):
            geo_errors.append(haversine(
                zone_lat[actual], zone_lng[actual],
                zone_lat[pred_zone], zone_lng[pred_zone]))

    metrics = {
        "n": n,
        "top1_pct":  round(100 * top1 / n, 2),
        "top3_pct":  round(100 * top3 / n, 2),
        "top5_pct":  round(100 * top5 / n, 2),
        "mrr":       round(mrr_sum / n, 4),
        "nll":       round(nll / n, 4),
        "brier":     round(brier / n, 4),
        "geo_mean_km":   round(float(np.mean(geo_errors)), 1)  if geo_errors else None,
        "geo_median_km": round(float(np.median(geo_errors)), 1) if geo_errors else None,
    }

    if label:
        print(f"  [{label}] n={n}  "
              f"Top1={metrics['top1_pct']}%  Top3={metrics['top3_pct']}%  "
              f"Top5={metrics['top5_pct']}%  MRR={metrics['mrr']:.3f}  "
              f"NLL={metrics['nll']:.3f}  Geo_med={metrics['geo_median_km']} km")
    return metrics


def probs_from_logits(logits_dict, T, zone_list):
    """Apply temperature-scaled softmax to all logits."""
    out = {}
    for cid, l in logits_dict.items():
        out[cid] = softmax_temp(l, T)
    return out


# ── MAIN ──────────────────────────────────────────────────────────────────────

def run():
    print("=" * 65)
    print("  TRINETRA Geographic Engine V2 — Training Pipeline")
    print("=" * 65)

    # ── Load V2 zone catalog ───────────────────────────────────────────────────
    zones_df  = pd.read_csv(ZONES_CSV)
    zone_list = sorted(zones_df["zone_id"].tolist())
    n_zones   = len(zone_list)
    zone_idx_map = {z: i for i, z in enumerate(zone_list)}

    zone_lat = dict(zip(zones_df["zone_id"], zones_df["lat"]))
    zone_lng = dict(zip(zones_df["zone_id"], zones_df["lng"]))

    print(f"\n  Zones: {n_zones}  |  Zone IDs: {zone_list[:3]} … {zone_list[-1]}")

    # ── Load causal registry ───────────────────────────────────────────────────
    print("\n[0] Loading causal registry …")
    causal_reg_df = pd.read_parquet(CAUSAL_REG)
    print(f"  Causal registry rows: {len(causal_reg_df):,}  "
          f"  complaints: {causal_reg_df['complaint_id'].nunique():,}")

    # ── Load splits ────────────────────────────────────────────────────────────
    print("\n[0] Loading data splits …")
    tr_comp, tr_hops, tr_cout = load_split("train")
    va_comp, va_hops, va_cout = load_split("val")
    te_comp, te_hops, te_cout = load_split("test")

    tr_obs = tr_cout[tr_cout["zone_id"].notna()]
    va_obs = va_cout[va_cout["zone_id"].notna()]
    te_obs = te_cout[te_cout["zone_id"].notna()]
    print(f"  Train obs: {len(tr_obs):,}  Val obs: {len(va_obs):,}  Test obs: {len(te_obs):,}")

    # ── Build training artifacts ───────────────────────────────────────────────
    global_prior, typology_priors, mule_zone_likelihoods, node_risk_registry = \
        build_training_artifacts(tr_comp, tr_hops, tr_cout, zone_list, causal_reg_df)

    global_log_prior = np.array([np.log(global_prior.get(z, 1e-9)) for z in zone_list])

    # ── Build causal per-complaint rich registry ───────────────────────────────
    print("[4] Building causal per-complaint rich registry (train T0) …")
    comp_registry_train = build_train_rich_registry(
        causal_reg_df[causal_reg_df["complaint_id"].isin(set(tr_comp["complaint_id"]))].copy(),
        zone_list, global_prior)
    print(f"  Complaints with causal registry entries: {len(comp_registry_train):,}")

    # For val/test evaluation: use the full static rich_registry_v2.json
    # (all of train history is "past" from val/test perspective)
    with open(os.path.join(ROOT, "artifacts/registry/rich_registry_v2.json")) as f:
        static_rich_registry = json.load(f)

    def build_eval_comp_registry(comp_df, hops_df, split_name):
        """Build comp_registry for val/test using static full-train registry."""
        reg = {}
        for _, crow in comp_df.iterrows():
            cid = crow["complaint_id"]
            case_hops_accs = hops_df[hops_df["complaint_id"]==cid]["to_account"].unique()
            case_reg = {}
            for acc in case_hops_accs:
                if acc not in static_rich_registry:
                    continue
                sr = static_rich_registry[acc]
                n_a = sr["historical_sightings"]
                if n_a == 0:
                    continue
                zone_counts = sr.get("zone_counts", {})
                q_a = {}
                for z in zone_list:
                    n_az = zone_counts.get(z, 0)
                    p_prior = global_prior.get(z, 1e-6)
                    q_a[z] = (n_az + M8_LAMBDA * p_prior) / (n_a + M8_LAMBDA)
                probs = np.array(list(q_a.values()))
                probs = probs / (probs.sum() + 1e-12)
                entropy = float(-np.sum(probs * np.log2(probs + 1e-12)))
                max_ent = np.log2(len(zone_list))
                norm_entropy = float(entropy / max_ent) if max_ent > 0 else 0.0
                strength    = n_a / (n_a + M8_K)
                consistency = 1.0 - norm_entropy
                reliability = strength * consistency
                case_reg[acc] = {
                    "historical_sightings": n_a,
                    "zone_counts":  zone_counts,
                    "q_a":          q_a,
                    "normalized_entropy": norm_entropy,
                    "reliability":  reliability,
                }
            if case_reg:
                reg[cid] = case_reg
        return reg

    print("[4b] Building eval registries for val/test (static train-period registry) …")
    comp_registry_val  = build_eval_comp_registry(va_comp, va_hops, "val")
    comp_registry_test = build_eval_comp_registry(te_comp, te_hops, "test")
    print(f"  Val complaints with registry: {len(comp_registry_val):,}")
    print(f"  Test complaints with registry: {len(comp_registry_test):,}")

    # ── Compute logits ─────────────────────────────────────────────────────────
    print("\n[5] Computing log-posteriors …")
    print("  Train …")
    tr_m3, tr_m8 = compute_log_posteriors(
        tr_comp, tr_hops, tr_cout, zone_list, global_prior,
        typology_priors, mule_zone_likelihoods, comp_registry_train, global_log_prior)
    print(f"  Train M3 logits: {len(tr_m3):,}  M8: {len(tr_m8):,}")

    print("  Val …")
    va_m3, va_m8 = compute_log_posteriors(
        va_comp, va_hops, va_cout, zone_list, global_prior,
        typology_priors, mule_zone_likelihoods, comp_registry_val, global_log_prior)
    print(f"  Val  M3 logits: {len(va_m3):,}  M8: {len(va_m8):,}")

    print("  Test …")
    te_m3, te_m8 = compute_log_posteriors(
        te_comp, te_hops, te_cout, zone_list, global_prior,
        typology_priors, mule_zone_likelihoods, comp_registry_test, global_log_prior)
    print(f"  Test M3 logits: {len(te_m3):,}  M8: {len(te_m8):,}")

    # ── Calibrate on Month-5 ───────────────────────────────────────────────────
    print("\n[6] Calibrating temperatures on Month-5 ONLY …")
    T_m3 = fit_temperature(va_m3, va_obs, zone_idx_map)
    T_m8 = fit_temperature(va_m8, va_obs, zone_idx_map)
    print(f"  T_M3 = {T_m3:.4f}  T_M8 = {T_m8:.4f}")

    # ── Validation metrics ─────────────────────────────────────────────────────
    print("\n[7] Validation metrics (Month-5, post-calibration) …")
    p_va_m3 = probs_from_logits(va_m3, T_m3, zone_list)
    p_va_m8 = probs_from_logits(va_m8, T_m8, zone_list)
    val_m3 = evaluate(p_va_m3, va_obs, zone_idx_map, zone_list, zones_df, "Val M3-Sequential")
    val_m8 = evaluate(p_va_m8, va_obs, zone_idx_map, zone_list, zones_df, "Val M8-Registry  ")

    # ── Month-6 evaluation (ONE touch) ────────────────────────────────────────
    print("\n[8] Month-6 FINAL evaluation (one touch) …")
    p_te_m3 = probs_from_logits(te_m3, T_m3, zone_list)
    p_te_m8 = probs_from_logits(te_m8, T_m8, zone_list)
    test_m3 = evaluate(p_te_m3, te_obs, zone_idx_map, zone_list, zones_df, "Test M3-Sequential")
    test_m8 = evaluate(p_te_m8, te_obs, zone_idx_map, zone_list, zones_df, "Test M8-Registry  ")

    # ── Ablation: seen-entity vs no-history ───────────────────────────────────
    print("\n[9] Test ablation by registry coverage …")
    te_with_hist    = [c for c in te_m8 if c in comp_registry_test]
    te_without_hist = [c for c in te_m8 if c not in comp_registry_test]
    te_obs_w  = te_obs[te_obs["complaint_id"].isin(te_with_hist)]
    te_obs_wo = te_obs[te_obs["complaint_id"].isin(te_without_hist)]
    ev_w  = evaluate(p_te_m8, te_obs_w,  zone_idx_map, zone_list, zones_df, "Test M8 (has registry)")
    ev_wo = evaluate(p_te_m8, te_obs_wo, zone_idx_map, zone_list, zones_df, "Test M8 (no registry) ")
    ev_m3_w  = evaluate(p_te_m3, te_obs_w,  zone_idx_map, zone_list, zones_df, "Test M3 (has registry)")
    ev_m3_wo = evaluate(p_te_m3, te_obs_wo, zone_idx_map, zone_list, zones_df, "Test M3 (no registry) ")

    # ── Save artifacts ────────────────────────────────────────────────────────
    print("\n[10] Saving V2 geographic artifacts …")
    artifacts = {
        "global_prior":            global_prior,
        "typology_priors":         typology_priors,
        "mule_zone_likelihoods":   mule_zone_likelihoods,
        "node_risk_registry":      node_risk_registry,
        "encoders": {
            "target_zone": zone_list,
        },
        "calibration": {
            "T_m3": T_m3,
            "T_m8": T_m8,
        },
        "m8_config": {
            "lambda": M8_LAMBDA,
            "k":      M8_K,
            "w_rel":  M8_W_REL,
        },
        "dataset_version": "v2",
        "train_obs_count": len(tr_obs),
    }
    with open(os.path.join(ART_DIR, "trained_model_geographic_v2.json"), "w") as f:
        json.dump(artifacts, f)
    print(f"  Saved: trained_model_geographic_v2.json")

    # Rich registry for V2 inference — this IS the static (full-train-period) registry
    # The static registry is correct for deployment: all of training is "past"
    import shutil
    shutil.copy(
        os.path.join(ROOT, "artifacts/registry/rich_registry_v2.json"),
        os.path.join(ART_DIR, "rich_registry_v2.json")
    )
    print(f"  Copied: rich_registry_v2.json → geographic_v2/")

    # Calibration temperatures also stored standalone
    calib = {"T_m3": T_m3, "T_m8": T_m8}
    with open(os.path.join(ART_DIR, "calibration_v2.json"), "w") as f:
        json.dump(calib, f, indent=2)

    metrics = {
        "val_m3":     val_m3,
        "val_m8":     val_m8,
        "test_m3":    test_m3,
        "test_m8":    test_m8,
        "test_m8_with_registry":    ev_w,
        "test_m8_no_registry":      ev_wo,
        "test_m3_with_registry":    ev_m3_w,
        "test_m3_no_registry":      ev_m3_wo,
        "calibration": {"T_m3": T_m3, "T_m8": T_m8},
        "n_train_obs": len(tr_obs),
        "n_val_obs":   len(va_obs),
        "n_test_obs":  len(te_obs),
    }
    with open(os.path.join(MET_DIR, "geographic_v2_metrics.json"), "w") as f:
        json.dump(metrics, f, indent=2)
    print(f"  Saved: geographic_v2_metrics.json")

    print("\n" + "=" * 65)
    print("  SUMMARY")
    print("=" * 65)
    print(f"  Zones:     {n_zones}")
    print(f"  Train obs: {len(tr_obs):,}  Val: {len(va_obs):,}  Test: {len(te_obs):,}")
    print(f"  Temp M3={T_m3:.3f}  Temp M8={T_m8:.3f}")
    print(f"\n  === ABLATION: Sequential-Only vs M8-Registry ===")
    print(f"  Test M3:  Top1={test_m3['top1_pct']}%  Top3={test_m3['top3_pct']}%  MRR={test_m3['mrr']:.3f}  Geo_med={test_m3['geo_median_km']} km")
    print(f"  Test M8:  Top1={test_m8['top1_pct']}%  Top3={test_m8['top3_pct']}%  MRR={test_m8['mrr']:.3f}  Geo_med={test_m8['geo_median_km']} km")
    print(f"\n  Artifacts: {ART_DIR}")
    print(f"  Metrics:   {MET_DIR}")
    print("=" * 65)

    return metrics


if __name__ == "__main__":
    run()
