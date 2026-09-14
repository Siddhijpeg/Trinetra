# Closed Feedback Loop

TRINETRA continuously improves its Intelligence Engines through a closed feedback loop based on actual intervention outcomes. 

**DO NOT implement uncontrolled online model retraining.** Model updates happen through controlled, periodic recalibration. Only the **Registry Intelligence** updates its historical ledger online.

## Lifecycle
1. **Prediction**: Live transaction triggers a prediction.
2. **Intervention Window**: Remaining time is estimated.
3. **Decision Engine**: Alerts generated based on confidence and SLA.
4. **Action**: Authorized Bank or Investigator takes action (e.g., freezes account).
5. **Outcome Event**: A definitive Outcome Event is received (CASHOUT, FROZEN, REVERSED).
6. **Registry Update**: The M8 Reliability-Aware Registry ledger is updated with the outcome, altering the normalized entropy and strength of the involved accounts.
7. **Timing History Update**: The actual time-to-event is recorded to improve future SLA bounds.
8. **Periodic Recalibration**: Human-in-the-loop ML engineers periodically retune geographic temperature scaling ($T$) and XGBoost hyperparameters based on historical drift.
