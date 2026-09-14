import json, numpy as np, pandas as pd
from scipy.optimize import minimize_scalar

with open("artifacts/models/trained_model_m8.json") as f: m = json.load(f)
with open("artifacts/models/rich_registry.json") as f: reg = json.load(f)
global_prior = m["global_prior"]; typology_priors = m["typology_priors"]
mule_zone_likelihoods = m["mule_zone_likelihoods"]; node_risk_registry = m["node_risk_registry"]
zone_list = m["encoders"]["target_zone"]; zidx = {z:i for i,z in enumerate(zone_list)}
log_gp = np.array([np.log(global_prior.get(z,1e-6)) for z in zone_list])

val_c = pd.read_csv("data/synthetic/splits/val_complaints.csv")
val_h = pd.read_csv("data/synthetic/splits/val_hops.csv")
val_y = pd.read_csv("data/synthetic/splits/val_cashout_events.csv")
y_by_c = dict(zip(val_y.complaint_id, val_y.zone_id))
typ_by_c = dict(zip(val_c.complaint_id, val_c.typology_id))
hops_by_c = val_h.groupby("complaint_id")["to_account"].apply(list).to_dict()

LAMBDA, K, W_REL = 1.0, 10.0, 1.0

def m8_logit(cid):
    typ = typ_by_c[cid]
    prior = typology_priors.get(typ, global_prior)
    l = np.array([np.log(prior.get(z,1e-6)) for z in zone_list])
    for acc in hops_by_c.get(cid, []):
        w = node_risk_registry.get(acc, {}).get("risk_weight", 1.0)
        lh = np.array([np.log(mule_zone_likelihoods.get(z,{}).get(acc,0.01)) for z in zone_list])
        l += lh*w
        if acc in reg:
            r = reg[acc]; n_a = r["historical_sightings"]
            q = np.array([(r["zone_counts"].get(z,0) + LAMBDA*global_prior.get(z,1e-6))/(n_a+LAMBDA) for z in zone_list])
            logq = np.log(q)
            consistency = 1.0 - r["normalized_entropy"]
            strength = n_a/(n_a+K)
            l += W_REL*strength*consistency*(logq - log_gp)
    return l

logits, labels = [], []
for cid in val_c.complaint_id:
    if cid not in y_by_c: continue
    logits.append(m8_logit(cid))
    labels.append(zidx[y_by_c[cid]])
logits = np.array(logits); labels = np.array(labels)

def nll(T):
    scaled = logits / T
    m_ = scaled.max(axis=1, keepdims=True)
    p = np.exp(scaled - m_); p /= p.sum(axis=1, keepdims=True)
    return -np.mean(np.log(np.clip(p[np.arange(len(labels)), labels], 1e-12, 1)))

res = minimize_scalar(nll, bounds=(0.1, 10.0), method="bounded")
print(f"Fitted temperature T = {res.x:.4f}  (val NLL = {res.fun:.4f})")
with open("artifacts/models/geographic_calibration.json", "w") as f:
    json.dump({"temperature": res.x, "lambda": LAMBDA, "k": K, "w_rel": W_REL}, f, indent=2)
print("saved artifacts/models/geographic_calibration.json")
