from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional, Dict, Any, List
from .entities import EntityReference

@dataclass
class TransactionEvent:
    event_id: str
    case_id: str
    event_time: datetime
    available_time: datetime
    source: str
    amount: float
    currency: str = "INR"
    source_entity: Optional[EntityReference] = None
    destination_entity: Optional[EntityReference] = None
    channel: Optional[str] = None
    institution: Optional[str] = None
    branch: Optional[str] = None
    terminal: Optional[str] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    zone_id: Optional[str] = None
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class ComplaintEvent:
    event_id: str
    case_id: str
    event_time: datetime  # incident time
    available_time: datetime  # complaint filed time
    source: str
    typology: Optional[str] = None
    victim_context: Dict[str, Any] = field(default_factory=dict)
    transaction_references: List[str] = field(default_factory=list)
    metadata: Dict[str, Any] = field(default_factory=dict)

@dataclass
class OutcomeEvent:
    event_id: str
    case_id: str
    event_time: datetime
    available_time: datetime
    source: str
    outcome_status: str  # e.g. "CASHOUT", "FROZEN", "REVERSED"
    cashout_location: Optional[str] = None
    amount_frozen: Optional[float] = None
    amount_recovered: Optional[float] = None
    metadata: Dict[str, Any] = field(default_factory=dict)
