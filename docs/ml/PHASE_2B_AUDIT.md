# TRINETRA — Phase 2B Post-Implementation Audit

**Audit Date:** 2026-09-14
**Status:** ✅ **PASS** (Safe to Proceed to Frontend)

This document is the deep technical audit of the Phase 2B Time-to-Event Engine implementation, verifying strict adherence to the schema-first architecture, leakage rules, mathematical properties, and metric comparability.

---

## 1. DATASET COUNTS RECONCILIATION

**Status:** ✅ **PASS**

**Accounting:**
- **Total 40k synthetic cases available**
- **Eligible total cases:** 35,347 cases (cases possessing both a complaint/hop sequence and a cashout event, successfully split across train/val/test).
- **Train split size:** 22,844 eligible cases.
- **Excluded during training snapshot generation:**
  Any case where `available_time > cashout_time` (meaning the event was only reported *after* the cashout had already occurred) is strictly excluded because predicting a cashout that already happened is mathematically invalid for a Time-to-Event model.
- **Valid snapshots produced (Train):** 23,981 valid dynamic snapshots.
- **Person-Period Rows generated (Train):** 61,718 rows for XGBoost interval training.

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

**Snapshot Distribution (per case with valid pre-cashout hops):**
- **Mean:** 2.718 snapshots
- **Median:** 2.0 snapshots
- **P75:** 3.0 snapshots
- **P90:** 4.0 snapshots
- **Max:** 4 snapshots (T0 + up to 3 hops)

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
- Brier Score $P(T > 30m)$: **0.1636**
- Brier Score $P(T > 60m)$: **0.1978**
- Brier Score $P(T > 120m)$: **0.1030**

---

## 2. SNAPSHOT COUNTS RECONCILIATION

**Status:** ✅ **RECONCILED**

**Accounting:**
- **Total Train Cases Available:** 22,844
- **Train Cases with $\ge 1$ Valid Prediction Snapshot:** 8,824 cases
- **Total Train Snapshots Generated:** 23,981 snapshots

**Explanation of Means:**
- Mean snapshots per **valid case** ($23,981 / 8,824$): **2.718 snapshots/case**
- Mean snapshots across **all cases** ($23,981 / 22,844$): **1.050 snapshots/case**
The large drop from 22,844 to 8,824 cases occurs because we strictly drop any case where the cashout happens before the first event is available (`remaining_time < 0`). Training on post-cashout snapshots would be illegal leakage.

**Snapshot Distribution (Valid Cases Only):**
- **0 snapshots:** 14,020 cases (excluded)
- **1 snapshot:** 0 cases
- **2 snapshots:** 4,566 cases
- **3 snapshots:** 2,183 cases
- **4 snapshots:** 2,075 cases
- **5+ snapshots:** 0 cases (capped)

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

## 7. TRAIN/INFERENCE FEATURE EQUIVALENCE

**Status:** ✅ **PASS**

An explicit equivalence check has been added to `train_time_to_event.py`.
Before building the training matrix, the script instantiates `TimeToEventFeatureBuilder` and strictly asserts:
`assert fb.get_feature_names() == FEATURE_COLS`
This halts training immediately if the vectorized Pandas columns drift from the canonical production inference contract.

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

- **HAZARD-DERIVED (Primary):** Extracted via interpolation from the calibrated $S(t)$ curve.
- **DIRECT QUANTILE MODEL (Companion):** Extracted via simultaneous regression.

**Coverage (Month 6):**
The empirical coverage of the DIRECT QUANTILE P25-P75 interval is 49.73%.
The mean interval width is 48.4m.
*Interpretation:* The observed interval width indicates coverage was not achieved solely through an extremely broad interval on this synthetic test distribution, but rather through accurate calibration.

---

## 10. FINAL RE-AUDIT CONCLUSION

- **CALIBRATION:** ✅ PASS (Isotonic Regression)
- **HAZARD TIME-BASIS:** ✅ PASS (`time_bin` feature used)
- **SNAPSHOT ACCOUNTING:** ✅ RECONCILED
- **SNAPSHOT TRAINING CAP:** ✅ DOCUMENTED (T0+3 hops)
- **SYNTHETIC-GROUND-TRUTH FEATURES:** ✅ NONE (Removed `is_mule`)
- **REGISTRY AS-OF-TIME:** ✅ PASS
- **TRAIN/INFERENCE FEATURE EQUIVALENCE:** ✅ PASS
- **MISSING VALUE SEMANTICS:** ✅ PASS

**RECOMMENDATION:**
**A) SAFE TO FREEZE PHASE 2B AND PROCEED TO FRONTEND**

