import pandas as pd
import json
import os

files = [
    'complaints.csv', 'hops.csv', 'accounts.csv', 
    'cashout_events.csv', 'zones.csv', 'atms_and_cashouts.csv', 
    'mule_entities.csv', 'typology_rules.csv'
]

data = {}
for f in files:
    if os.path.exists(f):
        data[f] = pd.read_csv(f)
        print(f"--- {f} ---")
        print(f"Rows: {len(data[f])}, Cols: {len(data[f].columns)}")
        print(f"Columns: {list(data[f].columns)}")
        print(f"Size: {os.path.getsize(f)} bytes\n")
    else:
        print(f"{f} not found\n")

print("--- AGGREGATE COUNTS ---")
print(f"TOTAL COMPLAINTS: {len(data['complaints.csv'])}")
print(f"TOTAL TRANSACTION HOPS: {len(data['hops.csv'])}")
print(f"TOTAL ACCOUNTS: {len(data['accounts.csv'])}")
print(f"TOTAL UNIQUE ACCOUNTS: {data['accounts.csv']['account_id'].nunique()}")
print(f"TOTAL MULE ACCOUNTS: {data['accounts.csv']['is_mule'].sum()}")
print(f"TOTAL CASH-OUT EVENTS: {len(data['cashout_events.csv'])}")
print(f"TOTAL ZONES: {len(data['zones.csv'])}")
print(f"TOTAL FRAUD TYPES: {data['complaints.csv']['typology_id'].nunique()}")
print(f"TOTAL TRANSACTIONS (Hops): {len(data['hops.csv'])}")
print(f"TOTAL UNIQUE CASE IDs: {data['complaints.csv']['complaint_id'].nunique()}")

print("\n--- DISTRIBUTION ANALYSIS ---")
print("Complaints per Fraud Type:\n", data['complaints.csv']['typology_name'].value_counts().to_dict())

if 'zone_id' in data['cashout_events.csv'].columns:
    print("Cashout by Zone:\n", data['cashout_events.csv']['zone_id'].value_counts().to_dict())

print("\n--- DATA LEAKAGE / GENERATOR INSIGHTS ---")
# Check if cashout zone is correlated with anything.
# From the generator, target_zone = random.choice(zones_data) which is purely random and independent of complaint!
