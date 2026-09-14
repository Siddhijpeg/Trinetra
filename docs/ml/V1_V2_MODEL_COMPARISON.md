# TRINETRA — V1 vs V2 Model Comparison

**Date:** 2026-09-14  
**Status:** Post-training comparison. V1 and V2 models are **NOT directly comparable** on several dimensions. Incomparabilities are flagged explicitly in every section.

---

## Important Comparability Notes (Read Before Interpreting)

The following differences between V1 and V2 make direct metric-to-metric comparison scientifically invalid without this context:

| Dimension | V1 | V2 |
|-----------|-----|-----|
| Dataset size | 40,000 cases | 60,000 cases |
| Geographic zones | 75 (10 named, 55 "District-N" placeholders) | 120 (all real named Indian districts) |
| Typologies | 6 | 10 |
| Complaint-before-cashout rate | 2.3% | 9.6% |
| Right-censored cases | 0 | 2.7% (1,621) |
| Training registry causality | Static aggregate over full train period (within-train leakage) | Causal per-snapshot using `causal_registry_v2.parquet` |
| Geographic distribution (Gini) | ~0.6 (concentrated) | 0.124 (coverage-balanced, near-uniform) |
| Snapshot policy (timing) | T0 + up to 3 hops, censored treated as observed (bug) | T0 + up to 3 hops, censored correctly `event_observed=False` |
| Snapshot count (timing val+test) | ~44k (V1 month split) | ~45.5k (V2) |

**The V2 near-uniform geographic distribution (Gini=0.124) makes geographic accuracy metrics lower in absolute terms** than V1 (Gini≈0.6). A model predicting the concentrated V1 distribution is "easier" than one covering 120 balanced zones. Do not claim V2 geographic accuracy is worse — it is solving a harder, more coverage-balanced problem.

---

## Section A: Geographic Engine V1 vs V2

### A.1 Architecture

Both use the same M8 Reliability-Aware Sequential Bayesian architecture:

```
Typology prior → Sequential log-likelihood updates → M8 registry update → Temperature softmax
```

M8 frozen parameters are identical (λ=0.5, k=5.0, w_rel=2.0).

### A.2 Key differences

| Item | V1 | V2 |
|------|-----|-----|
| Zone target space | 75 zones | 120 zones |
| Registry training | Static full-train aggregate | Causal per-T0 snapshot (`causal_registry_v2.parquet`) |
| Registry at val/test | Full V1 train registry | Full V2 train registry (static, correct: all train is past) |
| Calibration temperature | T = 5.17 (V1) | T_M8 = 4.50 (V2), T_M3 = 20.0 (V2) |
| Training registry leakage | ❌ Present — Jan snapshots saw Apr registry | ✅ Fixed — causal T0 registry per complaint |

### A.3 Month-6 Test Metrics

> ⚠️ **Not directly comparable**: V2 has 120 zones (harder, more balanced) vs V1's 75 zones (more concentrated). Absolute accuracy figures differ for structural reasons unrelated to model quality.

| Metric | V1 M8 (75 zones) | V2 M8 (120 zones) | V2 M3-Sequential (120 zones) |
|--------|------------------|-------------------|------------------------------|
| Top-1 Accuracy | — | **10.1%** | 1.4% |
| Top-3 Accuracy | — | **22.5%** | 3.8% |
| Top-5 Accuracy | — | **31.8%** | 6.1% |
| MRR | — | **0.207** | 0.052 |
| NLL | — | 4.411 | 4.829 |
| Geo Error (median km) | — | 997 km | 945 km |

> V1 Month-6 metrics were not re-evaluated on the new V2 test split — V1 was evaluated on a different dataset with different zone distribution. Keeping V1 metrics here would require re-running V1 inference on V2 test data with the V1 75-zone target space, which is methodologically undefined. The comparison is therefore left blank for V1.

### A.4 M8 vs Sequential Ablation (V2, Month-6)

This is a valid intra-V2 ablation since both models use identical data:

| Model | Top-1 | Top-3 | MRR | NLL |
|-------|-------|-------|-----|-----|
| Sequential-only (M3) | 1.4% | 3.8% | 0.052 | 4.829 |
| Sequential + M8 Registry | **10.1%** | **22.5%** | **0.207** | **4.411** |
| **M8 gain** | **+8.7 pp** | **+18.7 pp** | **+0.155** | **−0.418** |

**Conclusion:** M8 registry evidence provides a genuine and large improvement over sequential-only prediction in V2. The improvement is real: M8 narrows the geographic distribution using historical entity-zone associations.

### A.5 Registry Coverage Breakdown (V2, Month-6)

| Cohort | n | M8 Top-1 | M3 Top-1 |
|--------|---|---------|---------|
| Has registry evidence | 9,380 | **10.7%** | 1.3% |
| No registry evidence | 716 | 2.1% | 2.1% |

When no registry history exists, M8 = M3 (correct fallback to sequential-only). Registry evidence provides the entire M8 lift.

### A.6 Temperature Calibration

| Dataset | Temperature | Notes |
|---------|------------|-------|
| V1 | T = 5.17 | Fitted on V1 Month-5 |
| V2 M8 | T = 4.50 | Fitted on V2 Month-5 (independent) |
| V2 M3 | T = 20.0 | Effectively near-uniform — sequential evidence alone is weak on 120 balanced zones |

V2 temperatures are independent of V1. Do NOT reuse T=5.17 for V2 production.

---

## Section B: Time-to-Event Engine V1 vs V2

### B.1 Architecture

Both use the same three-model stack:

```
Dynamic Discrete-Time Hazard (XGBoost, person-period)
  + IsotonicRegression calibrator (Month-5 only)
AFT (XGBoost survival:aft)
Direct Quantile Regression (GradientBoosting, P25/P50/P75)
```

### B.2 Key Differences

| Item | V1 | V2 |
|------|-----|-----|
| Training data | 40k cases, V1 dataset | 60k cases, V2 dataset |
| Censored handling | ❌ All `event_observed=True` (bug — censored treated as observed) | ✅ `event_observed=False`, AFT upper_bound=+inf |
| Zero-hop T0 | ❌ Zero-hop cases missing from T0 snapshots | ✅ Zero-hop T0 from incident_timestamp − 10min |
| SPLITS_DIR | `data/synthetic/splits` | `data/synthetic_v2/splits` |
| ARTIFACTS_DIR | `artifacts/models/timing` | `artifacts/models/timing_v2` |
| Calibrator persistence | ❌ V1 pkl incompatible with sklearn 1.7 | ✅ V2 pkl: max_diff=0 before/after reload |
| Snapshot count (train) | 86,307 | 86,061 |
| Censored snapshots (test) | 0 | 880 |

### B.3 Month-6 Test Metrics

> ⚠️ **Not directly comparable on absolute MAE** because:
> - V2 timing distribution differs from V1 (longer tail: mean 110 min vs V1's 58 min)
> - V2 has right-censored cases that V1 excluded
> - V2 snapshot policy includes zero-hop T0 snapshots that V1 lacked

| Metric | V1 (40k cases) | V2 (60k cases) |
|--------|---------------|---------------|
| AFT MAE (test) | 31.7 min | 37.6 min |
| AFT Median AE (test) | 19.0 min | 24.9 min |
| Q50 MAE (test) | 31.6 min | 37.3 min |
| P25–P75 Coverage (test) | 49.2% | **49.4%** |
| P25–P75 Interval Mean | ~48.4 min | 52.6 min |
| Brier P(T>30m) | 0.221 | 0.200 |
| Brier P(T>60m) | 0.208 | 0.226 |
| Brier P(T>120m) | 0.073 | 0.104 |
| Quantile crossing (post-correction) | 0.0% | 0.0% |
| Survival monotone | ✅ | ✅ |
| Calibrator persistence | ❌ (sklearn version) | ✅ PASS |

**Why V2 MAE is higher than V1:**  
V2 has a longer-tail timing distribution (mean 110 min vs V1's ~58 min), more diverse cashout delay patterns across 10 typologies, and more zero-hop/censored cases. The harder problem produces higher absolute MAE — this is expected and does not indicate model degradation.

**V2-specific improvements:**
- Right-censored cases correctly handled (`event_observed=False`, AFT upper_bound=+∞)
- Brier at 30 min improved (0.200 vs 0.221) — model better calibrated for short-window urgency
- Coverage at 49.4% vs 49.2% — nearly identical, confirming stable quantile calibration
- Calibrator persistence fully functional on sklearn 1.7

### B.4 Censored Case Handling (V2 only)

V2 introduces 880 right-censored test snapshots (2.7% of test). All three models handle them correctly:

| Model | Handling |
|-------|---------|
| Dynamic Hazard | Person-period rows all label=0; calibrated normally |
| AFT | lower_bound = observation duration, upper_bound = +∞ |
| Quantile | Excluded from training (observed-only) — correct |

Censored snapshots verified: `exact_minutes=NaN`, `upper_bound=+inf`, `event_observed=False` — all ✅.

---

## Summary: What Can and Cannot Be Concluded

### Valid conclusions

1. **M8 provides genuine geographic lift in V2**: +8.7 pp Top-1, +18.7 pp Top-3 vs sequential-only on identical test data.
2. **M8 fallback is correct**: No-registry cases produce identical predictions between M3 and M8.
3. **Timing quantile coverage is stable at ~49.4%** across both V1 and V2 (target ~50%).
4. **Censoring is correctly implemented in V2** — both AFT and hazard handle right-censored cases.
5. **Calibrator persistence works** in V2 with sklearn 1.7.
6. **Causal registry leakage is fixed**: January training snapshots no longer see February–April registry history.

### Not valid conclusions

1. **"V2 geographic accuracy is lower than V1"**: Not valid — different zone spaces (75 vs 120), different concentration levels.
2. **"V2 timing is worse than V1"**: Not valid — different timing distributions (longer tail in V2), different censoring behavior.
3. **"V1 and V2 can be compared on any single metric"**: Only intra-V2 ablations (M3 vs M8) are directly comparable.

---

## Artifact Paths

| Component | V1 | V2 |
|-----------|-----|-----|
| Geographic model | `artifacts/models/trained_model_m8.json` | `artifacts/models/geographic_v2/trained_model_geographic_v2.json` |
| Geographic registry | `artifacts/models/rich_registry.json` | `artifacts/models/geographic_v2/rich_registry_v2.json` |
| Geographic calibration | embedded (T=5.17) | `artifacts/models/geographic_v2/calibration_v2.json` |
| Geographic metrics | `artifacts/metrics/` | `artifacts/metrics/geographic_v2/` |
| Timing models | `artifacts/models/timing/` | `artifacts/models/timing_v2/` |
| Timing metrics | `artifacts/metrics/timing/` | `artifacts/metrics/timing_v2/` |
| Causal registry | — | `artifacts/registry/causal_registry_v2.parquet` |

*V1 artifacts are preserved and untouched.*
