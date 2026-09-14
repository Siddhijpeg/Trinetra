import os
import random
import numpy as np
import pandas as pd
from datetime import datetime, timedelta
import argparse

# Import our Latent Structure configurations
from syndicates import INDIAN_ZONES, TYPOLOGIES, generate_syndicates

def parse_args():
    parser = argparse.ArgumentParser()
    parser.add_argument("--num_complaints", type=int, default=5000, help="Number of complaints to generate")
    parser.add_argument("--num_syndicates", type=int, default=15, help="Number of latent syndicates")
    parser.add_argument("--out_dir", type=str, default="../../data/synthetic", help="Output directory")
    return parser.parse_args()

def run_generator():
    args = parse_args()
    os.makedirs(args.out_dir, exist_ok=True)
    
    print(f"--- TRINETRA SYNTHETIC DATA GENERATOR ---")
    print(f"Target Complaints: {args.num_complaints}")
    
    np.random.seed(42)
    random.seed(42)

    # 1. Initialize Base Tables
    df_zones = pd.DataFrame(INDIAN_ZONES)
    df_typologies = pd.DataFrame(TYPOLOGIES)
    
    # 2. Generate Syndicates
    syndicates = generate_syndicates(args.num_syndicates)
    
    # 3. Pre-generate Mule Entities and Accounts per Syndicate
    # Using a Zipfian distribution to simulate mule reuse (few mules used many times)
    mule_entities_data = []
    accounts_data = []
    
    print("Generating Mule Infrastructure...")
    entity_counter = 1
    acc_counter = 1
    
    syndicate_mule_pools = {} # syndicate_id -> list of account_ids
    
    for syn in syndicates:
        syn_accs = []
        num_entities = max(10, syn["mule_pool_size"] // 3)
        for _ in range(num_entities):
            e_id = f"ENT_{entity_counter:05d}"
            mule_entities_data.append({
                "entity_id": e_id,
                "syndicate_id": syn["syndicate_id"],
                "operating_zone_id": random.choice(syn["home_zones"])
            })
            entity_counter += 1
            
            # An entity controls 1 to 5 accounts
            num_accs = min(5, max(1, int(np.random.zipf(1.8))))
            for _ in range(num_accs):
                a_id = f"ACC_{acc_counter:06d}"
                accounts_data.append({
                    "account_id": a_id,
                    "bank_name": random.choice(["HDFC", "SBI", "ICICI", "Axis", "Paytm PB", "Kotak", "PNB"]),
                    "is_mule": True,
                    "entity_id": e_id,
                    "created_timestamp": (datetime.now() - timedelta(days=random.randint(30, 365))).isoformat()
                })
                syn_accs.append(a_id)
                acc_counter += 1
                
        syndicate_mule_pools[syn["syndicate_id"]] = syn_accs

    # Generate innocent/victim accounts
    victim_pool = []
    for _ in range(args.num_complaints):
        a_id = f"ACC_{acc_counter:06d}"
        accounts_data.append({
            "account_id": a_id,
            "bank_name": random.choice(["HDFC", "SBI", "ICICI", "Axis"]),
            "is_mule": False,
            "entity_id": None,
            "created_timestamp": (datetime.now() - timedelta(days=random.randint(365, 3650))).isoformat()
        })
        victim_pool.append(a_id)
        acc_counter += 1

    df_mules = pd.DataFrame(mule_entities_data)
    df_accounts = pd.DataFrame(accounts_data)

    # 4. Generate Complaints, Hops, and Cashouts
    complaints_data = []
    hops_data = []
    cashouts_data = []
    
    print("Generating Complaints & Transaction Hops...")
    base_date = datetime(2025, 1, 1)
    
    for i in range(1, args.num_complaints + 1):
        if i % 1000 == 0:
            print(f"  Processed {i} / {args.num_complaints}...")
            
        c_id = f"CMP_{202600000 + i}"
        
        # Select a Latent Syndicate to orchestrate this fraud
        syn = random.choice(syndicates)
        
        # Assign Typology based on Syndicate's favorites
        typology_id = random.choice(syn["typologies"])
        typology = next(t for t in TYPOLOGIES if t["typology_id"] == typology_id)
        
        # Generate Amounts (Log-normal around typology avg)
        avg_amt = typology["avg_amount"]
        amount = round(float(np.random.lognormal(mean=np.log(avg_amt), sigma=0.8)), 2)
        amount = max(1000.0, min(amount, 5000000.0))
        
        # Victim details
        victim_zone = random.choice(INDIAN_ZONES)
        
        # Chronology
        # Spread over 6 months
        day_offset = random.randint(0, 180)
        hour = int(np.random.normal(loc=14, scale=4)) % 24 # Most happen during day
        minute = random.randint(0, 59)
        incident_time = base_date + timedelta(days=day_offset, hours=hour, minutes=minute)
        
        # Complaint lag (Victims take time to report)
        complaint_lag_hours = max(1, int(np.random.lognormal(mean=2.0, sigma=1.0)))
        complaint_time = incident_time + timedelta(hours=complaint_lag_hours)
        available_time = complaint_time + timedelta(minutes=random.randint(5, 60))
        
        complaints_data.append({
            "complaint_id": c_id,
            "typology_id": typology_id,
            "typology_name": typology["name"],
            "amount_inr": amount,
            "victim_state": victim_zone["state"],
            "victim_district": victim_zone["zone_name"],
            "incident_timestamp": incident_time.isoformat(),
            "complaint_timestamp": complaint_time.isoformat(),
            "available_timestamp": available_time.isoformat()
        })
        
        # Generate Hops (1 to 7 based on syndicate avg)
        num_hops = max(1, min(7, int(np.random.poisson(lam=syn["avg_hops"]))))
        
        # To simulate mule reuse, we pick from the syndicate's pool, but use a Zipfian/Pareto approach
        # A simple way is to sort the pool and heavily weight the first few elements.
        pool = syndicate_mule_pools[syn["syndicate_id"]]
        if len(pool) < num_hops:
            sampled_mules = random.choices(pool, k=num_hops) # Allow inner-loop reuse
        else:
            # We want some mules to be highly reused across complaints.
            # We can use np.random.zipf to pick indices.
            indices = [min(len(pool)-1, int(np.random.zipf(1.5))) for _ in range(num_hops)]
            sampled_mules = [pool[idx] for idx in indices]
            
        current_amount = amount
        current_time = incident_time
        prev_account = victim_pool[i-1] # Victim's account
        
        for h_idx in range(num_hops):
            # Noise: 5% chance of inter-syndicate transfer (buying external services)
            if random.random() < 0.05:
                to_acc = random.choice(df_accounts[df_accounts['is_mule'] == True]['account_id'].tolist())
            else:
                to_acc = sampled_mules[h_idx]
                
            # Time delay (Hop velocity)
            delay_mins = max(1, int(np.random.lognormal(mean=1.5, sigma=1.2)))
            current_time += timedelta(minutes=delay_mins)
            hop_available_time = current_time + timedelta(minutes=random.randint(15, 120)) # Bank response lag
            
            # Amount splitting / fee deduction (retains 50% to 100%)
            retained_ratio = random.uniform(0.5, 1.0) if h_idx < num_hops - 1 else 1.0
            transfer_amount = round(current_amount * retained_ratio, 2)
            
            hops_data.append({
                "hop_id": f"HOP_{c_id}_{h_idx+1}",
                "complaint_id": c_id,
                "hop_sequence": h_idx + 1,
                "from_account": prev_account,
                "to_account": to_acc,
                "amount_transferred": transfer_amount,
                "bank_channel": random.choice(["IMPS", "UPI", "NEFT"]),
                "event_timestamp": current_time.isoformat(),
                "available_timestamp": hop_available_time.isoformat()
            })
            
            prev_account = to_acc
            current_amount = transfer_amount
            
        # Ground Truth Cashout Event
        # Cashout zone is heavily influenced by the syndicate's cashout zones
        if random.random() < 0.90:
            target_zone_id = random.choice(syn["cashout_zones"])
        else:
            # 10% Noise
            target_zone_id = random.choice(INDIAN_ZONES)["zone_id"]
            
        cashout_delay_mins = max(5, int(np.random.lognormal(mean=3.0, sigma=1.0)))
        cashout_time = current_time + timedelta(minutes=cashout_delay_mins)
        
        status = "COMPLETED"
        actual_cashed_out = current_amount
        # If cashout time happens AFTER complaint time, there is a chance it was FROZEN
        if cashout_time > complaint_time and random.random() < 0.3:
            status = "FROZEN"
            actual_cashed_out = 0.0
            
        cashouts_data.append({
            "cashout_id": f"CSH_{c_id}",
            "complaint_id": c_id,
            "final_account": prev_account,
            "zone_id": target_zone_id,
            "location_id": f"ATM_{target_zone_id}_{random.randint(1, 50):03d}",
            "amount_cashed_out": actual_cashed_out,
            "status": status,
            "event_timestamp": cashout_time.isoformat()
        })

    # Save outputs
    print(f"Saving files to {args.out_dir}...")
    df_zones.to_csv(os.path.join(args.out_dir, "zones.csv"), index=False)
    df_typologies.to_csv(os.path.join(args.out_dir, "typology_rules.csv"), index=False)
    df_mules.to_csv(os.path.join(args.out_dir, "mule_entities.csv"), index=False)
    df_accounts.to_csv(os.path.join(args.out_dir, "accounts.csv"), index=False)
    pd.DataFrame(complaints_data).to_csv(os.path.join(args.out_dir, "complaints.csv"), index=False)
    pd.DataFrame(hops_data).to_csv(os.path.join(args.out_dir, "hops.csv"), index=False)
    pd.DataFrame(cashouts_data).to_csv(os.path.join(args.out_dir, "cashout_events.csv"), index=False)
    
    print("Done! Total Hops:", len(hops_data))

if __name__ == "__main__":
    run_generator()
