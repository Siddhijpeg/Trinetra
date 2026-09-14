TRINETRA Data Dictionary

This document outlines the final schema for the TRINETRA synthetic dataset. It maintains the 8-table structure from the prototype but extends fields to support temporal validity, leakage prevention, and model sequential processing.

## 1. COMPLAINTS (Table: `complaints.csv`)
Base table representing a registered cyber-financial fraud complaint.
| FIELD | TYPE | MEANING |
| --- | --- | --- |
| `complaint_id` | STRING | Unique ID (e.g., `CMP_1001`) |
| `typology_id` | STRING | Fraud Typology FK |
| `typology_name` | STRING | Readable fraud type |
| `amount_inr` | FLOAT | Total defrauded amount |
| `victim_state` | STRING | Victim's geographic state |
| `victim_district` | STRING | Victim's geographic district |
| `incident_timestamp` | DATETIME | Time the fraud actually occurred |
| `complaint_timestamp` | DATETIME | Time the victim filed the complaint |
| `available_timestamp` | DATETIME | Time the record becomes available to TRINETRA |

## 2. HOPS (Table: `hops.csv`)
Represents the money movement edges between bank accounts.
| FIELD | TYPE | MEANING |
| --- | --- | --- |
| `hop_id` | STRING | Unique ID for the transaction leg |
| `complaint_id` | STRING | FK to complaints |
| `hop_sequence` | INT | Sequential order (1, 2, 3...) |
| `from_account` | STRING | FK to accounts |
| `to_account` | STRING | FK to accounts |
| `amount_transferred` | FLOAT | Amount moved in this leg |
| `bank_channel` | STRING | Transfer method (UPI, IMPS, NEFT) |
| `event_timestamp` | DATETIME | Real-world time of transaction |
| `available_timestamp` | DATETIME | Time the bank feed reaches TRINETRA |

## 3. ACCOUNTS (Table: `accounts.csv`)
Represents financial accounts identified in the network.
| FIELD | TYPE | MEANING |
| --- | --- | --- |
| `account_id` | STRING | Unique ID |
| `bank_name` | STRING | Associated financial institution |
| `is_mule` | BOOLEAN | Synthetic Ground Truth flag |
| `entity_id` | STRING | FK to `mule_entities` if clustered |
| `created_timestamp` | DATETIME | Time the account entered TRINETRA's view |

## 4. CASHOUT_EVENTS (Table: `cashout_events.csv`)
**LABEL DATA.** Represents the final withdrawal or freeze outcome.
| FIELD | TYPE | MEANING |
| --- | --- | --- |
| `cashout_id` | STRING | Unique ID |
| `complaint_id` | STRING | FK to complaints |
| `final_account` | STRING | The account money was pulled from |
| `zone_id` | STRING | FK to zones (The Target Label) |
| `location_id` | STRING | FK to ATM/Branch infrastructure |
| `amount_cashed_out` | FLOAT | Actual withdrawn amount |
| `status` | STRING | `COMPLETED`, `FROZEN`, `PARTIAL` |
| `event_timestamp` | DATETIME | Time of the cashout / freeze |

## 5. MULE_ENTITIES (Table: `mule_entities.csv`)
Represents human actors or organized clusters controlling multiple accounts.
| FIELD | TYPE | MEANING |
| --- | --- | --- |
| `entity_id` | STRING | Unique ID |
| `syndicate_id` | STRING | FK to the latent syndicate (generator only) |
| `operating_zone_id` | STRING | Primary geographic base |

## 6. ZONES (Table: `zones.csv`)
Geospatial bounding areas (Districts / Clusters).
| FIELD | TYPE | MEANING |
| --- | --- | --- |
| `zone_id` | STRING | Unique ID |
| `zone_name` | STRING | Readable Name |
| `state` | STRING | State / Province |
| `lat` | FLOAT | Latitude |
| `lng` | FLOAT | Longitude |

## 7. ATMS_AND_CASHOUTS (Table: `atms_and_cashouts.csv`)
Physical infrastructure points inside Zones.
| FIELD | TYPE | MEANING |
| --- | --- | --- |
| `location_id` | STRING | Unique ID |
| `zone_id` | STRING | FK to zones |
| `type` | STRING | ATM, PoS, Branch |
| `lat` | FLOAT | Latitude |
| `lng` | FLOAT | Longitude |

## 8. TYPOLOGY_RULES (Table: `typology_rules.csv`)
Metadata about fraud classes.
| FIELD | TYPE | MEANING |
| --- | --- | --- |
| `typology_id` | STRING | Unique ID |
| `name` | STRING | Name (e.g., OTP Fraud) |
# 