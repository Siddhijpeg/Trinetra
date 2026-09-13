from abc import ABC, abstractmethod
from typing import Any, List
from ..canonical.events import TransactionEvent, ComplaintEvent, OutcomeEvent

class BaseAdapter(ABC):
    """
    Base contract for converting external API payloads or static files 
    into TRINETRA Canonical Events.
    """
    
    @abstractmethod
    def parse_transactions(self, raw_data: Any) -> List[TransactionEvent]:
        pass

    @abstractmethod
    def parse_complaints(self, raw_data: Any) -> List[ComplaintEvent]:
        pass

    @abstractmethod
    def parse_outcomes(self, raw_data: Any) -> List[OutcomeEvent]:
        pass
