from datetime import datetime
from typing import Dict, Any, Optional
from core.canonical.schemas import PredictionContext
from core.canonical.events import OutcomeEvent

class TimeToEventTargetBuilder:
    """
    Constructs labels for Time-to-Event training dynamically.
    Strictly uses actual outcome data and handles censoring.
    """
    
    def build_target(self, ctx: PredictionContext, outcome: Optional[OutcomeEvent]) -> Dict[str, Any]:
        """
        Given a PredictionContext at time t, and an eventual OutcomeEvent,
        construct the target label for the time remaining until the outcome.
        """
        
        target = {
            "event_observed": False,
            "lower_bound_minutes": 0.0,
            "upper_bound_minutes": float('inf'),
            "exact_minutes": None # Only populated if exactly observed
        }
        
        if not outcome:
            # Case is currently right-censored. We only know it hasn't cashed out 
            # by the prediction time (assuming prediction time <= current operational time)
            # This is a bit abstract in a pure retrospective dataset, but we model 
            # the bounds as [0, +inf] relative to the prediction time. 
            # If we had a "last known active time" > prediction_time, we'd use that.
            pass
        else:
            if outcome.outcome_status == "CASHOUT":
                target["event_observed"] = True
                
                # Time remaining from the prediction snapshot until the cashout
                remaining_time_secs = (outcome.event_time - ctx.prediction_time).total_seconds()
                
                # If the prediction context is somehow exactly at or after the cashout time,
                # remaining time is 0 (or we shouldn't be predicting, but we bound at 0)
                remaining_minutes = max(0.0, remaining_time_secs / 60.0)
                
                target["lower_bound_minutes"] = remaining_minutes
                target["upper_bound_minutes"] = remaining_minutes
                target["exact_minutes"] = remaining_minutes
            elif outcome.outcome_status == "FROZEN":
                # The funds were frozen before cashout. The cashout event is right-censored.
                # We know the cashout did not happen before the freeze time.
                target["event_observed"] = False
                
                remaining_time_secs = (outcome.event_time - ctx.prediction_time).total_seconds()
                remaining_minutes = max(0.0, remaining_time_secs / 60.0)
                
                target["lower_bound_minutes"] = remaining_minutes
                target["upper_bound_minutes"] = float('inf')
            
        return target
