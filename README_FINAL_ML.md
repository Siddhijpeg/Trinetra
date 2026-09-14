# TRINETRA — Final ML Workspace

This is the consolidated ML workspace assembled from the two team implementations.

## Final architecture

### 1. Geographic prediction — KEEP USER'S M8
- M8 reliability-aware geographic model/artifacts are retained.
- The trained M8 artifact is byte-identical to the teammate's M8 artifact, so there is no benefit in maintaining a duplicate.
- The teammate's registry evaluation and dataset infrastructure are retained.

### 2. Timing prediction — KEEP TEAMMATE'S ADVANCED ARCHITECTURE
The richer timing stack is now included:
- as-of-time feature snapshots
- dynamic hazard / survival model
- AFT model
- quantile model
- timing training/evaluation pipeline

Your simpler recoverability-curve implementation is also retained for comparison and fallback.

IMPORTANT: before treating the advanced timing model as final, correct the event censoring semantics. Frozen/no-cashout cases must be right-censored rather than automatically marked as observed events. `ml/timing/censoring.py` provides the helper for this correction.

### 3. Decision engine — KEEP USER'S INTEGRATED ENGINE
The user's decision engine remains the operational integration layer combining geographic and timing outputs into:
- CRITICAL_ALERT
- REVIEW
- MONITOR

Thresholds should be fitted on validation only.

### 4. Dataset + validation — KEEP TEAMMATE'S INFRASTRUCTURE
Included:
- synthetic generator
- data preparation
- temporal train/validation/test splitting
- validation scripts
- known/unseen mule evaluation
- known/unseen syndicate evaluation
- recorded metrics/artifacts

## Critical experiment rule

The synthetic dataset intentionally contains latent syndicate/mule structure. Therefore:
- known-entity results can be much stronger;
- unseen-entity/OOD results are essential;
- synthetic test performance must not be described as real-world accuracy.

## Recommended final experiment

1. Fix timing censoring.
2. Standardize data paths.
3. Generate a fresh larger dataset with a fixed seed.
4. Split temporally into train/validation/test.
5. Train geographic M8.
6. Train advanced timing models.
7. Fit decision thresholds on validation only.
8. Evaluate once on untouched test data.
9. Report overall + known/unseen entity metrics.
10. Compare against the simpler timing baseline.

Do not select a model merely because its training-set or known-entity score is higher.
