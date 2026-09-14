"""
PRAHARI — Sequential Estimator (Feature A, real version)
===========================================================

The baseline (baseline_predictor.py) predicts using ONLY fraud_type —
it never looks at the actual transaction chain of the complaint.
This script fixes that: it updates its zone-guess after EVERY hop,
the same way the UI demo does (Low confidence -> Medium -> High).

Plain-language idea:
  - Start with the same "reference-class" prior as the baseline
    (what zones does this fraud_type usually cash out in?).
  - As each hop reveals a new account, check: has this account been
    seen before in the TRAINING data? If yes, and it tends to lead to
    a particular zone, blend that evidence in — the more times we've
    seen this account before, the more we trust its zone signal over
    the generic typology prior.
  - This is a simplified stand-in for a proper Bayesian/HMM update
    (mentioned in the design doc) — good enough to demonstrate and
    measure the "anytime prediction, sharpens over time" idea now;
    swap in hmmlearn/particle filter later without changing the
    surrounding pipeline (same input/output contract).

What it prints:
  1. Final Top-1 / Top-3 hit rate, compared directly against the
     baseline number — this is your "we beat the naive baseline by
     X%" pitch line, with an actual measurement behind it.
  2. A step-by-step trace for one sample complaint, showing the
     confidence in the correct zone rising as hops are revealed —
     this is the number behind the UI's Low->Medium->High badges.

Usage:
  python3 sequential_estimator.py --datadir ../data/out
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


def main():
    ap = argparse.ArgumentParser(description="PRAHARI sequential hop-by-hop estimator")
    ap.add_argument("--datadir", type=str, default="../data/out")
    ap.add_argument("--test_fraction", type=float, default=0.2)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--top_k", type=int, default=3)
    ap.add_argument("--trust_scale", type=float, default=5.0,
                     help="how many prior sightings of an account = full trust in its zone signal")
    ap.add_argument("--min_evidence", type=int, default=3,
                     help="an account needs at least this many TRAIN sightings before its zone signal is trusted at all")
    ap.add_argument("--max_alpha", type=float, default=0.6,
                     help="cap on how much the account signal can override the typology prior")
    args = ap.parse_args()

    random.seed(args.seed)

    complaints = load_csv(os.path.join(args.datadir, "complaints.csv"))
    cashouts = load_csv(os.path.join(args.datadir, "cashout_events.csv"))
    hops = load_csv(os.path.join(args.datadir, "hops.csv"))

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

    # --- 1. typology prior, learned from TRAIN (same as baseline) ---
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

    # --- 2. account -> zone signal, learned from TRAIN hops only ---
    account_zone_counts = defaultdict(lambda: defaultdict(int))
    for cid in train_ids:
        azone = actual_zone_by_complaint[cid]
        for h in hops_by_complaint.get(cid, []):
            account_zone_counts[h["to_account"]][azone] += 1
    account_zone_dist = {acc: normalize(counts) for acc, counts in account_zone_counts.items()
                          if sum(counts.values()) >= args.min_evidence}
    account_evidence_count = {acc: sum(counts.values()) for acc, counts in account_zone_counts.items()
                               if sum(counts.values()) >= args.min_evidence}

    def blended_posterior(ftype, accounts_seen_so_far):
        """Blend typology prior with accumulated account-zone evidence."""
        prior = prior_by_type.get(ftype, global_prior)
        # accumulate account evidence across all hops seen so far
        acc_evidence = defaultdict(float)
        total_trust = 0.0
        for acc in accounts_seen_so_far:
            if acc in account_zone_dist:
                evidence = account_evidence_count[acc]
                trust = min(1.0, evidence / args.trust_scale)
                total_trust += trust
                for z, p in account_zone_dist[acc].items():
                    acc_evidence[z] += trust * p
        acc_evidence = normalize(dict(acc_evidence)) if acc_evidence else {}

        alpha = min(1.0, total_trust / max(1, len(accounts_seen_so_far))) if accounts_seen_so_far else 0.0
        alpha = min(alpha, args.max_alpha)  # never fully discard the typology prior

        combined = defaultdict(float)
        for z, p in prior.items():
            combined[z] += (1 - alpha) * p
        for z, p in acc_evidence.items():
            combined[z] += alpha * p
        return dict(combined), alpha

    # --- 3. evaluate: run each test complaint hop-by-hop, score at FINAL hop ---
    top1_hits = 0
    topk_hits = 0
    n_eval = 0
    sample_trace = None

    # calibration tracking: does a higher final confidence tier actually
    # mean higher accuracy? this is the real test of "sharpening" — not
    # raw Top-K accuracy, which is a different question.
    tier_totals = defaultdict(int)
    tier_hits = defaultdict(int)
    conf_rose_count = 0
    conf_compared_count = 0

    def confidence_tier(top_prob):
        if top_prob >= 0.55:
            return "HIGH"
        elif top_prob >= 0.35:
            return "MEDIUM"
        return "LOW"

    for cid in test_ids:
        ftype = fraud_type_by_complaint[cid]
        actual = actual_zone_by_complaint[cid]
        seq_hops = hops_by_complaint.get(cid, [])
        if not seq_hops:
            continue
        n_eval += 1

        accounts_seen = []
        trace = []
        for h in seq_hops:
            accounts_seen.append(h["to_account"])
            posterior, alpha = blended_posterior(ftype, accounts_seen)
            ranked = sorted(posterior.items(), key=lambda kv: kv[1], reverse=True)
            top_prob_on_actual = posterior.get(actual, 0.0)
            trace.append({
                "hop_index": h["hop_index"],
                "top3": ranked[:args.top_k],
                "top_prob": ranked[0][1] if ranked else 0.0,
                "confidence_in_actual": top_prob_on_actual,
                "trust_in_account_signal": alpha,
            })

        posterior_final, _ = blended_posterior(ftype, accounts_seen)
        ranked_full = [z for z, _ in sorted(posterior_final.items(), key=lambda kv: kv[1], reverse=True)]

        is_top1_hit = bool(ranked_full and ranked_full[0] == actual)
        if is_top1_hit:
            top1_hits += 1
        if actual in ranked_full[:args.top_k]:
            topk_hits += 1

        # calibration: bucket by the FINAL top-predicted probability
        # (this is the number the UI badge is actually based on — the
        # system's confidence in ITS OWN top guess, not in the true zone,
        # since in production the true zone is unknown at prediction time)
        final_top_prob = trace[-1]["top_prob"] if trace else 0.0
        tier = confidence_tier(final_top_prob)
        tier_totals[tier] += 1
        if is_top1_hit:
            tier_hits[tier] += 1

        # sharpening check: did confidence in the eventual top-guess's
        # probability mass rise from hop 1 to the final hop?
        if len(trace) >= 2:
            conf_compared_count += 1
            if trace[-1]["top_prob"] > trace[0]["top_prob"]:
                conf_rose_count += 1

        if sample_trace is None and len(seq_hops) >= 3 and is_top1_hit:
            sample_trace = (cid, ftype, actual, trace)

    top1_rate = top1_hits / n_eval if n_eval else 0
    topk_rate = topk_hits / n_eval if n_eval else 0

    print("=" * 64)
    print("PRAHARI — Sequential estimator evaluation (hop-by-hop update)")
    print("=" * 64)
    print(f"Test complaints  : {n_eval}")
    print(f"Top-1 hit rate   : {top1_rate:.1%}   (compare against baseline_predictor.py's output)")
    print(f"Top-{args.top_k} hit rate   : {topk_rate:.1%}   (compare against baseline_predictor.py's output)")
    print()
    print("-- Calibration: does a higher confidence tier mean higher accuracy? --")
    print("   (this is the real question — not raw Top-K — because this is what")
    print("    the decision engine's auto-alert/review/log-only routing relies on)")
    for tier in ["HIGH", "MEDIUM", "LOW"]:
        total = tier_totals.get(tier, 0)
        hits = tier_hits.get(tier, 0)
        rate = hits / total if total else 0
        print(f"   {tier:<7} confidence  ->  {total:4d} cases  ->  Top-1 accuracy within tier: {rate:.1%}")
    print()
    if conf_compared_count:
        print(f"-- Sharpening: top-guess confidence rose from hop 1 to final hop in "
              f"{conf_rose_count}/{conf_compared_count} multi-hop cases ({conf_rose_count/conf_compared_count:.1%}) --")
    print()

    if sample_trace:
        cid, ftype, actual, trace = sample_trace
        print(f"Sample walkthrough — {cid} ({ftype}), actual zone = {actual}")
        print("-" * 64)
        for step in trace:
            top3_str = ", ".join(f"{z}:{p:.0%}" for z, p in step["top3"])
            print(f"  Hop {step['hop_index']}: confidence-in-actual-zone = {step['confidence_in_actual']:.0%}"
                  f" | trust-in-account-signal = {step['trust_in_account_signal']:.0%}"
                  f" | top{args.top_k} = [{top3_str}]")
        print("-" * 64)
        print("This is the number behind the UI's LOW -> MEDIUM -> HIGH badges.")


if __name__ == "__main__":
    main()