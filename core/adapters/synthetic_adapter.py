import pandas as pd
from typing import Any, List, Optional
from .base_adapter import BaseAdapter
from ..canonical.events import TransactionEvent, ComplaintEvent, OutcomeEvent
from ..canonical.entities import EntityReference


class SyntheticAdapter(BaseAdapter):
    """
    Adapter that maps both V1 (40k) and V2 (60k) synthetic CSV files into
    TRINETRA canonical events.

    Column-name compatibility matrix
    ─────────────────────────────────────────────────────────────────────────────
    Table              V1 column name          V2 column name       Canonical field
    ─────────────────────────────────────────────────────────────────────────────
    hops               bank_channel            bank_channel         channel
    hops               (missing)               institution          institution
    hops               (missing/None)          (no cashout_zone)    zone_id → None
    complaints         available_timestamp     available_timestamp  available_time
    complaints         (missing)               victim_zone_id       victim_context
    cashout_events     (no available_ts)       available_timestamp  available_time
    cashout_events     status                  status               outcome_status
    cashout_events     zone_id                 zone_id              cashout_location
    cashout_events     lat / lng               lat / lng            metadata["lat"/"lng"]
    ─────────────────────────────────────────────────────────────────────────────

    Design rules
    ─────────────────────────────────────────────────────────────────────────────
    1. Never crash on a missing optional column — degrade gracefully to None/default.
    2. For CENSORED outcomes (status == "CENSORED"): cashout_location, lat, lng, and
       amount_cashed_out must NOT be exposed through canonical events.  The generator's
       intended future cashout target is kept in generator_metadata.csv only.
    3. Both V1 and V2 share the same parse_* entry points; auto-detection handles
       differences via `col_or_none()`.
    4. V1 cashout_events has no available_timestamp column → use event_timestamp.
    """

    # ── internal helpers ──────────────────────────────────────────────────────

    @staticmethod
    def _col(row: Any, *candidates, default=None):
        """Return the first available column value from a list of candidates."""
        for c in candidates:
            try:
                v = row[c]
                if pd.notna(v):
                    return v
            except (KeyError, TypeError):
                pass
        return default

    @staticmethod
    def _str_or_none(row: Any, *candidates) -> Optional[str]:
        v = SyntheticAdapter._col(row, *candidates)
        return str(v) if v is not None else None

    # ── public parse methods ──────────────────────────────────────────────────

    def parse_transactions(self, csv_path: str) -> List[TransactionEvent]:
        """
        Parse hops.csv (V1 or V2) into TransactionEvent canonical objects.

        V1 / V2 compatible columns:
          hop_id, complaint_id, event_timestamp, available_timestamp,
          amount_transferred, from_account, to_account,
          bank_channel (optional), institution (optional, V2 only)
        Note: zone_id on individual hops is NOT populated in either V1 or V2.
        """
        df = pd.read_csv(csv_path)
        events = []
        for _, row in df.iterrows():
            channel = self._str_or_none(row, "bank_channel")
            institution = self._str_or_none(row, "institution")
            events.append(TransactionEvent(
                event_id=str(row["hop_id"]),
                case_id=str(row["complaint_id"]),
                event_time=pd.to_datetime(row["event_timestamp"]),
                available_time=pd.to_datetime(row["available_timestamp"]),
                source="Synthetic Bank Feed",
                amount=float(row["amount_transferred"]),
                source_entity=EntityReference(
                    entity_id=str(row["from_account"]), entity_type="ACCOUNT"),
                destination_entity=EntityReference(
                    entity_id=str(row["to_account"]), entity_type="ACCOUNT"),
                channel=channel,
                institution=institution,
                zone_id=None,           # not populated at hop level in V1 or V2
            ))
        return events

    def parse_complaints(self, csv_path: str) -> List[ComplaintEvent]:
        """
        Parse complaints.csv (V1 or V2) into ComplaintEvent canonical objects.

        V1 / V2 compatible columns:
          complaint_id, incident_timestamp, available_timestamp,
          typology_id (optional), amount_inr,
          victim_state (optional), victim_district (optional),
          victim_zone_id (optional, V2 only)

        Canonical mapping:
          event_time       ← incident_timestamp
          available_time   ← available_timestamp
          metadata["amount_inr"] ← amount_inr
          victim_context["victim_state"]    ← victim_state
          victim_context["victim_district"] ← victim_district
          victim_context["victim_zone_id"]  ← victim_zone_id (V2 only)
        """
        df = pd.read_csv(csv_path)
        events = []
        for _, row in df.iterrows():
            victim_ctx: dict = {}
            for field in ("victim_state", "victim_district", "victim_zone_id"):
                v = self._str_or_none(row, field)
                if v is not None:
                    victim_ctx[field] = v

            amount_inr = self._col(row, "amount_inr", default=0.0)

            events.append(ComplaintEvent(
                event_id=str(row["complaint_id"]),
                case_id=str(row["complaint_id"]),
                event_time=pd.to_datetime(row["incident_timestamp"]),
                available_time=pd.to_datetime(row["available_timestamp"]),
                source="Synthetic NCRP Generator",
                typology=self._str_or_none(row, "typology_id"),
                victim_context=victim_ctx,
                metadata={"amount_inr": float(amount_inr)},
            ))
        return events

    def parse_outcomes(self, csv_path: str) -> List[OutcomeEvent]:
        """
        Parse cashout_events.csv (V1 or V2) into OutcomeEvent canonical objects.

        V1 / V2 compatible columns:
          complaint_id, event_timestamp,
          available_timestamp (optional, missing in V1 → falls back to event_timestamp),
          status            → outcome_status  (V1/V2 column is 'status')
          zone_id           → cashout_location (V1/V2 column is 'zone_id')
          lat / lng         → metadata["lat"] / metadata["lng"]  (V2 only)
          amount_cashed_out → metadata["amount_cashed_out"]
          amount_frozen     → metadata["amount_frozen"]
          amount_recovered  → metadata["amount_recovered"]

        CENSORED outcomes:
          cashout_location, lat, lng are set to None.
          These contain generator-truth target that must not enter inference.
          event_timestamp for CENSORED = last_hop_time + 24h (observation boundary).
        """
        df = pd.read_csv(csv_path)
        events = []
        for _, row in df.iterrows():
            status = self._str_or_none(row, "status") or "CASHOUT"

            # V1 has no available_timestamp on cashout_events — fall back to event_timestamp
            avail_raw = self._col(row, "available_timestamp", "event_timestamp")
            avail_time = pd.to_datetime(avail_raw)

            is_censored = (status == "CENSORED")

            # For CENSORED rows: do NOT expose zone / lat / lng (generator truth)
            if is_censored:
                cashout_loc = None
                lat = None
                lng = None
            else:
                cashout_loc = self._str_or_none(row, "zone_id")
                lat = self._col(row, "lat")
                lng = self._col(row, "lng")

            # Build metadata — only include non-null numeric fields
            meta: dict = {}
            for field in ("amount_cashed_out", "amount_frozen", "amount_recovered"):
                v = self._col(row, field)
                if v is not None:
                    meta[field] = float(v)
            if lat is not None:
                meta["lat"] = float(lat)
            if lng is not None:
                meta["lng"] = float(lng)
            # For CENSORED, still store that this case is right-censored
            meta["event_observed"] = not is_censored

            events.append(OutcomeEvent(
                event_id=str(row["complaint_id"]) + "_OUTCOME",
                case_id=str(row["complaint_id"]),
                event_time=pd.to_datetime(row["event_timestamp"]),
                available_time=avail_time,
                source="Synthetic Bank Feed",
                outcome_status=status,
                cashout_location=cashout_loc,
                metadata=meta,
            ))
        return events
