import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import time
import numpy as np
import pandas as pd
from scipy.optimize import minimize
from scripts.data_prep.feature_engineering import get_engineered_data

print("================================================================")
print("  REGISTRY INTELLIGENCE - FINAL TEST EVALUATION")
print("================================================================")

val_c, val_h, val_t = get_engineered_data("val", "../data/synthetic/splits")
test_c, test_h, test_t = get_engineered_data("test", "../data/synthetic/splits")

with open("../../artifacts/models/trained_model_m8.json", "r") as f:
    model_artifacts = json.load(f)
with open("../../artifacts/models/rich_registry.json", "r") as f:
    rich_registry = json.load(f)
with open("registry_tuning_results.json", "r") as f:
    tuning_results = json.load(f)

# Get the best M8 configuration from validation
best_m8 = max(tuning_results, key=lambda x: x["val_top3"])["config"]
print(f"Using Validation-Tuned Config for M8: {best_m8}")

# --- Helper logic from earlier ---
global_prior = model_artifacts["global_prior"]
typology_priors = model_artifacts["typology_priors"]
mule_zone_likelihoods = model_artifacts["mule_zone_likelihoods"]
node_risk_registry = model_artifacts["node_risk_registry"]
zone_list = model_artifacts["encoders"]["target_zone"]
zone_idx_map = {z: i for i, z in enumerate(zone_list)}
log_global_prior = np.array([np.log(global_prior.get(z, 1e-6)) for z in zone_list])
zones_df = pd.read_csv("../data/synthetic/zones.csv")

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
    override_threshold = config.get("override_threshold", 0.7)
    
    for c_id, l_seq in base_logits.items():
        c_hops = h_feat[h_feat['complaint_id'] == c_id]
        l_new = l_seq.copy()
        is_overridden = False
        
        for _, hop in c_hops.iterrows():
            acc = hop['to_account']
            if acc in rich_registry:
                reg = rich_registry[acc]
                
                if model_type == "M5":
                    if reg["raw_concentration"] > override_threshold and reg["historical_sightings"] > 3:
                        l_new = np.full(len(zone_list), -np.inf)
                        l_new[zone_idx_map[reg["top_zone"]]] = 0.0
                        is_overridden = True
                        break
                elif model_type in ["M6", "M7", "M8"]:
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
                    elif model_type == "M7":
                        l_new += (n_a * consistency * log_q_a)
                    elif model_type == "M8":
                        strength = n_a / (n_a + k)
                        reliability = strength * consistency
                        l_new += (w_rel * reliability * (log_q_a - log_global_prior))
        new_logits[c_id] = l_new
    return new_logits

# 1. Base Logits
print("Generating Base Logits...")
v_m3, v_m4 = generate_base_logits(val_c, val_h)
t_m3, t_m4 = generate_base_logits(test_c, test_h)

# 2. Registry adjusted logits
print("Applying Registry Evidence...")
v_m5 = apply_registry_evidence(val_h, v_m3, {"model_type": "M5", "override_threshold": 0.7})
t_m5 = apply_registry_evidence(test_h, t_m3, {"model_type": "M5", "override_threshold": 0.7})

v_m6 = apply_registry_evidence(val_h, v_m3, {"model_type": "M6", "lambda": 1.0})
t_m6 = apply_registry_evidence(test_h, t_m3, {"model_type": "M6", "lambda": 1.0})

v_m7 = apply_registry_evidence(val_h, v_m3, {"model_type": "M7", "lambda": 1.0})
t_m7 = apply_registry_evidence(test_h, t_m3, {"model_type": "M7", "lambda": 1.0})

v_m8 = apply_registry_evidence(val_h, v_m3, best_m8)
t_m8 = apply_registry_evidence(test_h, t_m3, best_m8)

# 3. Calibration on Validation
print("Calibrating on Validation...")
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
for name, v_logits in zip(["M4", "M5", "M6", "M7", "M8"], [v_m4, v_m5, v_m6, v_m7, v_m8]):
    # Note: M5 uses hard overrides (-inf), so temperature scaling will effectively preserve the hard override
    # but smooth the un-overridden cases.
    T_dict[name] = minimize(nll_loss, [1.0], args=(v_logits, val_t), bounds=[(0.1, 10.0)]).x[0]
print(f"Fitted Temperatures: {T_dict}")

def probs_from_logits(logits_dict, T):
    probs_dict = {}
    for c_id, l in logits_dict.items():
        scaled = l / T
        exp_l = np.exp(scaled - np.max(scaled))
        probs_dict[c_id] = exp_l / np.sum(exp_l)
    return probs_dict

p_m3 = probs_from_logits(t_m3, 1.0) # Uncalibrated baseline
p_m4 = probs_from_logits(t_m4, T_dict["M4"])
p_m5 = probs_from_logits(t_m5, T_dict["M5"])
p_m6 = probs_from_logits(t_m6, T_dict["M6"])
p_m7 = probs_from_logits(t_m7, T_dict["M7"])
p_m8 = probs_from_logits(t_m8, T_dict["M8"])

# 4. Evaluation
print("Evaluating on Final Test Set...")
with open("../data/synthetic/splits/test_special_splits.json", "r") as f:
    special = json.load(f)
    
# Find hit / no-hit slices
test_cids_with_hits = []
test_cids_without_hits = []
for c_id in test_c['complaint_id']:
    c_hops = test_h[test_h['complaint_id'] == c_id]
    hit = any(acc in rich_registry for acc in c_hops['to_account'])
    if hit: test_cids_with_hits.append(c_id)
    else: test_cids_without_hits.append(c_id)
    
print(f"Coverage: {len(test_cids_with_hits)} hits, {len(test_cids_without_hits)} no-hits")

def evaluate(probs_dict, targets, c_ids):
    if len(c_ids) == 0: return {}
    top1 = top3 = top5 = mrr_sum = brier = 0
    geo_errors = []
    entropies = []
    nll = 0
    
    for c_id in c_ids:
        if c_id not in probs_dict: continue
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
        nll -= np.log(probs[actual_idx] + 1e-12)
        entropies.append(-np.sum(probs * np.log(probs + 1e-12)))
        
        p_lat, p_lng = get_zone_coords(zone_list[sorted_indices[0]])
        a_lat, a_lng = get_zone_coords(actual_z)
        geo_errors.append(haversine(p_lat, p_lng, a_lat, a_lng))
        
    N = len(c_ids)
    return {
        "top1": round(top1/N*100, 1),
        "top3": round(top3/N*100, 1),
        "top5": round(top5/N*100, 1),
        "mrr": round(mrr_sum/N, 3),
        "geo_mean": round(np.mean(geo_errors), 1),
        "geo_med": round(np.median(geo_errors), 1),
        "geo_p75": round(np.percentile(geo_errors, 75), 1),
        "geo_p90": round(np.percentile(geo_errors, 90), 1),
        "brier": round(brier/N, 4),
        "nll": round(nll/N, 3),
        "entropy": round(np.mean(entropies), 2)
    }

results = {
    "Overall": {
        "M3_Bayesian": evaluate(p_m3, test_t, test_c['complaint_id']),
        "M4_Count_Registry": evaluate(p_m4, test_t, test_c['complaint_id']),
        "M5_Override": evaluate(p_m5, test_t, test_c['complaint_id']),
        "M6_Concentration": evaluate(p_m6, test_t, test_c['complaint_id']),
        "M7_Combined": evaluate(p_m7, test_t, test_c['complaint_id']),
        "M8_Reliability": evaluate(p_m8, test_t, test_c['complaint_id'])
    },
    "Coverage_Hits_Only": {
        "M4": evaluate(p_m4, test_t, test_cids_with_hits),
        "M8": evaluate(p_m8, test_t, test_cids_with_hits)
    },
    "Coverage_NoHits_Only": {
        "M4": evaluate(p_m4, test_t, test_cids_without_hits),
        "M8": evaluate(p_m8, test_t, test_cids_without_hits)
    },
    "Known_Mule": {
        "M4": evaluate(p_m4, test_t, special['known_mule_cases']),
        "M8": evaluate(p_m8, test_t, special['known_mule_cases'])
    },
    "Unseen_Mule": {
        "M4": evaluate(p_m4, test_t, special['unseen_mule_cases']),
        "M8": evaluate(p_m8, test_t, special['unseen_mule_cases'])
    },
    "Unseen_Syndicate_OOD": {
        "M4": evaluate(p_m4, test_t, special['unseen_syndicate_cases']),
        "M8": evaluate(p_m8, test_t, special['unseen_syndicate_cases'])
    }
}

with open("registry_evaluation_metrics.json", "w") as f:
    json.dump(results, f, indent=2)

print("\nEvaluation Output Saved. Final Test M8 Top-3:", results['Overall']['M8_Reliability']['top3'])
