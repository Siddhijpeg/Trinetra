import pandas as pd
import numpy as np
from faker import Faker
import random
from datetime import datetime, timedelta

fake = Faker('en_IN')

# Reproducibility ke liye seeds
np.random.seed(42)
random.seed(42)

TOTAL_COMPLAINTS = 60
TOTAL_ACCOUNTS = 120

# ---------------------------------------------------------
# 1. ZONES.CSV (Geospatial Hubs)
# ---------------------------------------------------------
zones_data = [
    {"zone_id": "Z01", "zone_name": "Mewat", "state": "Haryana", "lat": 28.0163, "lng": 77.0263},
    {"zone_id": "Z02", "zone_name": "Jamtara", "state": "Jharkhand", "lat": 23.9625, "lng": 86.8021},
    {"zone_id": "Z03", "zone_name": "Ludhiana", "state": "Punjab", "lat": 30.9010, "lng": 75.8573},
    {"zone_id": "Z04", "zone_name": "Amritsar", "state": "Punjab", "lat": 31.6340, "lng": 74.8723},
    {"zone_id": "Z05", "zone_name": "South Delhi", "state": "Delhi", "lat": 28.5355, "lng": 77.2410},
]
for i in range(6, 21):
    zones_data.append({
        "zone_id": f"Z{i:02d}",
        "zone_name": f"Hub-{fake.city()}",
        "state": fake.state(),
        "lat": round(float(fake.latitude()), 4),
        "lng": round(float(fake.longitude()), 4)
    })
df_zones = pd.DataFrame(zones_data)

# ---------------------------------------------------------
# 2. ATMS_AND_CASHOUTS.CSV (Clustered Hotspots using Gaussian Distribution)
# ---------------------------------------------------------
atms_data = []
atm_counter = 1

for zone in zones_data:
    center_lat, center_lng = zone["lat"], zone["lng"]
    cov = [[0.00008, 0], [0, 0.00008]]  # ~1-2km radius spread
    
    # Gaussian Multivariate Normal Distribution: 4-5 ATMs per cluster center
    atm_coords = np.random.multivariate_normal([center_lat, center_lng], cov, size=4)
    
    for lat, lng in atm_coords:
        atms_data.append({
            "location_id": f"ATM_{atm_counter:03d}",
            "zone_id": zone["zone_id"],
            "type": random.choice(["ATM", "PoS Terminal", "Micro-ATM / CSP"]),
            "bank_name": random.choice(["HDFC", "SBI", "ICICI", "Axis"]),
            "lat": round(lat, 6),
            "lng": round(lng, 6),
            "risk_level": random.choice(["HIGH", "HIGH", "MEDIUM", "LOW"])
        })
        atm_counter += 1
df_atms = pd.DataFrame(atms_data)

# ---------------------------------------------------------
# 3. TYPOLOGY_RULES.CSV (Metadata Priors)
# ---------------------------------------------------------
typology_rules = [
    {"typology_id": "TYP_01", "name": "OTP Fraud", "avg_velocity_mins": 10, "cashout_window_hrs": 1.5, "typical_hops": 2},
    {"typology_id": "TYP_02", "name": "Fake Loan App", "avg_velocity_mins": 35, "cashout_window_hrs": 4.0, "typical_hops": 3},
    {"typology_id": "TYP_03", "name": "Part-Time Job Scam", "avg_velocity_mins": 90, "cashout_window_hrs": 12.0, "typical_hops": 4},
    {"typology_id": "TYP_04", "name": "Investment Scam", "avg_velocity_mins": 150, "cashout_window_hrs": 24.0, "typical_hops": 3},
]
df_typology = pd.DataFrame(typology_rules)

# ---------------------------------------------------------
# 4. MULE_ENTITIES.CSV & ACCOUNTS.CSV (Network & Entities)
# ---------------------------------------------------------
entities_data = []
for i in range(1, 15):
    entities_data.append({
        "entity_id": f"ENT_{i:02d}",
        "phone_hash": f"SHA256_{fake.sha256()[:8]}",
        "device_id": f"DEV_{fake.uuid4()[:8]}",
        "primary_zone_id": random.choice(zones_data)["zone_id"]
    })
df_entities = pd.DataFrame(entities_data)

accounts_data = []
for i in range(1, TOTAL_ACCOUNTS + 1):
    is_mule = random.choices([True, False], weights=[0.75, 0.25])[0]
    assigned_entity = random.choice(entities_data)["entity_id"] if is_mule else None
    
    accounts_data.append({
        "account_id": f"ACC_{1000 + i}",
        "bank_name": random.choice(["HDFC", "SBI", "ICICI", "Axis", "Paytm PB", "Kotak"]),
        "is_mule": is_mule,
        "entity_id": assigned_entity,
        "times_flagged": random.randint(3, 18) if is_mule else random.randint(0, 1),
        "initial_risk_score": round(random.uniform(0.60, 0.99), 2) if is_mule else 0.05
    })
df_accounts = pd.DataFrame(accounts_data)

# ---------------------------------------------------------
# 5. COMPLAINTS, HOPS & CASHOUT_EVENTS (Time Bursts & Velocity)
# ---------------------------------------------------------
complaints_data = []
hops_data = []
cashout_data = []

# Non-Uniform Poisson Process for 24-Hour Time Bursts (Night low, Afternoon/Evening peak)
hours = list(range(24))
hour_probabilities = [
    0.01, 0.005, 0.005, 0.005, 0.01, 0.02, # 00:00 - 05:00
    0.03, 0.04, 0.05, 0.06, 0.07, 0.08,   # 06:00 - 11:00
    0.08, 0.08, 0.07, 0.08, 0.09, 0.08,   # 12:00 - 17:00
    0.06, 0.04, 0.02, 0.015, 0.01, 0.01    # 18:00 - 23:00
]
hour_probabilities = np.array(hour_probabilities) / sum(hour_probabilities) # Normalize

base_date = datetime.now() - timedelta(days=7)

for i in range(1, TOTAL_COMPLAINTS + 1):
    complaint_id = f"CMP_{2026000 + i}"
    typology_obj = random.choice(typology_rules)
    amount = random.randint(15000, 600000)
    
    # 1. Non-Uniform Poisson Time Assignment
    day_offset = random.randint(0, 6)
    selected_hour = np.random.choice(hours, p=hour_probabilities)
    selected_minute = random.randint(0, 59)
    created_at = base_date + timedelta(days=day_offset, hours=int(selected_hour), minutes=selected_minute)
    
    complaints_data.append({
        "complaint_id": complaint_id,
        "typology_id": typology_obj["typology_id"],
        "typology_name": typology_obj["name"],
        "amount_inr": amount,
        "victim_location": fake.city(),
        "created_at": created_at.isoformat()
    })
    
    # 2. Hops Generation with Log-Normal Velocity Delays
    num_hops = typology_obj["typical_hops"]
    mule_pool = df_accounts[df_accounts['is_mule']]['account_id'].tolist()
    hop_accounts = random.sample(mule_pool, num_hops)
    
    current_time = created_at
    for hop_idx in range(num_hops - 1):
        # Log-Normal Distribution delay (Most fast, few long delays)
        delay_minutes = int(np.random.lognormal(mean=1.5, sigma=0.5)) + 1
        current_time += timedelta(minutes=delay_minutes)
        
        hops_data.append({
            "hop_id": f"HOP_{complaint_id}_{hop_idx + 1}",
            "complaint_id": complaint_id,
            "hop_sequence": hop_idx + 1,
            "from_account": hop_accounts[hop_idx],
            "to_account": hop_accounts[hop_idx + 1],
            "amount_transferred": round(amount * (0.96 ** (hop_idx + 1)), 2),
            "delay_minutes": delay_minutes,
            "timestamp": current_time.isoformat()
        })
        
    # 3. Ground Truth Cashout Event (Target Zone + Nearest ATM from Clustered Hub)
    target_zone = random.choice(zones_data)
    zone_atms = df_atms[df_atms['zone_id'] == target_zone['zone_id']]
    selected_atm = zone_atms.sample(1).iloc[0] if len(zone_atms) > 0 else None
    
    cashout_delay = int(np.random.lognormal(mean=2.0, sigma=0.4)) + 3
    cashout_time = current_time + timedelta(minutes=cashout_delay)
    
    cashout_data.append({
        "cashout_id": f"CSH_{complaint_id}",
        "complaint_id": complaint_id,
        "final_account": hop_accounts[-1],
        "zone_id": target_zone["zone_id"],
        "location_id": selected_atm["location_id"] if selected_atm is not None else "ATM_001",
        "lat": selected_atm["lat"] if selected_atm is not None else target_zone["lat"],
        "lng": selected_atm["lng"] if selected_atm is not None else target_zone["lng"],
        "timestamp": cashout_time.isoformat(),
        "status": random.choice(["COMPLETED", "INTERCEPTED"])
    })

# Export all 8 datasets to CSV
df_zones.to_csv("zones.csv", index=False)
df_atms.to_csv("atms_and_cashouts.csv", index=False)
df_typology.to_csv("typology_rules.csv", index=False)
df_entities.to_csv("mule_entities.csv", index=False)
df_accounts.to_csv("accounts.csv", index=False)
pd.DataFrame(complaints_data).to_csv("complaints.csv", index=False)
pd.DataFrame(hops_data).to_csv("hops.csv", index=False)
pd.DataFrame(cashout_data).to_csv("cashout_events.csv", index=False)

print("All 8 mathematical-grade synthetic dataset CSVs generated successfully!")