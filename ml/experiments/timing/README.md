# R0 / R1 / R2 Timing Baselines

These scripts are **historical baseline experiments** used during the research phase of TRINETRA.

| File | Description |
|---|---|
| `recoverability_data.py` | Data loader and feature engineering for R0/R1/R2 |
| `recoverability_models.py` | R0 (global median), R1 (contextual median), R2 (XGBoost log-regression) |

## Status

These are **NOT** the production-facing Time-to-Event Engine. 

The production-facing engine is implemented at:
- `ml/timing/interface.py` — `estimate_intervention_window()` 
- `ml/timing/models/` — Dynamic Hazard, AFT, Quantile models
- `ml/timing/train_time_to_event.py` — Training pipeline

These baselines are preserved for research comparison only.
