# TRINETRA / PRAHARI - DEEP TECHNICAL AUDIT

## 1. EXECUTIVE SUMMARY
The teammate has successfully implemented a structural prototype of the TRINETRA prediction pipeline. The current branch introduces an end-to-end Python pipeline including a synthetic data generator, a training engine that builds a risk registry and Bayesian likelihood matrices, and a baseline inference engine that updates zone probabilities sequentially per hop. 

However, **this is currently a mathematical simulation rather than a valid machine learning model.** The synthetic dataset is dangerously small (60 complaints) and relies on purely random assignments (e.g., target cash-out zones are completely independent of fraud typology or victim location). Furthermore, the training engine processes the entire dataset without a train/test split, meaning the "prediction" script is heavily leaking the target and simply regurgitating the training data. The architecture is sound and conceptually aligned with TRINETRA, but the data science methodology requires a complete overhaul before real learning can occur.

## 2. CURRENT BRANCH VS MAIN
- **CURRENT BRANCH:** `feature/nisha-ui-refactor`
- **BASE BRANCH:** `main` (commit `a4aae5b`)
- **COMMITS UNIQUE TO CURRENT BRANCH:** 1 commit (`b908a16` - Update frontend)
- **FILES ADDED:** 12 files (8 CSV datasets, `generate_dataset.py`, `train_engine.py`, `mockPredictionsOutput.json`, `trained_model.json`)
- **FILES MODIFIED:** 2 files (`ml/baseline_predictor.py`, `frontend-nisha/frontend-nisha/src/screens/PredictionEngine.tsx`)
- **FILES DELETED:** 0

**Summary of changes:** The teammate merged in a fully functional mock ML pipeline (generating data, training, predicting, and outputting JSON) and wired the React frontend `PredictionEngine.tsx` to read the new `mockPredictionsOutput.json` file.

## 3. WHAT THE TEAMMATE BUILT
1. **Synthetic Data Generator:** A script (`generate_dataset.py`) that uses `Faker` and `numpy` to generate 8 interrelated tables mapping complaints to hops, accounts, and cashout events.
2. **Train Engine:** A Python script (`train_engine.py`) that computes TF-IDF profiles for fraud typologies, Bayesian P(Zone) priors, P(Account|Zone) likelihoods, and a node risk registry. It exports `trained_model.json`.
3. **Baseline Predictor:** An inference script (`baseline_predictor.py`) that consumes `trained_model.json` to perform inference on complaints. It combines a typology cosine-similarity prior with sequential Bayesian updates as each transaction hop is processed.
4. **UI Integration:** Modifications to the frontend to consume the output of the inference engine.

## 4. REPOSITORY / FILE MAP
**Data Generation & Sources:**
- `frontend-nisha/frontend-Nisha/scripts/generate_dataset.py` (Main generator)
- `zones.csv`, `atms_and_cashouts.csv`, `typology_rules.csv`, `mule_entities.csv`, `accounts.csv`, `complaints.csv`, `hops.csv`, `cashout_events.csv`

**Machine Learning Pipeline:**
- `ml/train_engine.py` (Consumes CSVs -> Outputs `trained_model.json`)
- `ml/baseline_predictor.py` (Consumes CSVs & `trained_model.json` -> Outputs `mockPredictionsOutput.json`)

**Frontend Simulation:**
- `frontend-nisha/frontend-Nisha/src/data/mockPredictionsOutput.json` (Used by React)
- `frontend-nisha/frontend-Nisha/src/screens/PredictionEngine.tsx`

## 5. CURRENT DATASET INVENTORY
All datasets are **Python-generated synthetic files**:
1. `complaints.csv` (4.6 KB) - Base fraud cases.
2. `hops.csv` (9.7 KB) - Transaction edges.
3. `accounts.csv` (3.9 KB) - Bank accounts & mule flags.
4. `cashout_events.csv` (6.5 KB) - Ground truth target labels.
5. `zones.csv` (884 B) - Geo-spatial boundaries.
6. `atms_and_cashouts.csv` (4.3 KB) - Physical cashout infrastructure.
7. `mule_entities.csv` (607 B) - Clustered human actors controlling accounts.
8. `typology_rules.csv` (193 B) - Hardcoded fraud classes.

## 6. EXACT DATA COUNTS
- **TOTAL COMPLAINTS:** 60
- **TOTAL TRANSACTION HOPS:** 109
- **TOTAL ACCOUNTS:** 120
- **TOTAL UNIQUE ACCOUNTS:** 120
- **TOTAL MULE ACCOUNTS:** 83
- **TOTAL CASH-OUT EVENTS:** 60
- **TOTAL ZONES:** 20
- **TOTAL FRAUD TYPES:** 4
- **TOTAL UNIQUE CASE IDs:** 60

## 7. DATA SCHEMA
The referential integrity is solid. 
- `complaints` (1) ↔ (N) `hops` (via `complaint_id`)
- `hops` (N) ↔ (1) `accounts` (via `from_account`, `to_account`)
- `complaints` (1) ↔ (1) `cashout_events` (Ground Truth)
- `cashout_events` (N) ↔ (1) `zones` (via `zone_id`)
- `accounts` (N) ↔ (1) `mule_entities` (via `entity_id`)

## 8. DATA QUALITY
- **Integrity:** Perfect referential integrity, no missing values, no impossible timestamps.
- **Scale:** **DANGEROUSLY SMALL.** 60 rows is entirely insufficient for any statistical modeling. 
- **Realism:** Very low. Mule accounts are assigned to hops simply via `random.sample(mule_pool)`.

## 9. DATA DISTRIBUTIONS
- **Fraud Types:** OTP Fraud (22), Investment (14), Fake Loan (13), Job Scam (11)
- **Hops per complaint:** Varies between 2 to 4 based on typology rules.
- **Cashout by Zone:** Completely random uniform distribution (e.g., Z15 has 7 cases, Z01 has 1). 
- **Amount Progression:** Amounts decay mathematically (`amount * (0.96 ** hop_index)`).

## 10. SYNTHETIC GENERATOR LOGIC
**How it works (and why it fails ML realism):**
1. **Target Zone Selection:** `target_zone = random.choice(zones_data)`. **This is the biggest flaw.** There is zero correlation between the fraud type, the victim location, and where the money ends up. 
2. **Mule Selection:** Accounts are picked uniformly at random. A mule account operating in Punjab is equally likely to be used in a Tamil Nadu fraud case.
3. **Shortcuts & Determinism:** Hop delays are generated via a strict log-normal distribution. Amounts always split by exactly 4% per hop. The model will easily memorize these deterministic equations rather than finding real-world fuzziness.

## 11. DATA LEAKAGE RISKS
> [!CAUTION]
> **TARGET LEAKAGE (CRITICAL):**
> `train_engine.py` reads `hops.csv` and `cashouts.csv` simultaneously, joining them to compute `P(Account | Zone)`. It then saves these likelihoods. `baseline_predictor.py` then runs on the EXACT SAME 60 COMPLAINTS. The predictor literally looks up the exact target zone the account was seen in during training. **Accuracy is 100% fabricated by this leakage.**

> [!CAUTION]
> **TEMPORAL LEAKAGE (CRITICAL):**
> There is no chronological splitting. Future cases are used to populate the risk registry, which is then used to predict past cases.

## 12. CURRENT PREDICTION ENGINE
- **MODEL NAME:** Custom Sequential Bayesian + Cosine Profiler
- **FILE:** `ml/baseline_predictor.py`
- **FUNCTION:** Combines a TF-IDF prior based on typology with hop-by-hop Bayesian likelihood updates.
- **TARGET:** `zone_id`
- **TRAINING METHOD:** Unsupervised statistical aggregation (Counting frequencies).
- **STATUS:** REAL IMPLEMENTATION (but operating on flawed, leaked data).
- **FLOW:** CSVs → `vectorizer.transform` (Prior) → Loop over Hops → `P(Z|Hop) = P(Hop|Z) * P(Z)` → `mockPredictionsOutput.json`.

## 13. CURRENT FEATURES AND TARGET
**CURRENT TARGET:** `zone_id` (Top-1 and Top-3). *This is a highly defensible, correct target for the architecture.*

**CURRENT FEATURES:**
- `typology_name` (Text Cosine Similarity)
- `amount_inr` (Standard Deviation distance)
- `delay_minutes` (Velocity)
- `to_account` (Categorical Likelihood lookup)
- `times_flagged` (Risk Registry weighting)

**MISSING FEATURES WE SHOULD ADD:**
- Inter-state bank movement, historical zone frequency, time of day/weekday, node degree (network graph features).

## 14. CURRENT MODEL PERFORMANCE
Because there is no test set and extreme target leakage, the current script simply outputs near-perfect metrics to the console. These metrics are statistically meaningless and only serve as a frontend integration payload.

## 15. ARCHITECTURE ALIGNMENT WITH TRINETRA
| ARCHITECTURAL LAYER | CURRENT STATUS | CURRENT FILES | NEXT STEP |
| :--- | :--- | :--- | :--- |
| **Reference-class prior** | 50% | `train_engine.py` | Need conditional P(Zone\|Typology) |
| **Initial Top-K prediction** | 75% | `baseline_predictor.py` | Working structurally |
| **Sequential hop updates** | 75% | `baseline_predictor.py` | Math is correct, needs valid data |
| **Persistent risk registry** | 50% | `train_engine.py` | Needs to be chronological |
| **Confidence/Calibration** | 25% | `baseline_predictor.py` | Outputs uncalibrated posteriors |
| **Recoverability** | 25% | `baseline_predictor.py` | Basic hardcoded threshold math |
| **Train/Test Split** | 0% | *Missing* | CRITICAL: Implement temporal split |

## 16. SEQUENTIAL-PREDICTION READINESS
**YES.** The schema and the Python logic natively support sequential prediction. 
The schema separates `complaints.csv` from `hops.csv` (which contains `hop_sequence` and `timestamp`). The `baseline_predictor.py` script actively iterates over `cmp_hops.iterrows()` and updates `log_posteriors` for each zone, mathematically demonstrating a narrowing probability distribution. The infrastructure is ready.

## 17. IS THE CURRENT DATA VIABLE?
**NO.** 
60 rows of purely randomized targets cannot be used to train or evaluate a machine learning model. It is barely enough to ensure the code compiles.

## 18. DO WE ACTUALLY NEED ~40,000 COMPLAINTS?
**YES, but 40,000 is a baseline.**
To properly model sequential Bayesian updates across 20-50 geographical zones with varying typologies, we need dense matrices. 
If we have 40,000 complaints, we can expect:
- ~120,000 transaction hops
- ~60,000 unique mule accounts
- ~15,000 reused mule accounts
This provides enough density to ensure that `P(Account | Zone)` is statistically meaningful without overfitting.

## 19. RECOMMENDED DATASET SIZE AND COMPOSITION
- **MINIMUM DEV SET:** 5,000 complaints (15k hops). Good for rapid local testing.
- **SIH TRAINING SET:** 40,000 - 50,000 complaints (120k hops, 50k accounts).
- **CASH-OUT LABELS:** Every complaint must have a 1:1 mapping to a target cash-out zone.

## 20. SYNTHETIC DATA REDESIGN
The generator must move from *Random Assignment* to *Conditional Probability distributions*.
1. **Typology -> Zone Correlation:** Investment Scams should heavily bias towards specific tech-hubs or border regions. 
2. **Victim -> Zone Correlation:** Fraud originating in South India should have a higher likelihood of cashing out in specific neighboring states.
3. **Mule Reuse:** Accounts must have a "Home Zone". An account used heavily in Jharkhand should rarely appear in a cash-out chain ending in Kerala.
4. **Fuzziness:** Remove deterministic 4% amount splits. Add noise.

## 21. TRAIN / VALIDATION / TEST STRATEGY
You cannot use random 80/20 splitting. We must use:
1. **TEMPORAL TEST:** Train on Months 1-4, Test on Month 5. This prevents future risk-registry leakage.
2. **UNSEEN-MULE TEST:** Ensure the test set contains a subset of complaints where 100% of the hop accounts are brand new, forcing the model to rely on Geo/Prior features rather than memorizing accounts.

## 22. RECOMMENDED METRICS
- **Primary:** Top-3 Zone Recall (Does the true zone appear in our top 3 predictions?)
- **Secondary:** Mean Geographic Error (Distance in km between predicted zone center and actual cash-out ATM).
- **Tertiary:** Brier Score (Are our confidence percentages actually calibrated?)

## 23. MODEL ROADMAP
1. **Baseline 0:** Global Prior (Predict the most common zone for a given typology).
2. **Baseline 1:** The teammate's current Sequential Bayesian Updater (once trained on valid data without leakage).
3. **Baseline 2:** XGBoost / LightGBM Classifier (Using engineered features at T=Hop_N).
4. **Baseline 3:** Graph Neural Network / Node2Vec (If entity relationships become highly complex).

## 24. KEEP / MODIFY / REWRITE ANALYSIS
- **KEEP AS-IS:** The UI integration (`PredictionEngine.tsx`) and the Data Schema.
- **KEEP BUT MODIFY:** `baseline_predictor.py` and `train_engine.py` (Structurally excellent, but must enforce Train/Test splitting and proper serialization).
- **REWRITE:** `generate_dataset.py`. The generation logic must be rebuilt using conditional probabilities.
- **DO NOT USE FOR TRAINING:** The current 8 CSV files.

## 25. MAJOR TECHNICAL RISKS
1. **Data Leakage:** If the temporal split is not implemented correctly, the model will cheat by using future mule data.
2. **Synthetic Overfitting:** If the new generator is too simple, a Gradient Boosting model will achieve 99% accuracy by just learning the `if/else` statements in the Python generator script.

## 26. CURRENT PROJECT READINESS
- **DATA:** 15% (Schema perfect, content meaningless).
- **MODEL:** 40% (Bayesian logic is solid, evaluation methodology is 0%).
- **SEQUENTIAL PREDICTION:** 75% (Core loop exists).
- **FRONTEND CONNECTION:** 90% (Mock JSON handoff works).

## 27. NEXT IMPLEMENTATION ORDER
1. **Rewrite `generate_dataset.py`** to use complex, noisy, conditional probability distributions.
2. **Generate 40,000 records.**
3. **Implement a strict Temporal Train/Test Split script.**
4. **Rewrite `train_engine.py`** to ONLY learn from the Train Split.
5. **Evaluate `baseline_predictor.py`** on the Test Split using proper Top-3 Recall metrics.

## 28. TOP 10 ACTION ITEMS
1. Delete the current 60-row CSV datasets.
2. Map out a logical probability matrix (e.g., Typology A -> 60% Zone X, 30% Zone Y).
3. Update `generate_dataset.py` to use this probability matrix.
4. Add a `split_data.py` script for chronological separation.
5. Refactor `train_engine.py` to accept only `train_` CSVs.
6. Refactor `baseline_predictor.py` to evaluate on `test_` CSVs.
7. Output a `metrics_report.json` alongside `mockPredictionsOutput.json`.
8. Ensure `PredictionEngine.tsx` gracefully handles missing/new zones.
9. Validate that `P(Account|Zone)` is no longer leaking test data.
10. Scale generation up to 40k.

## 29. QUESTIONS / UNKNOWNS
- Will we eventually receive real, anonymized bank data for SIH, or will the final submission rely 100% on synthetic data? If 100% synthetic, we must spend heavily on generator realism.
- What is the computational budget for the backend? Real-time Bayesian updates are cheap, but GNNs will require a dedicated inference server.
