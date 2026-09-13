import numpy as np
import pandas as pd
from typing import List, Dict, Any
from sklearn.ensemble import GradientBoostingRegressor

class QuantileModel:
    """
    Direct Quantile Estimation using Gradient Boosting.
    Fits separate models for P25, P50, and P75.
    """
    def __init__(self, quantiles=[0.25, 0.50, 0.75], **gb_kwargs):
        self.quantiles = quantiles
        if not gb_kwargs:
            gb_kwargs = {
                'n_estimators': 100,
                'max_depth': 4,
                'learning_rate': 0.1,
                'random_state': 42
            }
        
        self.models = {}
        for q in self.quantiles:
            self.models[q] = GradientBoostingRegressor(loss='quantile', alpha=q, **gb_kwargs)
            
        self.is_fitted = False
        
    def fit(self, X: pd.DataFrame, y: List[Dict[str, Any]]):
        # Quantile regression typically requires exact observations.
        # We will train on the lower_bound of observed events for simplicity,
        # or we can train on all data. For the prototype, we use the exact observed times.
        
        # Filter for observed events if we want strict exact targets
        # Or we use lower_bound for everyone (which means we assume censored cases happened exactly at censor time, which is biased).
        # We'll use only observed events for the direct quantile model to avoid bias.
        
        observed_indices = [i for i, t in enumerate(y) if t["event_observed"]]
        if not observed_indices:
            raise ValueError("No observed events available to train quantile models.")
            
        X_obs = X.iloc[observed_indices]
        y_obs = np.array([y[i]["exact_minutes"] for i in observed_indices])
        
        for q in self.quantiles:
            self.models[q].fit(X_obs, y_obs)
            
        self.is_fitted = True
        return self
        
    def predict(self, X: pd.DataFrame) -> Dict[float, np.ndarray]:
        """
        Predicts all quantiles. Corrects quantile crossing by enforcing monotonicity.
        """
        if not self.is_fitted:
            raise ValueError("Model is not fitted yet.")
            
        preds = {}
        for q in self.quantiles:
            preds[q] = self.models[q].predict(X)
            
        # Correct quantile crossing: P25 <= P50 <= P75
        sorted_qs = sorted(self.quantiles)
        for i in range(1, len(sorted_qs)):
            q_prev = sorted_qs[i-1]
            q_curr = sorted_qs[i]
            # Enforce current >= previous
            preds[q_curr] = np.maximum(preds[q_curr], preds[q_prev])
            
        return preds
