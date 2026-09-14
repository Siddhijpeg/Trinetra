import pandas as pd
import numpy as np
import json
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from sklearn.preprocessing import MinMaxScaler

print("================================================================")
print("  TRINETRA PREDICTION ENGINE - MULTI-FEATURE MODEL TRAINING     ")
print("================================================================")

# 1. Datasets Load Karo
zones = pd.read_csv("zones.csv")
accounts = pd.read_csv("accounts.csv")
complaints = pd.read_csv("complaints.csv")
hops = pd.read_csv("hops.csv")
cashouts = pd.read_csv("cashout_events.csv")
typology_rules = pd.read_csv("typology_rules.csv")
mule_entities = pd.read_csv("mule_entities.csv")

# -------------------------------------------------------------------------
# MODULE 1 TRAINING: Cosine Similarity + Multi-Feature Profiling (Typology, Amount, Velocity, Frequency)
# -------------------------------------------------------------------------
print("\n[Module 1] Training Reference-Class Prior Matcher...")

# A. Typology Cosine Vectorizer
vectorizer = TfidfVectorizer()
typology_tfidf = vectorizer.fit_transform(typology_rules['name'].tolist())

# B. Historical Typology Statistical Baseline Learning (Amount, Velocity & Hop Frequency)
typology_profiles = {}

for _, rule in typology_rules.iterrows():
    t_id = rule['typology_id']
    t_name = rule['name']
    
    # Filter historical complaints matching this typology
    matched_cmps = complaints[complaints['typology_id'] == t_id]
    
    if not matched_cmps.empty:
        cmp_ids = matched_cmps['complaint_id'].tolist()
        matched_hops = hops[hops['complaint_id'].isin(cmp_ids)]
        
        avg_amt = float(matched_cmps['amount_inr'].mean())
        std_amt = float(matched_cmps['amount_inr'].std()) if len(matched_cmps) > 1 else 10000.0
        avg_velocity = float(matched_hops['delay_minutes'].mean()) if not matched_hops.empty else rule['avg_velocity_mins']
        avg_hops_count = float(matched_hops.groupby('complaint_id')['hop_sequence'].max().mean()) if not matched_hops.empty else rule['typical_hops']
    else:
        avg_amt = 100000.0
        std_amt = 20000.0
        avg_velocity = float(rule['avg_velocity_mins'])
        avg_hops_count = float(rule['typical_hops'])
        
    typology_profiles[t_id] = {
        "typology_name": t_name,
        "mean_amount": round(avg_amt, 2),
        "std_amount": round(std_amt, 2),
        "mean_velocity_mins": round(avg_velocity, 2),
        "mean_hops_frequency": round(avg_hops_count, 2),
        "cashout_window_hrs": float(rule['cashout_window_hrs'])
    }

print(f"  [OK] Generated feature profiles for {len(typology_profiles)} typologies (Amount, Speed, Frequency).")

# -------------------------------------------------------------------------
# MODULE 2 TRAINING: Sequential Bayesian Estimator (Hop-by-Hop Transition Likelihood)
# -------------------------------------------------------------------------
print("\n[Module 2] Training Sequential Bayesian Estimator...")

# A. Global Prior Distribution P(Zone)
zone_ids = zones['zone_id'].tolist()
total_cashouts = len(cashouts)
zone_prior_counts = cashouts['zone_id'].value_counts().to_dict()

# Laplace smoothing ke saath baseline zone prior computation P(Z_k)
priors_p_zone = {
    z: float((zone_prior_counts.get(z, 0) + 1) / (total_cashouts + len(zone_ids))) 
    for z in zone_ids
}

# B. Likelihood P(Mule_Account | Zone) & Likelihood P(Velocity | Zone)
# Hops data ko target zone ke saath join karo
merged_hops = hops.merge(cashouts[['complaint_id', 'zone_id']], on='complaint_id')

mule_zone_likelihoods = {}
velocity_zone_distributions = {}

for z_id in zone_ids:
    zone_hops = merged_hops[merged_hops['zone_id'] == z_id]
    total_zone_hops = len(zone_hops)
    
    # Mule account transition probability matrix
    acc_counts = zone_hops['to_account'].value_counts().to_dict()
    mule_zone_likelihoods[z_id] = {
        acc: float((acc_counts.get(acc, 0) + 0.1) / (total_zone_hops + 1))
        for acc in accounts['account_id']
    }
    
    # Velocity distribution P(Hop_Delay | Zone)
    if not zone_hops.empty:
        velocity_zone_distributions[z_id] = {
            "mean_speed": float(zone_hops['delay_minutes'].mean()),
            "std_speed": float(zone_hops['delay_minutes'].std()) if len(zone_hops) > 1 else 5.0
        }
    else:
        velocity_zone_distributions[z_id] = {"mean_speed": 15.0, "std_speed": 5.0}

print(f"  [OK] Bayesian update matrix mapped for {len(zone_ids)} geographic zones.")
print(f"  [OK] Hop-by-hop likelihood distributions trained across all mule nodes.")

# -------------------------------------------------------------------------
# MODULE 3 TRAINING: Entity & Node Risk Weights Matrix
# -------------------------------------------------------------------------
print("\n[Module 3] Calculating Risk Registry Weights...")

node_risk_registry = {}
for _, acc in accounts.iterrows():
    mule_id = acc['account_id']
    flag_score = acc['times_flagged'] / 20.0
    init_risk = acc['initial_risk_score']
    
    # Aggregate transaction frequency & total volume handled by account
    acc_hops = hops[hops['to_account'] == mule_id]
    tx_freq = len(acc_hops)
    tx_volume = float(acc_hops['amount_transferred'].sum()) if not acc_hops.empty else 0.0
    
    # Composite trained weight
    composite_risk = min(0.99, (flag_score * 0.4) + (init_risk * 0.4) + min(0.2, tx_freq * 0.02))
    
    node_risk_registry[mule_id] = {
        "risk_score": round(float(composite_risk), 4),
        "times_flagged": int(acc['times_flagged']),
        "total_transfers": tx_freq,
        "total_volume_inr": round(tx_volume, 2)
    }

# -------------------------------------------------------------------------
# SAVE TRAINED ARTIFACTS TO trained_model.json
# -------------------------------------------------------------------------
trained_artifacts = {
    "model_metadata": {
        "version": "2.0.0-multi-feature",
        "trained_date": "2026-09-12",
        "total_training_complaints": len(complaints),
        "total_training_hops": len(hops)
    },
    "module_1_cosine_priors": {
        "vocabulary": list(vectorizer.get_feature_names_out()),
        "typology_tfidf_matrix": typology_tfidf.toarray().tolist(),
        "typology_profiles": typology_profiles
    },
    "module_2_bayesian_estimator": {
        "priors_p_zone": priors_p_zone,
        "mule_zone_likelihoods": mule_zone_likelihoods,
        "velocity_zone_distributions": velocity_zone_distributions
    },
    "module_3_risk_registry": node_risk_registry
}

with open("trained_model.json", "w") as f:
    json.dump(trained_artifacts, f, indent=2)

print("\n================================================================")
print("  [OK] MODEL TRAINING COMPLETE! Trained artifacts saved to:    ")
print("    --> ml/trained_model.json                                  ")
print("================================================================")