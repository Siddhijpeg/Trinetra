import pandas as pd
from typing import Any, List
from datetime import datetime
from .base_adapter import BaseAdapter
from ..canonical.events import TransactionEvent, ComplaintEvent, OutcomeEvent
from ..canonical.entities import EntityReference

class SyntheticAdapter(BaseAdapter):
    """
    Adapter mapping the official 40,000-case synthetic datasets into TRINETRA canonical events.
    """
    
    def parse_transactions(self, csv_path: str) -> List[TransactionEvent]:
        df = pd.read_csv(csv_path)
        events = []
        for _, row in df.iterrows():
            events.append(
                TransactionEvent(
                    event_id=str(row['hop_id']),
                    case_id=str(row['complaint_id']),
                    event_time=pd.to_datetime(row['event_timestamp']),
                    available_time=pd.to_datetime(row['available_timestamp']),
                    source="Synthetic Bank Feed",
                    amount=float(row['amount_transferred']),
                    source_entity=EntityReference(entity_id=str(row['from_account']), entity_type="ACCOUNT"),
                    destination_entity=EntityReference(entity_id=str(row['to_account']), entity_type="ACCOUNT"),
                    channel=str(row.get('bank_channel', 'UNKNOWN')),
                    zone_id=str(row.get('cashout_zone', 'UNKNOWN')) if pd.notna(row.get('cashout_zone')) else None
                )
            )
        return events

    def parse_complaints(self, csv_path: str) -> List[ComplaintEvent]:
        df = pd.read_csv(csv_path)
        events = []
        for _, row in df.iterrows():
            events.append(
                ComplaintEvent(
                    event_id=str(row['complaint_id']),
                    case_id=str(row['complaint_id']),
                    event_time=pd.to_datetime(row['incident_timestamp']),
                    available_time=pd.to_datetime(row['complaint_timestamp']),
                    source="Synthetic NCRP Generator",
                    typology=str(row.get('typology_id', 'UNKNOWN')),
                    victim_context={"victim_zone": str(row.get('victim_zone', 'UNKNOWN'))}
                )
            )
        return events

    def parse_outcomes(self, csv_path: str) -> List[OutcomeEvent]:
        df = pd.read_csv(csv_path)
        events = []
        for _, row in df.iterrows():
            events.append(
                OutcomeEvent(
                    event_id=str(row['complaint_id']) + "_OUTCOME",
                    case_id=str(row['complaint_id']),
                    event_time=pd.to_datetime(row['event_timestamp']),
                    available_time=pd.to_datetime(row['available_timestamp']),
                    source="Synthetic Bank Feed",
                    outcome_status=str(row.get('outcome_status', 'CASHOUT')),
                    cashout_location=str(row.get('cashout_zone', 'UNKNOWN')) if pd.notna(row.get('cashout_zone')) else None
                )
            )
        return events
