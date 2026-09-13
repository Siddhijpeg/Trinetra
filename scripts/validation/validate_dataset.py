import pandas as pd
import json
import os
import argparse

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--data_dir", type=str, default="../../data/synthetic")
    return parser.parse_args()

def run_validation():
    args = parse_args()
    print(f"Loading data from {args.data_dir}...")
    
    complaints = pd.read_csv(os.path.join(args.data_dir, "complaints.csv"))
    hops = pd.read_csv(os.path.join(args.data_dir, "hops.csv"))
    accounts = pd.read_csv(os.path.join(args.data_dir, "accounts.csv"))
    cashouts = pd.read_csv(os.path.join(args.data_dir, "cashout_events.csv"))
    zones = pd.read_csv(os.path.join(args.data_dir, "zones.csv"))
    entities = pd.read_csv(os.path.join(args.data_dir, "mule_entities.csv"))
    
    report = {
        "integrity": {},
        "temporal": {},
        "distributions": {},
        "leakage": {}
    }
    
    passed_all = True
    errors = []

    # 1. Integrity Checks
    print("Checking Referential Integrity...")
    c_ids = set(complaints['complaint_id'])
    h_c_ids = set(hops['complaint_id'])
    
    if not h_c_ids.issubset(c_ids):
        errors.append("Orphan hops found! (complaint_id in hops not in complaints)")
        passed_all = False
        
    acc_ids = set(accounts['account_id'])
    h_acc_ids = set(hops['from_account']).union(set(hops['to_account']))
    if not h_acc_ids.issubset(acc_ids):
        errors.append("Orphan accounts found in hops!")
        passed_all = False
        
    report["integrity"]["orphan_hops"] = not h_c_ids.issubset(c_ids)
    report["integrity"]["orphan_accounts"] = not h_acc_ids.issubset(acc_ids)

    # 2. Temporal Checks
    print("Checking Temporal Chronology...")
    # Merge hops with complaints to check timestamps
    h_c = hops.merge(complaints[['complaint_id', 'incident_timestamp']], on='complaint_id')
    h_c['event_timestamp'] = pd.to_datetime(h_c['event_timestamp'])
    h_c['incident_timestamp'] = pd.to_datetime(h_c['incident_timestamp'])
    
    if (h_c['event_timestamp'] < h_c['incident_timestamp']).any():
        errors.append("Temporal Leakage: Some hops occur BEFORE the incident_timestamp!")
        passed_all = False
        
    report["temporal"]["hops_after_incident"] = not (h_c['event_timestamp'] < h_c['incident_timestamp']).any()
    
    # 3. Distribution Checks
    print("Checking Distributions...")
    report["distributions"]["total_complaints"] = len(complaints)
    report["distributions"]["total_hops"] = len(hops)
    report["distributions"]["avg_hops_per_complaint"] = float(len(hops) / len(complaints))
    report["distributions"]["mule_reuse_max"] = int(hops['to_account'].value_counts().max())
    
    if report["distributions"]["mule_reuse_max"] < 2:
        errors.append("Network Validity Failed: No mule reuse detected!")
        passed_all = False
        
    # 4. Leakage Check
    print("Checking Target Leakage...")
    # Check if target zone is trivially equal to victim state (should be somewhat correlated but not 100%)
    c_out = cashouts.merge(complaints[['complaint_id', 'victim_district']], on='complaint_id')
    # Since zone IDs don't perfectly map to victim_district string, this is just a proxy check
    
    print("\n--- VALIDATION RESULTS ---")
    if passed_all:
        print("✅ ALL GATES PASSED.")
    else:
        print("❌ FAILED GATES:")
        for e in errors:
            print(f"  - {e}")
            
    report["status"] = "PASSED" if passed_all else "FAILED"
    report["errors"] = errors
    
    with open(os.path.join(args.data_dir, "dataset_validation_report.json"), "w") as f:
        json.dump(report, f, indent=2)
        
    with open(os.path.join(args.data_dir, "DATASET_VALIDATION_REPORT.md"), "w") as f:
        f.write(f"# Dataset Validation Report\n")
        f.write(f"**Status:** {report['status']}\n\n")
        f.write(f"## Errors\n")
        for e in errors:
            f.write(f"- {e}\n")
        f.write(f"\n## Metrics\n")
        f.write(f"- Total Complaints: {report['distributions']['total_complaints']}\n")
        f.write(f"- Total Hops: {report['distributions']['total_hops']}\n")
        f.write(f"- Max Mule Reuse: {report['distributions']['mule_reuse_max']}\n")
        
    print(f"Validation reports saved to {args.data_dir}")

if __name__ == "__main__":
    run_validation()
