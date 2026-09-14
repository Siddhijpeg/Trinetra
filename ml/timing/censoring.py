"""
Censoring helpers for timing/survival experiments.

Purpose:
- event_observed=True only when a cashout event is actually observed by the
  end of the observation window.
- event_observed=False for frozen/no-cashout cases that end observation without
  observing the event (right-censored).
"""
from __future__ import annotations

import pandas as pd


def add_event_observed(
    snapshots: pd.DataFrame,
    cashout_col: str = "cashout_time",
    status_col: str | None = "status",
) -> pd.DataFrame:
    """Return a copy with an explicit right-censoring indicator.

    If a cashout timestamp is present, the event is observed.
    If status explicitly says FROZEN (case-insensitive), the event is censored.
    Otherwise, a missing cashout timestamp is treated as censored.
    """
    out = snapshots.copy()

    if cashout_col in out.columns:
        observed = out[cashout_col].notna()
    else:
        observed = pd.Series(False, index=out.index)

    if status_col and status_col in out.columns:
        frozen = out[status_col].astype(str).str.upper().eq("FROZEN")
        observed = observed & ~frozen

    out["event_observed"] = observed.astype(bool)
    return out
