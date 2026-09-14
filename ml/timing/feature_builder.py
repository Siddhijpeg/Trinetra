import numpy as np
from typing import Dict, Any
from core.canonical.schemas import PredictionContext

class TimeToEventFeatureBuilder:
    """
    Builds inference-safe features strictly from a canonical PredictionContext.
    Ensures that NO future leakage occurs by only using data available in the context.
    Degrades gracefully if optional fields are missing.
    """
    
    def build_features(self, ctx: PredictionContext) -> Dict[str, float]:
        features = {}
        
        # 1. CORE FEATURES
        # Hop count observed so far
        hop_count = len(ctx.observed_transactions)
        features["hop_count"] = float(hop_count)
        
        # Cumulative amount and elapsed times
        cumulative_amount = 0.0
        elapsed_since_first_txn = 0.0
        elapsed_since_prev_txn = 0.0
        current_txn_amount = 0.0
        
        if hop_count > 0:
            first_txn_time = ctx.observed_transactions[0].event_time
            last_txn = ctx.observed_transactions[-1]
            last_txn_time = last_txn.event_time
            
            cumulative_amount = sum(t.amount for t in ctx.observed_transactions)
            current_txn_amount = last_txn.amount
            
            elapsed_since_first_txn = (ctx.prediction_time - first_txn_time).total_seconds() / 60.0
            
            if hop_count > 1:
                prev_txn_time = ctx.observed_transactions[-2].event_time
                elapsed_since_prev_txn = (last_txn_time - prev_txn_time).total_seconds() / 60.0
                
        features["cumulative_amount"] = cumulative_amount
        features["current_txn_amount"] = current_txn_amount
        features["elapsed_since_first_txn"] = elapsed_since_first_txn
        features["elapsed_since_prev_txn"] = elapsed_since_prev_txn
        
        # Time of day / Day of week of the prediction time
        features["prediction_hour"] = float(ctx.prediction_time.hour)
        features["prediction_dayofweek"] = float(ctx.prediction_time.weekday())
        
        # 2. OPTIONAL COMPLAINT FEATURES
        if ctx.available_complaint_context:
            c = ctx.available_complaint_context
            features["has_complaint"] = 1.0
            elapsed_since_incident = (ctx.prediction_time - c.event_time).total_seconds() / 60.0
            features["elapsed_since_incident"] = elapsed_since_incident
            
            # Amount retained ratio
            total_incident_amt = c.metadata.get("amount_inr", 0.0)
            if total_incident_amt > 0:
                features["amount_retained_ratio"] = current_txn_amount / total_incident_amt
            else:
                features["amount_retained_ratio"] = 0.0
        else:
            features["has_complaint"] = 0.0
            features["elapsed_since_incident"] = 0.0
            features["amount_retained_ratio"] = 0.0

        return features

    def get_feature_names(self):
        """Returns the canonical order of features for matrix construction"""
        return [
            "hop_count",
            "cumulative_amount",
            "current_txn_amount",
            "elapsed_since_first_txn",
            "elapsed_since_prev_txn",
            "prediction_hour",
            "prediction_dayofweek",
            "has_complaint",
            "elapsed_since_incident",
            "amount_retained_ratio",
        ]
