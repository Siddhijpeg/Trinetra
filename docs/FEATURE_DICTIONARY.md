# TRINETRA Feature Dictionary

This document details the features engineered for the predictive models (Gradient Boosting & Bayesian Updater). 
**CRITICAL RULE:** All historical features are computed **AS OF TIME (T)** to prevent target leakage.

## 1. CASE FEATURES (Available at T=0)
| FEATURE | TYPE | DESCRIPTION |
| --- | --- | --- |
| `fraud_type_encoded` | Categorical | Typology ID (e.g., Investment Scam) |
| `amount_log` | Continuous | Log(amount_inr) |
| `victim_state_encoded` | Categorical | State where the complaint was filed |
| `complaint_hour` | Continuous | 0-23 hour of the day |
| `complaint_dayofweek` | Continuous | 0-6 day of the week |

## 2. TRANSACTION FEATURES (Available at T=Hop_N)
| FEATURE | TYPE | DESCRIPTION |
| --- | --- | --- |
| `hop_index` | Continuous | Current depth in the transaction chain (1, 2, 3...) |
| `velocity_mins` | Continuous | Time elapsed since the previous hop |
| `time_since_incident` | Continuous | Time elapsed since the original fraud event |
| `amount_retained_ratio` | Continuous | (Current Hop Amount) / (Original Fraud Amount) |
| `bank_changed` | Boolean | Did the money move to a different bank? |

## 3. AS-OF-TIME ACCOUNT FEATURES (Available at T=Hop_N)
| FEATURE | TYPE | DESCRIPTION |
| --- | --- | --- |
| `to_account_historical_flags` | Continuous | Number of times this account appeared in previous complaints (where `available_timestamp < current_hop.available_timestamp`) |
| `to_account_known_mule` | Boolean | Has this account been flagged as a mule BEFORE this timestamp? |
| `entity_prior_complaints` | Continuous | Number of prior complaints tied to this account's broader Entity cluster |

## 4. NETWORK & GEO FEATURES (Available at T=Hop_N)
| FEATURE | TYPE | DESCRIPTION |
| --- | --- | --- |
| `node_degree_in` | Continuous | Total unique incoming connections to this account (As of T) |
| `node_degree_out` | Continuous | Total unique outgoing connections from this account (As of T) |
| `historical_zone_prob` | Continuous | The historical probability of cash-out in each zone given this Typology (Computed only on training data). |
