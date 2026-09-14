# Production Target: Time-to-Event Engine

## Implementation Status (Phase 2B — FROZEN)
The schema-first **Time-to-Event Engine** is fully implemented, audited, and frozen in `ml/timing/`.

**ACTIVE PIPELINE**:
- **Interface**: `estimate_intervention_window(prediction_context, sla_minutes=None)`
- **Feature Builder**: `TimeToEventFeatureBuilder` (10 transaction-temporal features, 0 train-serve skew, leak-free as-of-time evaluation)
- **Primary Engine**: `DynamicHazardModel` (Discrete-time hazard via XGBoost + Isotonic Calibration on Month 5)
- **Survival Curve**: Generates monotonic $S(t) = \prod (1 - h_k)$ and interpolated P25, P50, P75
- **Companion Models**: AFT model (`aft_model.py`) and Direct Quantiles (`quantile_model.py`)
- **Authoritative Dataset Counts**: 22,844 train cases $\to$ 37,851 dynamic snapshots (T0 + Max 3 hops) $\to$ 86,307 person-period rows.

## Real-World Production Roadmap
While Phase 2B implements discrete-time hazard modeling, AFT, and quantile regression on the 40k synthetic harness, future real-world data integration will extend this engine to:
1. **Competing Risks Modeling**: Multi-state transitions (cashout vs. fund freeze vs. reversal).
2. **Right-Censored Survival Analysis**: Handling live active cases that haven't hit cashout yet.
3. **Conformal Prediction Intervals**: Distribution-free coverage guarantees around intervention time.

## Configurable SLA
Operational urgency metrics are driven by configurable bank/law-enforcement SLAs passed via `estimate_intervention_window(..., sla_minutes=...)`.
