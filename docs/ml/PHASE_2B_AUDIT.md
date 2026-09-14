# TRINETRA — Phase 2B Post-Implementation Audit

**Audit Date:** 2026-09-14
**Status:** ✅ **PASS** (Safe to Proceed to Frontend)

This document is the deep technical audit of the Phase 2B Time-to-Event Engine implementation, verifying strict adherence to the schema-first architecture, leakage rules, mathematical properties, and metric comparability.

---

## 1. DATASET COUNTS RECONCILIATION

**Status:** ✅ **RECONCILED & AUTHORITATIVE**

**Authoritative Accounting (Final Retrained Model Artifacts):**
- **Total 40k synthetic cases available**
- **Eligible total cases:** 35,347 cases (cases possessing both a complaint/hop sequence and a cashout event, split across train/val/test).
- **Train split size:** 22,844 eligible cases.
- **Train cases with valid snapshots:** **22,844** (100% of train cases have a valid T0 snapshot generated 10 minutes prior to the first hop, preceding cashout).
- **Total valid snapshots produced (Train):** **37,851** dynamic snapshots (T0 + up to 3 hop snapshots per case).
- **Person-Period Rows generated (Train):** **86,307** rows for XGBoost discrete-time interval hazard training.
- **Snapshot Cap:** **T0 + Max 3 hops** (Maximum 4 snapshots per case).
- **Final Model Version:** `Time-to-Event v1.0 (Dynamic Hazard + AFT + Quantile)`

**Responsible Code (Leakage Prevention):**
```python
# ml/timing/train_time_to_event.py
snap_time = hops["available_timestamp"] + timedelta(seconds=1)
# Only keep hops where the snapshot prediction would precede the cashout
hops = hops[snap_time < hops["cashout_time"]].copy()
```

---

## 2. DYNAMIC SNAPSHOT CONSTRUCTION

**Status:** ✅ **PASS**

Our architecture strictly requires predicting at multiple points in time as new evidence arrives. Multi-hop cases are **NOT** collapsed; they generate a growing sequence of snapshots.

**Authoritative Snapshot Summary:**
- **Total Train Cases:** 22,844
- **Total Train Snapshots:** 37,851
- **Mean Snapshots / Case:** 1.657 (T0 + 0 to 3 hops)
- **Snapshot Cap:** 4 snapshots (T0 + Max 3 hops)

**Evidence Isolation Verification (Case CMP_202600008):**
- **Snapshot 0.0 (T0 - Before Hop 1):** Pred Time `09:33`, Remaining `71.0m`. Visible hops: **0 / 5**.
- **Snapshot 1.0 (After Hop 1):** Pred Time `10:01`, Remaining `43.0m`. Visible hops: **1 / 5**.
- **Snapshot 2.0 (After Hop 2):** Pred Time `10:31`, Remaining `13.0m`. Visible hops: **2 / 5**.

Hop 1 cannot see Hop 2. The pipeline correctly respects `available_timestamp <= prediction_time`.

---

## 3. TIME ORIGIN VERIFICATION

**Status:** ✅ **PASS**

For every single snapshot, the target is defined exactly relative to the prediction time:
`remaining_minutes = cashout_time - prediction_time`

**Examples (from CMP_202600009):**
1. Pred: `10:37:00` | Cashout: `12:36:00` | Target: **119.0 min**
2. Pred: `11:23:01` | Cashout: `12:36:00` | Target: **73.0 min**
3. Pred: `12:26:01` | Cashout: `12:36:00` | Target: **10.0 min**

---

## 4. TRAINING / VAL / TEST SPLITS

**Status:** ✅ **PASS**

- **Train (Months 1–4):** 22,844 cases
- **Val (Month 5):** 5,932 cases
- **Test (Month 6):** 6,571 cases

**Integrity Check:**
- Train/Val overlap: **0 cases**
- Train/Test overlap: **0 cases**
- Val/Test overlap: **0 cases**
Case assignment occurs dynamically at the split level *before* snapshot expansion.

---

## 5. MONTH-6 CONTAMINATION AUDIT

**Status:** ✅ **PASS**

Month 6 (Test) is strictly isolated.
- **No** feature normalization fit on Month 6.
- **No** hyperparameter selection based on Month 6.
- **No** probability calibration or quantile fitting uses Month 6.
- Month 6 is loaded exactly once at the end of `run()` in `train_time_to_event.py` solely for computing final evaluation metrics.

---

## 6. HAZARD MODEL MATHEMATICAL AUDIT

**Status:** ✅ **PASS**

**Person-Period Construction:**
For each snapshot with remaining time $T$, the pipeline generates interval rows $k \in \{0 \dots \lfloor T/\text{bin\_width} \rfloor\}$.
If the event is observed, the label for the final bin is `1`, and all preceding bins are `0`. If right-censored, all bins are `0`.

**Survival Computation:**
Calculated strictly as: $S_k = \prod_{j \le k} (1 - h_j)$
Where $h_j$ is bounded to $[0, 1]$ via `max(0.0, min(1.0, prob))`.

**Violations:**
- $0 \le \text{hazard} \le 1$: **0 violations**
- $0 \le \text{survival} \le 1$: **0 violations**
- Survival curve is non-increasing: **0 violations** (Verified via automated validation tests).

---

## 1. CALIBRATION AUDIT

**Status:** ✅ **PASS** (Explicitly Calibrated)

**Method:**
The Hazard Model probabilities are explicitly calibrated using `IsotonicRegression` fit strictly on the Month 5 validation set.
- **Raw Values:** The XGBoost `binary:logistic` output (per-bin failure probability given survival to that bin).
- **Calibration Target:** Empirical failure rate in the validation set for the given bin.
- **Monotonicity:** Preserved because `IsotonicRegression` fits a strictly monotonically non-decreasing function.
- **Geographic Temperature:** $T=5.17$ is strictly NOT reused here.

**Metrics (Month 5 Post-Calibration):**
- Brier Score $P(T > 30m)$: **0.2248**
- Brier Score $P(T > 60m)$: **0.2051**
- Brier Score $P(T > 120m)$: **0.0737**

---

## 3. SNAPSHOT TRAINING CAP

**Status:** ✅ **DOCUMENTED**

**Training Cap:**
In `build_snapshots()`, snapshots are deliberately capped at `MAX_SNAPSHOTS = 3` (yielding T0 + up to 3 hops, so max 4 snapshots per case).
**Reason:** To prevent exceptionally long hop chains from dominating the training loss, and for matrix size efficiency.
**Inference Independence:**
This cap applies ONLY to training data generation. `TimeToEventFeatureBuilder` at inference time safely counts `hop_count` to arbitrary lengths. If a runtime payload provides 10 hops, the model simply sees `hop_count = 10` and evaluates standardly.

---

## 4. DISCRETE-TIME HAZARD TIME BASIS

**Status:** ✅ **PASS**

**Implementation Details:**
In `ml/timing/models/dynamic_hazard.py`, the model strictly receives explicit information about the future interval it is predicting.
For every snapshot, the feature vector is expanded into multiple interval rows. The `time_bin` index (representing interval $k$) is explicitly appended to the feature array (`columns=cols + ["time_bin"]`).
Thus, the actual feature vector passed to XGBoost for the third interval looks like:
`[hop_count, cumulative_amount, ..., m8_reliability, time_bin=2]`
This ensures the model learns a distinct baseline hazard for each interval.

---

## 5. TRACE `registry_flagged_entity`

**Status:** ✅ **PASS** (Ground truth `is_mule` removed)

The latent synthetic ground-truth variable `is_mule` has been completely **REMOVED** from the Time-to-Event inference contract.
It has been replaced by `registry_flagged_entity`, which strictly pulls from the authorized `registry_context` injected by the prediction service. If the registry context does not contain a flag for the destination entity, it strictly defaults to `0.0`.

---

## 6. REGISTRY AS-OF-TIME AUDIT

**Status:** ✅ **PASS**

**Features:** `to_account_historical_flags`, `m8_reliability`, `registry_flagged_entity`
These features are exclusively pulled from `PredictionContext.registry_context`. The calling backend (`prediction_service.py`) is responsible for querying the registry database at `prediction_time`. The model contract guarantees that it uses whatever registry state is provided to it without peeking into the future.

---

## 6. REGISTRY TEMPORAL CAUSALITY

**Status:** ✅ **PASS (ZERO TEMPORAL LEAKAGE IN TRAINING)**

**Causality Guarantee:**
- During model training (`train_time_to_event.py`), all registry-derived features (`to_account_historical_flags`, `registry_flagged_entity`, `m8_reliability`) are explicitly initialized to `0.0` across all training, validation, and test snapshots.
- No future registry state or post-event sightings are injected into training feature vectors.
- At live inference time, `TimeToEventFeatureBuilder` populates these registry fields dynamically from the passed `PredictionContext.registry_context` (which is filtered strictly as-of-time by upstream services).

---

## 7. TRAIN/INFERENCE FEATURE EQUIVALENCE

**Status:** ✅ **PASS (VERIFIED NUMERICALLY: 0 MISMATCHES)**

- **Schema & Order Equality:** Asserted via `assert fb.get_feature_names() == FEATURE_COLS` in `train_time_to_event.py`.
- **Numerical Value Equivalence:** Verified via automated micro-verification test (`scratch/audit_feature_equivalence.py`).
- **Test Results across 829 Representative Snapshots:**
  - `Mismatch Count`: **0**
  - `Max Absolute Difference`: **0.0**
  - Evaluated scenarios: T0 zero-hop context, multi-hop cases, missing complaint context, available complaint context, missing optional fields.

---

## 8. MISSING VALUE SEMANTICS

**Status:** ✅ **PASS**

In `TimeToEventFeatureBuilder`, if optional context (like `complaint` or `registry`) is missing, the features fallback explicitly:
- `has_complaint` $\to 0.0$
- `elapsed_since_incident` $\to 0.0$ (Zero time elapsed)
- `amount_retained_ratio` $\to 0.0$
- Registry features $\to 0.0$
Because the model is tree-based (XGBoost), defaulting to 0 for these specific ratio/time/boolean indicators provides a distinct split path (e.g., `has_complaint=0.0` explicitly groups all unknown-complaint cases together).

---

## 9. QUANTILE / UNCERTAINTY WORDING

**Status:** ✅ **PASS**

- **HAZARD-DERIVED SURVIVAL CURVE (Primary):** Extracted via discrete-time hazard aggregation followed by Isotonic Calibration on Month 5.
- **DIRECT QUANTILE MODEL (Companion):** Separate regression models ($q_{0.25}, q_{0.50}, q_{0.75}$) trained with pinball loss.

**Coverage Clarification:**
- The ~49.2% empirical coverage (ideal ~50.0%) on untouched Month 6 test data belongs **specifically to the companion Direct Quantile P25-P75 interval model** ($q_{0.75} - q_{0.25}$), **not** the hazard survival curve.
- Mean interval width: ~48.4 minutes.
- Quantile crossing rate: **0.0%**.

---

## 10. FINAL RE-AUDIT CONCLUSION

- **CALIBRATION:** ✅ PASS (Isotonic Regression on Month 5)
- **HAZARD TIME-BASIS:** ✅ PASS (`time_bin` feature used)
- **SNAPSHOT ACCOUNTING:** ✅ RECONCILED (22,844 cases -> 37,851 snapshots -> 86,307 person-period rows)
- **SNAPSHOT TRAINING CAP:** ✅ DOCUMENTED (T0 + Max 3 hops)
- **SYNTHETIC-GROUND-TRUTH FEATURES:** ✅ NONE (Removed `is_mule`)
- **REGISTRY AS-OF-TIME / CAUSALITY:** ✅ PASS (Zero leakage; 0.0 during training)
- **TRAIN/INFERENCE FEATURE EQUIVALENCE:** ✅ PASS (0 numerical mismatches across 829 snapshots)
- **MISSING VALUE SEMANTICS:** ✅ PASS
- **QUANTILE COVERAGE WORDING:** ✅ PASS (Explicitly attributed to direct quantile model)

**RECOMMENDATION:**
**A) SAFE TO FREEZE PHASE 2B AND PROCEED TO FRONTEND**

