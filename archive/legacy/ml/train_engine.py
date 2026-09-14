import sys
import os

# Add the parent directory to the path so we can import from scripts
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

import pandas as pd
import numpy as np
import json
import xgboost as xgb
from sklearn.preprocessing import LabelEncoder
from scripts.data_prep.feature_engineering import get_engineered_data

print("================================================================")
print("  TRINETRA PREDICTION ENGINE - MULTI-MODEL TRAINING (NO LEAKAGE) ")
print("================================================================")

# 1. Load STRICTLY Train Data
c_feat, h_feat, targets = get_engineered_data("train", "../data/generated/splits")
zones_df = pd.read_csv("../data/generated/full/zones.csv")
accounts_df = pd.read_csv("../data/generated/full/accounts.csv")

print(f"Loaded {len(c_feat)} training cases and {len(h_feat)} training hops.")

# Merge target zone onto cases and hops
c_full = c_feat.merge(targets, on='complaint_id')
h_full = h_feat.merge(targets, on='complaint_id')

zone_list = list(zones_df['zone_id'])

# --- MODEL 0: Global Prior P(Zone) ---
print("\n[Model 0] Training Global Prior...")
zone_counts = c_full['zone_id'].value_counts().to_dict()
total_cases = len(c_full)
global_prior = {z: (zone_counts.get(z, 0) + 1) / (total_cases + len(zone_list)) for z in zone_list}

# --- MODEL 1: Typology / Reference Class Prior P(Zone | Typology) ---
print("[Model 1] Training Typology Prior...")
typology_priors = {}
for typ in c_full['typology_id'].unique():
    typ_cases = c_full[c_full['typology_id'] == typ]
    t_counts = typ_cases['zone_id'].value_counts().to_dict()
    typology_priors[typ] = {z: (t_counts.get(z, 0) + 1) / (len(typ_cases) + len(zone_list)) for z in zone_list}

# --- MODEL 2: Feature-Based Classifier (XGBoost) ---
print("\n[Model 2] Training XGBoost Feature Ranker...")
# We will train XGBoost to predict the final zone using only T0 (Case) features 
# + T=Hop1 features to avoid leaking sequence length.
first_hops = h_full[h_full['hop_sequence'] == 1]
xgb_df = c_full.merge(first_hops[['complaint_id', 'time_since_incident_mins', 'to_account_historical_flags', 'is_mule', 'amount_retained_ratio']], on='complaint_id', how='left')
xgb_df.fillna(0, inplace=True)

# Encode categorical features
le_state = LabelEncoder()
xgb_df['victim_state_encoded'] = le_state.fit_transform(xgb_df['victim_state'])

le_typology = LabelEncoder()
xgb_df['typology_encoded'] = le_typology.fit_transform(xgb_df['typology_id'])

le_target = LabelEncoder()
y = le_target.fit_transform(xgb_df['zone_id'])

features = ['typology_encoded', 'victim_state_encoded', 'complaint_hour', 'complaint_dayofweek', 'amount_log', 
            'time_since_incident_mins', 'to_account_historical_flags', 'amount_retained_ratio']
X = xgb_df[features]

xgb_model = xgb.XGBClassifier(objective='multi:softprob', num_class=len(le_target.classes_), eval_metric='mlogloss', seed=42)
xgb_model.fit(X, y)
print("  [OK] XGBoost trained.")

# --- MODEL 3: Sequential Bayesian Estimator ---
print("\n[Model 3] Training Sequential Bayesian Likelihoods P(Account | Zone)...")
# Likelihood matrix
mule_zone_likelihoods = {}
total_hops = len(h_full)
for z in zone_list:
    z_hops = h_full[h_full['zone_id'] == z]
    acc_counts = z_hops['to_account'].value_counts().to_dict()
    mule_zone_likelihoods[z] = {
        acc: (acc_counts.get(acc, 0) + 0.1) / (len(z_hops) + 1)
        for acc in acc_counts.keys()
    }

# --- MODEL 4: Network Enrichment (Risk Registry) ---
print("\n[Model 4] Generating Node Risk Registry (M4 Baseline)...")
node_risk_registry = {}
for acc in h_full['to_account'].unique():
    acc_hops = h_full[h_full['to_account'] == acc]
    node_risk_registry[acc] = {
        "historical_count": len(acc_hops),
        "risk_weight": min(2.0, 1.0 + (len(acc_hops) * 0.1))
    }

print("\n[Registry Optimization] Generating Rich Registry Artifact...")
rich_registry = {}
for acc in h_full['to_account'].unique():
    acc_hops = h_full[h_full['to_account'] == acc]
    # Zone counts
    z_counts = acc_hops['zone_id'].value_counts()
    z_dist = z_counts.to_dict()
    total_sightings = len(acc_hops)
    
    top_z = z_counts.idxmax()
    raw_conc = z_counts.max() / total_sightings
    
    # Entropy
    probs = np.array(list(z_dist.values())) / total_sightings
    h = -np.sum(probs * np.log(probs + 1e-12))
    norm_h = h / np.log(len(zone_list)) if len(zone_list) > 1 else 0.0
    
    rich_registry[acc] = {
        "account_id": acc,
        "historical_sightings": total_sightings,
        "zone_counts": z_dist,
        "top_zone": top_z,
        "raw_concentration": float(raw_conc),
        "normalized_entropy": float(norm_h),
        "first_seen": str(acc_hops['event_timestamp'].min()),
        "last_seen": str(acc_hops['event_timestamp'].max())
    }

# --- SAVE ARTIFACTS ---
trained_artifacts = {
    "global_prior": global_prior,
    "typology_priors": typology_priors,
    "mule_zone_likelihoods": mule_zone_likelihoods,
    "node_risk_registry": node_risk_registry,
    "encoders": {
        "state": list(le_state.classes_),
        "typology": list(le_typology.classes_),
        "target_zone": list(le_target.classes_)
    },
    "xgb_features": features
}

with open("trained_model.json", "w") as f:
    json.dump(trained_artifacts, f, indent=2)

with open("rich_registry.json", "w") as f:
    json.dump(rich_registry, f, indent=2)

xgb_model.save_model("xgboost_model.json")

print("\n  [OK] ALL MODELS TRAINED AND SAVED SAFELY WITHOUT LEAKAGE.")