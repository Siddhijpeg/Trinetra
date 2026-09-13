import pandas as pd
import numpy as np
import json
import xgboost as xgb
from sklearn.metrics import mean_absolute_error, brier_score_loss

print("Loading dataset...")
train = pd.read_csv("recoverability_train.csv")
val = pd.read_csv("recoverability_val.csv")
test = pd.read_csv("recoverability_test.csv")
with open("recoverability_features.json", "r") as f:
    features = json.load(f)

# Filter out registry features for ablation
features_no_reg = [f for f in features if not f.startswith('reg_')]

print("==========================================")
print("  R0: Global Median")
print("==========================================")
global_median = train['remaining_minutes'].median()
print(f"Global Median Remaining Time (Train): {global_median:.1f} mins")

def eval_r0(df, name):
    preds = np.full(len(df), global_median)
    mae = mean_absolute_error(df['remaining_minutes'], preds)
    med_ae = np.median(np.abs(df['remaining_minutes'] - preds))
    p75_ae = np.percentile(np.abs(df['remaining_minutes'] - preds), 75)
    print(f"[{name}] MAE: {mae:.1f}, MedAE: {med_ae:.1f}, P75_AE: {p75_ae:.1f}")
    return preds

eval_r0(val, "Val")
eval_r0(test, "Test")

print("\n==========================================")
print("  R1: Contextual Median (Hop Sequence)")
print("==========================================")
r1_model = train.groupby('hop_sequence')['remaining_minutes'].median().to_dict()

def predict_r1(df):
    # Fallback to global if unseen hop
    return df['hop_sequence'].map(r1_model).fillna(global_median)

def eval_r1(df, name):
    preds = predict_r1(df)
    mae = mean_absolute_error(df['remaining_minutes'], preds)
    med_ae = np.median(np.abs(df['remaining_minutes'] - preds))
    p75_ae = np.percentile(np.abs(df['remaining_minutes'] - preds), 75)
    print(f"[{name}] MAE: {mae:.1f}, MedAE: {med_ae:.1f}, P75_AE: {p75_ae:.1f}")
    return preds

eval_r1(val, "Val")
eval_r1(test, "Test")

print("\n==========================================")
print("  R2: XGBoost Log-Regression (No Registry)")
print("==========================================")
y_train_log = np.log(np.clip(train['remaining_minutes'], 1e-6, None))
y_val_log = np.log(np.clip(val['remaining_minutes'], 1e-6, None))
y_test_log = np.log(np.clip(test['remaining_minutes'], 1e-6, None))

model_no_reg = xgb.XGBRegressor(n_estimators=100, max_depth=4, learning_rate=0.1, random_state=42)
model_no_reg.fit(train[features_no_reg], y_train_log)

def eval_xgb(model, feats, df, y_log, name):
    log_preds = model.predict(df[feats])
    preds = np.exp(log_preds)
    mae = mean_absolute_error(df['remaining_minutes'], preds)
    med_ae = np.median(np.abs(df['remaining_minutes'] - preds))
    p75_ae = np.percentile(np.abs(df['remaining_minutes'] - preds), 75)
    print(f"[{name}] MAE: {mae:.1f}, MedAE: {med_ae:.1f}, P75_AE: {p75_ae:.1f}")
    return preds, log_preds

eval_xgb(model_no_reg, features_no_reg, val, y_val_log, "Val")
eval_xgb(model_no_reg, features_no_reg, test, y_test_log, "Test")

print("\n==========================================")
print("  R2: XGBoost Log-Regression (WITH Registry)")
print("==========================================")
model_reg = xgb.XGBRegressor(n_estimators=100, max_depth=5, learning_rate=0.1, random_state=42)
model_reg.fit(train[features], y_train_log)

_, val_log_preds = eval_xgb(model_reg, features, val, y_val_log, "Val")
test_preds, test_log_preds = eval_xgb(model_reg, features, test, y_test_log, "Test")

print("\n==========================================")
print("  Probabilistic Survival & Quantiles")
print("==========================================")
# Calculate empirical residuals on Validation: e = y_true - y_pred
val_residuals = y_val_log - val_log_preds

def predict_survival(log_preds, t_threshold, residuals):
    """ Returns P(Y > t_threshold) using empirical CDF of residuals """
    log_t = np.log(t_threshold)
    # We want P(log_y > log_t) => P(log_pred + e > log_t) => P(e > log_t - log_pred)
    probs = []
    # Sort residuals once for fast search
    sorted_res = np.sort(residuals)
    N = len(sorted_res)
    for p in log_preds:
        cutoff = log_t - p
        # count how many residuals are > cutoff
        idx = np.searchsorted(sorted_res, cutoff, side='right')
        prob = (N - idx) / N
        probs.append(prob)
    return np.array(probs)

def predict_quantiles(log_preds, residuals, q):
    """ Returns specific time quantile """
    q_val = np.percentile(residuals, q * 100)
    return np.exp(log_preds + q_val)

p30_true = (test['remaining_minutes'] > 30).astype(int)

# R0 Survival (Global empirical fraction > 30m)
r0_prob_30 = (train['remaining_minutes'] > 30).mean()
r0_brier = brier_score_loss(p30_true, np.full(len(test), r0_prob_30))
print(f"R0 (Global) Brier Score for P(Y > 30m): {r0_brier:.4f}")

# R2 Survival
p30_preds = predict_survival(test_log_preds, 30.0, val_residuals)
r2_brier = brier_score_loss(p30_true, p30_preds)
print(f"R2 (XGBoost) Brier Score for P(Y > 30m): {r2_brier:.4f}")

p60_true = (test['remaining_minutes'] > 60).astype(int)
p60_preds = predict_survival(test_log_preds, 60.0, val_residuals)
r2_brier_60 = brier_score_loss(p60_true, p60_preds)
print(f"R2 (XGBoost) Brier Score for P(Y > 60m): {r2_brier_60:.4f}")

test['p25_time'] = predict_quantiles(test_log_preds, val_residuals, 0.25)
test['p50_time'] = predict_quantiles(test_log_preds, val_residuals, 0.50)
test['p75_time'] = predict_quantiles(test_log_preds, val_residuals, 0.75)

print("\nExample Case:")
print(f"True Remaining Time: {test.iloc[0]['remaining_minutes']:.1f} mins")
print(f"P25: {test.iloc[0]['p25_time']:.1f} mins")
print(f"Median: {test.iloc[0]['p50_time']:.1f} mins")
print(f"P75: {test.iloc[0]['p75_time']:.1f} mins")
print(f"P(Y > 30m): {p30_preds[0]:.2f}")
