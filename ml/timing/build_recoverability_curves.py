import json, numpy as np, pandas as pd

train_c = pd.read_csv("data/synthetic/splits/train_complaints.csv")
train_y = pd.read_csv("data/synthetic/splits/train_cashout_events.csv")
merged = train_c.merge(train_y, on="complaint_id")
merged["incident_timestamp"] = pd.to_datetime(merged["incident_timestamp"])
merged["event_timestamp"] = pd.to_datetime(merged["event_timestamp"])
merged["minutes_to_cashout"] = (merged["event_timestamp"] - merged["incident_timestamp"]).dt.total_seconds()/60.0

curves = {}
for typ, grp in merged.groupby("typology_id"):
    curves[typ] = sorted(grp["minutes_to_cashout"].tolist())
curves["__global__"] = sorted(merged["minutes_to_cashout"].tolist())

with open("artifacts/models/recoverability_curves.json", "w") as f:
    json.dump(curves, f)

for typ, c in curves.items():
    print(f"{typ}: n={len(c)} median={np.median(c):.0f}min")
