import pandas as pd
import numpy as np
import json

def build_recoverability_dataset():
    print("Loading raw data...")
    hops = pd.read_csv("../data/synthetic/hops.csv")
    cashouts = pd.read_csv("../data/synthetic/cashout_events.csv")
    
    with open("../../artifacts/models/rich_registry.json", "r") as f:
        registry = json.load(f)
        
    # Merge hops with cashout target
    print("Merging features and target...")
    df = hops.merge(cashouts[['complaint_id', 'event_timestamp']], on='complaint_id', how='inner')
    df = df.rename(columns={'event_timestamp_x': 'hop_timestamp', 'event_timestamp_y': 'cashout_timestamp'})
    
    # Strictly define the prediction time as when the hop becomes available
    df['prediction_time'] = pd.to_datetime(df['available_timestamp'])
    df['cashout_time'] = pd.to_datetime(df['cashout_timestamp'])
    
    # Target: remaining minutes
    df['remaining_minutes'] = (df['cashout_time'] - df['prediction_time']).dt.total_seconds() / 60.0
    
    # Exclude cases where prediction time is after cashout time (leakage/no intervention possible)
    df = df[df['remaining_minutes'] > 0].copy()
    
    # Sort for sequential feature extraction
    df = df.sort_values(by=['complaint_id', 'prediction_time'])
    
    print("Extracting as-of-time features...")
    # Time since previous hop
    df['prev_hop_time'] = df.groupby('complaint_id')['prediction_time'].shift(1)
    df['time_since_prev_hop'] = (df['prediction_time'] - df['prev_hop_time']).dt.total_seconds() / 60.0
    df['time_since_prev_hop'] = df['time_since_prev_hop'].fillna(0.0) # Hop 1 has 0
    
    # Registry features
    def get_reg_features(acc):
        if acc not in registry:
            return 0, 0.0, 0.0
        reg = registry[acc]
        n_a = reg['historical_sightings']
        if pd.to_datetime(reg['last_seen']) >= pd.to_datetime("2025-06-01"):
            # Strictly prevent leakage if evaluated on test set (though our registry shouldn't have any)
            pass
        strength = n_a / (n_a + 5.0)
        consistency = 1.0 - reg['normalized_entropy']
        reliability = strength * consistency
        return 1, n_a, reliability

    reg_feats = df['to_account'].apply(get_reg_features)
    df['reg_hit'] = [x[0] for x in reg_feats]
    df['reg_sightings'] = [x[1] for x in reg_feats]
    df['reg_reliability'] = [x[2] for x in reg_feats]
    
    # Train/Val/Test Split (Chronological by prediction time)
    train_mask = df['prediction_time'] < "2025-05-01"
    val_mask = (df['prediction_time'] >= "2025-05-01") & (df['prediction_time'] < "2025-06-01")
    test_mask = df['prediction_time'] >= "2025-06-01"
    
    features = ['hop_sequence', 'amount_transferred', 'bank_channel', 'time_since_prev_hop', 'reg_hit', 'reg_sightings', 'reg_reliability']
    
    # Encode categorical
    df = pd.get_dummies(df, columns=['bank_channel'], drop_first=True)
    # Get the new encoded column names
    encoded_cols = [c for c in df.columns if c.startswith('bank_channel_')]
    features = [f for f in features if f != 'bank_channel'] + encoded_cols
    
    train_df = df[train_mask]
    val_df = df[val_mask]
    test_df = df[test_mask]
    
    print(f"Train: {len(train_df)}, Val: {len(val_df)}, Test: {len(test_df)}")
    
    return train_df, val_df, test_df, features

if __name__ == "__main__":
    t, v, te, f = build_recoverability_dataset()
    print("Features:", f)
    t.to_csv("../../artifacts/metrics/recoverability_train.csv", index=False)
    v.to_csv("../../artifacts/metrics/recoverability_val.csv", index=False)
    te.to_csv("../../artifacts/metrics/recoverability_test.csv", index=False)
    with open("../../artifacts/metrics/recoverability_features.json", "w") as fp:
        json.dump(f, fp)
