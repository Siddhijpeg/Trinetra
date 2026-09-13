import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scripts.data_prep.feature_engineering import get_engineered_data

print("================================================================")
print("  REGISTRY INTELLIGENCE - FINAL CLOSURE AUDIT")
print("================================================================")

val_c, val_h, val_t = get_engineered_data("val", "../data/generated/splits")
test_c, test_h, test_t = get_engineered_data("test", "../data/generated/splits")

with open("trained_model.json", "r") as f:
    model_artifacts = json.load(f)
with open("rich_registry.json", "r") as f:
    rich_registry = json.load(f)
with open("registry_tuning_results.json", "r") as f:
    tuning_results = json.load(f)

# Rebuild M8 config
best_m8 = max(tuning_results, key=lambda x: x["val_top3"])["config"]

global_prior = model_artifacts["global_prior"]
typology_priors = model_artifacts["typology_priors"]
mule_zone_likelihoods = model_artifacts["mule_zone_likelihoods"]
node_risk_registry = model_artifacts["node_risk_registry"]
zone_list = model_artifacts["encoders"]["target_zone"]
zone_idx_map = {z: i for i, z in enumerate(zone_list)}
log_global_prior = np.array([np.log(global_prior.get(z, 1e-6)) for z in zone_list])
zones_df = pd.read_csv("../data/generated/full/zones.csv")

def get_zone_coords(z_id):
    row = zones_df[zones_df['zone_id'] == z_id]
    if not row.empty:
        return row.iloc[0]['lat'], row.iloc[0]['lng']
    return 0.0, 0.0

def haversine(lat1, lon1, lat2, lon2):
    R = 6371.0
    dlat, dlon = np.radians(lat2 - lat1), np.radians(lon2 - lon1)
    a = np.sin(dlat / 2)**2 + np.cos(np.radians(lat1)) * np.cos(np.radians(lat2)) * np.sin(dlon / 2)**2
    return 2 * R * np.arcsin(np.sqrt(a))

def generate_base_logits(c_feat, h_feat):
    m3_logits = {}
    m4_logits = {}
    for _, row in c_feat.iterrows():
        c_id = row['complaint_id']
        b_prior = typology_priors.get(row['typology_id'], global_prior)
        l_prior = np.array([np.log(b_prior.get(z, 1e-6)) for z in zone_list])
        c_hops = h_feat[h_feat['complaint_id'] == c_id].sort_values('hop_sequence')
        l_post3 = l_prior.copy()
        l_post4 = l_prior.copy()
        for _, hop in c_hops.iterrows():
            to_acc = hop['to_account']
            acc_risk_weight = node_risk_registry.get(to_acc, {}).get("risk_weight", 1.0)
            lh_array = np.array([np.log(mule_zone_likelihoods.get(z, {}).get(to_acc, 0.01)) for z in zone_list])
            l_post3 += lh_array
            l_post4 += (lh_array * acc_risk_weight)
        m3_logits[c_id] = l_post3
        m4_logits[c_id] = l_post4
    return m3_logits, m4_logits

def apply_registry_evidence(h_feat, base_logits, config):
    new_logits = {}
    lambd = config.get("lambda", 1.0)
    k = config.get("k", 10.0)
    w_rel = config.get("w_rel", 1.0)
    model_type = config.get("model_type", "M8")
    
    for c_id, l_seq in base_logits.items():
        c_hops = h_feat[h_feat['complaint_id'] == c_id]
        l_new = l_seq.copy()
        for _, hop in c_hops.iterrows():
            acc = hop['to_account']
            if acc in rich_registry:
                reg = rich_registry[acc]
                n_a = reg["historical_sightings"]
                q_a = np.zeros(len(zone_list))
                for i, z in enumerate(zone_list):
                    n_az = reg["zone_counts"].get(z, 0)
                    p_prior = global_prior.get(z, 1e-6)
                    q_a[i] = (n_az + lambd * p_prior) / (n_a + lambd)
                    
                log_q_a = np.log(q_a)
                consistency = 1.0 - reg["normalized_entropy"]
                
                if model_type == "M6":
                    l_new += (consistency * log_q_a)
                elif model_type == "M8":
                    strength = n_a / (n_a + k)
                    reliability = strength * consistency
                    l_new += (w_rel * reliability * (log_q_a - log_global_prior))
        new_logits[c_id] = l_new
    return new_logits

print("Generating Logits...")
v_m3, v_m4 = generate_base_logits(val_c, val_h)
t_m3, t_m4 = generate_base_logits(test_c, test_h)

v_m6 = apply_registry_evidence(val_h, v_m3, {"model_type": "M6", "lambda": 1.0})
t_m6 = apply_registry_evidence(test_h, t_m3, {"model_type": "M6", "lambda": 1.0})

v_m8 = apply_registry_evidence(val_h, v_m3, best_m8)
t_m8 = apply_registry_evidence(test_h, t_m3, best_m8)

# Calibrate
def nll_loss(T, logits_dict, targets):
    logits = np.array([logits_dict[c] for c in targets['complaint_id']])
    labels = np.array([zone_idx_map[z] for z in targets['zone_id']])
    scaled = logits / T[0]
    max_l = np.max(scaled, axis=1, keepdims=True)
    exp_l = np.exp(scaled - max_l)
    probs = exp_l / np.sum(exp_l, axis=1, keepdims=True)
    probs = np.clip(probs, 1e-12, 1.0)
    return -np.mean(np.log(probs[np.arange(len(labels)), labels]))

T_dict = {}
for name, v_logits in zip(["M4", "M6", "M8"], [v_m4, v_m6, v_m8]):
    T_dict[name] = minimize(nll_loss, [1.0], args=(v_logits, val_t), bounds=[(0.1, 10.0)]).x[0]

def probs_from_logits(logits_dict, T):
    probs_dict = {}
    for c_id, l in logits_dict.items():
        scaled = l / T
        exp_l = np.exp(scaled - np.max(scaled))
        probs_dict[c_id] = exp_l / np.sum(exp_l)
    return probs_dict

p_m4 = probs_from_logits(t_m4, T_dict["M4"])
p_m6 = probs_from_logits(t_m6, T_dict["M6"])
p_m8 = probs_from_logits(t_m8, T_dict["M8"])

# --- 2. Coverage & Leakage Audit ---
print("\n[Coverage Audit]")
test_c_list = test_c['complaint_id'].tolist()

leakage_found = False
for acc, reg in rich_registry.items():
    if pd.to_datetime(reg["last_seen"]) >= pd.to_datetime("2025-06-01"):
        leakage_found = True
print(f"Leakage Audit (last_seen >= 2025-06-01 in Registry): {'FAILED' if leakage_found else 'PASSED'}")

hit_counts = []
total_sightings_cohorts = {"No Reuse": [], "Low Reuse": [], "Medium Reuse": [], "High Reuse": []}

for c_id in test_c_list:
    c_hops = test_h[test_h['complaint_id'] == c_id]
    hits = 0
    total_sight = 0
    for acc in c_hops['to_account']:
        if acc in rich_registry:
            hits += 1
            total_sight += rich_registry[acc]["historical_sightings"]
    
    hit_counts.append(hits)
    
    if total_sight == 0: total_sightings_cohorts["No Reuse"].append(c_id)
    elif total_sight <= 5: total_sightings_cohorts["Low Reuse"].append(c_id)
    elif total_sight <= 20: total_sightings_cohorts["Medium Reuse"].append(c_id)
    else: total_sightings_cohorts["High Reuse"].append(c_id)

hc = pd.Series(hit_counts)
print(f"Test Cases: {len(test_c_list)}")
print(f"0 Hits: {(hc == 0).mean()*100:.1f}%")
print(f"1 Hit: {(hc == 1).mean()*100:.1f}%")
print(f"2 Hits: {(hc == 2).mean()*100:.1f}%")
print(f"3+ Hits: {(hc >= 3).mean()*100:.1f}%")

print("\n[Reuse Cohorts]")
for k, v in total_sightings_cohorts.items():
    print(f"{k}: {len(v)} cases")

# --- 3. Evaluate Cohorts ---
def eval_cohort(probs_dict, targets, c_ids):
    if len(c_ids) == 0: return {}
    top1 = top3 = top5 = mrr_sum = brier = 0
    geo_errors = []
    
    for c_id in c_ids:
        probs = probs_dict[c_id]
        actual_z = targets[targets['complaint_id'] == c_id].iloc[0]['zone_id']
        actual_idx = zone_idx_map[actual_z]
        
        sorted_indices = np.argsort(probs)[::-1]
        rank = np.where(sorted_indices == actual_idx)[0][0] + 1
        
        if rank == 1: top1 += 1
        if rank <= 3: top3 += 1
        if rank <= 5: top5 += 1
        mrr_sum += (1.0 / rank)
        
        y_true = np.zeros_like(probs)
        y_true[actual_idx] = 1.0
        brier += np.mean((probs - y_true)**2)
        
        p_lat, p_lng = get_zone_coords(zone_list[sorted_indices[0]])
        a_lat, a_lng = get_zone_coords(actual_z)
        geo_errors.append(haversine(p_lat, p_lng, a_lat, a_lng))
        
    N = len(c_ids)
    return {
        "top1": round(top1/N*100, 1),
        "top3": round(top3/N*100, 1),
        "top5": round(top5/N*100, 1),
        "mrr": round(mrr_sum/N, 3),
        "geo_med": round(np.median(geo_errors), 1),
        "brier": round(brier/N, 4)
    }

cohort_results = {}
for c_name, c_ids in total_sightings_cohorts.items():
    cohort_results[c_name] = {
        "M4": eval_cohort(p_m4, test_t, c_ids),
        "M6": eval_cohort(p_m6, test_t, c_ids),
        "M8": eval_cohort(p_m8, test_t, c_ids)
    }

with open("registry_cohort_results.json", "w") as f:
    json.dump(cohort_results, f, indent=2)

# --- 4. Bootstrapping ---
print("\n[Bootstrapping M6 vs M8]")
B = 1000
np.random.seed(42)

results_m6 = {"top1": [], "top3": [], "mrr": [], "geo_mean": []}
results_m8 = {"top1": [], "top3": [], "mrr": [], "geo_mean": []}
diffs = {"top3": [], "mrr": [], "geo_mean": []}

# Precompute arrays for speed
def precompute_arrs(probs_dict, targets, c_ids):
    N = len(c_ids)
    is_top1 = np.zeros(N)
    is_top3 = np.zeros(N)
    rr = np.zeros(N)
    geos = np.zeros(N)
    
    for i, c_id in enumerate(c_ids):
        probs = probs_dict[c_id]
        actual_z = targets[targets['complaint_id'] == c_id].iloc[0]['zone_id']
        actual_idx = zone_idx_map[actual_z]
        sorted_indices = np.argsort(probs)[::-1]
        rank = np.where(sorted_indices == actual_idx)[0][0] + 1
        
        if rank == 1: is_top1[i] = 1
        if rank <= 3: is_top3[i] = 1
        rr[i] = 1.0 / rank
        
        p_lat, p_lng = get_zone_coords(zone_list[sorted_indices[0]])
        a_lat, a_lng = get_zone_coords(actual_z)
        geos[i] = haversine(p_lat, p_lng, a_lat, a_lng)
        
    return is_top1, is_top3, rr, geos

print("Precomputing arrays for bootstrapping...")
m6_t1, m6_t3, m6_rr, m6_g = precompute_arrs(p_m6, test_t, test_c_list)
m8_t1, m8_t3, m8_rr, m8_g = precompute_arrs(p_m8, test_t, test_c_list)

print(f"Running {B} bootstrap iterations...")
N = len(test_c_list)
for b in range(B):
    indices = np.random.randint(0, N, N)
    
    m6_res_t3 = np.mean(m6_t3[indices]) * 100
    m6_res_rr = np.mean(m6_rr[indices])
    m6_res_gm = np.mean(m6_g[indices])
    
    m8_res_t3 = np.mean(m8_t3[indices]) * 100
    m8_res_rr = np.mean(m8_rr[indices])
    m8_res_gm = np.mean(m8_g[indices])
    
    results_m6["top3"].append(m6_res_t3)
    results_m6["mrr"].append(m6_res_rr)
    results_m6["geo_mean"].append(m6_res_gm)
    
    results_m8["top3"].append(m8_res_t3)
    results_m8["mrr"].append(m8_res_rr)
    results_m8["geo_mean"].append(m8_res_gm)
    
    diffs["top3"].append(m8_res_t3 - m6_res_t3)
    diffs["mrr"].append(m8_res_rr - m6_res_rr)
    diffs["geo_mean"].append(m8_res_gm - m6_res_gm)

bootstrap_summary = {
    "M6": {
        "top3": [np.percentile(results_m6["top3"], 2.5), np.percentile(results_m6["top3"], 97.5)],
        "mrr": [np.percentile(results_m6["mrr"], 2.5), np.percentile(results_m6["mrr"], 97.5)],
    },
    "M8": {
        "top3": [np.percentile(results_m8["top3"], 2.5), np.percentile(results_m8["top3"], 97.5)],
        "mrr": [np.percentile(results_m8["mrr"], 2.5), np.percentile(results_m8["mrr"], 97.5)],
    },
    "Diff_M8_minus_M6": {
        "top3": [np.percentile(diffs["top3"], 2.5), np.percentile(diffs["top3"], 97.5)],
        "mrr": [np.percentile(diffs["mrr"], 2.5), np.percentile(diffs["mrr"], 97.5)],
        "geo_mean": [np.percentile(diffs["geo_mean"], 2.5), np.percentile(diffs["geo_mean"], 97.5)]
    }
}

with open("registry_bootstrap_results.json", "w") as f:
    json.dump(bootstrap_summary, f, indent=2)

print("Bootstrapping Complete. Results saved.")
