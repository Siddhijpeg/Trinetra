# Geographic Engine — M8 Reliability-Aware Registry

## Overview
TRINETRA's geographic prediction pipeline uses a sequential Bayesian approach enriched with a cross-complaint entity memory registry (M8). This document describes the frozen, verified architecture.

## Pipeline
`M0 (Global Prior) → M1 (Typology Prior) → M2 (XGBoost at T0) → M3 (Sequential Bayesian Hops) → M4 (Count Registry) → M8 (Reliability-Aware Registry + Calibration)`

## M8 Frozen Parameters
```
lambda = 0.5    # Dirichlet smoothing
k      = 5.0    # Half-strength count  
w_rel  = 2.0    # Registry evidence weight
T      = 5.17   # Temperature scaling
```

DO NOT retune these parameters.

## Formulas
```
q_a(z) = (n_{a,z} + lambda * p_global(z)) / (n_a + lambda)
Strength(a) = n_a / (n_a + k)
Reliability(a) = Strength(a) * (1 - NormalizedEntropy(a))

L_new = L_seq + sum_a [ w_rel * Reliability(a) * (log q_a(z) - log p_global(z)) ]
```

## Key Verified Metrics (Month 6 Test)
- M8 Top-3 Recall: ~66.6%
- M8 MRR: 0.475
- Mean Geo Error: 725.3 km
- NLL (post-calibration): 2.862
- Brier Score: 0.0121
