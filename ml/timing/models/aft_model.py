import numpy as np
import pandas as pd
import xgboost as xgb
from typing import List, Dict, Any

class AFTModel:
    """
    Accelerated Failure Time model using XGBoost's survival:aft objective.
    Supports right-censored training labels natively.
    """
    def __init__(self, **xgb_kwargs):
        if not xgb_kwargs:
            xgb_kwargs = {
                'n_estimators': 100,
                'max_depth': 4,
                'learning_rate': 0.1,
                'objective': 'survival:aft',
                'eval_metric': 'aft-nloglik',
                'aft_loss_distribution': 'normal',
                'random_state': 42
            }
        self.model = xgb.XGBRegressor(**xgb_kwargs)
        self.is_fitted = False
        
    def _prepare_labels(self, y: List[Dict[str, Any]]) -> np.ndarray:
        """
        XGBoost survival:aft requires lower and upper bounds.
        Format: a 1D array of lower bounds, and we set DMatrix.set_float_info('label_upper_bound', upper_bounds)
        Actually, with the scikit-learn API (XGBRegressor), we can pass y as a 2D array [lower_bound, upper_bound] 
        or we must construct DMatrix directly. 
        Wait, XGBRegressor in newer XGBoost versions accepts lower and upper bounds if we pass it 
        via specific kwargs, but the safest way is DMatrix. We will just use DMatrix for training.
        """
        pass
        
    def fit(self, X: pd.DataFrame, y: List[Dict[str, Any]]):
        lower_bounds = np.array([t["lower_bound_minutes"] for t in y])
        upper_bounds = np.array([t["upper_bound_minutes"] for t in y])
        
        # Clip zeros to a small positive value to avoid log(0) in AFT
        lower_bounds = np.clip(lower_bounds, 1e-3, None)
        upper_bounds = np.where(upper_bounds == float('inf'), np.inf, np.clip(upper_bounds, 1e-3, None))
        
        dtrain = xgb.DMatrix(X)
        dtrain.set_float_info('label_lower_bound', lower_bounds)
        dtrain.set_float_info('label_upper_bound', upper_bounds)
        
        params = self.model.get_params()
        n_estimators = params.pop('n_estimators', 100)
        
        self.booster = xgb.train(params, dtrain, num_boost_round=n_estimators)
        self.is_fitted = True
        return self
        
    def predict(self, X: pd.DataFrame) -> np.ndarray:
        """
        Predicts the expected time-to-event (point estimate).
        """
        if not self.is_fitted:
            raise ValueError("Model is not fitted yet.")
        dtest = xgb.DMatrix(X)
        return self.booster.predict(dtest)
