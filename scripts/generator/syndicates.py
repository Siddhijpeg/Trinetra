import random
import numpy as np

# A realistic list of 75 Indian zones for the synthetic generator
INDIAN_ZONES = [
    # Top Metros & Tech Hubs
    {"zone_name": "Bengaluru Urban", "state": "Karnataka", "lat": 12.9716, "lng": 77.5946, "type": "Metro"},
    {"zone_name": "Mumbai", "state": "Maharashtra", "lat": 19.0760, "lng": 72.8777, "type": "Metro"},
    {"zone_name": "South Delhi", "state": "Delhi", "lat": 28.5355, "lng": 77.2410, "type": "Metro"},
    {"zone_name": "Hyderabad", "state": "Telangana", "lat": 17.3850, "lng": 78.4867, "type": "Metro"},
    {"zone_name": "Chennai", "state": "Tamil Nadu", "lat": 13.0827, "lng": 80.2707, "type": "Metro"},
    {"zone_name": "Pune", "state": "Maharashtra", "lat": 18.5204, "lng": 73.8567, "type": "Metro"},
    {"zone_name": "Kolkata", "state": "West Bengal", "lat": 22.5726, "lng": 88.3639, "type": "Metro"},
    {"zone_name": "Ahmedabad", "state": "Gujarat", "lat": 23.0225, "lng": 72.5714, "type": "Metro"},
    {"zone_name": "Gurugram", "state": "Haryana", "lat": 28.4595, "lng": 77.0266, "type": "Metro"},
    {"zone_name": "Noida", "state": "Uttar Pradesh", "lat": 28.5355, "lng": 77.3910, "type": "Metro"},
    
    # Notorious Cybercrime Hotspots (Historical/OSINT derived for realism)
    {"zone_name": "Jamtara", "state": "Jharkhand", "lat": 23.9625, "lng": 86.8021, "type": "Hotspot"},
    {"zone_name": "Mewat", "state": "Haryana", "lat": 28.0163, "lng": 77.0263, "type": "Hotspot"},
    {"zone_name": "Bharatpur", "state": "Rajasthan", "lat": 27.2170, "lng": 77.4900, "type": "Hotspot"},
    {"zone_name": "Mathura", "state": "Uttar Pradesh", "lat": 27.4924, "lng": 77.6737, "type": "Hotspot"},
    {"zone_name": "Deoghar", "state": "Jharkhand", "lat": 24.4818, "lng": 86.6974, "type": "Hotspot"},
    {"zone_name": "Alwar", "state": "Rajasthan", "lat": 27.5530, "lng": 76.6346, "type": "Hotspot"},
    
    # Border & Transit Regions
    {"zone_name": "Siliguri", "state": "West Bengal", "lat": 26.7271, "lng": 88.3953, "type": "Transit"},
    {"zone_name": "Amritsar", "state": "Punjab", "lat": 31.6340, "lng": 74.8723, "type": "Transit"},
    {"zone_name": "Gorakhpur", "state": "Uttar Pradesh", "lat": 26.7606, "lng": 83.3732, "type": "Transit"},
    {"zone_name": "Purnia", "state": "Bihar", "lat": 25.7796, "lng": 87.4753, "type": "Transit"},
]

# Procedurally generate the remaining up to 75 zones across major states
STATES = [
    ("Uttar Pradesh", 27.5, 80.5), ("Maharashtra", 19.5, 76.0), ("Bihar", 25.5, 85.5), 
    ("West Bengal", 23.5, 87.5), ("Madhya Pradesh", 23.0, 78.5), ("Tamil Nadu", 11.5, 79.5), 
    ("Rajasthan", 26.5, 73.5), ("Karnataka", 14.5, 76.5), ("Gujarat", 22.5, 71.5), 
    ("Andhra Pradesh", 16.5, 80.5), ("Odisha", 20.5, 84.5), ("Telangana", 17.5, 79.5), 
    ("Kerala", 10.5, 76.5), ("Jharkhand", 23.5, 85.5), ("Assam", 26.5, 92.5), 
    ("Punjab", 31.0, 75.5), ("Chhattisgarh", 21.5, 82.0), ("Haryana", 29.0, 76.0)
]

for i in range(len(INDIAN_ZONES) + 1, 76):
    state_info = random.choice(STATES)
    lat_offset = random.uniform(-1.5, 1.5)
    lng_offset = random.uniform(-1.5, 1.5)
    INDIAN_ZONES.append({
        "zone_name": f"District-{i}",
        "state": state_info[0],
        "lat": round(state_info[1] + lat_offset, 4),
        "lng": round(state_info[2] + lng_offset, 4),
        "type": "General"
    })

# Add unique zone IDs
for i, z in enumerate(INDIAN_ZONES):
    z["zone_id"] = f"Z{i+1:03d}"

# Define Typologies
TYPOLOGIES = [
    {"typology_id": "TYP_01", "name": "OTP / KYC Fraud", "avg_amount": 25000},
    {"typology_id": "TYP_02", "name": "Fake Loan App", "avg_amount": 15000},
    {"typology_id": "TYP_03", "name": "Part-Time Job Scam", "avg_amount": 120000},
    {"typology_id": "TYP_04", "name": "Investment / Crypto Scam", "avg_amount": 500000},
    {"typology_id": "TYP_05", "name": "Sextortion", "avg_amount": 40000},
    {"typology_id": "TYP_06", "name": "Marketplace / OLX Fraud", "avg_amount": 10000}
]

# Define Latent Syndicates
# A Syndicate represents an organized network with specific geographic footprint and methods.
def generate_syndicates(num_syndicates=10):
    syndicates = []
    
    # Separate zones by type for biased selection
    hotspots = [z for z in INDIAN_ZONES if z["type"] == "Hotspot"]
    metros = [z for z in INDIAN_ZONES if z["type"] == "Metro"]
    general = [z for z in INDIAN_ZONES if z["type"] in ["General", "Transit"]]
    
    for i in range(1, num_syndicates + 1):
        # 1. Favored Typologies (1-3 per syndicate)
        favored_typs = random.sample(TYPOLOGIES, k=random.randint(1, 3))
        
        # 2. Operating/Home Zones (Where mules originate/are controlled)
        # 30% chance they are based in a notorious hotspot, 70% chance general/metro
        if random.random() < 0.3 and hotspots:
            home_zones = random.sample(hotspots, k=random.randint(1, 2))
        else:
            home_zones = random.sample(general + metros, k=random.randint(1, 3))
            
        # 3. Cash-out Zones (Where money is withdrawn)
        # Often overlaps with home zones, but can include metros for ATM density
        metro_sample = random.sample(metros, k=random.randint(1, 2))
        combined = home_zones + metro_sample
        # deduplicate by zone_id
        seen = set()
        cashout_zones = []
        for z in combined:
            if z['zone_id'] not in seen:
                seen.add(z['zone_id'])
                cashout_zones.append(z)
        
        # 4. Generate Mule Pool for this Syndicate (Power-law distribution handled in main script)
        # Just pre-define the max pool size for this syndicate
        pool_size = random.randint(50, 500)
        
        syndicates.append({
            "syndicate_id": f"SYN_{i:03d}",
            "typologies": [t["typology_id"] for t in favored_typs],
            "home_zones": [z["zone_id"] for z in home_zones],
            "cashout_zones": [z["zone_id"] for z in cashout_zones],
            "mule_pool_size": pool_size,
            "avg_hops": random.uniform(1.5, 4.5), # Some syndicates use short chains, some long
            "inter_state_prob": random.uniform(0.1, 0.8) # How likely they move money across state lines
        })
    return syndicates
