"""
TRINETRA Decision Engine — Policy Configuration
================================================
All thresholds are named, documented, and version-controlled here.
To adjust policy: change values in this file only — do not scatter
magic numbers through the engine code.

Version: v1.0
Dataset: Synthetic V2
Tuning basis: Empirical inspection of V2 model output distributions
              on the validation split (Month 5 ONLY).

⚠️  Do NOT tune these thresholds using Month-6 test data.
"""

# ─────────────────────────────────────────────────────────────────────────────
# GEOGRAPHIC SIGNAL THRESHOLDS
# ─────────────────────────────────────────────────────────────────────────────

# Minimum Top-1 probability to consider geographic evidence "strong"
# V2 M8 median Top-1 prob for correctly ranked cases ≈ 0.20–0.35
GEO_HIGH_CONFIDENCE_THRESHOLD   = 0.20   # Top-1 prob >= this → strong geo signal

# Top-1 probability below this → geo signal is "weak" (prior-dominated)
GEO_LOW_CONFIDENCE_THRESHOLD    = 0.08   # Top-1 prob < this → weak

# Top-3 cumulative probability: if high → distribution is concentrated
GEO_TOP3_CONCENTRATED_THRESHOLD = 0.55   # Top-3 mass >= this → concentrated

# M8 registry reliability: if the best registry signal reliability >= this,
# evidence is considered "registry-supported"
GEO_REGISTRY_SUPPORTED_THRESHOLD = 0.10  # reliability score >= this

# Whether any registry evidence exists at all
GEO_MIN_REGISTRY_SIGHTINGS       = 1     # at least 1 prior sighting

# ─────────────────────────────────────────────────────────────────────────────
# TIMING SIGNAL THRESHOLDS
# ─────────────────────────────────────────────────────────────────────────────

# Default operational SLA (minutes) — configurable at call time
# Represents the minimum time an officer needs to execute intervention
DEFAULT_SLA_MINUTES = 30.0

# P50 window below which intervention is considered "urgent"
# V2 test median P50 ≈ 54 min; acute urgency starts well below median
TIMING_HIGH_URGENCY_P50_THRESHOLD   = 35.0   # P50 < 35 min → high urgency
TIMING_MEDIUM_URGENCY_P50_THRESHOLD = 70.0   # P50 < 70 min → medium urgency

# Probability that opportunity remains beyond SLA (from survival curve)
# High probability → intervention feasible; low → likely too late
TIMING_SLA_VIABLE_THRESHOLD         = 0.45   # P(T > SLA) >= this → viable window
TIMING_SLA_LOW_THRESHOLD            = 0.20   # P(T > SLA) < this → likely expired

# Quantile interval width — narrow interval = precise timing estimate
TIMING_NARROW_INTERVAL_THRESHOLD    = 45.0   # P75-P25 < 45 min → precise
TIMING_WIDE_INTERVAL_THRESHOLD      = 90.0   # P75-P25 > 90 min → uncertain

# ─────────────────────────────────────────────────────────────────────────────
# EXPOSURE THRESHOLDS
# ─────────────────────────────────────────────────────────────────────────────

# Amount at risk (INR) thresholds
EXPOSURE_HIGH_THRESHOLD   = 200_000   # ≥ ₹2L → high exposure
EXPOSURE_MEDIUM_THRESHOLD =  50_000   # ≥ ₹50k → medium
# Below MEDIUM_THRESHOLD → low exposure

# ─────────────────────────────────────────────────────────────────────────────
# DECISION RULES — CRITICAL_ALERT
# ─────────────────────────────────────────────────────────────────────────────
# A case is CRITICAL_ALERT when intervention is both:
#   (a) geographically actionable — we know WHERE
#   (b) temporally urgent      — the window is closing
# The rule is: BOTH conditions must hold (not just one).

# Minimum geo confidence score for CRITICAL_ALERT
CRITICAL_GEO_MIN_CONFIDENCE     = GEO_HIGH_CONFIDENCE_THRESHOLD  # 0.20

# Maximum P50 for CRITICAL_ALERT
CRITICAL_TIMING_MAX_P50         = TIMING_HIGH_URGENCY_P50_THRESHOLD  # 35 min

# Minimum SLA viability for CRITICAL_ALERT
CRITICAL_SLA_MIN_VIABILITY      = TIMING_SLA_VIABLE_THRESHOLD  # 0.45

# OR: high exposure alone with moderate geo+timing can also trigger CRITICAL
CRITICAL_EXPOSURE_OVERRIDE_AMOUNT   = EXPOSURE_HIGH_THRESHOLD   # ₹2L
CRITICAL_EXPOSURE_MIN_GEO_CONF      = 0.12   # needs at least some geo evidence
CRITICAL_EXPOSURE_MAX_P50           = TIMING_MEDIUM_URGENCY_P50_THRESHOLD  # 70 min

# ─────────────────────────────────────────────────────────────────────────────
# DECISION RULES — REVIEW
# ─────────────────────────────────────────────────────────────────────────────
# REVIEW when signals are present but not strong enough for CRITICAL_ALERT:
#   - Moderate geo evidence OR moderate timing urgency
#   - Geographic concentration exists but timing is relaxed
#   - High exposure with weak-to-moderate signals

REVIEW_GEO_MIN_CONFIDENCE       = GEO_LOW_CONFIDENCE_THRESHOLD   # 0.08
REVIEW_TIMING_MAX_P50           = TIMING_MEDIUM_URGENCY_P50_THRESHOLD  # 70 min

# ─────────────────────────────────────────────────────────────────────────────
# DECISION RULES — MONITOR
# ─────────────────────────────────────────────────────────────────────────────
# MONITOR when evidence is too weak for immediate action:
#   - Weak geographic signal (prior-dominated)
#   - Long intervention window (P50 > MEDIUM threshold)
#   - Minimal exposure
# Default when no stronger rule fires.

# ─────────────────────────────────────────────────────────────────────────────
# DECISION CONFIDENCE SCORING
# ─────────────────────────────────────────────────────────────────────────────
# A continuous score 0–1 summarising how confident the decision is.
# This is a weighted combination — not a probability of outcome.
# Weights reflect relative importance of each signal.

CONFIDENCE_WEIGHT_GEO     = 0.40   # geographic concentration/confidence
CONFIDENCE_WEIGHT_TIMING  = 0.35   # timing urgency (inverted P50)
CONFIDENCE_WEIGHT_REGISTRY = 0.15  # registry evidence quality
CONFIDENCE_WEIGHT_EXPOSURE = 0.10  # financial exposure magnitude

# ─────────────────────────────────────────────────────────────────────────────
# SLA HORIZON PROBABILITIES
# ─────────────────────────────────────────────────────────────────────────────
# Which horizons to extract P(T > horizon) from the survival curve
SLA_HORIZONS_MINUTES = [15, 30, 60]

# ─────────────────────────────────────────────────────────────────────────────
# VERSION
# ─────────────────────────────────────────────────────────────────────────────
DECISION_ENGINE_VERSION = "Deterministic Policy v2.0"
DECISION_ENGINE_DATASET = "V2 Synthetic"
