import sys
import os

sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pandas as pd
import numpy as np
import json
import xgboost as xgb
from math import radians, cos, sin, asin, sqrt
from scipy.optimize import minimize
from scripts.data_prep.feature_engineering import get_engineered_data

print("================================================================")
print("  TRINETRA PREDICTION ENGINE - FINAL SCIENTIFIC EVALUATION ")
print("================================================================")

# ==========================================
# 1. LOAD DATA & MODELS
# ==========================================
zones_df = pd.read_csv("../data/synthetic/zones.csv")
with open("../../artifacts/models/trained_model_m8.json", "r") as f:
    model_artifacts = json.load(f)
xgb_model = xgb.XGBClassifier()
xgb_model.load_model("../../artifacts/models/xgboost_model_m8.json")

global_prior = model_artifacts["global_prior"]
typology_priors = model_artifacts["typology_priors"]
mule_zone_likelihoods = model_artifacts["mule_zone_likelihoods"]
node_risk_registry = model_artifacts["node_risk_registry"]
encoders = model_artifacts["encoders"]
xgb_features = model_artifacts["xgb_features"]
zone_list = encoders["target_zone"]
zone_idx_map = {z: i for i, z in enumerate(zone_list)}

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

# ==========================================
# 2. INFERENCE LOGIC (Uncalibrated Logits)
# ==========================================
def run_inference(c_feat, h_feat):
    c_ids = list(c_feat['complaint_id'])
    
    # M2: XGBoost Logits (Raw margins)
    c_full = c_feat.copy()
    first_hops = h_feat[h_feat['hop_sequence'] == 1]
    xgb_df = c_full.merge(first_hops[['complaint_id', 'time_since_incident_mins', 'to_account_historical_flags', 'is_mule', 'amount_retained_ratio']], on='complaint_id', how='left')
    xgb_df.fillna(0, inplace=True)
    try:
        xgb_df['victim_state_encoded'] = xgb_df['victim_state'].apply(lambda x: encoders['state'].index(x) if x in encoders['state'] else 0)
        xgb_df['typology_encoded'] = xgb_df['typology_id'].apply(lambda x: encoders['typology'].index(x) if x in encoders['typology'] else 0)
    except:
        pass
        
    X = xgb_df[xgb_features]
    # predict outputs margins when output_margin=True
    m2_logits_raw = xgb_model.predict(X, output_margin=True)
    m2_logits = {c: m2_logits_raw[i] for i, c in enumerate(xgb_df['complaint_id'])}
    
    m3_logits_hop1 = {}
    m3_logits_hopN = {}
    m4_logits_hopN = {}
    
    # Store histories for the frontend API payload
    histories = {}
    
    for _, row in c_feat.iterrows():
        c_id = row['complaint_id']
        base_prior = typology_priors.get(row['typology_id'], global_prior)
        
        # Log Prior
        log_prior_array = np.array([np.log(base_prior.get(z, 1e-6)) for z in zone_list])
        
        histories[c_id] = [{"stage": "T0", "logits": log_prior_array.copy()}]
        
        log_post3 = log_prior_array.copy()
        log_post4 = log_prior_array.copy()
        
        c_hops = h_feat[h_feat['complaint_id'] == c_id].sort_values('hop_sequence')
        
        if c_hops.empty:
            m3_logits_hop1[c_id] = log_post3
            m3_logits_hopN[c_id] = log_post3
            m4_logits_hopN[c_id] = log_post4
            continue
            
        for idx, hop in c_hops.iterrows():
            to_acc = hop['to_account']
            acc_risk_weight = node_risk_registry.get(to_acc, {}).get("risk_weight", 1.0)
            
            lh_array = np.array([np.log(mule_zone_likelihoods.get(z, {}).get(to_acc, 0.01)) for z in zone_list])
            
            log_post3 += lh_array
            log_post4 += (lh_array * acc_risk_weight)
            
            histories[c_id].append({"stage": f"HOP_{hop['hop_sequence']}", "logits": log_post4.copy()})
            
            if hop['hop_sequence'] == 1:
                m3_logits_hop1[c_id] = log_post3.copy()
                
        # Fill Hop1 if missing (length 0 already handled above)
        if c_id not in m3_logits_hop1:
            m3_logits_hop1[c_id] = log_post3.copy()
            
        m3_logits_hopN[c_id] = log_post3.copy()
        m4_logits_hopN[c_id] = log_post4.copy()
        
    return m2_logits, m3_logits_hop1, m3_logits_hopN, m4_logits_hopN, histories

# ==========================================
# 3. MULTICLASS CALIBRATION (Temperature Scaling)
# ==========================================
print("Calibrating models on Validation Set (Month 5)...")
val_c, val_h, val_t = get_engineered_data("val")
m2_val, m3h1_val, m3_val, m4_val, _ = run_inference(val_c, val_h)

def nll_loss(T, logits_dict, targets):
    logits = np.array([logits_dict[c] for c in targets['complaint_id']])
    labels = np.array([zone_idx_map[z] for z in targets['zone_id']])
    scaled = logits / T[0]
    max_l = np.max(scaled, axis=1, keepdims=True)
    exp_l = np.exp(scaled - max_l)
    probs = exp_l / np.sum(exp_l, axis=1, keepdims=True)
    probs = np.clip(probs, 1e-12, 1.0)
    return -np.mean(np.log(probs[np.arange(len(labels)), labels]))

T_m2 = minimize(nll_loss, [1.0], args=(m2_val, val_t), bounds=[(0.1, 10.0)]).x[0]
T_m3 = minimize(nll_loss, [1.0], args=(m3_val, val_t), bounds=[(0.1, 10.0)]).x[0]
T_m4 = minimize(nll_loss, [1.0], args=(m4_val, val_t), bounds=[(0.1, 10.0)]).x[0]

print(f"  Fitted Temperatures -> M2: {T_m2:.2f}, M3: {T_m3:.2f}, M4: {T_m4:.2f}")

def apply_temperature(logits_dict, T):
    probs_dict = {}
    for c_id, logits in logits_dict.items():
        scaled = logits / T
        exp_l = np.exp(scaled - np.max(scaled))
        probs_dict[c_id] = exp_l / np.sum(exp_l)
    return probs_dict

# ==========================================
# 4. FINAL TEST EVALUATION
# ==========================================
print("\nEvaluating on Final Touched Test Set (Month 6)...")
test_c, test_h, test_t = get_engineered_data("test")
m2_raw, m3h1_raw, m3_raw, m4_raw, test_histories = run_inference(test_c, test_h)

# Apply temperatures
m2_probs = apply_temperature(m2_raw, T_m2)
m3h1_probs = apply_temperature(m3h1_raw, T_m3)
m3_probs = apply_temperature(m3_raw, T_m3)
m4_probs = apply_temperature(m4_raw, T_m4)

# Global and Typology Priors (already probabilities)
m0_probs = {c: np.array([global_prior.get(z, 0) for z in zone_list]) for c in test_c['complaint_id']}
m1_probs = {c: np.array([typology_priors.get(typ, global_prior).get(z, 0) for z in zone_list]) for c, typ in zip(test_c['complaint_id'], test_c['typology_id'])}

# Load special slices
with open("../data/synthetic/splits/test_special_splits.json", "r") as f:
    special_splits = json.load(f)

def evaluate(probs_dict, targets, c_ids, name):
    count = 0
    top1 = 0
    top3 = 0
    top5 = 0
    mrr_sum = 0
    geo_errors = []
    entropies = []
    brier = 0
    
    for c_id in c_ids:
        if c_id not in probs_dict: continue
        count += 1
        probs = probs_dict[c_id]
        
        # Brier Score & Entropy
        entropies.append(-np.sum(probs * np.log(probs + 1e-12)))
        
        actual_z = targets[targets['complaint_id'] == c_id].iloc[0]['zone_id']
        actual_idx = zone_idx_map[actual_z]
        
        y_true = np.zeros_like(probs)
        y_true[actual_idx] = 1.0
        brier += np.mean((probs - y_true)**2)
        
        sorted_indices = np.argsort(probs)[::-1]
        rank = np.where(sorted_indices == actual_idx)[0][0] + 1
        
        if rank == 1: top1 += 1
        if rank <= 3: top3 += 1
        if rank <= 5: top5 += 1
        mrr_sum += (1.0 / rank)
        
        pred_z = zone_list[sorted_indices[0]]
        p_lat, p_lng = get_zone_coords(pred_z)
        a_lat, a_lng = get_zone_coords(actual_z)
        geo_errors.append(haversine(p_lat, p_lng, a_lat, a_lng))
        
    if count == 0: return {}
    
    return {
        "count": count,
        "top1_acc": round((top1 / count) * 100, 1),
        "top3_recall": round((top3 / count) * 100, 1),
        "top5_recall": round((top5 / count) * 100, 1),
        "mrr": round(mrr_sum / count, 3),
        "geo_err_mean_km": round(np.mean(geo_errors), 1),
        "geo_err_median_km": round(np.median(geo_errors), 1),
        "geo_err_p90_km": round(np.percentile(geo_errors, 90), 1),
        "brier_score": round(brier / count, 4),
        "mean_entropy": round(np.mean(entropies), 2)
    }

metrics = {
    "overall": {
        "M0_Global": evaluate(m0_probs, test_t, test_c['complaint_id'], "M0"),
        "M1_Typology": evaluate(m1_probs, test_t, test_c['complaint_id'], "M1"),
        "M2_XGBoost_T1": evaluate(m2_probs, test_t, test_c['complaint_id'], "M2"),
        "M3_Bayes_Hop1": evaluate(m3h1_probs, test_t, test_c['complaint_id'], "M3h1"),
        "M3_Bayes_HopN": evaluate(m3_probs, test_t, test_c['complaint_id'], "M3"),
        "M4_NetworkEnriched_HopN": evaluate(m4_probs, test_t, test_c['complaint_id'], "M4")
    }
}

for slice_name, ids in special_splits.items():
    metrics[slice_name] = {
        "M3_Bayes_HopN": evaluate(m3_probs, test_t, ids, "M3"),
        "M4_NetworkEnriched_HopN": evaluate(m4_probs, test_t, ids, "M4")
    }

print("\n--- ABLATION RESULTS (M3 vs M4 on Overall Test Set) ---")
m3_t3 = metrics["overall"]["M3_Bayes_HopN"]["top3_recall"]
m4_t3 = metrics["overall"]["M4_NetworkEnriched_HopN"]["top3_recall"]
print(f"Top-3 Recall -> M3: {m3_t3}% | M4: {m4_t3}% (Diff: {round(m4_t3 - m3_t3, 1)}%)")

m3_mrr = metrics["overall"]["M3_Bayes_HopN"]["mrr"]
m4_mrr = metrics["overall"]["M4_NetworkEnriched_HopN"]["mrr"]
print(f"MRR          -> M3: {m3_mrr} | M4: {m4_mrr}")

print("\n--- GENERALIZATION (Unseen Syndicate / OOD) ---")
print("Top-3 Recall (M4):", metrics["unseen_syndicate_cases"]["M4_NetworkEnriched_HopN"]["top3_recall"], "%")

with open("model_comparison.json", "w") as f:
    json.dump(metrics, f, indent=2)

# ==========================================
# 5. FRONTEND CONTRACT (M4 Calibrated)
# ==========================================
print("\nGenerating Frontend API Contract payload...")
frontend_payload = {
    "calibration": {"method": "Temperature Scaling (Validation Fit)", "modelVersion": "TRINETRA_v2.0_M4"},
    "evaluated_cases": []
}

for c_id in list(test_c['complaint_id'])[:50]:
    hist = test_histories[c_id]
    pred_history = []
    
    for stage in hist:
        probs = np.exp((stage["logits"] / T_m4) - np.max(stage["logits"] / T_m4))
        probs /= np.sum(probs)
        sorted_idx = np.argsort(probs)[::-1]
        
        ranked = []
        for i in range(10): # Top 10 for UI
            idx = sorted_idx[i]
            z_id = zone_list[idx]
            z_row = zones_df[zones_df['zone_id'] == z_id].iloc[0]
            ranked.append({
                "rank": i + 1,
                "zoneId": z_id,
                "district": z_row['zone_name'],
                "state": z_row['state'],
                "lat": float(z_row['lat']),
                "lng": float(z_row['lng']),
                "probability": float(round(probs[idx], 4))
            })
            
        pred_history.append({
            "stage": stage["stage"],
            "timestamp": "ISO_MOCK", # Would be actual hop timestamp
            "rankedZones": ranked
        })
        
    final_stage = pred_history[-1]
    actual_zone = test_t[test_t['complaint_id'] == c_id].iloc[0]['zone_id']
    
    frontend_payload["evaluated_cases"].append({
        "caseId": c_id,
        "stage": final_stage["stage"],
        "topZone": final_stage["rankedZones"][0],
        "confidence": final_stage["rankedZones"][0]["probability"],
        "rankedZones": final_stage["rankedZones"],
        "predictionHistory": pred_history,
        "recoverability": {
            "score": 0.85,
            "elapsedMinutes": 120,
            "estimatedRemainingMinutes": 30
        },
        "recommendedAction": "Issue Freeze Request to Node Bank",
        "actual_zone_ground_truth": actual_zone
    })

with open("../frontend-nisha/frontend-Nisha/src/data/mockPredictionsOutput.json", "w") as f:
    json.dump(frontend_payload, f, indent=2)

print("[OK] Verification and API Contract complete.")
