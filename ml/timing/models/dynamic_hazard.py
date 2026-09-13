import numpy as np
import pandas as pd
import xgboost as xgb
from typing import List, Dict, Tuple, Any

class DynamicHazardModel:
    """
    Dynamic Discrete-Time Hazard Model using XGBoost.
    Transforms data into person-period format and predicts hazard rates for
    configurable time intervals.
    """
    def __init__(self, bin_width_minutes: float = 30.0, max_minutes: float = 480.0, **xgb_kwargs):
        self.bin_width = bin_width_minutes
        self.max_minutes = max_minutes
        self.num_bins = int(np.ceil(max_minutes / bin_width_minutes))

        xgb_kwargs.setdefault('n_estimators', 100)
        xgb_kwargs.setdefault('max_depth', 4)
        xgb_kwargs.setdefault('learning_rate', 0.1)
        xgb_kwargs.setdefault('objective', 'binary:logistic')
        xgb_kwargs.setdefault('random_state', 42)
        xgb_kwargs.setdefault('verbosity', 0)

        self.xgb_kwargs = xgb_kwargs
        self.model = xgb.XGBClassifier(**xgb_kwargs)
        self.is_fitted = False

    def _create_person_period_data(self, X: pd.DataFrame, y: List[Dict[str, Any]]) -> Tuple[pd.DataFrame, np.ndarray]:
        """Expands snapshot rows into person-period format."""
        X_reset = X.reset_index(drop=True)
        cols = list(X_reset.columns)
        rows_out = []
        labels_out = []

        for i in range(len(X_reset)):
            target_info = y[i]
            event_observed = target_info["event_observed"]
            lower_bound = float(target_info["lower_bound_minutes"])

            effective_time = min(lower_bound, self.max_minutes)
            end_bin = min(int(effective_time // self.bin_width), self.num_bins - 1)
            feat_vals = list(X_reset.iloc[i].values)

            for k in range(end_bin + 1):
                label = 1 if (k == end_bin and event_observed and lower_bound < self.max_minutes) else 0
                rows_out.append(feat_vals + [k])
                labels_out.append(label)

        expanded = pd.DataFrame(rows_out, columns=cols + ["time_bin"])
        return expanded, np.array(labels_out)

    def fit(self, X: pd.DataFrame, y: List[Dict[str, Any]]):
        print(f"  Building person-period data ({len(X)} snapshots × up to {self.num_bins} bins)...")
        X_exp, y_exp = self._create_person_period_data(X, y)
        print(f"  Person-period rows: {len(X_exp)}  (events: {int(y_exp.sum())})")
        self.model.fit(X_exp, y_exp)
        self.is_fitted = True
        self.calibrator = None
        return self

    def predict_survival_curve(self, X: pd.DataFrame) -> List[List[Dict[str, float]]]:
        """Predicts S(t) for each row. Vectorized: one model pass per bin."""
        if not self.is_fitted:
            raise ValueError("Model is not fitted yet.")

        N = len(X)
        X_reset = X.reset_index(drop=True)
        all_hazards = np.zeros((self.num_bins, N))

        for k in range(self.num_bins):
            X_k = X_reset.copy()
            X_k["time_bin"] = k
            raw_hazards = self.model.predict_proba(X_k)[:, 1]
            if getattr(self, "calibrator", None) is not None:
                all_hazards[k] = self.calibrator.predict(raw_hazards)
            else:
                all_hazards[k] = raw_hazards

        curves = []
        for i in range(N):
            curve = [{"minutes": 0.0, "probability_remaining": 1.0}]
            surv = 1.0
            for k in range(self.num_bins):
                surv = max(0.0, min(1.0, surv * (1.0 - float(all_hazards[k, i]))))
                curve.append({
                    "minutes": float((k + 1) * self.bin_width),
                    "probability_remaining": surv,
                })
            curves.append(curve)

        return curves

    def predict_quantiles_from_curve(self, curve: List[Dict[str, float]]) -> Dict[str, float]:
        """P25/P50/P75 from survival curve via linear interpolation."""
        def _find(target_s):
            for i in range(1, len(curve)):
                s0 = curve[i-1]["probability_remaining"]
                s1 = curve[i]["probability_remaining"]
                if s1 <= target_s:
                    t0, t1 = curve[i-1]["minutes"], curve[i]["minutes"]
                    if s0 == s1:
                        return float(t1)
                    frac = (s0 - target_s) / (s0 - s1)
                    return float(t0 + frac * (t1 - t0))
            return float(curve[-1]["minutes"])

        return {
            "p25_minutes": _find(0.75),
            "p50_minutes": _find(0.50),
            "p75_minutes": _find(0.25),
        }
