"""
TRINETRA Decision Engine Configuration & Centralized Thresholds
================================================================
Centralized, explainable policy rules for prototype priority assignment.
"""

# Time-to-Event Urgency Thresholds (minutes)
TIME_CRITICAL_P50_MINUTES = 15.0  # <= 15 mins -> CRITICAL_TIME_WINDOW
TIME_URGENT_P50_MINUTES = 30.0    # <= 30 mins -> URGENT_TIME_WINDOW

# Financial Exposure Thresholds (INR)
FINANCIAL_CRITICAL_EXPOSURE_INR = 500000.0 # >= ₹5 Lakhs
FINANCIAL_HIGH_EXPOSURE_INR = 100000.0     # >= ₹1 Lakh

# Geographic Confidence Thresholds (0-100)
GEO_HIGH_CONFIDENCE = 75.0
GEO_MEDIUM_CONFIDENCE = 50.0

# SLA Warning Horizon (minutes)
SLA_WARNING_MARGIN_MINUTES = 15.0
