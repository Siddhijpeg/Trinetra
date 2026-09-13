# Production Target: Time-to-Event Engine

## Current Implementation vs Production Target
**CURRENT IMPLEMENTATION**: The synthetic prototype (`ml/timing/recoverability_models.py`) uses a fully-observed XGBoost log-regression model. Because 100% of the synthetic data reaches a "cash-out" state, classical right-censored survival analysis was bypassed in favor of a simpler regression on the remaining minutes.

**PRODUCTION TARGET**: Real-world data will contain:
- Cash-outs
- Frozen funds (successful interventions)
- Reversals/Recoveries
- Still-active / censored cases

Therefore, the production architecture must support true **survival modeling** and **competing risks**.

## Future Architecture
The production engine will transition to:
1. **Dynamic Discrete-Time Hazard Model** or **Accelerated Failure Time (AFT) Model**.
2. **Survival Curve Generation**: Producing $S(t)$, the probability of "surviving" past time $t$.
3. **Calibrated Survival Probabilities**: Outputs such as P(Y > 15m), P(Y > 30m) rigorously calibrated on real-world censoring.
4. **Quantile Prediction**: Outputting the exact P25, Median, and P75 time bounds for the UI.
5. **Conformal Prediction Intervals**: Providing statistical guarantees around the remaining window.

## Configurable SLA
Operational urgency metrics should eventually be driven by a configurable bank/law-enforcement SLA, rather than hardcoded 30-minute thresholds.
