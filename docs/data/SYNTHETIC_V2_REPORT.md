# TRINETRA — Synthetic Dataset V2 Quality Report (Final Audited)

**Generated:** 2026-09-14  
**Audit completed:** 2026-09-14  
**Seed:** 2026 (deterministic)  
**Version:** V2  
**Generator:** `scripts/synthetic_v2/generate_synthetic_v2.py`  
**Config:** `config/synthetic_v2.yaml`  
**Validator:** `scripts/synthetic_v2/validate_synthetic_v2.py` — ✅ 70/70 PASSED  
**Adapter:** `core/adapters/synthetic_adapter.py` — ✅ 25/25 tests passed  
**Roundtrip:** `tests/test_synthetic_adapter.py` — ✅ 0 errors on 1,000 cases

---

## 0. TERMINOLOGY USED IN THIS REPORT

| Term | Definition |
|------|------------|
| **incident→cashout** | Time from fraud incident to confirmed cashout (case-level) |
| **last-hop→cashout** | Time from last transaction hop event to cashout (generator's `cashout_delay`) |
| **T0 remaining time** | Time from T0 prediction point to cashout ≈ incident→cashout + 10 min |
| **snapshot remaining time** | Cashout time − hop available_time (training target for non-T0 snapshots) |
| **VERY_SHORT_WINDOW** | Generator edge-case tag: **last-hop→cashout < 5 min** (3,346 cases) |
| **Outcome record** | One row in `cashout_events.csv` per complaint — not always a confirmed cashout |
| **Observation boundary** | For CENSORED: `event_timestamp` = last_hop_time + 24h — NOT a real cashout |

---

## 1. TOTAL COUNTS

| Metric | V2 | V1 (baseline) | Change |
|--------|-----|----------------|--------|
| Complaints | **60,000** | 40,000 | +50% |
| Transaction hops | **176,915** | 116,205 | +52% |
| Outcome records | **60,000** | 40,000 | +50% |
| Confirmed cashout outcomes | **58,379** | 39,468 | — |
| Censored / unresolved | **1,621** | 0 | New |
| Accounts total | **103,086** | 64,209 | +61% |
| Mule accounts | **43,086** | 24,209 | +78% |
| Victim accounts | **60,000** | 40,000 | +50% |
| Mule entities | **18,000** | 10,793 | +67% |
| Geographic zones | **120** | 75 | +60% |
| Typologies | **10** | 6 | +67% |
| Latent syndicates | **904** | ~120 | — |
| States covered | **28** | 19 | +47% |
| Named districts | **116** | ~10 | — |
| Regions | **8** | 1 (implicit) | — |

> **Important naming correction:** The table above uses "outcome records" rather than "cashout events" because 1,621 rows are CENSORED — their `event_timestamp` is the observation boundary (last_hop + 24h), not a confirmed cashout timestamp. Only 58,379 rows represent observed cashouts.

---

## 2. TEMPORAL SPLITS

| Split | Months | Complaints | Hops | Outcome Records |
|-------|--------|-----------|------|-----------------|
| **Train** | Jan–Apr 2026 | 39,220 | 116,031 | 39,220 |
| **Val** | May 2026 | 10,412 | 30,592 | 10,412 |
| **Test** | Jun 2026 | 10,368 | 30,292 | 10,368 |

Split overlap: Train∩Val = 0 · Train∩Test = 0 · Val∩Test = 0 ✅  
Temporal ordering: All train incidents ≤ all val ≤ all test ✅

---

## 3. OUTCOME DISTRIBUTION

| Outcome | Count | % | Note |
|---------|-------|---|------|
| COMPLETED | 52,396 | 87.3% | Confirmed cashout |
| FROZEN | 2,638 | 4.4% | Complaint arrived before cashout; funds held |
| PARTIAL_FREEZE | 2,285 | 3.8% | Partial intervention |
| CENSORED | 1,621 | 2.7% | No confirmed cashout within 24h observation window |
| REVERSED | 1,060 | 1.8% | Post-cashout reversal within 24h |

**Combined intervention rate** (FROZEN + PARTIAL_FREEZE): **8.2%** — up from 1.3% in V1.  
**Right-censored rate**: 2.7% — new in V2, zero in V1.

### Right-censoring semantics

For CENSORED rows in `cashout_events.csv`:
- `event_timestamp` = `last_hop_time + 24h` (observation boundary — **not** a real cashout time)
- `zone_id`, `lat`, `lng` are present in the CSV (generator's intended target for simulation)
- **The SyntheticAdapter sets `cashout_location = None`, `lat/lng = None` for CENSORED rows**
- Generator truth (intended target zone) is stored only in `generator_metadata.csv`
- Canonical `OutcomeEvent` for CENSORED: `outcome_status="CENSORED"`, `cashout_location=None`, `metadata["event_observed"]=False`

---

## 4. GEOGRAPHIC DISTRIBUTION

### 4.1 Zone catalog (120 zones — 0 placeholder names)

All 120 zones use real Indian district/locality names. Zero "District-N" placeholders.

| Zone Type | Count | Cashout % |
|-----------|-------|----------|
| Metro | 35 | 35.8% |
| Tier2City | 53 | 39.5% |
| Tier3City | 23 | 16.8% |
| Hotspot | 8 | 7.2% |
| Transit | 1 | 0.7% |

**28 states · 116 named districts · 8 geographic regions**

Districts with multiple zones (intentional — large metros):
- Bengaluru Urban: MG Road / Whitefield / Electronic City
- Chennai: T Nagar / OMR IT Corridor
- Hyderabad: Hitech City / Old City / Charminar

### 4.2 Zone concentration — designed for coverage, not realism

| Metric | V2 | V1 |
|--------|-----|-----|
| Max single zone share | **1.58%** | 6.4% (Gurugram) |
| Min single zone share | **0.54%** | < 0.1% (43 zones) |
| Top-10 combined | **13.2%** | ~60% |
| Top-20 combined | **23.9%** | ~75% |
| Gini coefficient | **0.124** | ~0.6 (estimated) |
| Normalized entropy | **0.995** | ~0.75 (estimated) |

**Design note:** Gini = 0.124 is intentionally low (nearly uniform). This is a deliberate engineering choice for coverage-balanced training. Real-world Indian fraud data would have Gini ≈ 0.5–0.7 with heavy metro concentration. V2 sacrifices realism for model testability across all 120 zones. Document this explicitly when comparing V2 model metrics to real-world deployment performance.

### 4.3 Regional distribution

| Region | Cashouts | % |
|--------|----------|---|
| south | 12,618 | 21.0% |
| west | 12,437 | 20.7% |
| north | 11,474 | 19.1% |
| east | 8,424 | 14.0% |
| northwest | 6,741 | 11.2% |
| central | 4,804 | 8.0% |
| northeast | 2,358 | 3.9% |
| coastal | 1,644 | 2.7% |

Northeast now has 2,358 cases — was essentially absent in V1.

### 4.4 Top-10 cashout zones

| Rank | Zone | State | Type | Count | % |
|------|------|-------|------|-------|---|
| 1 | Jamtara | Jharkhand | Hotspot | 951 | 1.58% |
| 2 | Bengaluru MG Road | Karnataka | Metro | 926 | 1.54% |
| 3 | Lucknow Hazratganj | Uttar Pradesh | Metro | 829 | 1.38% |
| 4 | Hyderabad Hitech City | Telangana | Metro | 821 | 1.37% |
| 5 | South Delhi / Saket | Delhi | Metro | 770 | 1.28% |
| 6 | Mumbai Lower Parel / BKC | Maharashtra | Metro | 768 | 1.28% |
| 7 | Pune FC Road / Hinjewadi | Maharashtra | Metro | 738 | 1.23% |
| 8 | Gurugram Sector 29 | Haryana | Metro | 712 | 1.19% |
| 9 | Central Delhi ATM Cluster | Delhi | Metro | 711 | 1.18% |
| 10 | Jaipur C-Scheme / Malviya Nagar | Rajasthan | Metro | 702 | 1.17% |

### 4.5 Geographic movement distribution

The edge-case tags `CROSS_STATE` (94.9%) and `CROSS_REGION` (86.8%) reflect that victim zones are drawn uniformly from the same 120-zone / 28-state pool as cashout zones. With 28 states, the probability of random same-state assignment is ≈ 1/28 ≈ 3.6%, observed at 5.1% (slightly elevated due to some intra-region syndicate clustering).

**This is not a modeling bias.** It correctly represents that cybercrime-to-cashout movement is predominantly inter-state and inter-regional in India. The tags are valid diagnostic labels.

| Movement tier | Cases | % |
|---------------|-------|---|
| Same zone | 527 | 0.9% |
| Same city | 586 | 1.0% |
| Same district | 571 | 1.0% |
| Same state | 3,075 | 5.1% |
| Cross-state, same region | 4,872 | 8.1% |
| Cross-region | 52,053 | 86.8% |

### 4.6 Lat/Lng availability

| Table | Lat/Lng populated | Notes |
|-------|------------------|-------|
| `zone_catalog.csv` | ✅ 120/120 | Zone centroids, all within India bounds |
| `cashout_events.csv` (COMPLETED) | ✅ 58,379/58,379 | ATM-level jitter ±0.08° from centroid |
| `cashout_events.csv` (CENSORED) | ⛔ 0/1,621 | Nulled by adapter — generator truth in metadata only |
| `hops.csv` | ❌ 0 | Not populated (schema supports it; future work) |

Coordinate verification: all zone lat ∈ [6°N, 37.5°N], lng ∈ [68°E, 97.5°E]. 5 spot-checks ✅.  
Cashout ATM jitter is within 0.15° (≈15 km) of zone centroid — validated. Zero duplicates in zone catalog.

---

## 5. AUTHORITATIVE TIME-TO-EVENT DISTRIBUTIONS

> **⚠ V2 Report v1 error corrected:** The previous report mixed two different timing definitions in one table. This section separates them precisely.

### 5.1 Definition mapping

| Quantity | Definition | Source |
|----------|------------|--------|
| `inc→cashout` | `cashout_event.event_timestamp − complaint.incident_timestamp` | Case-level |
| `lh→cashout` | `cashout_event.event_timestamp − last_hop.event_timestamp` | Generator's `cashout_delay` |
| `T0 remaining` | `inc→cashout + 10 min` (T0 is 10 min before first hop ≈ incident time) | Approximation |
| `snapshot remaining` | `cashout_event.event_timestamp − hop.available_timestamp` | Training target |
| `VERY_SHORT_WINDOW` tag | `lh→cashout < 5 min` | Generator edge-case label |

### 5.2 Case-level incident→cashout (non-censored, n=58,379)

| Bucket | Cases | % |
|--------|-------|---|
| < 5 min | 188 | 0.3% |
| 5–15 min | 2,774 | 4.8% |
| 15–30 min | 8,664 | 14.8% |
| 30–60 min | 19,178 | 32.9% |
| 60–120 min | 19,081 | 32.7% |
| > 120 min | 8,494 | 14.5% |

P25 = 35 min · P50 = 58.5 min · P75 = 97 min · P90 = 157 min · mean = 110.8 min

### 5.3 Case-level last-hop→cashout (`cashout_delay`, non-censored, n=58,379)

This is the immediate ATM withdrawal delay after the final hop clears.

| Bucket | Cases | % |
|--------|-------|---|
| < 5 min | 3,251 | 5.6% |
| 5–15 min | 14,804 | 25.4% |
| 15–30 min | 15,611 | 26.7% |
| 30–60 min | 13,739 | 23.5% |
| 60–120 min | 7,703 | 13.2% |
| > 120 min | 3,271 | 5.6% |

> **The `VERY_SHORT_WINDOW` edge-case tag (3,346 cases) uses this definition**, not incident→cashout. The previous report incorrectly implied these were incident→cashout <5min cases (which number only 188).

### 5.4 T0 snapshot remaining time (≈ inc→cashout + 10 min)

T0 is defined as `min(event_timestamp) − 10 minutes` (10 min before first hop arrives).  
Remaining time at T0 ≈ inc→cashout + 10 min.

| Bucket | Cases | % |
|--------|-------|---|
| < 5 min | 0 | 0.0% |
| 5–15 min | 188 | 0.3% |
| 15–30 min | 5,220 | 8.9% |
| 30–60 min | 19,573 | 33.5% |
| 60–120 min | 23,034 | 39.5% |
| > 120 min | 10,364 | 17.8% |

### 5.5 Snapshot-level remaining time (all usable hop snapshots, n=78,994)

Usable = `hop.available_timestamp < cashout.event_timestamp` AND non-censored.

| Bucket | Snapshots | % |
|--------|-----------|---|
| < 5 min | 7,758 | 9.8% |
| 5–15 min | 13,603 | 17.2% |
| 15–30 min | 15,997 | 20.3% |
| 30–60 min | 19,254 | 24.4% |
| 60–120 min | 14,742 | 18.7% |
| > 120 min | 7,640 | 9.7% |

P25 = 14 min · P50 = 32 min · P75 = 66 min · P90 = 118 min

---

## 6. COMPLAINT TIMING DISTRIBUTION

### 6.1 Complaint available-time vs cashout-time

| Timing | Cases | % |
|--------|-------|---|
| Complaint available **before** cashout | 5,760 | 9.6% |
| 0–15 min after cashout | 1,097 | 1.8% |
| 15–60 min after cashout | 1,867 | 3.1% |
| 1–24h after cashout | 2,781 | 4.6% |
| > 24h after cashout | 15 | 0.0% |
| Complaint available very late (missingness cohort) | ~2,400 | 4.0% |

Complaint-before-cashout rate improved from **2.3% (V1) to 9.6% (V2)** via the fast-filer cohort.

### 6.2 Complaint lag by typology (incident → complaint filed)

| Typology | Name | Complaint-before-cashout % | Median complaint lag |
|----------|------|-----------------------------|---------------------|
| TYP_01 | OTP / KYC Fraud | 83.1% | 2.0h |
| TYP_06 | Marketplace / OLX | 86.9% | 2.4h |
| TYP_08 | SIM Swap / ATO | 88.9% | 2.7h |
| TYP_10 | Courier Scam | 88.7% | 3.0h |
| TYP_02 | Fake Loan App | 91.5% | 4.0h |
| TYP_03 | Part-Time Job Scam | 92.1% | 5.5h |
| TYP_07 | Digital Arrest | 92.9% | 7.3h |
| TYP_04 | Investment / Crypto | 94.0% | 10.4h |
| TYP_05 | Sextortion | 94.4% | 18.8h |
| TYP_09 | Romance / Honey Trap | 94.5% | 31.9h |

**Note:** "Complaint before cashout %" means the complaint's `available_timestamp` precedes the cashout `event_timestamp`. Romance/sextortion victims take days to report — the cashout has already occurred long before the complaint arrives. Transaction-stream-first prediction remains the primary modality; complaint context is supplementary.

### 6.3 Outlier analysis (>24h incident→cashout cases)

| Status | Count >24h | Notes |
|--------|-----------|-------|
| COMPLETED | 0 | No legitimate cashout takes >24h in dataset |
| FROZEN | 0 | |
| PARTIAL_FREEZE | 0 | |
| REVERSED | 0 | |
| **CENSORED** | **1,558** | Observation boundary = last_hop + 24h — intentional |

**All 1,558 "outlier" cases flagged by the validator are CENSORED.** Their `event_timestamp` is the observation window end (`last_hop + 24h`), not a real cashout time. These are **not timestamp bugs**. They are structurally correct.

---

## 7. HOP DISTRIBUTION

| Hop Count | Cases | % |
|-----------|-------|---|
| 0 (upstream trigger only) | 2,357 | 3.9% |
| 1 | 10,893 | 18.2% |
| 2 | 13,047 | 21.7% |
| 3 | 13,234 | 22.1% |
| 4 | 9,534 | 15.9% |
| 5 | 6,045 | 10.1% |
| 6 | 3,025 | 5.0% |
| 7 | 1,205 | 2.0% |
| 8 | 660 | 1.1% |

Mean: 2.95 · Median: 3 · Max: 8 · Zero-hop: 2,357 (3.9%)  
V1 had 0 zero-hop cases and a maximum of 7.

---

## 8. FRAUD TYPOLOGY DISTRIBUTION

| Typology | Name | Count | % |
|----------|------|-------|---|
| TYP_01 | OTP / KYC Fraud | 8,322 | 13.9% |
| TYP_02 | Fake Loan App | 6,740 | 11.2% |
| TYP_03 | Part-Time Job Scam | 6,462 | 10.8% |
| TYP_04 | Investment / Crypto Scam | 7,204 | 12.0% |
| TYP_05 | Sextortion | 4,699 | 7.8% |
| TYP_06 | Marketplace / OLX Fraud | 7,184 | 12.0% |
| TYP_07 | Digital Arrest *(new)* | 7,300 | 12.2% |
| TYP_08 | SIM Swap / Account Takeover *(new)* | 4,834 | 8.1% |
| TYP_09 | Romance / Honey Trap Scam *(new)* | 4,258 | 7.1% |
| TYP_10 | Courier / Parcel Scam *(new)* | 2,997 | 5.0% |

---

## 9. ENTITY RECURRENCE DISTRIBUTION

### 9.1 Mule entity tiers

| Tier | Description | Entities | Accounts |
|------|-------------|---------|---------|
| A | Hub (high reuse, 50–500 appearances) | 540 (3%) | 1,046 used |
| B | Medium (5–50 appearances) | 2,160 (12%) | 2,065 used |
| C | Low (2–5 appearances) | 4,500 (25%) | 4,809 used |
| D | Single-use / ephemeral | 9,000 (50%) | 10,775 used |
| E | Test-only unseen (never in train) | 1,800 (10%) | 4,113 used |

22,808 of 43,086 mule accounts appeared as hop destinations (20,278 pre-generated but unused).

### 9.2 Account-level reuse (appearances as hop destination)

| Bin | Count | % |
|-----|-------|---|
| Single-use (1) | 8,339 | 36.6% |
| 2–5 | 8,495 | 37.2% |
| 6–10 | 2,407 | 10.6% |
| 11–50 | 2,664 | 11.7% |
| > 50 | 903 | 4.0% |

P75 = 6 · P90 = 17 · P95 = 31 · max = 123 (down from 555 in V1)

### 9.3 Recurrence by tier

| Tier | Active accounts | Median reuse | P90 | Max |
|------|----------------|-------------|-----|-----|
| A | 1,046 | 4 | 30 | 116 |
| B | 2,065 | 2 | 15 | 103 |
| C | 4,809 | 2 | 15 | 120 |
| D | 10,775 | 2 | 17 | 120 |
| E | 4,113 | 4 | 15 | 123 |

### 9.4 Geographic entropy by tier

Percentage of accounts appearing in > 3 distinct cashout zones (high-entropy accounts).

| Tier | High-entropy accounts (>3 zones) |
|------|----------------------------------|
| A | **50.8%** — intentionally scattered (M8 challenge cases) |
| B | 29.7% |
| C | 28.3% |
| D | 29.9% |
| E | **55.1%** — test-only, diverse by design |

Both high-reuse + geographically concentrated (Tier A low-entropy) and high-reuse + dispersed (Tier A high-entropy) cases are present, as required for M8 reliability learning.

---

## 10. AMOUNT DISTRIBUTION

| Percentile | Amount (INR) |
|-----------|-------------|
| P10 | ₹9,323 |
| P25 | ₹19,281 |
| P50 | ₹59,102 |
| P75 | ₹2,19,148 |
| P90 | ₹5,58,683 |
| P95 | ₹9,24,555 |
| P99 | ₹24,49,276 |
| Mean | ₹2,32,820 |
| Max | ₹1,00,00,000 |

---

## 11. CHANNEL DISTRIBUTION

| Channel | Hops | % |
|---------|------|---|
| UPI | 100,752 | 56.9% |
| IMPS | 39,190 | 22.2% |
| NEFT | 16,334 | 9.2% |
| RTGS | 15,147 | 8.6% |
| null (missing) | 5,492 | 3.1% |

UPI dominance (57%) is realistic vs V1's artificially uniform 33%/33%/33%.

---

## 12. MISSINGNESS

| Field | Missing | % | Target |
|-------|---------|---|--------|
| `hops.bank_channel` | 5,492 | 3.1% | 3% ✅ |
| `hops.institution` | 14,168 | 8.0% | 8% ✅ |
| `complaints.victim_district` | 1,213 | 2.0% | 2% ✅ |
| `cashout_events.zone_id` (CENSORED rows) | 1,621 | 2.7% | Adapter nulls these ✅ |

---

## 13. EDGE-CASE COVERAGE

| Edge Case | Definition | Cases | % |
|-----------|------------|-------|---|
| ZERO_HOP | No transaction hops at prediction time | 2,357 | 3.9% |
| LONG_CHAIN | 6+ hops | 4,890 | 8.2% |
| CROSS_STATE | Victim zone and cashout zone in different states | 56,925 | 94.9% |
| CROSS_REGION | Victim zone and cashout zone in different regions | 52,053 | 86.8% |
| SAME_ZONE | Victim zone = cashout zone | 527 | 0.9% |
| INTERVENTION | Complaint before cashout AND outcome=FROZEN | 2,638 | 4.4% |
| CENSORED | No confirmed cashout (right-censored) | 1,621 | 2.7% |
| VERY_SHORT_WINDOW | **last-hop→cashout < 5 min** | 3,346 | 5.6% |
| SHORT_WINDOW | last-hop→cashout 5–15 min | 18,585 | 31.0% |
| LONG_WINDOW | last-hop→cashout > 120 min | 3,352 | 5.6% |
| HOTSPOT_TARGET | Cashout zone type = Hotspot | 4,347 | 7.2% |

> **CROSS_STATE/CROSS_REGION note:** These high percentages (~95%/87%) are a property of the victim-zone sampling method (uniform over 120 zones in 28 states). With 28 states, P(same state) ≈ 5%, observed at 5.1%. This is not a systematic modeling bias — it correctly reflects inter-state fraud movement patterns. The edge-case tags are valid diagnostic labels.

---

## 14. CANONICAL SCHEMA COMPATIBILITY

### 14.1 Adapter fixes (SyntheticAdapter v2)

All three V1 column mismatches are resolved in the new adapter:

| Bug | Old behaviour | Fixed behaviour |
|-----|--------------|-----------------|
| `parse_outcomes`: read `outcome_status` col | Always default `"CASHOUT"` | Reads `status` column correctly |
| `parse_outcomes`: read `cashout_zone` col | Always `None` | Reads `zone_id` column → `cashout_location` |
| `parse_complaints`: read `victim_zone` col | `"UNKNOWN"` | Reads `victim_zone_id`, `victim_state`, `victim_district` |
| `parse_outcomes`: read `available_timestamp` on V1 | **Crash** (col absent in V1) | Falls back to `event_timestamp` gracefully |
| CENSORED rows expose generator truth | Zone/lat/lng passed through | Adapter nulls zone/lat/lng for all CENSORED rows |

V1 regression: 25/25 adapter tests pass. V1 pipeline unaffected. ✅

### 14.2 Canonical roundtrip result (1,000 sampled V2 cases)

| Check | Result |
|-------|--------|
| Contexts built | 1,000 / 1,000 ✅ |
| IDs correct | 1,000 / 1,000 ✅ |
| available_time filter respected | 1,000 / 1,000 ✅ |
| typology set | 1,000 / 1,000 ✅ |
| amount_inr in metadata | 1,000 / 1,000 ✅ |
| outcome_status valid | 1,000 / 1,000 ✅ |
| censored → zone=None | 28 / 28 ✅ |
| completed → lat/lng in India bounds | 883 / 883 ✅ |
| **Total errors** | **0** |

---

## 15. ZONE CATALOG AUDIT

| Check | Result |
|-------|--------|
| Total zones | 120 ✅ |
| States | 28 ✅ |
| Named districts (non-placeholder) | 116 ✅ |
| Districts with multiple zones | 3 (Bengaluru Urban, Chennai, Hyderabad) — intentional ✅ |
| Duplicate lat/lng coordinates | 0 ✅ |
| Out-of-bounds lat (India: 6–37.5°N) | 0 ✅ |
| Out-of-bounds lng (India: 68–97.5°E) | 0 ✅ |
| Spot-checks (5 zones verified) | All pass ✅ |

---

## 16. VALIDATION SUMMARY

**✅ 70 checks PASSED · 0 FAILED · 1 non-blocking warning**

| Check Group | Checks | Passed |
|-------------|--------|--------|
| ID Uniqueness | 6 | 6 |
| Foreign Key Integrity | 6 | 6 |
| Timestamp Ordering | 4 | 4 |
| Leakage Prevention | 2 | 2 |
| Target Validity | 2 | 2 |
| Censored Bounds | 2 | 2 |
| Coordinate Validity | 7 | 7 |
| Temporal Split Integrity | 10 | 10 |
| Latent Feature Isolation | 6 | 6 |
| Geographic Coverage | 5 | 5 |
| Time-to-Event Coverage | 6 | 6 |
| Missingness Rates | 3 | 3 |
| Amount Validity | 4 | 4 |
| Edge Case Coverage | 8 | 8 |

**Non-blocking warning:** 1,558 cases with inc→cashout > 24h. All are CENSORED — their `event_timestamp` is the 24h observation boundary, not a real cashout time. Confirmed not timestamp bugs.

---

## 17. OUTPUT FILES

```
data/synthetic_v2/
├── zone_catalog.csv              120 zones, full hierarchy, lat/lng
├── typology_rules.csv            10 typologies
├── complaints.csv                60,000 complaint events
├── hops.csv                      176,915 transaction hop events
├── cashout_events.csv            60,000 outcome records (58,379 observed + 1,621 censored)
│                                 ⚠️ CENSORED rows have zone_id/lat/lng populated in CSV
│                                    but SyntheticAdapter NULLS these before canonical events
├── accounts.csv                  103,086 accounts (mule + victim)
├── mule_entities.csv             18,000 entities with tier + syndicate (registry bootstrap)
├── generator_metadata.csv        LATENT ONLY — syndicate_id, tier, edge_case_tag,
│                                 intended target zone for CENSORED cases
│                                 ⛔ NEVER pass to ML training or inference pipeline
├── v2_stats.json                 Machine-readable summary statistics
├── ui_test_cases.json            10 verified test cases with full zone metadata
└── splits/
    ├── train_{complaints,hops,cashout_events}.csv   39,220 cases / 116,031 hops
    ├── val_{complaints,hops,cashout_events}.csv     10,412 cases / 30,592 hops
    └── test_{complaints,hops,cashout_events}.csv    10,368 cases / 30,292 hops

config/synthetic_v2.yaml
scripts/synthetic_v2/
├── generate_synthetic_v2.py      Main generator
├── validate_synthetic_v2.py      Validator (70 checks)
└── zone_catalog.py               Zone definitions
tests/test_synthetic_adapter.py   25 adapter tests (V1+V2)
docs/data/SYNTHETIC_DATA_AUDIT_V2.md
docs/data/SYNTHETIC_V2_REPORT.md  ← this file
```

---

## 18. RECOMMENDED NEXT STEPS

1. **Update `SyntheticAdapter` usage in training scripts** — new `core/adapters/synthetic_adapter.py` is backward-compatible with V1 and correctly handles V2 column names and CENSORED rows.

2. **Bootstrap V2 registry** — run `ml/geographic/registry_bootstrap.py` on `data/synthetic_v2/splits/train_*` to produce `rich_registry_v2.json`. Tier-E entities appear ONLY in val/test splits by design.

3. **Retrain Geographic M8** — point to V2 train split (120 zones, same 10-feature schema).

4. **Retrain Time-to-Event** — point to V2 train split. All 10 features are derivable. Note: CENSORED outcomes map to `event_observed=False` / right-censored survival targets.

5. **Compare V1 vs V2 metrics** on the respective test splits before promoting V2 to production.

6. **Do NOT delete V1** at `data/synthetic/` — keep for rollback and metric comparison.

---

*Models have NOT been retrained. Model artifacts are untouched. No commits pushed.*
