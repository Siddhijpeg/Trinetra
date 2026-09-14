# ```python
import sys
from pathlib import Path
import json

import numpy as np
import pandas as pd


# ─── Repository paths ─────────────────────────────────────────────────────────
# Resolve paths from this file so the script works regardless of where the
# terminal command is executed from.
REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT))

from scripts.data_prep.feature_engineering import get_engineered_data


print("Loading data for Registry Optimization...")

# Validation data ONLY.
# Test data is deliberately not loaded during hyperparameter tuning.
val_c, val_h, val_t = get_engineered_data("val")


ARTIFACTS_DIR = REPO_ROOT / "artifacts" / "models"
OUTPUT_PATH = REPO_ROOT / "artifacts" / "metrics" / "registry_tuning_results.json"


# ─── Load trained geographic artifacts ────────────────────────────────────────
with open(ARTIFACTS_DIR / "trained_model_m8.json", "r") as f:
    model_artifacts = json.load(f)

with open(ARTIFACTS_DIR / "rich_registry.json", "r") as f:
    rich_registry = json.load(f)


global_prior = model_artifacts["global_prior"]
typology_priors = model_artifacts["typology_priors"]
mule_zone_likelihoods = model_artifacts["mule_zone_likelihoods"]
node_risk_registry = model_artifacts["node_risk_registry"]

zone_list = model_artifacts["encoders"]["target_zone"]
zone_idx_map = {z: i for i, z in enumerate(zone_list)}

zone_count = len(zone_list)


# ─── Precompute static information ────────────────────────────────────────────
# The old implementation repeatedly searched the entire hop DataFrame for
# every complaint and every hyperparameter configuration.
#
# We instead prepare everything once and reuse it across the 27 configurations.

print("Precomputing validation features...")


# Global prior in log-space.
# Log-space lets us add evidence from multiple hops instead of multiplying
# many very small probabilities.
log_global_prior = np.array(
    [
        np.log(max(global_prior.get(z, 1e-6), 1e-6))
        for z in zone_list
    ],
    dtype=float,
)


# complaint_id -> true target zone index
val_targets = (
    val_t
    .drop_duplicates("complaint_id")
    .set_index("complaint_id")["zone_id"]
    .map(zone_idx_map)
    .to_dict()
)


# ─── Group hops once ──────────────────────────────────────────────────────────
# Instead of repeatedly doing:
#
#     val_h[val_h["complaint_id"] == complaint_id]
#
# create the groups once and reuse them.

hops_by_complaint = {
    complaint_id: group.sort_values("hop_sequence")
    for complaint_id, group in val_h.groupby(
        "complaint_id",
        sort=False
    )
}


# ─── Precompute account-level information ─────────────────────────────────────

account_base_loglik = {}
account_risk_weight = {}
registry_stats = {}


unique_accounts = val_h["to_account"].dropna().unique()

for account in unique_accounts:

    account = str(account)

    # Historical likelihood of each destination zone for this account.
    account_base_loglik[account] = np.array(
        [
            np.log(
                max(
                    mule_zone_likelihoods
                    .get(zone, {})
                    .get(account, 0.01),
                    1e-6,
                )
            )
            for zone in zone_list
        ],
        dtype=float,
    )

    # Existing node-risk weight used by the baseline enriched model.
    account_risk_weight[account] = (
        node_risk_registry
        .get(account, {})
        .get("risk_weight", 1.0)
    )

    # Rich registry information.
    registry_entry = rich_registry.get(account)

    if registry_entry is not None:

        registry_stats[account] = {
            "n_a": float(
                registry_entry.get(
                    "historical_sightings",
                    0,
                )
            ),
            "zone_counts": registry_entry.get(
                "zone_counts",
                {},
            ),
            "normalized_entropy": float(
                registry_entry.get(
                    "normalized_entropy",
                    1.0,
                )
            ),
            "raw_concentration": float(
                registry_entry.get(
                    "raw_concentration",
                    0.0,
                )
            ),
            "top_zone": registry_entry.get(
                "top_zone"
            ),
        }


print(
    f"  Validation complaints: {len(val_c)}"
)

print(
    f"  Validation hops: {len(val_h)}"
)

print(
    f"  Unique accounts: {len(unique_accounts)}"
)

print(
    f"  Registry accounts: {len(registry_stats)}"
)


# ─── Precompute base geographic logits ─────────────────────────────────────────
#
# These calculations do NOT depend on M8's lambda/k/w_rel parameters.
#
# Therefore we calculate them once instead of repeating them 27 times.

print("Precomputing geographic base logits...")


val_m3_logits = {}
val_m4_logits = {}


for _, complaint in val_c.iterrows():

    complaint_id = complaint["complaint_id"]

    # Typology-specific prior, falling back to the global prior.
    prior = typology_priors.get(
        complaint["typology_id"],
        global_prior,
    )

    log_prior = np.array(
        [
            np.log(
                max(
                    prior.get(zone, 1e-6),
                    1e-6,
                )
            )
            for zone in zone_list
        ],
        dtype=float,
    )

    m3_logits = log_prior.copy()
    m4_logits = log_prior.copy()

    # Add evidence from the complaint's observed hops.
    for _, hop in hops_by_complaint.get(
        complaint_id,
        pd.DataFrame(),
    ).iterrows():

        account = str(hop["to_account"])

        likelihood = account_base_loglik.get(account)

        if likelihood is None:
            continue

        # M3: normal Bayesian accumulation.
        m3_logits += likelihood

        # M4: risk-weighted Bayesian accumulation.
        m4_logits += (
            likelihood
            * account_risk_weight.get(
                account,
                1.0,
            )
        )

    val_m3_logits[complaint_id] = m3_logits
    val_m4_logits[complaint_id] = m4_logits


# ─── Evaluation helper ────────────────────────────────────────────────────────

def evaluate_predictions(probabilities):
    """
    Calculate validation Top-3 accuracy.

    Only the three highest-scoring zones are required, so np.argpartition()
    avoids fully sorting all zones for every complaint.
    """

    if not probabilities:
        return 0.0

    top3_hits = 0

    for complaint_id, probs in probabilities.items():

        actual_idx = val_targets.get(complaint_id)

        if actual_idx is None:
            continue

        top3_indices = np.argpartition(
            probs,
            -3
        )[-3:]

        if actual_idx in top3_indices:
            top3_hits += 1

    return (
        top3_hits
        / len(probabilities)
        * 100.0
    )


# ─── M8 registry evidence ─────────────────────────────────────────────────────

def build_registry_evidence(
    lambd,
    k,
    w_rel,
):
    """
    Build the M8 registry evidence vector for every registry account.

    This is calculated once per hyperparameter configuration rather than
    once per complaint.
    """

    evidence_cache = {}

    for account, registry in registry_stats.items():

        n_a = registry["n_a"]

        if n_a <= 0:
            continue

        zone_counts = registry["zone_counts"]

        q_a = np.empty(
            zone_count,
            dtype=float,
        )

        for index, zone in enumerate(zone_list):

            n_az = zone_counts.get(
                zone,
                0,
            )

            prior_probability = max(
                global_prior.get(
                    zone,
                    1e-6,
                ),
                1e-6,
            )

            # Smoothed empirical probability:
            #
            # (zone observations + lambda * global prior)
            # ------------------------------------------------
            #          total observations + lambda

            q_a[index] = (
                n_az
                + lambd * prior_probability
            ) / (
                n_a
                + lambd
            )

        # Low entropy = account repeatedly appears in a small number of zones.
        consistency = (
            1.0
            - registry["normalized_entropy"]
        )

        # More historical observations -> more confidence in the registry.
        strength = (
            n_a
            / (n_a + k)
        )

        reliability = (
            strength
            * consistency
        )

        # Compare registry probability against global probability.
        #
        # Positive value:
        #     registry makes the zone more likely.
        #
        # Negative value:
        #     registry makes the zone less likely.

        evidence = (
            w_rel
            * reliability
            * (
                np.log(
                    np.maximum(
                        q_a,
                        1e-6,
                    )
                )
                - log_global_prior
            )
        )

        evidence_cache[account] = evidence

    return evidence_cache


# ─── Apply M8 ─────────────────────────────────────────────────────────────────

def apply_registry_evidence(
    base_logits,
    lambd,
    k,
    w_rel,
):
    """
    Apply M8 registry evidence to precomputed geographic logits.
    """

    evidence_cache = build_registry_evidence(
        lambd,
        k,
        w_rel,
    )

    probabilities = {}

    for complaint_id, base_logit in base_logits.items():

        final_logits = base_logit.copy()

        complaint_hops = hops_by_complaint.get(
            complaint_id,
            pd.DataFrame(),
        )

        for _, hop in complaint_hops.iterrows():

            account = str(
                hop["to_account"]
            )

            evidence = evidence_cache.get(
                account
            )

            if evidence is not None:
                final_logits += evidence

        # Numerically stable softmax.
        shifted = (
            final_logits
            - np.max(final_logits)
        )

        exp_logits = np.exp(
            shifted
        )

        probabilities[complaint_id] = (
            exp_logits
            / np.sum(exp_logits)
        )

    return probabilities


# ─── Grid Search ──────────────────────────────────────────────────────────────
#
# IMPORTANT:
# This uses ONLY the validation split.
#
# The test split is not loaded and therefore cannot accidentally influence
# hyperparameter selection.

print()
print(
    "Running Grid Search on Validation Set "
    "for Registry Hyperparameters..."
)

best_m8_top3 = -1.0
best_m8_config = None

tuning_results = []


grid_values = {
    "lambda": [0.5, 1.0, 5.0],
    "k": [5.0, 10.0, 20.0],
    "w_rel": [0.5, 1.0, 2.0],
}


total_configs = (
    len(grid_values["lambda"])
    * len(grid_values["k"])
    * len(grid_values["w_rel"])
)

config_number = 0


for lambd in grid_values["lambda"]:

    for k in grid_values["k"]:

        for w_rel in grid_values["w_rel"]:

            config_number += 1

            print(
                f"  [{config_number}/{total_configs}] "
                f"lambda={lambd}, "
                f"k={k}, "
                f"w_rel={w_rel}"
            )

            probabilities = apply_registry_evidence(
                val_m3_logits,
                lambd,
                k,
                w_rel,
            )

            top3 = evaluate_predictions(
                probabilities
            )

            config = {
                "model_type": "M8",
                "lambda": lambd,
                "k": k,
                "w_rel": w_rel,
            }

            tuning_results.append(
                {
                    "config": config,
                    "val_top3": top3,
                }
            )

            print(
                f"       Validation Top-3: "
                f"{top3:.2f}%"
            )

            if top3 > best_m8_top3:

                best_m8_top3 = top3
                best_m8_config = config


# ─── Save results ──────────────────────────────────────────────────────────────

print()
print(
    f"Best M8 Config on Val: "
    f"{best_m8_config} "
    f"(Top-3: {best_m8_top3:.2f}%)"
)


OUTPUT_PATH.parent.mkdir(
    parents=True,
    exist_ok=True,
)

with open(
    OUTPUT_PATH,
    "w",
) as f:

    json.dump(
        tuning_results,
        f,
        indent=2,
    )


print(
    f"Saved tuning results to: "
    f"{OUTPUT_PATH}"
)

print()
print(
    "Grid Search Complete. "
    "Execute final evaluation in "
    "registry_final_evaluation.py"
)
# ```
