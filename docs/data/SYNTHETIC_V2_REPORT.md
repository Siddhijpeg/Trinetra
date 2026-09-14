# TRINETRA — Synthetic Dataset V2 Report
## Status: ✅ FROZEN FOR CURRENT MODEL EXPERIMENTS

**Dataset version:** V2  
**Freeze date:** 2026-09-14  
**Seed:** 2026 (deterministic)  
**Generator:** `scripts/synthetic_v2/generate_synthetic_v2.py`  
**Config:** `config/synthetic_v2.yaml`  
**Validator:** `scripts/synthetic_v2/validate_synthetic_v2.py` — ✅ **84/84 PASSED · 0 FAILED**  
**Adapter:** `core/adapters/synthetic_adapter.py` — ✅ **25/25 tests passed**  
**Roundtrip:** 1,000 cases — ✅ **0 errors**  
**Registry:** `artifacts/registry/rich_registry_v2.json` — ✅ **13,511 entries, clean temporal isolation**

> **Coverage disclaimer:** V2 is a synthetic coverage-oriented benchmark. Its geographic
> frequencies are engineered for broad zone coverage, not measured real-world Indian
> cybercrime prevalence. Gini = 0.124 (near-uniform). Do not interpret zone percentages
> as population-level prevalence estimates or make public claims that they represent
> observed Indian fraud geography.

---

## PATCHES APPLIED TO V2 (2026-09-14)

The following in-place patches were applied after initial generation. No cases were regenerated.

| # | Issue | Fix | Files changed |
|---|-------|-----|---------------|
| P1 | Complaint-timing sign convention in report was misread | Corrected documentation (9.6% before cashout is the correct number) | `SYNTHETIC_V2_REPORT.md` |
| P2 | CENSORED rows in `cashout_events.csv` exposed generator-truth zone/lat/lng | Nulled 7 fields on all 1,621 censored rows. Timestamps preserved. | `cashout_events.csv`, all 3 split files |
| P3 | 1,717 of 1,800 Tier-E entities appeared in TRAIN hops (unseen contract violated) | Relabelled train-contaminated Tier-E → Tier-D. 83 truly-unseen entities remain as Tier-E | `mule_entities.csv` |
| P4 | Validator coordinate check failed on null lat/lng from censored rows | Validator updated: coordinate check now applies to observed-outcome rows only | `validate_synthetic_v2.py` |
| P5 | Validator lacked censored-field isolation and Tier-E isolation checks | Added sections 15 and 16 to validator | `validate_synthetic_v2.py` |

---

## 1. TOTAL COUNTS

| Metric | Count |
|--------|-------|
| **Complaints** | **60,000** |
| **Transaction hops** | **176,915** |
| **Outcome records** | **60,000** |
| — Observed cashout (COMPLETED + FROZEN + PARTIAL + REVERSED) | 58,379 |
| — Right-censored (CENSORED) | 1,621 |
| **Accounts total** | **103,086** |
| — Mule accounts | 43,086 |
| — Victim accounts | 60,000 |
| **Mule entities** | **18,000** |
| **Geographic zones** | **120** |
| **Typologies** | **10** |
| **Latent syndicates** | **904** (generator-internal only) |
| **States** | **28** |
| **Named districts** | **116** |
| **Regions** | **8** |

---

## 2. TEMPORAL SPLITS

| Split | Period | Complaints | Hops | Outcome records |
|-------|--------|-----------|------|-----------------|
| **Train** | Jan–Apr 2026 | 39,220 | 116,031 | 39,220 |
| **Val** | May 2026 | 10,412 | 30,592 | 10,412 |
| **Test** | Jun 2026 | 10,368 | 30,292 | 10,368 |

Split integrity: Train∩Val = 0 · Train∩Test = 0 · Val∩Test = 0 ✅  
Temporal ordering: all train ≤ all val ≤ all test ✅

---

## 3. OUTCOME DISTRIBUTION

| Outcome | Count | % | Notes |
|---------|-------|---|-------|
| COMPLETED | 52,396 | 87.3% | Confirmed cashout |
| FROZEN | 2,638 | 4.4% | Funds held — complaint arrived before cashout |
| PARTIAL_FREEZE | 2,285 | 3.8% | Partial intervention |
| CENSORED | 1,621 | 2.7% | No confirmed cashout within 24h observation window |
| REVERSED | 1,060 | 1.8% | Post-cashout reversal |

**Combined intervention rate** (FROZEN + PARTIAL_FREEZE): **8.2%** (V1: 1.3%)  
**Right-censored rate**: **2.7%** (V1: 0%)

### Censored-row semantics (post-patch P2)

For CENSORED rows in `cashout_events.csv`:
- `event_timestamp` = last_hop_time + 24 h — **observation boundary, not a real cashout time**
- `available_timestamp` = event_timestamp + uniform(5–30 min) — **preserved for survival lower bound**
- `zone_id`, `zone_name`, `district`, `state`, `location_id`, `lat`, `lng` — **all null (patched)**
- `amount_cashed_out` — null
- Generator's intended target zone stored in `generator_metadata.csv` only

`SyntheticAdapter` also enforces this: `cashout_location=None`, `lat/lng=None`, `event_observed=False` for all CENSORED rows. **Defense-in-depth: both CSV and adapter layer block generator truth from canonical inference.**

---

## 4. ENTITY / REGISTRY TIERS (post-patch P3)

### Entity tier distribution

| Tier | Description | Entities | % |
|------|-------------|---------|---|
| A | High-reuse hub (hub accounts, high registry signal) | 540 | 3.0% |
| B | Medium-reuse | 2,160 | 12.0% |
| C | Low-reuse | 4,500 | 25.0% |
| D | Single-use / ephemeral (includes relabelled former Tier-E) | **10,717** | **59.5%** |
| **E** | **Truly unseen — never appear in TRAIN hops** | **83** | **0.5%** |

### Tier-E isolation verification

83 Tier-E entities appear **only** in val/test hops. Zero appear in any train hop. ✅  
(Original 1,800 Tier-E entities had 1,717 appearing in train — these were relabelled Tier-D.)

### Account-level reuse (hop destination appearances)

| Metric | Value |
|--------|-------|
| Mean | 7.8 appearances |
| Median | 2 |
| P75 | 6 |
| P90 | 17 |
| P95 | 31 |
| Max | 123 |
| Single-use accounts | 8,339 (36.6%) |
| > 10 appearances | 3,567 (15.6%) |

### Geographic entropy by tier

| Tier | Accounts with > 3 distinct cashout zones | Description |
|------|----------------------------------------|-------------|
| A | 50.8% | High-entropy hubs — challenge cases for M8 |
| B | 29.7% | |
| C | 28.3% | |
| D | 29.9% | |
| E | 55.1% | Test-only, diverse by design |

Both **high-reuse + concentrated** (Tier A low-entropy) and **high-reuse + dispersed** (Tier A high-entropy) cases exist, as required for M8 reliability learning.

---

## 5. V2 REGISTRY (`artifacts/registry/rich_registry_v2.json`)

| Metric | Value |
|--------|-------|
| Source | TRAIN split only (Months 1–4) |
| Entries | 13,511 accounts |
| Hops processed | 51,734 (avail_time < cashout_time, non-censored) |
| Mean sightings | 3.8 |
| Median sightings | 2 |
| Max sightings | 48 |
| Mean risk_weight | 0.190 |
| Max risk_weight | 0.889 |
| Mean entropy | 0.478 |
| Cross-split contamination | **0** ✅ |
| Tier-E in registry | **0** ✅ |
| 8 entries with last_seen in early May | **Not leakage** — April-incident train hops with bank-feed lag |

### Registry schema per entry

```json
{
  "entity_id":             "ENT_V2_000123",
  "historical_sightings":  12,
  "zone_counts":           {"V2_ZID_003": 8, "V2_ZID_009": 4},
  "historical_zones":      ["V2_ZID_003", "V2_ZID_009"],
  "normalized_entropy":    0.918,
  "first_seen":            "2026-01-15T10:32:00",
  "last_seen":             "2026-04-28T16:45:00",
  "tier":                  "A",
  "risk_weight":           0.523
}
```

### Risk weight formula
```
strength    = sightings / (sightings + 5.0)       # asymptotic
consistency = 1.0 − normalized_entropy
risk_weight = 2.0 × strength × consistency        # matches M8 w_rel=2.0
```

---

## 6. GEOGRAPHIC DISTRIBUTION

### Zone catalog (120 zones — zero placeholders)

All zones are named real Indian districts/localities. Zero "District-N" placeholders.

| Zone Type | Count | Cashout % |
|-----------|-------|----------|
| Metro | 35 | 35.8% |
| Tier2City | 53 | 39.5% |
| Tier3City | 23 | 16.8% |
| Hotspot | 8 | 7.2% |
| Transit | 1 | 0.7% |

**28 states · 116 named districts · 8 geographic regions**

### Zone concentration

| Metric | V2 | V1 |
|--------|-----|-----|
| Max zone share | 1.54% | 6.4% |
| Min zone share | 0.53% | < 0.1% |
| Top-10 combined | 13.2% | ~60% |
| Top-20 combined | 23.9% | ~75% |
| Gini coefficient | 0.124 | ~0.6 |
| Normalized entropy | 0.995 | ~0.75 |

**Design note:** Near-uniform distribution is intentional for coverage. Real-world Indian fraud would have Gini ≈ 0.5–0.7.

### Geographic movement distribution

| Tier | Cases | % |
|------|-------|---|
| Same zone | 527 | 0.9% |
| Same city | 586 | 1.0% |
| Same district | 571 | 1.0% |
| Same state | 3,075 | 5.1% |
| Cross-state, same region | 4,872 | 8.1% |
| Cross-region | 52,053 | 86.8% |

The 86.8% cross-region rate reflects that victim zones are drawn uniformly from the same 120-zone pool as cashout zones. With 28 states, P(same state) ≈ 1/28 ≈ 3.6%, observed at 5.1%. This is a property of the sampling method, not a modeling bias.

---

## 7. AUTHORITATIVE TIMING DISTRIBUTIONS

### Terminology

| Term | Definition |
|------|------------|
| `inc→cashout` | `cashout_event.event_timestamp − complaint.incident_timestamp` |
| `lh→cashout` | `cashout_event.event_timestamp − last_hop.event_timestamp` (generator's `cashout_delay`) |
| `T0 remaining` | `inc→cashout + 10 min` (T0 = 10 min before first hop) |
| `snapshot remaining` | `cashout_time − hop.available_timestamp` (training target per snapshot) |
| `VERY_SHORT_WINDOW` | Generator edge-case tag: **`lh→cashout < 5 min`** — NOT inc→cashout |

### Case-level `inc→cashout` (non-censored, n = 58,379)

| Bucket | Cases | % |
|--------|-------|---|
| < 5 min | 188 | 0.3% |
| 5–15 min | 2,774 | 4.8% |
| 15–30 min | 8,664 | 14.8% |
| 30–60 min | 19,178 | 32.9% |
| 60–120 min | 19,081 | 32.7% |
| > 120 min | 8,494 | 14.5% |

P25=35 min · P50=58.5 min · P75=97 min · P90=157 min · mean=110.8 min

### T0 remaining time (≈ `inc→cashout + 10 min`)

| Bucket | Cases | % |
|--------|-------|---|
| < 5 min | 0 | 0.0% |
| 5–15 min | 188 | 0.3% |
| 15–30 min | 5,220 | 8.9% |
| 30–60 min | 19,573 | 33.5% |
| 60–120 min | 23,034 | 39.5% |
| > 120 min | 10,364 | 17.8% |

### Snapshot-level remaining time (n = 78,994 usable hop snapshots)

| Bucket | Snapshots | % |
|--------|-----------|---|
| < 5 min | 7,758 | 9.8% |
| 5–15 min | 13,603 | 17.2% |
| 15–30 min | 15,997 | 20.3% |
| 30–60 min | 19,254 | 24.4% |
| 60–120 min | 14,742 | 18.7% |
| > 120 min | 7,640 | 9.7% |

P25=14 min · P50=32 min · P75=66 min · P90=118 min

---

## 8. COMPLAINT TIMING

### Complaint available-time relative to cashout

| Timing | Cases | % |
|--------|-------|---|
| Complaint **before** cashout | **5,760** | **9.6%** |
| 0–15 min after cashout | 1,516 | 2.5% |
| 15–60 min after cashout | 6,290 | 10.5% |
| 1–24h after cashout | 32,780 | 54.6% |
| > 24h after cashout | 13,654 | 22.8% |

> **Sign convention:** `ava_to_cash = cashout_time − complaint_available_time`.  
> **Positive** = complaint available before cashout (intervention possible).  
> **Negative** = complaint available after cashout (too late for that case).

Complaint-before-cashout rate: **9.6% (V2) vs 2.3% (V1)** — 4× improvement.

Among complaint-before-cashout cases (n=5,760): 44.0% FROZEN, 32.8% COMPLETED, 20.8% CENSORED.  
Median available window when before cashout: **56.8 min**.

---

## 9. HOP DISTRIBUTION

| Hops | Cases | % |
|------|-------|---|
| 0 | 2,357 | 3.9% |
| 1 | 10,893 | 18.2% |
| 2 | 13,047 | 21.7% |
| 3 | 13,234 | 22.1% |
| 4 | 9,534 | 15.9% |
| 5 | 6,045 | 10.1% |
| 6 | 3,025 | 5.0% |
| 7 | 1,205 | 2.0% |
| 8 | 660 | 1.1% |

Mean: 2.95 · Median: 3 · Max: 8 · Zero-hop: 2,357 (3.9%)

---

## 10. TYPOLOGY DISTRIBUTION

| ID | Name | Count | % |
|----|------|-------|---|
| TYP_01 | OTP / KYC Fraud | 8,322 | 13.9% |
| TYP_02 | Fake Loan App | 6,740 | 11.2% |
| TYP_03 | Part-Time Job Scam | 6,462 | 10.8% |
| TYP_04 | Investment / Crypto Scam | 7,204 | 12.0% |
| TYP_05 | Sextortion | 4,699 | 7.8% |
| TYP_06 | Marketplace / OLX Fraud | 7,184 | 12.0% |
| TYP_07 | Digital Arrest *(new in V2)* | 7,300 | 12.2% |
| TYP_08 | SIM Swap / Account Takeover *(new)* | 4,834 | 8.1% |
| TYP_09 | Romance / Honey Trap Scam *(new)* | 4,258 | 7.1% |
| TYP_10 | Courier / Parcel Scam *(new)* | 2,997 | 5.0% |

---

## 11. MISSINGNESS

| Field | Missing | % |
|-------|---------|---|
| `hops.bank_channel` | 5,492 | 3.1% |
| `hops.institution` | 14,168 | 8.0% |
| `complaints.victim_district` | 1,213 | 2.0% |
| `cashout_events.zone_id` (CENSORED) | 1,621 | 2.7% (intentional) |

---

## 12. EDGE-CASE COVERAGE

| Edge Case | Definition | Count | % |
|-----------|------------|-------|---|
| ZERO_HOP | No transaction hops at prediction time | 2,357 | 3.9% |
| LONG_CHAIN | 6+ hops | 4,890 | 8.2% |
| CROSS_STATE | Victim and cashout zones in different states | 56,925 | 94.9% |
| CROSS_REGION | Victim and cashout zones in different regions | 52,053 | 86.8% |
| SAME_ZONE | Victim zone = cashout zone | 527 | 0.9% |
| INTERVENTION | Complaint before cashout AND FROZEN | 2,638 | 4.4% |
| CENSORED | No confirmed cashout | 1,621 | 2.7% |
| VERY_SHORT_WINDOW | **last-hop→cashout < 5 min** | 3,346 | 5.6% |
| SHORT_WINDOW | last-hop→cashout 5–15 min | 18,585 | 31.0% |
| LONG_WINDOW | last-hop→cashout > 120 min | 3,352 | 5.6% |
| HOTSPOT_TARGET | Cashout zone type = Hotspot | 4,347 | 7.2% |

---

## 13. VALIDATION RESULT (post-patch)

**✅ 84 checks PASSED · 0 FAILED · 1 non-blocking warning**

| Section | Checks | Passed |
|---------|--------|--------|
| 1. ID Uniqueness | 6 | 6 |
| 2. Foreign Key Integrity | 6 | 6 |
| 3. Timestamp Ordering | 4 | 4 |
| 4. Leakage Prevention | 2 | 2 |
| 5. Target Validity | 2 | 2 |
| 6. Censored Bounds | 2 | 2 |
| 7. Coordinate Validity (observed only) | 8 | 8 |
| 8. Temporal Split Integrity | 10 | 10 |
| 9. Latent Feature Isolation | 6 | 6 |
| 10. Geographic Coverage | 5 | 5 |
| 11. Time-to-Event Coverage | 6 | 6 |
| 12. Missingness Rates | 3 | 3 |
| 13. Amount Validity | 4 | 4 |
| 14. Edge Case Coverage | 8 | 8 |
| **15. Censored Field Isolation (new)** | **10** | **10** |
| **16. Tier-E Entity Isolation (new)** | **2** | **2** |
| **TOTAL** | **84** | **84** |

**Non-blocking warning:** 1,558 cases with > 24h remaining at T0 — all CENSORED, observation-boundary timestamps, not bugs.

---

## 14. CANONICAL ROUNDTRIP (1,000 cases)

| Check | Result |
|-------|--------|
| Contexts built | 1,000/1,000 ✅ |
| IDs correct | 1,000/1,000 ✅ |
| available_time filter respected | 1,000/1,000 ✅ |
| Typology set | 1,000/1,000 ✅ |
| amount_inr in metadata | 1,000/1,000 ✅ |
| outcome_status valid | 1,000/1,000 ✅ |
| Censored → zone=None | 28/28 ✅ |
| Censored → event_observed=False | 28/28 ✅ |
| Observed → lat/lng in India bounds | 898/898 ✅ |
| Tier-E in train hops | **0** ✅ |
| **Total errors** | **0** |

---

## 15. OUTPUT FILES

```
data/synthetic_v2/
├── zone_catalog.csv              120 zones, full geographic hierarchy + lat/lng
├── typology_rules.csv            10 typologies
├── complaints.csv                60,000 complaint events
├── hops.csv                      176,915 transaction hop events
├── cashout_events.csv            60,000 outcome records
│                                 — CENSORED rows: zone/lat/lng = null (patch P2)
│                                 — event_timestamp = observation boundary (not real cashout)
├── accounts.csv                  103,086 accounts
├── mule_entities.csv             18,000 entities (patch P3: Tier-E corrected to 83)
├── generator_metadata.csv        LATENT ONLY — syndicate_id, tier, intended target zone
│                                 ⛔ NEVER pass to ML training or inference
├── v2_stats.json                 Machine-readable summary statistics
├── ui_test_cases.json            10 verified test cases with full zone metadata
└── splits/
    ├── train_{complaints,hops,cashout_events}.csv   39,220 / 116,031 / 39,220
    ├── val_{complaints,hops,cashout_events}.csv     10,412 / 30,592 / 10,412
    └── test_{complaints,hops,cashout_events}.csv   10,368 / 30,292 / 10,368

artifacts/registry/
└── rich_registry_v2.json         13,511 entries, train-only, clean temporal isolation
                                  ⚠️ DO NOT overwrite — this is the frozen V2 registry

config/synthetic_v2.yaml
scripts/synthetic_v2/
├── generate_synthetic_v2.py      Generator (frozen — do not modify without new version)
├── validate_synthetic_v2.py      84-check validator
├── bootstrap_registry_v2.py      Registry builder (train-only)
└── zone_catalog.py               120-zone catalog

tests/
└── test_synthetic_adapter.py     25 adapter tests (V1 + V2 regression)
```

---

## 16. GEOGRAPHIC M8 RETRAINING READINESS

| Requirement | Status |
|-------------|--------|
| Zone catalog (120 V2 zones, named, with lat/lng) | ✅ `data/synthetic_v2/zone_catalog.csv` |
| Train split (39,220 complaints, 116,031 hops) | ✅ `splits/train_*` |
| Registry (13,511 entries, train-only) | ✅ `artifacts/registry/rich_registry_v2.json` |
| No Tier-E in registry | ✅ |
| No val/test contamination in registry | ✅ 0 cross-split entries |
| zone_id is machine identifier (not zone_name string) | ✅ V2 zone IDs: `V2_ZID_001–V2_ZID_120` |
| Existing M8 architecture compatible | ✅ Same features, wider zone space |
| V1 registry untouched | ✅ `artifacts/models/rich_registry.json` preserved |
| Output artifact path | `artifacts/models/geographic_v2/` (new) |

---

## 17. TIME-TO-EVENT RETRAINING READINESS

| Requirement | Status |
|-------------|--------|
| Train split with valid snapshots | ✅ 51,734 usable hop snapshots in train |
| T0 snapshots (inc_time − 10 min) | ✅ 39,220 T0 snapshots |
| CENSORED → event_observed=False | ✅ SyntheticAdapter enforces this |
| Observation boundary timestamps preserved | ✅ event_timestamp / available_timestamp intact |
| All 10 canonical features derivable | ✅ hop_count, cumulative_amount, current_txn_amount, elapsed_since_first_txn, elapsed_since_prev_txn, prediction_hour, prediction_dayofweek, has_complaint, elapsed_since_incident, amount_retained_ratio |
| Temporal split (M1-4 / M5 / M6) | ✅ No test-set contamination |
| Existing architecture compatible | ✅ Dynamic Hazard + AFT + Quantile |
| V1 models untouched | ✅ `artifacts/models/timing/` preserved |
| Output artifact path | `artifacts/models/timing_v2/` (new) |

---

## 18. V1 PRESERVATION CHECKLIST

| Item | Status |
|------|--------|
| `data/synthetic/` (V1 data) | ✅ Untouched |
| `artifacts/models/rich_registry.json` | ✅ Untouched |
| `artifacts/models/trained_model_m8.json` | ✅ Untouched |
| `artifacts/models/timing/*.pkl` | ✅ Untouched |
| V1 adapter regression tests | ✅ All 25 pass |

---

## 19. NEXT STEPS (AWAITING APPROVAL)

1. **Retrain Geographic M8** on V2 train split  
   → Output: `artifacts/models/geographic_v2/`  
   → Use `data/synthetic_v2/splits/train_*` + `artifacts/registry/rich_registry_v2.json`

2. **Retrain Time-to-Event** on V2 train split  
   → Output: `artifacts/models/timing_v2/`  
   → CENSORED outcomes: `event_observed=False`, lower_bound = observed duration  
   → Use same `ml/timing/train_time_to_event.py` pointed at V2 splits

3. **Evaluate on V2 val/test** — compare vs V1 baselines before promoting

4. **Do not retrain until explicitly approved.**

---

*V2 frozen. No further dataset modifications without creating an explicitly versioned V2.x.*  
*Models have NOT been retrained. No commits pushed.*
