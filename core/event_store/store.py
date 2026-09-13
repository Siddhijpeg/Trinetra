from datetime import datetime
from typing import List, Dict, Any
from ..canonical.events import TransactionEvent, ComplaintEvent, OutcomeEvent

class LocalEventStore:
    """
    Lightweight prototype event store enforcing strict AS-OF-TIME querying.
    """
    def __init__(self):
        self.transactions: List[TransactionEvent] = []
        self.complaints: List[ComplaintEvent] = []
        self.outcomes: List[OutcomeEvent] = []

    def append_transaction(self, event: TransactionEvent):
        self.transactions.append(event)
        
    def append_complaint(self, event: ComplaintEvent):
        self.complaints.append(event)
        
    def append_outcome(self, event: OutcomeEvent):
        self.outcomes.append(event)

    def get_case_events(self, case_id: str) -> Dict[str, List[Any]]:
        return {
            "transactions": [t for t in self.transactions if t.case_id == case_id],
            "complaints": [c for c in self.complaints if c.case_id == case_id],
            "outcomes": [o for o in self.outcomes if o.case_id == case_id],
        }

    def get_events_as_of(self, case_id: str, timestamp: datetime) -> Dict[str, List[Any]]:
        """
        NON-NEGOTIABLE TEMPORAL RULE:
        An event is visible to prediction only if:
        available_time <= prediction_time
        """
        case_data = self.get_case_events(case_id)
        return {
            "transactions": [t for t in case_data["transactions"] if t.available_time <= timestamp],
            "complaints": [c for c in case_data["complaints"] if c.available_time <= timestamp],
            "outcomes": [o for o in case_data["outcomes"] if o.available_time <= timestamp],
        }

    def get_entity_history(self, entity_id: str, as_of_time: datetime) -> List[TransactionEvent]:
        # Simple implementation searching both source and dest
        history = []
        for t in self.transactions:
            if t.available_time <= as_of_time:
                if (t.source_entity and t.source_entity.entity_id == entity_id) or \
                   (t.destination_entity and t.destination_entity.entity_id == entity_id):
                    history.append(t)
        return history

    def get_outcomes(self, case_id: str) -> List[OutcomeEvent]:
        return [o for o in self.outcomes if o.case_id == case_id]
