import json, numpy as np, pandas as pd

with open("artifacts/models/trained_model_m8.json") as f: m = json.load(f)
with open("artifacts/models/rich_registry.json") as f: reg = json.load(f)
with open("artifacts/models/geographic_calibration.json") as f: calib = json.load(f)
with open("artifacts/models/recoverability_curves.json") as f: curves_raw = json.load(f)
curves = {k: np.array(v) for k, v in curves_raw.items()}

global_prior = m["global_prior"]; typology_priors = m["typology_priors"]
mule_zone_likelihoods = m["mule_zone_likelihoods"]; node_risk_registry = m["node_risk_registry"]
zone_list = m["encoders"]["target_zone"]
log_gp = np.array([np.log(global_prior.get(z,1e-6)) for z in zone_list])
LAMBDA, K, W_REL, T = calib["lambda"], calib["k"], calib["w_rel"], calib["temperature"]

val_c = pd.read_csv("data/synthetic/splits/val_complaints.csv")
val_h = pd.read_csv("data/synthetic/splits/val_hops.csv")
typ_by_c = dict(zip(val_c.complaint_id, val_c.typology_id))
incident_by_c = dict(zip(val_c.complaint_id, pd.to_datetime(val_c.incident_timestamp)))
hops_by_c = {}
for cid, grp in val_h.groupby("complaint_id"):
    hops_by_c[cid] = list(zip(grp["to_account"], pd.to_datetime(grp["available_timestamp"])))

def m8_conf(typ, accounts):
    prior = typology_priors.get(typ, global_prior)
    l = np.array([np.log(prior.get(z,1e-6)) for z in zone_list])
    for acc in accounts:
        w = node_risk_registry.get(acc, {}).get("risk_weight", 1.0)
        lh = np.array([np.log(mule_zone_likelihoods.get(z,{}).get(acc,0.01)) for z in zone_list])
        l += lh*w
        if acc in reg:
            r = reg[acc]; n_a = r["historical_sightings"]
            q = np.array([(r["zone_counts"].get(z,0)+LAMBDA*global_prior.get(z,1e-6))/(n_a+LAMBDA) for z in zone_list])
            consistency = 1.0 - r["normalized_entropy"]; strength = n_a/(n_a+K)
            l += W_REL*strength*consistency*(np.log(q)-log_gp)
    scaled = l/T
    p = np.exp(scaled-scaled.max()); p/=p.sum()
    return float(p.max())

confs, recovs = [], []
for cid, hop_list in hops_by_c.items():
    typ = typ_by_c.get(cid)
    incident = incident_by_c.get(cid)
    if typ is None or incident is None: continue
    accounts_so_far = []
    for acc, avail in hop_list:
        accounts_so_far.append(acc)
        elapsed = max(0.0, (avail-incident).total_seconds()/60.0)
        curve = curves.get(typ, curves["__global__"])
        recov = float(np.sum(curve>elapsed)/len(curve))
        conf = m8_conf(typ, accounts_so_far)
        confs.append(conf); recovs.append(recov)

confs = np.array(confs); recovs = np.array(recovs)
CONF_HIGH = float(np.percentile(confs, 80))
CONF_MED = float(np.percentile(confs, 50))
RECOV_HIGH = float(np.percentile(recovs, 70))
RECOV_MED = float(np.percentile(recovs, 40))
print(f"CONF_HIGH={CONF_HIGH:.3f} CONF_MED={CONF_MED:.3f} RECOV_HIGH={RECOV_HIGH:.3f} RECOV_MED={RECOV_MED:.3f}")

with open("artifacts/models/decision_thresholds.json", "w") as f:
    json.dump({"conf_high": CONF_HIGH, "conf_med": CONF_MED, "recov_high": RECOV_HIGH, "recov_med": RECOV_MED}, f, indent=2)
print("saved artifacts/models/decision_thresholds.json")
