import os
import sys
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import json
import numpy as np
import pandas as pd
from scripts.data_prep.feature_engineering import get_engineered_data

print("Loading data for Registry Optimization...")
val_c, val_h, val_t = get_engineered_data("val", "../data/synthetic/splits")
test_c, test_h, test_t = get_engineered_data("test", "../data/synthetic/splits")

with open("../../artifacts/models/trained_model_m8.json", "r") as f:
    model_artifacts = json.load(f)
with open("../../artifacts/models/rich_registry.json", "r") as f:
    rich_registry = json.load(f)

global_prior = model_artifacts["global_prior"]
typology_priors = model_artifacts["typology_priors"]
mule_zone_likelihoods = model_artifacts["mule_zone_likelihoods"]
node_risk_registry = model_artifacts["node_risk_registry"]
zone_list = model_artifacts["encoders"]["target_zone"]
zone_idx_map = {z: i for i, z in enumerate(zone_list)}

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
    """Generates L_seq (M3) and L_xgb (M2) base logits for all complaints"""
    m3_logits = {}
    m4_logits = {} # The existing baseline
    
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

val_m3_logits, val_m4_logits = generate_base_logits(val_c, val_h)

def evaluate_predictions(probs_dict, targets_df):
    count = 0
    top1 = top3 = top5 = 0
    mrr_sum = 0
    geo_errors = []
    
    for c_id in probs_dict:
        count += 1
        probs = probs_dict[c_id]
        
        actual_z = targets_df[targets_df['complaint_id'] == c_id].iloc[0]['zone_id']
        actual_idx = zone_idx_map[actual_z]
        
        sorted_indices = np.argsort(probs)[::-1]
        rank = np.where(sorted_indices == actual_idx)[0][0] + 1
        
        if rank == 1: top1 += 1
        if rank <= 3: top3 += 1
        if rank <= 5: top5 += 1
        mrr_sum += (1.0 / rank)
        
    return (top3 / count) * 100 if count > 0 else 0.0

def apply_registry_evidence(h_feat, base_logits, config):
    """
    Applies the rich registry evidence dynamically using the specified configuration.
    config keys: 'lambda', 'k', 'w_rel', 'model_type'
    """
    new_logits = {}
    lambd = config.get("lambda", 1.0)
    k = config.get("k", 10.0)
    w_rel = config.get("w_rel", 1.0)
    model_type = config.get("model_type", "M8")
    override_threshold = config.get("override_threshold", 0.7)
    
    # Precompute global prior array for evidence subtraction
    log_global_prior = np.array([np.log(global_prior.get(z, 1e-6)) for z in zone_list])
    
    for c_id, l_seq in base_logits.items():
        c_hops = h_feat[h_feat['complaint_id'] == c_id]
        
        l_new = l_seq.copy()
        is_overridden = False
        
        for _, hop in c_hops.iterrows():
            acc = hop['to_account']
            if acc in rich_registry:
                reg = rich_registry[acc]
                
                if model_type == "M5": # Override
                    if reg["raw_concentration"] > override_threshold and reg["historical_sightings"] > 3:
                        l_new = np.full(len(zone_list), -np.inf)
                        l_new[zone_idx_map[reg["top_zone"]]] = 0.0
                        is_overridden = True
                        break # One override is enough
                        
                elif model_type in ["M6", "M7", "M8"]:
                    # Compute Smoothed Distribution q_a(z)
                    n_a = reg["historical_sightings"]
                    q_a = np.zeros(len(zone_list))
                    for i, z in enumerate(zone_list):
                        n_az = reg["zone_counts"].get(z, 0)
                        p_prior = global_prior.get(z, 1e-6)
                        q_a[i] = (n_az + lambd * p_prior) / (n_a + lambd)
                        
                    log_q_a = np.log(q_a)
                    
                    if model_type == "M6": # Concentration Weighted
                        consistency = 1.0 - reg["normalized_entropy"]
                        evidence = consistency * log_q_a
                        l_new += evidence
                        
                    elif model_type == "M7": # Count x Concentration (Overconfidence test)
                        consistency = 1.0 - reg["normalized_entropy"]
                        weight = n_a * consistency
                        evidence = weight * log_q_a
                        l_new += evidence
                        
                    elif model_type == "M8": # Reliability Aware
                        consistency = 1.0 - reg["normalized_entropy"]
                        strength = n_a / (n_a + k)
                        reliability = strength * consistency
                        
                        evidence = log_q_a - log_global_prior
                        l_new += (w_rel * reliability * evidence)
                        
        # Softmax
        if not is_overridden:
            exp_l = np.exp(l_new - np.max(l_new))
            probs = exp_l / np.sum(exp_l)
        else:
            probs = np.exp(l_new) # Already handled
            
        new_logits[c_id] = probs
        
    return new_logits

# Grid Search on Validation
print("Running Grid Search on Validation Set for Registry Hyperparameters...")
best_m8_top3 = 0.0
best_m8_config = None
tuning_results = []

for lambd in [0.5, 1.0, 5.0]:
    for k in [5.0, 10.0, 20.0]:
        for w_rel in [0.5, 1.0, 2.0]:
            cfg = {"model_type": "M8", "lambda": lambd, "k": k, "w_rel": w_rel}
            val_probs = apply_registry_evidence(val_h, val_m3_logits, cfg)
            top3 = evaluate_predictions(val_probs, val_t)
            
            tuning_results.append({
                "config": cfg,
                "val_top3": top3
            })
            
            if top3 > best_m8_top3:
                best_m8_top3 = top3
                best_m8_config = cfg

print(f"Best M8 Config on Val: {best_m8_config} (Top-3: {best_m8_top3:.2f}%)")

with open("registry_tuning_results.json", "w") as f:
    json.dump(tuning_results, f, indent=2)

print("\nGrid Search Complete. Execute final evaluation in registry_evaluate.py")
