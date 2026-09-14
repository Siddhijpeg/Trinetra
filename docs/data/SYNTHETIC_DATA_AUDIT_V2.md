# TRINETRA — Synthetic Dataset V1 Audit
**Audit Date:** 2026-09-14  
**Purpose:** Baseline audit of the existing 40 k-case V1 dataset before designing Synthetic Dataset V2.  
**Auditor:** Automated pipeline inspection + statistical profiling.

---

## 1. EXISTING DATASET STRUCTURE

### File inventory — `data/synthetic/`

| File | Rows (data) | Size | Role |
|------|-------------|------|------|
| `complaints.csv` | 40,000 | 5.0 MB | One row per fraud case — the "complaint event" |
| `hops.csv` | 116,205 | 12 MB | Transaction edges (multi-hop money movement) |
| `cashout_events.csv` | 40,000 | 3.8 MB | Ground-truth outcome per complaint |
| `accounts.csv` | 64,209 | 3.3 MB | All accounts (24,209 mule + 40,000 victim) |
| `mule_entities.csv` | 10,793 | 244 KB | Latent mule actor clusters |
| `zones.csv` | 75 | 4 KB | Geographic zone metadata |
| `typology_rules.csv` | 6 | 4 KB | Fraud typology definitions |

### `data/synthetic/splits/`

| File | Rows |
|------|------|
| `train_complaints.csv` | 22,844 |
| `train_hops.csv` | 65,253 |
| `train_cashout_events.csv` | 22,844 |
| `val_complaints.csv` | 5,932 |
| `val_hops.csv` | 16,838 |
| `val_cashout_events.csv` | 5,932 |
| `test_complaints.csv` | 6,571 |
| `test_hops.csv` | 19,214 |
| `test_cashout_events.csv` | 6,571 |
| `test_special_splits.json` | known-mule case IDs |

**Note:** The `test_special_splits.json` contains IDs for cases with known-registry mule accounts, used for out-of-domain evaluation.

---

## 2. EXISTING COLUMNS

### `complaints.csv`
```
complaint_id          string   CMP_202600001 … CMP_202640000
typology_id           string   TYP_01 … TYP_06
typology_name         string   "OTP / KYC Fraud" etc.
amount_inr            float    ₹1,000 – ₹5,000,000
victim_state          string   e.g. "Punjab", "Maharashtra"
victim_district       string   zone_name used as proxy (not a real district field)
incident_timestamp    ISO str  2025-01-01 to 2025-06-30
complaint_timestamp   ISO str  incident + lognormal(2.0,1.0) hours lag
available_timestamp   ISO str  complaint + uniform(5,60) min lag
```

### `hops.csv`
```
hop_id                string   HOP_CMP_202600001_1
complaint_id          string   FK → complaints
hop_sequence          int      1 – 7
from_account          string   FK → accounts
to_account            string   FK → accounts
amount_transferred    float    ₹64 – ₹5,000,000
bank_channel          string   UPI | IMPS | NEFT
event_timestamp       ISO str  
available_timestamp   ISO str  event + uniform(15,120) min (bank feed lag)
```
**Missing from hops.csv:** no `latitude`, `longitude`, `zone_id`, `institution`, `cashout_zone` (column exists in adapter but not CSV — bug).

### `cashout_events.csv`
```
cashout_id            string   CSH_CMP_202600001
complaint_id          string   FK → complaints
final_account         string   FK → accounts
zone_id               string   e.g. "Z009"
location_id           string   ATM_Z009_018 (synthetic ATM ID)
amount_cashed_out     float    ₹0 (FROZEN) or original amount
status                string   COMPLETED | FROZEN
event_timestamp       ISO str  last hop time + lognormal(3.0,1.0) min
```
**Missing from cashout_events.csv:** no `available_timestamp`, no lat/lng.

### `accounts.csv`
```
account_id            string   ACC_000001 – ACC_064209
bank_name             string   HDFC | SBI | ICICI | Axis | PNB | Kotak | Paytm PB
is_mule               bool     True / False
entity_id             string   ENT_XXXXX (null for victim accounts)
created_timestamp     ISO str
```

### `mule_entities.csv`
```
entity_id             string   ENT_00001 – ENT_10793
syndicate_id          string   SYN_001 – SYN_120 (latent, not canonical)
operating_zone_id     string   zone_id where entity is "based"
```
**IMPORTANT:** `syndicate_id` is a latent generator construct — must never enter canonical inference schema.

### `zones.csv`
```
zone_id               string   Z001 – Z075
zone_name             string   10 named; 55 are "District-N" placeholders
state                 string   19 states represented
lat                   float    zone centroid latitude
lng                   float    zone centroid longitude
type                  string   Metro | Hotspot | Transit | General
```

---

## 3. CANONICAL MAPPING

The `SyntheticAdapter` maps CSVs → canonical events. **Three confirmed column name mismatches:**

| CSV column (actual) | Adapter expects | Impact |
|---------------------|----------------|--------|
| `cashout_events.zone_id` | `cashout_zone` | `OutcomeEvent.cashout_location` always None |
| `cashout_events.status` | `outcome_status` | `OutcomeEvent.outcome_status` always default "CASHOUT" |
| `complaints` has no `victim_zone` | `victim_zone` | `ComplaintEvent.victim_context.victim_zone` always "UNKNOWN" |

**V2 must fix these.** Options: rename CSV columns to match adapter, or update adapter to match actual CSV columns.

### Canonical event fields used at inference time

| Source | Canonical field | Used by |
|--------|----------------|---------|
| `hops.to_account` | `TransactionEvent.destination_entity.entity_id` | Geographic M8 registry lookup |
| `hops.amount_transferred` | `TransactionEvent.amount` | Timing feature: cumulative_amount |
| `hops.event_timestamp` | `TransactionEvent.event_time` | Timing feature: elapsed_since_first_txn |
| `hops.available_timestamp` | `TransactionEvent.available_time` | Leakage prevention filter |
| `complaints.typology_id` | `ComplaintEvent.typology` | M8 typology prior |
| `complaints.amount_inr` | `ComplaintEvent.metadata["amount_inr"]` | Timing feature: amount_retained_ratio |
| `complaints.incident_timestamp` | `ComplaintEvent.event_time` | Timing feature: elapsed_since_incident |
| `complaints.available_timestamp` | `ComplaintEvent.available_time` | Leakage prevention filter |
| `cashout_events.event_timestamp` | `OutcomeEvent.event_time` | Training target: remaining_minutes |

---

## 4. CURRENT GEOGRAPHIC RESOLUTION

**Single level only.** The "zone" is the atomic geographic unit. There is no hierarchy.

```
country     → India (implied, never stored)
zone_name   → "Gurugram" / "Mumbai" / "District-26"   ← sole geographic field
zone_id     → Z001 – Z075
state       → stored in zones.csv
lat/lng     → zone centroid only (zones.csv)
```

**What is absent:**
- No district-level field separate from zone_name
- No city field
- No locality / ATM-cluster field
- No lat/lng on individual hops (only zone centroid)
- No lat/lng on cashout_events
- No ATM coordinates (ATM IDs are synthetic: "ATM_Z009_018")
- No geohash or H3 index

---

## 5. CURRENT LATITUDE / LONGITUDE AVAILABILITY

| Table | lat/lng present? | Notes |
|-------|-----------------|-------|
| `zones.csv` | ✅ YES | Zone centroid only |
| `hops.csv` | ❌ NO | TransactionEvent.latitude/longitude fields exist in schema but never populated |
| `cashout_events.csv` | ❌ NO | No coordinates at all |
| `accounts.csv` | ❌ NO | — |
| `mule_entities.csv` | ❌ NO | Has operating_zone_id but no direct lat/lng |

**TransactionEvent** in `core/canonical/events.py` has `latitude: Optional[float]` and `longitude: Optional[float]` fields — these exist in schema but are never populated by V1 data.

---

## 6. CURRENT ZONE DISTRIBUTION

### Cashout zone frequencies (top 20 of 75):

| Rank | Zone ID | Zone Name | State | Type | Cases | % |
|------|---------|-----------|-------|------|-------|---|
| 1 | Z009 | Gurugram | Haryana | Metro | 2,550 | 6.4% |
| 2 | Z002 | Mumbai | Maharashtra | Metro | 2,376 | 5.9% |
| 3 | Z004 | Hyderabad | Telangana | Metro | 2,253 | 5.6% |
| 4 | Z005 | Chennai | Tamil Nadu | Metro | 2,151 | 5.4% |
| 5 | Z015 | Deoghar | Jharkhand | Hotspot | 2,020 | 5.1% |
| 6 | Z007 | Kolkata | West Bengal | Metro | 1,831 | 4.6% |
| 7 | Z010 | Noida | UP | Metro | 1,812 | 4.5% |
| 8 | Z003 | South Delhi | Delhi | Metro | 1,781 | 4.5% |
| 9 | Z006 | Pune | Maharashtra | Metro | 1,720 | 4.3% |
| 10 | Z001 | Bengaluru Urban | Karnataka | Metro | 1,619 | 4.0% |

**Top 12 zones account for 67% of all cashouts.** 43 zones (mostly "District-N") have negligible representation — some with fewer than 50 cases.

---

## 7. CURRENT STATE / DISTRICT DISTRIBUTION

### Victim states (complaints):
Punjab (10.5%), UP (9.6%), Rajasthan (9.4%), Jharkhand (9.2%), Karnataka (8.2%), Gujarat (6.8%), Bihar (6.8%), AP (6.5%), West Bengal (5.3%).

**Only 19 states represented in zones.csv.** Major gaps: Telangana listed for Hyderabad but no Telangana-origin victims, no Odisha, no Chhattisgarh zones in named list, no Northeast India zones beyond Assam/Guwahati.

### Cashout districts:
Effectively only 12–15 districts see meaningful cashout volume. The 55 "District-N" placeholder zones are barely distinguishable by the model.

---

## 8. CURRENT TIMING DISTRIBUTION

### Incident → Cashout (minutes):
```
min:    6 min
P10:   12 min
P25:   26 min
P50:   44 min (median)
P75:   73 min
P90:  107 min
P95:  140 min
max: 1,504 min
mean:  58 min
```
Generated as: `last_hop_time + lognormal(3.0, 1.0) min`. This produces a realistic short-window distribution but is missing a significant tail of >2-hour cases.

### Complaint available → Cashout (the intervention window):
Only **2.3%** of complaints are available to the system BEFORE the cashout occurs. This is extremely low — the model rarely sees cases where intervention is genuinely possible.

### Hop inter-arrival delay (event timestamps):
`lognormal(1.5, 1.2)` minutes. Median ~4.5 min, mean ~7 min. Fast chains.

### Hop available_timestamp lag (bank feed):
`uniform(15, 120)` minutes after hop event_time. P50 = ~67 min.

### Hour-of-day bias:
Incidents peak at hour ~14 (2 PM) drawn from N(14, 4). No weekend/weekday pattern.

---

## 9. CURRENT FRAUD-TYPE DISTRIBUTION

| Typology | Cases | % | avg_amount |
|----------|-------|---|-----------|
| TYP_06 Marketplace/OLX | 8,183 | 20.5% | ₹10,000 |
| TYP_04 Investment/Crypto | 7,396 | 18.5% | ₹500,000 |
| TYP_02 Fake Loan App | 6,706 | 16.8% | ₹15,000 |
| TYP_05 Sextortion | 6,325 | 15.8% | ₹40,000 |
| TYP_03 Part-Time Job | 6,005 | 15.0% | ₹120,000 |
| TYP_01 OTP/KYC Fraud | 5,385 | 13.5% | ₹25,000 |

Distribution is fairly balanced (13–21%) — no single type dominates, but important types are missing: Digital Arrest, SIM Swap, Romance Scam, Impersonation.

---

## 10. CURRENT ENTITY REUSE DISTRIBUTION

### Mule account destination appearances in hops:
```
min:    1
P25:    1
P50:    2
P75:    3
mean:   9.2
max:  555
```
**6,167 accounts appear exactly once** (50% single-use).  
**1,336 accounts appear >10 times** (10.6% of active mule accounts).  
Top account: 555 appearances.

**Distribution is Zipf-like** — realistic. But the heavy-hitters (top accounts) are so reused that M8 can trivially identify them. V2 should ensure high-recurrence entities have some geographic entropy too.

---

## 11. CURRENT COMPLAINT BEFORE/AFTER CASHOUT BEHAVIOR

| Metric | V1 value |
|--------|---------|
| Complaints available before cashout | 922 (2.3%) |
| Mean complaint lag from incident | ~11.7 h |
| Median complaint lag | ~7 h |
| Mean cashout delay from incident | 58 min |

**Critical problem:** In 97.7% of cases, the cashout has already occurred before TRINETRA even sees the complaint. The system theoretically can intervene using the transaction stream alone (without complaint), but the model never learns from cases where the complaint genuinely precedes the cashout.

**Root cause:** `complaint_lag ~ lognormal(2.0, 1.0) hours` (median ~7 h) vs `cashout_delay ~ lognormal(3.0, 1.0) min from last hop` (median ~44 min). V2 should include a significant fraction (target 20–30%) of "fast-filer" complaints with sub-1-hour lag.

---

## 12. CURRENT TRANSACTION HOP DISTRIBUTION

| Hops per complaint | Count | % |
|--------------------|-------|---|
| 1 | 10,226 | 25.6% |
| 2 | 9,911 | 24.8% |
| 3 | 8,895 | 22.2% |
| 4 | 5,728 | 14.3% |
| 5 | 3,568 | 8.9% |
| 6 | 1,984 | 5.0% |
| 7 | 688 | 1.7% |
| **Total** | **40,000** | |

Mean: 2.9 hops. **No 0-hop cases exist.** The generator always generates `max(1, Poisson(lam))`, so the minimum is 1. This means T0 always has at least 1 hop, which is unrealistic.

---

## 13. MISSING-DATA BEHAVIOR

V1 has essentially **no controlled missingness**. Every case has:
- All 9 complaint fields
- All 9 hop fields  
- channel is always populated (UPI/IMPS/NEFT)
- No missing amounts
- No partial-history entities

The only "missing" data is structural:
- `zone_id` on hops: always None (adapter bug)
- `victim_zone` in complaint context: always "UNKNOWN" (adapter bug)

**V2 must include controlled missingness** for: missing complaint, missing channel, missing institution, unknown entity, partial coordinates.

---

## 14. STRONG BIASES / OVERREPRESENTED GROUPS

1. **Top 3 zones (Gurugram, Mumbai, Hyderabad) = 18% of all cashouts** — any trivial model can predict "Gurugram" and be right 6.4% of the time.
2. **55/75 zones are "District-N" placeholders** — meaningless as distinguishable geographic signals.
3. **Victim states**: Punjab alone is 10.5% despite being a mid-size state; no South India victim states beyond Karnataka.
4. **FROZEN rate (1.3%)** is far too low to train meaningful censored survival models.
5. **Complaint timing**: 97.7% of cashouts pre-date complaint availability — system only ever evaluates in hindsight.
6. **Hour-of-day**: Gaussian peak at 14:00. No weekend/weekday variation, no monthly trends.
7. **Channel**: Perfectly uniform 33%/33%/33% — real-world UPI dominates.
8. **Bank names**: Only 7 banks for mule accounts; victim accounts only use 4 of those 7.

---

## 15. UNDERREPRESENTED CASES

1. **0-hop / upstream-trigger-only**: None. Real cases sometimes arrive with only the complaint.
2. **Very short intervention windows** (<5 min remaining): Very rare.
3. **Long intervention windows** (>3 hours remaining): Only ~5% of dataset.
4. **Cross-state transactions**: Generator has `inter_state_prob` per syndicate but no explicit cross-state hop routing.
5. **Completely unseen entities**: Every hop destination is a pre-generated mule account — no truly out-of-registry accounts.
6. **Rural/semi-urban zones**: Only 4 Transit zones; no explicitly rural areas.
7. **High-entropy entities** (same account used across multiple geographies): Most high-recurrence accounts are concentrated in 1–2 zones.
8. **Competing geographic zones** (cases where 2+ zones have similar probability): M8 gets very confident very quickly.
9. **Multiple simultaneous cashout zones** (split funds): No multi-cashout modeling.
10. **Right-censored cases**: Only 1.3% FROZEN outcomes.
11. **Northeast India**: Only Guwahati/Assam represented.
12. **Domestic wire (RTGS)**: Not present in channel list.

---

## 16. EDGE CASES CURRENTLY ABSENT

| Edge Case | Status in V1 |
|-----------|-------------|
| 0-hop upstream context | ❌ Absent |
| Complaint available before any hop | ❌ Absent |
| Same-city victim-to-cashout | ❌ Not modeled |
| Inter-state transfer chain (3+ states) | ❌ Not modeled |
| Geographically ambiguous case (entropy > 0.8) | ❌ Rare |
| Previously unseen entity (never in registry) | ❌ Absent — all are pre-generated |
| Entity changing geographic footprint over time | ❌ Absent |
| Entity with high geographic entropy | ❌ Rare |
| Rural cashout location | ❌ Essentially absent |
| Amount > ₹10L (RTGS-sized transfers) | ✅ Present but rare (<1%) |
| 5+ hop chain | ✅ Present (~7% of cases) |
| FROZEN / intervention-caught | ✅ Present but severely underrepresented (1.3%) |
| Sub-5-minute intervention window | ❌ Very rare |
| Missing channel metadata | ❌ Absent |
| Missing complaint context | ❌ Absent |

---

## 17. DATASET LIMITATIONS — SUMMARY

| Limitation | Severity | V2 Fix Required |
|------------|---------|----------------|
| 55/75 zones are "District-N" placeholders | 🔴 Critical | Replace with real Indian districts |
| Complaint-before-cashout rate only 2.3% | 🔴 Critical | Introduce "fast filer" cohort |
| FROZEN/intervention rate only 1.3% | 🔴 Critical | Realistic ~15% freeze/hold rate |
| No 0-hop cases | 🟠 High | Add upstream-trigger-only cases |
| No lat/lng on hops or cashout events | 🟠 High | Add ATM-level coordinates to zone catalog |
| SyntheticAdapter column mismatches | 🟠 High | Fix CSV column names to match adapter |
| No cashout available_timestamp | 🟠 High | Add to cashout_events |
| Top 3 zones dominate (18% combined) | 🟠 High | Cap max zone share, enforce minimum floor |
| Channel distribution perfectly uniform | 🟡 Medium | Realistic UPI > IMPS > NEFT |
| No geography below zone level | 🟡 Medium | Add locality/district hierarchy |
| No controlled missingness | 🟡 Medium | Inject structured missingness |
| No cross-state chain modeling | 🟡 Medium | Model inter-state movement explicitly |
| Only 6 typologies | 🟡 Medium | Add Digital Arrest, SIM Swap, Romance |
| No temporal patterns (weekday, monthly) | 🟡 Medium | Add realistic temporal variation |
| No truly unseen entities | 🟡 Medium | Reserve a fraction for test-only |

---

*This audit is the authoritative baseline for designing Synthetic Dataset V2.*  
*V2 generation script: `scripts/synthetic_v2/generate_synthetic_v2.py`*  
*V2 config: `config/synthetic_v2.yaml`*
