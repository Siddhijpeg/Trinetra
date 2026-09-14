"""
PRAHARI — Risk Registry (Feature B)
=====================================

What this is, in plain terms:
  A running list of accounts that have shown up in MORE THAN ONE
  complaint. If an account keeps appearing across unrelated fraud
  cases, and it keeps leading to roughly the same cash-out zone, that
  is a strong, concentrated signal — much stronger than the noisy
  "blend the whole zone-distribution" approach tried in
  sequential_estimator.py, which spread trust too thin over sparse
  per-account data and never sharpened reliably.

  This module deliberately does ONE simple thing instead: if a hop
  lands on a REGISTRY-FLAGGED account (seen enough times, and
  concentrated enough in one zone), boost that single zone hard. If
  not, fall back to the typology prior. No blending of weak evidence.

This is also what the UI's "Registry match" toast is showing —
this script is the logic behind that toast, and behind the jump from
MEDIUM to HIGH confidence in the demo walkthrough.

What it prints:
  1. The registry itself — which accounts are flagged, how often
     seen, how concentrated their zone signal is. (This is literally
     the table shown on the UI's "Risk Registry" screen.)
  2. Top-1 / Top-3 hit rate + calibration, directly comparable to
     baseline_predictor.py and sequential_estimator.py.

Usage:
  python3 risk_registry.py --datadir ../data/out
"""

import argparse
import csv
import os
import random
from collections import defaultdict


def load_csv(path):
    with open(path, newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


def normalize(d):
    total = sum(d.values())
    if total == 0:
        return {}
    return {k: v / total for k, v in d.items()}


def expected_calibration_error(confidences, outcomes, n_bins=10):
    """ECE: bins predictions by confidence, checks if accuracy within each
    bin actually matches that confidence level. Lower = more trustworthy
    confidence scores. (Metric used in the graph-fraud-detection paper.)"""
    bins = [[] for _ in range(n_bins)]
    for conf, outcome in zip(confidences, outcomes):
        idx = min(n_bins - 1, int(conf * n_bins))
        bins[idx].append((conf, outcome))
    n_total = len(confidences)
    ece = 0.0
    for b in bins:
        if not b:
            continue
        bin_conf = sum(c for c, _ in b) / len(b)
        bin_acc = sum(o for _, o in b) / len(b)
        ece += (len(b) / n_total) * abs(bin_conf - bin_acc)
    return ece


def brier_score(confidences, outcomes):
    """Mean squared error between predicted confidence and actual outcome
    (1 if correct, 0 if not). Lower = better calibrated."""
    if not confidences:
        return 0.0
    return sum((c - o) ** 2 for c, o in zip(confidences, outcomes)) / len(confidences)


def main():
    ap = argparse.ArgumentParser(description="PRAHARI risk registry (feature B)")
    ap.add_argument("--datadir", type=str, default="../data/out")
    ap.add_argument("--test_fraction", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--top_k", type=int, default=3)
    ap.add_argument("--min_sightings", type=int, default=3,
                     help="account must appear in at least this many TRAIN complaints to be registry-flagged")
    ap.add_argument("--min_concentration", type=float, default=0.5,
                     help="account's top zone must account for at least this fraction of its appearances to be trusted")
    ap.add_argument("--registry_confidence", type=float, default=0.85,
                     help="how much probability mass a registry hit assigns to its flagged zone")
    args = ap.parse_args()

    random.seed(args.seed)

    complaints = load_csv(os.path.join(args.datadir, "complaints.csv"))
    cashouts = load_csv(os.path.join(args.datadir, "cashout_events.csv"))
    hops = load_csv(os.path.join(args.datadir, "hops.csv"))
    zones = load_csv(os.path.join(args.datadir, "zones.csv"))
    n_zones = max(1, len(zones))
    uniform_prob = 1.0 / n_zones

    actual_zone_by_complaint = {c["complaint_id"]: c["actual_zone_id"] for c in cashouts}
    fraud_type_by_complaint = {c["complaint_id"]: c["fraud_type"] for c in complaints}

    hops_by_complaint = defaultdict(list)
    for h in hops:
        hops_by_complaint[h["complaint_id"]].append(h)
    for cid in hops_by_complaint:
        hops_by_complaint[cid].sort(key=lambda h: int(h["hop_index"]))

    complaint_ids = [c["complaint_id"] for c in complaints if c["complaint_id"] in actual_zone_by_complaint]
    random.shuffle(complaint_ids)
    n_test = int(len(complaint_ids) * args.test_fraction)
    test_ids = set(complaint_ids[:n_test])
    train_ids = [cid for cid in complaint_ids if cid not in test_ids]

    # --- 1. typology prior (fallback, same as baseline) ---
    zone_counts_by_type = defaultdict(lambda: defaultdict(int))
    for cid in train_ids:
        ftype = fraud_type_by_complaint[cid]
        azone = actual_zone_by_complaint[cid]
        zone_counts_by_type[ftype][azone] += 1
    prior_by_type = {ft: normalize(counts) for ft, counts in zone_counts_by_type.items()}
    global_counts = defaultdict(int)
    for counts in zone_counts_by_type.values():
        for z, c in counts.items():
            global_counts[z] += c
    global_prior = normalize(global_counts)

    # --- 2. build the registry from TRAIN only ---
    # account -> set of complaint_ids it appeared in (distinct sightings)
    account_complaints = defaultdict(set)
    account_zone_counts = defaultdict(lambda: defaultdict(int))
    for cid in train_ids:
        azone = actual_zone_by_complaint[cid]
        for h in hops_by_complaint.get(cid, []):
            acc = h["to_account"]
            account_complaints[acc].add(cid)
            account_zone_counts[acc][azone] += 1

    registry = {}
    for acc, comp_set in account_complaints.items():
        sightings = len(comp_set)
        if sightings < args.min_sightings:
            continue
        zone_counts = account_zone_counts[acc]
        total = sum(zone_counts.values())
        top_zone, top_count = max(zone_counts.items(), key=lambda kv: kv[1])
        concentration = top_count / total if total else 0
        if concentration < args.min_concentration:
            continue
        registry[acc] = {
            "sightings": sightings,
            "top_zone": top_zone,
            "concentration": concentration,
        }

    print("=" * 64)
    print(f"RISK REGISTRY — {len(registry)} accounts flagged "
          f"(>= {args.min_sightings} sightings, >= {args.min_concentration:.0%} concentration)")
    print("=" * 64)
    for acc, info in sorted(registry.items(), key=lambda kv: -kv[1]["sightings"])[:10]:
        print(f"  {acc:<10} seen in {info['sightings']:2d} complaints "
              f"-> {info['concentration']:.0%} of the time cashed out in {info['top_zone']}")
    if len(registry) > 10:
        print(f"  ... and {len(registry) - 10} more")
    print()

    def predict(ftype, accounts_seen_so_far):
        """Registry-first prediction: a strong registry hit wins outright.
        No registry hit -> fall back to the typology prior, untouched."""
        # check most-recent-first: the latest hop's registry status is most relevant
        for acc in reversed(accounts_seen_so_far):
            if acc in registry:
                info = registry[acc]
                flagged_zone = info["top_zone"]
                conf = args.registry_confidence
                remaining = 1 - conf
                prior = prior_by_type.get(ftype, global_prior)
                dist = {z: p * remaining for z, p in prior.items()}
                dist[flagged_zone] = dist.get(flagged_zone, 0) + conf
                return dist, True, acc
        return prior_by_type.get(ftype, global_prior), False, None

    # --- 3. first pass: run predictions, collect everything (tiers assigned after) ---
    results = []

    for cid in test_ids:
        ftype = fraud_type_by_complaint[cid]
        actual = actual_zone_by_complaint[cid]
        seq_hops = hops_by_complaint.get(cid, [])
        if not seq_hops:
            continue

        accounts_seen = []
        trace = []
        for h in seq_hops:
            accounts_seen.append(h["to_account"])
            posterior, hit, flagged_acc = predict(ftype, accounts_seen)
            ranked = sorted(posterior.items(), key=lambda kv: kv[1], reverse=True)
            trace.append({
                "hop_index": h["hop_index"],
                "top3": ranked[:args.top_k],
                "top_prob": ranked[0][1] if ranked else 0.0,
                "registry_hit": hit,
                "flagged_account": flagged_acc,
            })

        posterior_final, hit_final, _ = predict(ftype, accounts_seen)
        ranked_full = [z for z, _ in sorted(posterior_final.items(), key=lambda kv: kv[1], reverse=True)]
        is_top1_hit = bool(ranked_full and ranked_full[0] == actual)
        is_topk_hit = actual in ranked_full[:args.top_k]
        final_top_prob = trace[-1]["top_prob"] if trace else 0.0

        results.append({
            "cid": cid, "ftype": ftype, "actual": actual, "trace": trace,
            "is_top1_hit": is_top1_hit, "is_topk_hit": is_topk_hit,
            "registry_hit": hit_final, "final_top_prob": final_top_prob,
        })

    n_eval = len(results)
    top1_hits = sum(1 for r in results if r["is_top1_hit"])
    topk_hits = sum(1 for r in results if r["is_topk_hit"])
    top1_rate = top1_hits / n_eval if n_eval else 0
    topk_rate = topk_hits / n_eval if n_eval else 0

    registry_hit_results = [r for r in results if r["registry_hit"]]
    no_registry_results = [r for r in results if not r["registry_hit"]]
    registry_hit_count = len(registry_hit_results)
    no_registry_count = len(no_registry_results)
    registry_hit_top1 = sum(1 for r in registry_hit_results if r["is_top1_hit"])
    no_registry_top1 = sum(1 for r in no_registry_results if r["is_top1_hit"])

    # percentile-based tiers: split final_top_prob into thirds based on
    # THIS run's actual distribution, not an arbitrary fixed formula —
    # otherwise, if the typology prior alone is already concentrated
    # (as ours deliberately is), every case ends up in one bucket.
    sorted_probs = sorted(r["final_top_prob"] for r in results)
    if n_eval >= 3:
        low_cut = sorted_probs[n_eval // 3]
        high_cut = sorted_probs[(2 * n_eval) // 3]
    else:
        low_cut = high_cut = 0

    def tier_of(p):
        if p >= high_cut:
            return "HIGH"
        elif p >= low_cut:
            return "MEDIUM"
        return "LOW"

    tier_totals = defaultdict(int)
    tier_hits = defaultdict(int)
    for r in results:
        t = tier_of(r["final_top_prob"])
        tier_totals[t] += 1
        if r["is_top1_hit"]:
            tier_hits[t] += 1

    ece = expected_calibration_error(
        [r["final_top_prob"] for r in results],
        [1.0 if r["is_top1_hit"] else 0.0 for r in results],
    )
    brier = brier_score(
        [r["final_top_prob"] for r in results],
        [1.0 if r["is_top1_hit"] else 0.0 for r in results],
    )

    sample_trace = None
    for r in registry_hit_results:
        if len(r["trace"]) >= 2:
            sample_trace = (r["cid"], r["ftype"], r["actual"], r["trace"])
            break

    print("=" * 64)
    print("PRAHARI — Registry-boosted prediction evaluation")
    print("=" * 64)
    print(f"Test complaints  : {n_eval}")
    print(f"Top-1 hit rate   : {top1_rate:.1%}   (compare against baseline_predictor.py's output)")
    print(f"Top-{args.top_k} hit rate   : {topk_rate:.1%}   (compare against baseline_predictor.py's output)")
    print()
    print(f"Cases with a registry hit    : {registry_hit_count:4d}  ->  "
          f"Top-1 accuracy within these: {(registry_hit_top1/registry_hit_count if registry_hit_count else 0):.1%}")
    print(f"Cases with NO registry hit   : {no_registry_count:4d}  ->  "
          f"Top-1 accuracy within these: {(no_registry_top1/no_registry_count if no_registry_count else 0):.1%}")
    if registry_hit_count < 30:
        print(f"NOTE: only {registry_hit_count} registry-hit test cases — too small a sample to")
        print("      draw a real conclusion either way. Needs a bigger dataset to evaluate properly.")
    print()
    print("-- Calibration by confidence tier (tiers = this run's own top/middle/bottom third) --")
    for tier in ["HIGH", "MEDIUM", "LOW"]:
        total = tier_totals.get(tier, 0)
        hits = tier_hits.get(tier, 0)
        rate = hits / total if total else 0
        print(f"   {tier:<7} confidence  ->  {total:4d} cases  ->  Top-1 accuracy within tier: {rate:.1%}")
    print()
    print(f"Expected Calibration Error (ECE): {ece:.3f}   (lower is better; from the graph-fraud paper's methodology)")
    print(f"Brier Score                     : {brier:.3f}   (lower is better)")
    print()

    if sample_trace:
        cid, ftype, actual, trace = sample_trace
        print(f"Sample walkthrough — {cid} ({ftype}), actual zone = {actual}")
        print("-" * 64)
        for step in trace:
            top3_str = ", ".join(f"{z}:{p:.0%}" for z, p in step["top3"])
            flag = f" <- REGISTRY HIT on {step['flagged_account']}" if step["registry_hit"] else ""
            print(f"  Hop {step['hop_index']}: top{args.top_k} = [{top3_str}]{flag}")
        print("-" * 64)
    else:
        print("(no multi-hop registry-hit case in this test split to show as a walkthrough)")


if __name__ == "__main__":
    main()