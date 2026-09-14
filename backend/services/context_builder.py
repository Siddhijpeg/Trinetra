from datetime import datetime
from core.canonical.schemas import PredictionContext
from core.event_store.store import LocalEventStore

class ContextBuilder:
    def __init__(self, event_store: LocalEventStore):
        self.event_store = event_store

    def build(self, case_id: str, prediction_time: datetime) -> PredictionContext:
        """
        Builds a canonical PredictionContext strictly enforcing 
        available_time <= prediction_time
        """
        # Query event store as-of the prediction_time
        events = self.event_store.get_events_as_of(case_id, prediction_time)
        
        ctx = PredictionContext(
            case_id=case_id,
            prediction_time=prediction_time
        )
        
        if events["complaints"]:
            # Typically only one complaint per case_id, we take the most recent available one
            c = max(events["complaints"], key=lambda x: x.available_time)
            ctx.available_complaint_context = c
            
        if events["transactions"]:
            # Sort hops by sequence (event_time)
            sorted_hops = sorted(events["transactions"], key=lambda x: x.event_time)
            ctx.observed_transactions = sorted_hops
                
        return ctx
