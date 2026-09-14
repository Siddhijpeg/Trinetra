"""
TRINETRA — Financial Exposure Packaging (Phase 2)
==================================================
Deterministic prototype financial risk signal computed strictly from
available transaction and complaint context.
"""
from typing import Dict, Any
from core.canonical.schemas import PredictionContext

def calculate_financial_exposure(context: PredictionContext) -> Dict[str, Any]:
    """
    Computes a transparent, deterministic financial exposure signal.
    Uses only real fields available in the canonical PredictionContext.
    """
    txns = context.observed_transactions
    amount_at_risk = sum(t.amount for t in txns) if txns else 0.0
    current_txn_amount = txns[-1].amount if txns else 0.0

    reported_loss = 0.0
    if context.available_complaint_context:
        reported_loss = float(context.available_complaint_context.metadata.get("amount_inr", 0.0))

    if reported_loss > 0:
        amount_retained_ratio = current_txn_amount / reported_loss
    else:
        amount_retained_ratio = 0.0

    estimated_exposure = max(amount_at_risk, reported_loss)

    return {
        "amount_at_risk_inr": float(round(amount_at_risk, 2)),
        "reported_loss_inr": float(round(reported_loss, 2)),
        "amount_retained_ratio": float(round(amount_retained_ratio, 4)),
        "estimated_exposure_inr": float(round(estimated_exposure, 2)),
        "method": "prototype_deterministic_exposure",
        "description": "PROTOTYPE HEURISTIC — deterministic financial risk signal from canonical transaction and complaint context",
    }
