# TRINETRA Data Provenance

This document tracks how the synthetic data is generated to ensure statistical realism without falling into trivial determinism.

## 1. Latent Syndicate Logic
The synthetic world is driven by **Latent Fraud Syndicates**. These are not exposed directly to the model, but they define the underlying conditional probabilities.

A Syndicate has:
- A predefined set of favored **Typologies** (e.g., Investment Scam).
- A predefined list of **Operating Zones** (Where they control mules).
- A predefined list of **Cash-out Zones** (Where they physically withdraw).
- A dedicated pool of **Mule Entities**.

When generating a complaint, the generator first selects a Syndicate, and then samples properties from that Syndicate's conditional distributions.

## 2. Mule & Entity Reuse
- Mules are NOT sampled uniformly at random.
- They are sampled from a power-law distribution (Pareto/Zipf). 
- A small number of mules will be highly reused across complaints, mimicking professional laundering accounts.
- The majority of mules will be used only 1-2 times, mimicking innocent victims or burn accounts.

## 3. Temporal Realism
- `incident_timestamp`: The actual time the crime happened.
- `complaint_timestamp`: `incident_timestamp` + random victim delay (e.g., 2 to 24 hours).
- `available_timestamp`: `event_timestamp` + simulated API lag (e.g., 5 to 60 minutes).
- **Leakage Rule:** The model can only use data where `available_timestamp <= Current_Prediction_Time`.

## 4. Cash-out Generation
- Target Zone is selected from the Latent Syndicate's probabilistic distribution, NOT randomly from all 100 zones.
- This ensures `P(Zone | Typology)` and `P(Zone | Mule)` are learnable signals.

## 5. Noise Injection
To prevent the model from memorizing the generator:
- 10% chance a mule operates outside their Syndicate's normal zone.
- 5% chance the cash-out happens in a completely random anomalous zone.
- Amount splitting varies randomly between 60% to 100% per hop, rather than a fixed percentage.
