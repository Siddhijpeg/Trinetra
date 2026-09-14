import os
import sys
from pathlib import Path

# ============================================================
# 1. PROJECT PATHS
# ============================================================

# This file is:
# TRINETRA_final_ml_COMPLETE/ml/geographic/registry_final_evaluation.py
#
# parents[0] = geographic
# parents[1] = ml
# parents[2] = TRINETRA_final_ml_COMPLETE

ROOT = Path(__file__).resolve().parents[2]

if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import json
import numpy as np
import pandas as pd
from scipy.optimize import minimize

from scripts.data_prep.feature_engineering import get_engineered_data


ARTIFACTS_DIR = ROOT / "artifacts"
MODELS_DIR = ARTIFACTS_DIR / "models"
METRICS_DIR = ARTIFACTS_DIR / "metrics"

DATA_DIR = ROOT / "data"
SYNTHETIC_DIR = DATA_DIR / "synthetic"


# ============================================================
# 2. START
# ============================================================

print("================================================================")
print("  REGISTRY INTELLIGENCE - FINAL CLOSURE AUDIT")
print("================================================================")

print(f"Project root: {ROOT}")


# ============================================================
# 3. LOAD ENGINEERED DATA
# ============================================================

print("\nLoading validation and test data...")

val_c, val_h, val_t = get_engineered_data("val")
test_c, test_h, test_t = get_engineered_data("test")

print(f"Validation complaints: {len(val_c)}")
print(f"Validation hops:       {len(val_h)}")
print(f"Test complaints:       {len(test_c)}")
print(f"Test hops:             {len(test_h)}")


# ============================================================
# 4. LOAD MODEL ARTIFACTS
# ============================================================

model_path = MODELS_DIR / "trained_model_m8.json"
registry_path = MODELS_DIR / "rich_registry.json"
tuning_path = METRICS_DIR / "registry_tuning_results.json"

print("\nLoading model artifacts...")

if not model_path.exists():
    raise FileNotFoundError(f"M8 model not found: {model_path}")

if not registry_path.exists():
    raise FileNotFoundError(f"Rich registry not found: {registry_path}")

if not tuning_path.exists():
    raise FileNotFoundError(
        f"Registry tuning results not found: {tuning_path}\n"
        "Run registry_tune_grid_search.py first."
    )

with open(model_path, "r") as f:
    model_artifacts = json.load(f)

with open(registry_path, "r") as f:
    rich_registry = json.load(f)

with open(tuning_path, "r") as f:
    tuning_results = json.load(f)


# ============================================================
# 5. SELECT BEST M8 CONFIGURATION
# ============================================================

best_result = max(
    tuning_results,
    key=lambda x: x["val_top3"]
)

best_m8 = best_result["config"]

print("\nBest M8 registry configuration from validation:")
print(f"  lambda = {best_m8.get('lambda')}")
print(f"  k      = {best_m8.get('k')}")
print(f"  w_rel  = {best_m8.get('w_rel')}")
print(f"  Val Top-3 = {best_result['val_top3']:.2f}%")


# ============================================================
# 6. LOAD MODEL COMPONENTS
# ============================================================

global_prior = model_artifacts["global_prior"]
typology_priors = model_artifacts["typology_priors"]
mule_zone_likelihoods = model_artifacts["mule_zone_likelihoods"]
node_risk_registry = model_artifacts["node_risk_registry"]

zone_list = model_artifacts["encoders"]["target_zone"]

zone_idx_map = {
    z: i
    for i, z in enumerate(zone_list)
}

log_global_prior = np.array(
    [
        np.log(global_prior.get(z, 1e-6))
        for z in zone_list
    ]
)


# ============================================================
# 7. LOAD ZONE COORDINATES
# ============================================================

zones_path = SYNTHETIC_DIR / "zones.csv"

if not zones_path.exists():
    raise FileNotFoundError(
        f"Zone file not found: {zones_path}"
    )

zones_df = pd.read_csv(zones_path)

print(f"\nLoaded {len(zones_df)} zones.")


def get_zone_coords(z_id):
    row = zones_df[zones_df["zone_id"] == z_id]

    if not row.empty:
        return (
            row.iloc[0]["lat"],
            row.iloc[0]["lng"]
        )

    return 0.0, 0.0


def haversine(lat1, lon1, lat2, lon2):
    """
    Calculate geographic distance between two coordinates.

    Returns distance in kilometers.
    """

    R = 6371.0

    dlat = np.radians(lat2 - lat1)
    dlon = np.radians(lon2 - lon1)

    a = (
        np.sin(dlat / 2) ** 2
        +
        np.cos(np.radians(lat1))
        * np.cos(np.radians(lat2))
        * np.sin(dlon / 2) ** 2
    )

    return 2 * R * np.arcsin(np.sqrt(a))


# ============================================================
# 8. GENERATE BASE GEOGRAPHIC LOGITS
# ============================================================

def generate_base_logits(c_feat, h_feat):

    m3_logits = {}
    m4_logits = {}

    for _, row in c_feat.iterrows():

        c_id = row["complaint_id"]

        # Typology-aware prior
        b_prior = typology_priors.get(
            row["typology_id"],
            global_prior
        )

        l_prior = np.array(
            [
                np.log(b_prior.get(z, 1e-6))
                for z in zone_list
            ]
        )

        c_hops = (
            h_feat[
                h_feat["complaint_id"] == c_id
            ]
            .sort_values("hop_sequence")
        )

        l_post3 = l_prior.copy()
        l_post4 = l_prior.copy()

        for _, hop in c_hops.iterrows():

            to_acc = hop["to_account"]

            acc_risk_weight = (
                node_risk_registry
                .get(to_acc, {})
                .get("risk_weight", 1.0)
            )

            lh_array = np.array(
                [
                    np.log(
                        mule_zone_likelihoods
                        .get(z, {})
                        .get(to_acc, 0.01)
                    )
                    for z in zone_list
                ]
            )

            # M3: sequential Bayesian likelihood
            l_post3 += lh_array

            # M4: risk-weighted Bayesian likelihood
            l_post4 += (
                lh_array
                * acc_risk_weight
            )

        m3_logits[c_id] = l_post3
        m4_logits[c_id] = l_post4

    return m3_logits, m4_logits


# ============================================================
# 9. APPLY REGISTRY EVIDENCE
# ============================================================

def apply_registry_evidence(
    h_feat,
    base_logits,
    config
):

    new_logits = {}

    lambd = config.get(
        "lambda",
        1.0
    )

    k = config.get(
        "k",
        10.0
    )

    w_rel = config.get(
        "w_rel",
        1.0
    )

    model_type = config.get(
        "model_type",
        "M8"
    )

    for c_id, l_seq in base_logits.items():

        c_hops = h_feat[
            h_feat["complaint_id"] == c_id
        ]

        l_new = l_seq.copy()

        for _, hop in c_hops.iterrows():

            acc = hop["to_account"]

            if acc not in rich_registry:
                continue

            reg = rich_registry[acc]

            n_a = reg["historical_sightings"]

            q_a = np.zeros(
                len(zone_list)
            )

            for i, z in enumerate(zone_list):

                n_az = (
                    reg["zone_counts"]
                    .get(z, 0)
                )

                p_prior = global_prior.get(
                    z,
                    1e-6
                )

                # Dirichlet-smoothed
                # account -> zone probability
                q_a[i] = (
                    n_az
                    + lambd * p_prior
                ) / (
                    n_a + lambd
                )

            log_q_a = np.log(q_a)

            # Historical consistency:
            # high when the account is concentrated
            # in a small number of zones.
            consistency = (
                1.0
                - reg["normalized_entropy"]
            )

            if model_type == "M6":

                l_new += (
                    consistency
                    * log_q_a
                )

            elif model_type == "M8":

                # Reliability depends on:
                # 1. Strength: how much historical evidence exists
                # 2. Consistency: how concentrated that evidence is
                strength = (
                    n_a
                    / (n_a + k)
                )

                reliability = (
                    strength
                    * consistency
                )

                # Only add the evidence relative to
                # the global prior.
                l_new += (
                    w_rel
                    * reliability
                    * (
                        log_q_a
                        - log_global_prior
                    )
                )

        new_logits[c_id] = l_new

    return new_logits


# ============================================================
# 10. GENERATE ALL LOGITS
# ============================================================

print("\nGenerating geographic logits...")

v_m3, v_m4 = generate_base_logits(
    val_c,
    val_h
)

t_m3, t_m4 = generate_base_logits(
    test_c,
    test_h
)


# M6 baseline
v_m6 = apply_registry_evidence(
    val_h,
    v_m3,
    {
        "model_type": "M6",
        "lambda": 1.0
    }
)

t_m6 = apply_registry_evidence(
    test_h,
    t_m3,
    {
        "model_type": "M6",
        "lambda": 1.0
    }
)


# M8 with BEST validation-selected configuration
v_m8 = apply_registry_evidence(
    val_h,
    v_m3,
    best_m8
)

t_m8 = apply_registry_evidence(
    test_h,
    t_m3,
    best_m8
)


# ============================================================
# 11. TEMPERATURE CALIBRATION
# ============================================================

def nll_loss(
    T,
    logits_dict,
    targets
):

    logits = np.array(
        [
            logits_dict[c]
            for c in targets["complaint_id"]
        ]
    )

    labels = np.array(
        [
            zone_idx_map[z]
            for z in targets["zone_id"]
        ]
    )

    scaled = logits / T[0]

    max_l = np.max(
        scaled,
        axis=1,
        keepdims=True
    )

    exp_l = np.exp(
        scaled - max_l
    )

    probs = (
        exp_l
        / np.sum(
            exp_l,
            axis=1,
            keepdims=True
        )
    )

    probs = np.clip(
        probs,
        1e-12,
        1.0
    )

    return -np.mean(
        np.log(
            probs[
                np.arange(len(labels)),
                labels
            ]
        )
    )


print("\nCalibrating temperatures on validation data...")

T_dict = {}

for name, v_logits in zip(
    ["M4", "M6", "M8"],
    [v_m4, v_m6, v_m8]
):

    result = minimize(
        nll_loss,
        [1.0],
        args=(
            v_logits,
            val_t
        ),
        bounds=[
            (0.1, 10.0)
        ]
    )

    T_dict[name] = result.x[0]

    print(
        f"  {name} temperature = "
        f"{T_dict[name]:.4f}"
    )


# ============================================================
# 12. CONVERT LOGITS -> PROBABILITIES
# ============================================================

def probs_from_logits(
    logits_dict,
    T
):

    probs_dict = {}

    for c_id, l in logits_dict.items():

        scaled = l / T

        exp_l = np.exp(
            scaled - np.max(scaled)
        )

        probs_dict[c_id] = (
            exp_l
            / np.sum(exp_l)
        )

    return probs_dict


p_m4 = probs_from_logits(
    t_m4,
    T_dict["M4"]
)

p_m6 = probs_from_logits(
    t_m6,
    T_dict["M6"]
)

p_m8 = probs_from_logits(
    t_m8,
    T_dict["M8"]
)


# ============================================================
# 13. COVERAGE + LEAKAGE AUDIT
# ============================================================

print("\n[Coverage Audit]")

test_c_list = (
    test_c["complaint_id"]
    .tolist()
)


# ------------------------------------------------------------
# Leakage audit
# ------------------------------------------------------------

leakage_found = False

for acc, reg in rich_registry.items():

    if pd.to_datetime(
        reg["last_seen"]
    ) >= pd.to_datetime(
        "2025-06-01"
    ):

        leakage_found = True
        break


print(
    "Leakage Audit "
    "(last_seen >= 2025-06-01 in Registry): "
    f"{'FAILED' if leakage_found else 'PASSED'}"
)


# ============================================================
# 14. REUSE COHORT ANALYSIS
# ============================================================

hit_counts = []

total_sightings_cohorts = {
    "No Reuse": [],
    "Low Reuse": [],
    "Medium Reuse": [],
    "High Reuse": []
}


for c_id in test_c_list:

    c_hops = test_h[
        test_h["complaint_id"] == c_id
    ]

    hits = 0
    total_sight = 0

    for acc in c_hops["to_account"]:

        if acc in rich_registry:

            hits += 1

            total_sight += (
                rich_registry[acc]
                ["historical_sightings"]
            )

    hit_counts.append(hits)

    if total_sight == 0:

        total_sightings_cohorts[
            "No Reuse"
        ].append(c_id)

    elif total_sight <= 5:

        total_sightings_cohorts[
            "Low Reuse"
        ].append(c_id)

    elif total_sight <= 20:

        total_sightings_cohorts[
            "Medium Reuse"
        ].append(c_id)

    else:

        total_sightings_cohorts[
            "High Reuse"
        ].append(c_id)


hc = pd.Series(hit_counts)

print(
    f"Test Cases: {len(test_c_list)}"
)

print(
    f"0 Hits: {(hc == 0).mean() * 100:.1f}%"
)

print(
    f"1 Hit: {(hc == 1).mean() * 100:.1f}%"
)

print(
    f"2 Hits: {(hc == 2).mean() * 100:.1f}%"
)

print(
    f"3+ Hits: {(hc >= 3).mean() * 100:.1f}%"
)


print("\n[Reuse Cohorts]")

for cohort_name, cases in (
    total_sightings_cohorts.items()
):

    print(
        f"{cohort_name}: "
        f"{len(cases)} cases"
    )


# ============================================================
# 15. COHORT EVALUATION
# ============================================================

def eval_cohort(
    probs_dict,
    targets,
    c_ids
):

    if len(c_ids) == 0:
        return {}

    top1 = 0
    top3 = 0
    top5 = 0
    mrr_sum = 0
    brier = 0

    geo_errors = []

    # Faster target lookup
    target_lookup = (
        targets
        .drop_duplicates(
            "complaint_id"
        )
        .set_index(
            "complaint_id"
        )
    )

    for c_id in c_ids:

        probs = probs_dict[c_id]

        actual_z = (
            target_lookup
            .loc[c_id, "zone_id"]
        )

        actual_idx = (
            zone_idx_map[actual_z]
        )

        sorted_indices = np.argsort(
            probs
        )[::-1]

        rank = (
            np.where(
                sorted_indices
                == actual_idx
            )[0][0]
            + 1
        )

        if rank == 1:
            top1 += 1

        if rank <= 3:
            top3 += 1

        if rank <= 5:
            top5 += 1

        mrr_sum += 1.0 / rank

        # Multiclass Brier score
        y_true = np.zeros_like(
            probs
        )

        y_true[actual_idx] = 1.0

        brier += np.mean(
            (probs - y_true) ** 2
        )

        # Geographic error of top prediction
        p_lat, p_lng = get_zone_coords(
            zone_list[
                sorted_indices[0]
            ]
        )

        a_lat, a_lng = get_zone_coords(
            actual_z
        )

        geo_errors.append(
            haversine(
                p_lat,
                p_lng,
                a_lat,
                a_lng
            )
        )

    N = len(c_ids)

    return {
        "top1": round(
            top1 / N * 100,
            1
        ),
        "top3": round(
            top3 / N * 100,
            1
        ),
        "top5": round(
            top5 / N * 100,
            1
        ),
        "mrr": round(
            mrr_sum / N,
            3
        ),
        "geo_med": round(
            np.median(geo_errors),
            1
        ),
        "brier": round(
            brier / N,
            4
        )
    }


# ============================================================
# 16. RUN COHORT EVALUATION
# ============================================================

print("\n[Evaluating Reuse Cohorts]")

cohort_results = {}

for cohort_name, c_ids in (
    total_sightings_cohorts.items()
):

    cohort_results[cohort_name] = {

        "M4": eval_cohort(
            p_m4,
            test_t,
            c_ids
        ),

        "M6": eval_cohort(
            p_m6,
            test_t,
            c_ids
        ),

        "M8": eval_cohort(
            p_m8,
            test_t,
            c_ids
        )
    }


# ============================================================
# 17. SAVE COHORT RESULTS
# ============================================================

cohort_output = (
    METRICS_DIR
    / "registry_cohort_results.json"
)

with open(
    cohort_output,
    "w"
) as f:

    json.dump(
        cohort_results,
        f,
        indent=2
    )

print(
    f"\nCohort results saved to:\n"
    f"{cohort_output}"
)


# ============================================================
# 18. BOOTSTRAPPING
# ============================================================

print("\n[Bootstrapping M6 vs M8]")

B = 1000

np.random.seed(42)

results_m6 = {
    "top1": [],
    "top3": [],
    "mrr": [],
    "geo_mean": []
}

results_m8 = {
    "top1": [],
    "top3": [],
    "mrr": [],
    "geo_mean": []
}

diffs = {
    "top3": [],
    "mrr": [],
    "geo_mean": []
}


# ============================================================
# 19. PRECOMPUTE BOOTSTRAP ARRAYS
# ============================================================

def precompute_arrs(
    probs_dict,
    targets,
    c_ids
):

    N = len(c_ids)

    is_top1 = np.zeros(N)
    is_top3 = np.zeros(N)

    rr = np.zeros(N)
    geos = np.zeros(N)

    target_lookup = (
        targets
        .drop_duplicates(
            "complaint_id"
        )
        .set_index(
            "complaint_id"
        )
    )

    for i, c_id in enumerate(c_ids):

        probs = probs_dict[c_id]

        actual_z = (
            target_lookup
            .loc[c_id, "zone_id"]
        )

        actual_idx = (
            zone_idx_map[actual_z]
        )

        sorted_indices = np.argsort(
            probs
        )[::-1]

        rank = (
            np.where(
                sorted_indices
                == actual_idx
            )[0][0]
            + 1
        )

        if rank == 1:
            is_top1[i] = 1

        if rank <= 3:
            is_top3[i] = 1

        rr[i] = 1.0 / rank

        p_lat, p_lng = get_zone_coords(
            zone_list[
                sorted_indices[0]
            ]
        )

        a_lat, a_lng = get_zone_coords(
            actual_z
        )

        geos[i] = haversine(
            p_lat,
            p_lng,
            a_lat,
            a_lng
        )

    return (
        is_top1,
        is_top3,
        rr,
        geos
    )


print(
    "Precomputing arrays for bootstrapping..."
)

m6_t1, m6_t3, m6_rr, m6_g = (
    precompute_arrs(
        p_m6,
        test_t,
        test_c_list
    )
)

m8_t1, m8_t3, m8_rr, m8_g = (
    precompute_arrs(
        p_m8,
        test_t,
        test_c_list
    )
)


# ============================================================
# 20. RUN BOOTSTRAP
# ============================================================

print(
    f"Running {B} bootstrap iterations..."
)

N = len(test_c_list)

for _ in range(B):

    indices = np.random.randint(
        0,
        N,
        N
    )

    m6_res_t3 = (
        np.mean(
            m6_t3[indices]
        )
        * 100
    )

    m6_res_rr = np.mean(
        m6_rr[indices]
    )

    m6_res_gm = np.mean(
        m6_g[indices]
    )

    m8_res_t3 = (
        np.mean(
            m8_t3[indices]
        )
        * 100
    )

    m8_res_rr = np.mean(
        m8_rr[indices]
    )

    m8_res_gm = np.mean(
        m8_g[indices]
    )

    results_m6["top3"].append(
        m6_res_t3
    )

    results_m6["mrr"].append(
        m6_res_rr
    )

    results_m6["geo_mean"].append(
        m6_res_gm
    )

    results_m8["top3"].append(
        m8_res_t3
    )

    results_m8["mrr"].append(
        m8_res_rr
    )

    results_m8["geo_mean"].append(
        m8_res_gm
    )

    diffs["top3"].append(
        m8_res_t3 - m6_res_t3
    )

    diffs["mrr"].append(
        m8_res_rr - m6_res_rr
    )

    diffs["geo_mean"].append(
        m8_res_gm - m6_res_gm
    )


# ============================================================
# 21. BOOTSTRAP CONFIDENCE INTERVALS
# ============================================================

bootstrap_summary = {

    "M6": {

        "top3": [
            np.percentile(
                results_m6["top3"],
                2.5
            ),
            np.percentile(
                results_m6["top3"],
                97.5
            )
        ],

        "mrr": [
            np.percentile(
                results_m6["mrr"],
                2.5
            ),
            np.percentile(
                results_m6["mrr"],
                97.5
            )
        ]
    },

    "M8": {

        "top3": [
            np.percentile(
                results_m8["top3"],
                2.5
            ),
            np.percentile(
                results_m8["top3"],
                97.5
            )
        ],

        "mrr": [
            np.percentile(
                results_m8["mrr"],
                2.5
            ),
            np.percentile(
                results_m8["mrr"],
                97.5
            )
        ]
    },

    "Diff_M8_minus_M6": {

        "top3": [
            np.percentile(
                diffs["top3"],
                2.5
            ),
            np.percentile(
                diffs["top3"],
                97.5
            )
        ],

        "mrr": [
            np.percentile(
                diffs["mrr"],
                2.5
            ),
            np.percentile(
                diffs["mrr"],
                97.5
            )
        ],

        "geo_mean": [
            np.percentile(
                diffs["geo_mean"],
                2.5
            ),
            np.percentile(
                diffs["geo_mean"],
                97.5
            )
        ]
    }
}


# ============================================================
# 22. SAVE BOOTSTRAP RESULTS
# ============================================================

bootstrap_output = (
    METRICS_DIR
    / "registry_bootstrap_results.json"
)

with open(
    bootstrap_output,
    "w"
) as f:

    json.dump(
        bootstrap_summary,
        f,
        indent=2
    )


# ============================================================
# 23. FINAL SUMMARY
# ============================================================

print("\n================================================================")
print("  FINAL REGISTRY AUDIT COMPLETE")
print("================================================================")

print("\nSelected M8 configuration:")
print(
    f"  lambda = {best_m8.get('lambda')}"
)

print(
    f"  k      = {best_m8.get('k')}"
)

print(
    f"  w_rel  = {best_m8.get('w_rel')}"
)

print(
    f"  Validation Top-3 = "
    f"{best_result['val_top3']:.2f}%"
)

print("\nTemperature calibration:")

for name, temperature in T_dict.items():

    print(
        f"  {name}: {temperature:.4f}"
    )

print(
    "\nLeakage audit: "
    f"{'FAILED' if leakage_found else 'PASSED'}"
)

print(
    f"\nCohort results:\n"
    f"{cohort_output}"
)

print(
    f"Bootstrap results:\n"
    f"{bootstrap_output}"
)

print(
    "\nBootstrapping Complete."
)

print("================================================================")