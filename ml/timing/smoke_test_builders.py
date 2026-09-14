import os
import sys
import pandas as pd
from datetime import datetime, timedelta

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '../..')))

from core.adapters.synthetic_adapter import SyntheticAdapter
from core.event_store.store import LocalEventStore
from backend.services.context_builder import ContextBuilder
from ml.timing.feature_builder import TimeToEventFeatureBuilder
from ml.timing.target_builder import TimeToEventTargetBuilder
from core.canonical.events import OutcomeEvent

def run_smoke_test():
    print("=== Smoke Test: Builders ===")
    
    # 1. Load a few cases
    data_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), '../../data/synthetic'))
    adapter = SyntheticAdapter()
    
    # Load 100 hops/complaints
    hops_df = pd.read_csv(os.path.join(data_dir, "hops.csv"), nrows=100)
    cmps_df = pd.read_csv(os.path.join(data_dir, "complaints.csv"), nrows=10)
    cashout_df = pd.read_csv(os.path.join(data_dir, "cashout_events.csv"), nrows=10)
    
    # We write them to temp files so adapter can parse them, or just use the adapter directly 
    # since adapter uses pandas internally, but adapter expects paths.
    hops_path = "temp_hops.csv"
    cmps_path = "temp_cmps.csv"
    hops_df.to_csv(hops_path, index=False)
    cmps_df.to_csv(cmps_path, index=False)
    
    txns = adapter.parse_transactions(hops_path)
    cmps = adapter.parse_complaints(cmps_path)
    
    os.remove(hops_path)
    os.remove(cmps_path)
    
    store = LocalEventStore()
    for t in txns: store.append_transaction(t)
    for c in cmps: store.append_complaint(c)
    
    case_ids = list(cmps_df['complaint_id'])
    
    # Let's take the first case and trace it
    c_id = case_ids[0]
    
    # Let's find a cashout event for this case
    c_out_row = cashout_df[cashout_df['complaint_id'] == c_id]
    outcome = None
    if not c_out_row.empty:
        c_time = pd.to_datetime(c_out_row.iloc[0]['event_timestamp'])
        outcome = OutcomeEvent(
            event_id="out_1",
            case_id=c_id,
            event_time=c_time,
            available_time=c_time,
            source="synthetic",
            outcome_status="CASHOUT",
            cashout_location=c_out_row.iloc[0]['zone_id']
        )
    else:
        # mock outcome if not in the 10 rows
        c_time = datetime(2025, 1, 1, 12, 0)
        outcome = OutcomeEvent("out_mock", c_id, c_time, c_time, "mock", "CASHOUT")
        
    print(f"Tracking Case ID: {c_id}")
    
    ctx_builder = ContextBuilder(store)
    feat_builder = TimeToEventFeatureBuilder()
    targ_builder = TimeToEventTargetBuilder()
    
    # Create prediction context BEFORE the first hop
    t0 = datetime(1970, 1, 1)
    if txns: t0 = txns[0].event_time - timedelta(minutes=10)
    
    ctx = ctx_builder.build(c_id, t0)
    feats = feat_builder.build_features(ctx)
    targ = targ_builder.build_target(ctx, outcome)
    
    print(f"\\nT0 (-10m from first hop):")
    print(f"Features: {feats}")
    print(f"Target: {targ}")
    
    # Create prediction context exactly after the first hop
    t1 = txns[0].available_time + timedelta(seconds=1)
    ctx = ctx_builder.build(c_id, t1)
    feats = feat_builder.build_features(ctx)
    targ = targ_builder.build_target(ctx, outcome)
    
    print(f"\\nT1 (After first hop):")
    print(f"Features: {feats}")
    print(f"Target: {targ}")

if __name__ == "__main__":
    run_smoke_test()
