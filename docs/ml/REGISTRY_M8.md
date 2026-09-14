# M8 Registry — Reliability-Aware Entity Memory

## What it is
The M8 Registry is a persistent cross-complaint memory ledger of mule/intermediary accounts. For each account it stores historical sighting counts, zone distribution, normalized entropy, and last-seen timestamps.

## Frozen Specification

```python
# Parameters (DO NOT CHANGE)
lambda_ = 0.5   # Dirichlet smoothing
k       = 5.0   # Half-strength sample count
w_rel   = 2.0   # Evidence weight in log-likelihood update

# Per-account computation
n_a  = historical_sightings
q_az = (zone_count_z + lambda * p_global_z) / (n_a + lambda)

strength  = n_a / (n_a + k)
entropy   = -sum(p_z * log(p_z)) for all zones
norm_ent  = entropy / log(num_zones)
reliability = strength * (1 - norm_ent)

# Update rule (added to log-likelihood of the sequential prior)
delta_L = w_rel * reliability * (log(q_az) - log(p_global_z))
```

## Temporal Leakage Prevention
- For Month-5 Validation: registry built from Months 1–4 only.
- For Month-6 Test: registry built from Months 1–5 only.
- No registry entry may reference events after the prediction timestamp.

## Coverage
- ~86% of Month-6 test cases have at least one registry hit.
- Registry-hit cases: M8 Top-3 ≈ 74.0% vs M4 ≈ 44.5%
- No-hit cases: M4 = M8 ≈ 21.3% (registry adds nothing when account is unseen)
