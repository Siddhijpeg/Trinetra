from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Dict, Any, List
from .events import TransactionEvent, ComplaintEvent

@dataclass
class PredictionContext:
    case_id: str
    prediction_time: datetime
    observed_transactions: List[TransactionEvent] = field(default_factory=list)
    available_complaint_context: Optional[ComplaintEvent] = None
    registry_context: Dict[str, Any] = field(default_factory=dict)
