import pandas as pd
import numpy as np
import os
import sys
import traceback
from datetime import datetime

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from ml.timing.train_time_to_event import load_split, build_snapshots, FEATURE_COLS
from ml.timing.feature_builder import TimeToEventFeatureBuilder
from core.canonical.schemas import PredictionContext
from core.canonical.events import TransactionEvent, ComplaintEvent
from core.canonical.entities import EntityReference

def run_equivalence_test():
    print("Loading small train sample...")
    tr_cmps, tr_hops, tr_outs = load_split("train")
    
    # Take 500 random complaint IDs
    np.random.seed(42)
    sample_ids = np.random.choice(tr_cmps["complaint_id"].unique(), 500, replace=False)
    
    tr_cmps = tr_cmps[tr_cmps["complaint_id"].isin(sample_ids)]
    tr_hops = tr_hops[tr_hops["complaint_id"].isin(sample_ids)]
    tr_outs = tr_outs[tr_outs["complaint_id"].isin(sample_ids)]
    
    # Build vectorized
    train_df = build_snapshots(tr_cmps, tr_hops, tr_outs)
    
    # Now check them via feature builder
    fb = TimeToEventFeatureBuilder()
    
    mismatch_count = 0
    max_diff = 0.0
    
    print(f"Comparing {len(train_df)} snapshots...")
    for _, row in train_df.iterrows():
        case_id = row["complaint_id"]
        pred_time = row["prediction_time"]
        
        # Build PredictionContext manually as it would happen in API
        # Only include hops that are strictly <= pred_time by available_timestamp
        case_hops = tr_hops[(tr_hops["complaint_id"] == case_id) & (tr_hops["available_timestamp"] <= pred_time)].sort_values("event_timestamp")
        
        transactions = []
        for i, hop in case_hops.iterrows():
            transactions.append(TransactionEvent(
                event_id=hop["hop_id"],
                case_id=case_id,
                event_time=hop["event_timestamp"],
                available_time=hop["available_timestamp"],
                source="test",
                amount=hop["amount_transferred"],
                destination_entity=EntityReference(entity_id=hop["to_account"], entity_type="ACCOUNT") if pd.notna(hop.get("to_account")) else None,
                channel=hop.get("bank_channel"),
                institution=hop.get("institution")
            ))
            
        case_cmp = tr_cmps[tr_cmps["complaint_id"] == case_id].iloc[0]
        complaint = None
        if pd.notna(case_cmp["complaint_id"]) and case_cmp["available_timestamp"] <= pred_time:
            complaint = ComplaintEvent(
                event_id=case_id,
                case_id=case_id,
                event_time=case_cmp["incident_timestamp"],
                available_time=case_cmp["available_timestamp"],
                source="test",
                typology=None,
                victim_context={},
                metadata={"amount_inr": case_cmp.get("amount_inr", 0.0)}
            )
            
        ctx = PredictionContext(
            case_id=case_id,
            prediction_time=pred_time,
            observed_transactions=transactions,
            available_complaint_context=complaint,
            registry_context={}  # Emulate training where registry is empty
        )
        
        feat_dict = fb.build_features(ctx)
        
        # Compare
        for col in FEATURE_COLS:
            val_vec = row[col]
            val_bld = feat_dict[col]
            
            # handle NaNs
            if pd.isna(val_vec) and pd.isna(val_bld):
                continue
            if pd.isna(val_vec) and not pd.isna(val_bld):
                mismatch_count += 1
                max_diff = max(max_diff, abs(val_bld))
                continue
            if not pd.isna(val_vec) and pd.isna(val_bld):
                mismatch_count += 1
                max_diff = max(max_diff, abs(val_vec))
                continue
                
            diff = abs(val_vec - val_bld)
            if diff > 1e-5:
                mismatch_count += 1
                max_diff = max(max_diff, diff)
                print(f"Mismatch in {col}: vec={val_vec}, bld={val_bld}, case={case_id}, pred={pred_time}")

    print(f"Total Mismatches: {mismatch_count}")
    print(f"Max Absolute Difference: {max_diff}")

if __name__ == "__main__":
    run_equivalence_test()
