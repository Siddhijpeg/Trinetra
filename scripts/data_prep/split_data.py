import pandas as pd
import os
import json
import argparse
import numpy as np

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", type=str, default="../../data/generated/full")
    parser.add_argument("--out_dir", type=str, default="../../data/generated/splits")
    return parser.parse_args()

def run_split():
    args = parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    
    print("Loading full dataset for splitting...")
    complaints = pd.read_csv(os.path.join(args.data_dir, "complaints.csv"))
    hops = pd.read_csv(os.path.join(args.data_dir, "hops.csv"))
    cashouts = pd.read_csv(os.path.join(args.data_dir, "cashout_events.csv"))
    accounts = pd.read_csv(os.path.join(args.data_dir, "accounts.csv"))
    entities = pd.read_csv(os.path.join(args.data_dir, "mule_entities.csv"))
    
    # Merge cashout timestamp to ensure we split on outcome availability
    complaints = complaints.merge(cashouts[['complaint_id', 'event_timestamp']], on='complaint_id')
    complaints = complaints.rename(columns={'event_timestamp': 'cashout_timestamp'})
    complaints['cashout_timestamp'] = pd.to_datetime(complaints['cashout_timestamp'])
    
    # 2025-01-01 to 2025-07-01 roughly. 
    # M1-M4: Jan to Apr (Cutoff May 1)
    # M5: May (Cutoff Jun 1)
    # M6: June onwards
    
    train_mask = complaints['cashout_timestamp'] < '2025-05-01'
    val_mask = (complaints['cashout_timestamp'] >= '2025-05-01') & (complaints['cashout_timestamp'] < '2025-06-01')
    test_mask = complaints['cashout_timestamp'] >= '2025-06-01'
    
    # Map accounts to syndicates to identify complaint syndicates
    acc_to_syn = accounts.merge(entities[['entity_id', 'syndicate_id']], on='entity_id', how='left')
    acc_syn_map = dict(zip(acc_to_syn['account_id'], acc_to_syn['syndicate_id']))
    
    # Determine the primary syndicate for each complaint
    # Since we can't easily join hops here, we'll just randomly select 10 syndicates to hold out
    all_syndicates = entities['syndicate_id'].unique()
    np.random.seed(42)
    holdout_syndicates = set(np.random.choice(all_syndicates, size=15, replace=False))
    
    # We must drop cases from train/val if ANY of their hops touch a holdout syndicate
    holdout_accounts = set(acc_to_syn[acc_to_syn['syndicate_id'].isin(holdout_syndicates)]['account_id'])
    
    # Find complaints that touch holdout accounts
    holdout_cids = set(hops[hops['to_account'].isin(holdout_accounts)]['complaint_id'])
    
    # Remove holdout cases from Train and Val
    train_cmps = complaints[train_mask & ~complaints['complaint_id'].isin(holdout_cids)].copy()
    val_cmps = complaints[val_mask & ~complaints['complaint_id'].isin(holdout_cids)].copy()
    test_cmps = complaints[test_mask].copy()
    
    # Drop the temporary column before saving
    train_cmps.drop(columns=['cashout_timestamp'], inplace=True)
    val_cmps.drop(columns=['cashout_timestamp'], inplace=True)
    test_cmps.drop(columns=['cashout_timestamp'], inplace=True)
    
    print(f"Split sizes -> Train: {len(train_cmps)}, Val: {len(val_cmps)}, Test: {len(test_cmps)}")
    
    train_cmps.to_csv(os.path.join(args.out_dir, "train_complaints.csv"), index=False)
    val_cmps.to_csv(os.path.join(args.out_dir, "val_complaints.csv"), index=False)
    test_cmps.to_csv(os.path.join(args.out_dir, "test_complaints.csv"), index=False)
    
    def save_related(split_cmps, prefix):
        c_ids = set(split_cmps['complaint_id'])
        h = hops[hops['complaint_id'].isin(c_ids)]
        c = cashouts[cashouts['complaint_id'].isin(c_ids)]
        h.to_csv(os.path.join(args.out_dir, f"{prefix}_hops.csv"), index=False)
        c.to_csv(os.path.join(args.out_dir, f"{prefix}_cashout_events.csv"), index=False)
        return h
        
    train_hops = save_related(train_cmps, "train")
    val_hops = save_related(val_cmps, "val")
    test_hops = save_related(test_cmps, "test")
    
    # --- Special Slices ---
    print("Generating specialized evaluation splits...")
    
    # Map accounts to syndicates
    acc_to_syn = accounts.merge(entities[['entity_id', 'syndicate_id']], on='entity_id', how='left')
    acc_syn_map = dict(zip(acc_to_syn['account_id'], acc_to_syn['syndicate_id']))
    
    train_mules = set(train_hops['to_account']).union(set(train_hops['from_account']))
    
    train_syndicates = set()
    for m in train_mules:
        syn = acc_syn_map.get(m)
        if pd.notna(syn):
            train_syndicates.add(syn)
            
    test_c_ids = list(test_cmps['complaint_id'])
    
    special = {
        "known_mule_cases": [],
        "unseen_mule_cases": [],
        "known_syndicate_cases": [],
        "unseen_syndicate_cases": []
    }
    
    for c_id in test_c_ids:
        c_hops = test_hops[test_hops['complaint_id'] == c_id]
        c_mules = set(c_hops['to_account'])
        
        if c_mules.isdisjoint(train_mules):
            special["unseen_mule_cases"].append(c_id)
        else:
            special["known_mule_cases"].append(c_id)
            
        c_syndicates = set()
        for m in c_mules:
            syn = acc_syn_map.get(m)
            if pd.notna(syn):
                c_syndicates.add(syn)
                
        if c_syndicates.isdisjoint(train_syndicates):
            special["unseen_syndicate_cases"].append(c_id)
        else:
            special["known_syndicate_cases"].append(c_id)
            
    print(f"Test Set - Known Mule Cases: {len(special['known_mule_cases'])}")
    print(f"Test Set - Unseen Mule Cases: {len(special['unseen_mule_cases'])}")
    print(f"Test Set - Known Syndicate Cases: {len(special['known_syndicate_cases'])}")
    print(f"Test Set - Unseen Syndicate Cases: {len(special['unseen_syndicate_cases'])}")
    
    with open(os.path.join(args.out_dir, "test_special_splits.json"), "w") as f:
        json.dump(special, f, indent=2)
        
    print(f"Splits completed successfully in {args.out_dir}")

if __name__ == "__main__":
    run_split()
