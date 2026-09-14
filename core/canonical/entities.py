from dataclasses import dataclass
from typing import Optional, Dict, Any

@dataclass
class EntityReference:
    entity_id: str
    entity_type: str  # e.g., 'ACCOUNT', 'PHONE', 'PERSON'
    institution: Optional[str] = None
    geo: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
