# Decision Engine

This module is a placeholder for the future TRINETRA Decision Engine. 
It does **NOT** currently implement autonomous thresholds or account freezing logic.

## Expected Future Inputs
- Top-K geographic distribution (from Geographic Engine)
- Calibrated geographic confidence (from Geographic Engine)
- M8 registry reliability
- Intervention-window distribution (from Timing Engine)
- Financial exposure/amount at risk
- Operational SLA

## Expected Future Outputs
- `CRITICAL_ALERT`
- `REVIEW`
- `MONITOR`

## Important Principles
- `registry reliability != prediction confidence`: A known mule account increases reliability of the prediction, but doesn't guarantee the exact location alone.
- `recoverability != urgency`: An incident may have high recoverability (lots of time remaining) but low urgency, or vice versa. They must be evaluated independently.
