# TRINETRA Real-World Data Mapping

This document answers the critical operational question: *Where would TRINETRA get this data in a real deployment?*

| SYNTHETIC TABLE / FIELD | REAL-WORLD DATA SOURCE | WHEN IS IT AVAILABLE? |
| --- | --- | --- |
| **`complaints.csv`** | | |
| `typology_name`, `amount_inr` | NCRP API / State Cyber Cell Feed | At T=0 (Complaint Filed) |
| `victim_state`, `incident_timestamp` | NCRP API | At T=0 |
| **`hops.csv`** | | |
| `from_account`, `to_account` | Bank FIU / Section 91 notices | As bank responses arrive (T=Hop) |
| `amount_transferred` | Bank Transaction Ledgers | As bank responses arrive (T=Hop) |
| `event_timestamp` | Bank Core Banking System (CBS) | As bank responses arrive (T=Hop) |
| **`accounts.csv`** | | |
| `bank_name` | Derived from IFSC code in bank feed | At T=Hop |
| `is_mule` | Internal TRINETRA Investigator flags | Sourced historically / MLOps |
| **`cashout_events.csv`** (LABEL) | | |
| `zone_id` (Target) | Final Police Investigation Report | **POST-EVENT (Labels only)** |
| `amount_cashed_out` | Bank Freeze Rejection / ATM Logs | **POST-EVENT (Labels only)** |
| `status` (FROZEN vs COMPLETED)| Bank Action Report | **POST-EVENT (Labels only)** |
| **`zones.csv`** | | |
| `lat`, `lng`, `district` | Govt Census / Geo-Spatial boundaries | Static / Pre-loaded |
| **`mule_entities.csv`** | | |
| `entity_id` | Generated via Graph Analytics (Shared devices, IPs) | Computed retrospectively |

## Important Architectural Notes
1. **The Model NEVER sees `cashout_events.csv` at inference time.** This table is strictly used to evaluate the model's prediction of `zone_id`.
2. **`available_timestamp`** simulates the real-world bureaucratic delay between a transaction happening at a bank, the police requesting it, and the bank sending the PDF/API response back to TRINETRA.
