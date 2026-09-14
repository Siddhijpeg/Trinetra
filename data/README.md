# TRINETRA Data

This directory contains the data used by the TRINETRA ML prototype.

**CRITICAL DISCLAIMER:**
- This is entirely **SYNTHETIC DATA**. It is a 40,000-case digital twin created strictly as a test harness.
- It does NOT contain real NCRP, I4C, or banking data.
- The geographic, timing, and risk distributions are simulated and do NOT represent real Indian crime facts.

## Schema Warning
The CSV schemas in `synthetic/` are for offline simulation and evaluation only. 
The algorithms must not depend on the exact synthetic CSV column names in production. 
Future real-world APIs will enter the system through the canonical adapters in `core/adapters/`, mapping diverse real-world JSON structures into the unified `PredictionContext`.
