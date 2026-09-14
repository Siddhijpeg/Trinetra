import pandas as pd
import numpy as np

def build_case_features(complaints_df):
    """Features available at T=0."""
    df = complaints_df.copy()
    
    # Extract temporal features
    df['complaint_timestamp'] = pd.to_datetime(df['complaint_timestamp'])
    df['incident_timestamp'] = pd.to_datetime(df['incident_timestamp'])
    
    df['complaint_hour'] = df['complaint_timestamp'].dt.hour
    df['complaint_dayofweek'] = df['complaint_timestamp'].dt.dayofweek
    df['amount_log'] = np.log1p(df['amount_inr'])
    
    # We will let the model handle categorical encoding (e.g. XGBoost handles categories, 
    # or we do one-hot/label encoding in the train engine)
    
    return df[['complaint_id', 'typology_id', 'victim_state', 'complaint_hour', 'complaint_dayofweek', 'amount_log']]

def build_hop_features(hops_df, complaints_df, accounts_df, as_of_time_col='available_timestamp'):
    """Features available at T=Hop_N. Includes historical as-of-time calculations."""
    h_c = hops_df.merge(complaints_df[['complaint_id', 'incident_timestamp', 'amount_inr']], on='complaint_id')
    h_c['event_timestamp'] = pd.to_datetime(h_c['event_timestamp'])
    h_c['incident_timestamp'] = pd.to_datetime(h_c['incident_timestamp'])
    
    h_c['time_since_incident_mins'] = (h_c['event_timestamp'] - h_c['incident_timestamp']).dt.total_seconds() / 60.0
    h_c['amount_retained_ratio'] = h_c['amount_transferred'] / (h_c['amount_inr'] + 1e-5)
    
    # We could do complex historical lookbacks here, but for efficiency in the prototype,
    # we'll compute a rolling count of 'times_flagged' based on previous hops.
    # To do this safely: Sort by available_timestamp
    h_c['available_timestamp'] = pd.to_datetime(h_c['available_timestamp'])
    h_c = h_c.sort_values(by='available_timestamp')
    
    # Rolling count of how many times a `to_account` has been seen BEFORE this row
    h_c['to_account_historical_flags'] = h_c.groupby('to_account').cumcount()
    
    # Join account static info
    h_c = h_c.merge(accounts_df[['account_id', 'bank_name', 'is_mule']], left_on='to_account', right_on='account_id', how='left')
    
    return h_c

def get_engineered_data(split_prefix="train", data_dir=None):
    """Load a packaged synthetic split and return engineered DataFrames."""
    from pathlib import Path

    # Resolve paths from the repository root, not from the terminal's
    # current working directory.
    repo_root = Path(__file__).resolve().parents[2]
    split_dir = (
        Path(data_dir).resolve()
        if data_dir is not None
        else repo_root / "data" / "synthetic" / "splits"
    )

    cmps = pd.read_csv(split_dir / f"{split_prefix}_complaints.csv")
    hops = pd.read_csv(split_dir / f"{split_prefix}_hops.csv")
    cashouts = pd.read_csv(split_dir / f"{split_prefix}_cashout_events.csv")

    # accounts.csv is stored once because it contains static account metadata.
    accounts = pd.read_csv(
        repo_root / "data" / "synthetic" / "accounts.csv"
    )

    case_features = build_case_features(cmps)
    hop_features = build_hop_features(hops, cmps, accounts)

    # Merge targets
    targets = cashouts[['complaint_id', 'zone_id']]

    return case_features, hop_features, targets

if __name__ == "__main__":
    c, h, t = get_engineered_data("train")
    print("Engineered Train Case Features:", c.shape)
    print("Engineered Train Hop Features:", h.shape)
