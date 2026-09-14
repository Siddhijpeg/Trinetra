# TRINETRA

**Cyber-Fraud Intervention Intelligence System**  
*Smart India Hackathon 2026 — Prototype*

---

## The Problem

Cybercrime fund-recovery failures arise from a critical timing gap: 95.5% of NCRP complaints are filed **after** the cash-out has already occurred. By the time law enforcement acts, the money is gone.

## The TRINETRA Solution

TRINETRA is an intelligence engine that operates on **pre-cashout transaction streams** (not post-facto complaints) to answer two questions:

1. **WHERE** will the cash be withdrawn? — *Geographic Prediction*
2. **HOW MUCH TIME** remains to intercept it? — *Intervention Window Estimation*

It does not autonomously freeze accounts. It assists **authorized investigators** with calibrated, ranked intelligence to prioritize action.

---

## Current Prototype State

This repository is an **SIH prototype** using a fully synthetic 40,000-complaint digital twin. It is **not connected to real NCRP, I4C, or banking data**.

```
Frontend (Nisha's UI)        ←→  Static mock data (TS files)
AI Copilot (Palak's work)    ←→  Google Gemini API (direct browser call)
ML Pipeline (Python)         ←→  data/synthetic/ CSVs → artifacts/
```

The frontend and ML pipeline are currently airgapped. Integration is the next phase.

---

## Architecture

```
[External APIs: NCRP, Banks]
         ↓
   [Schema Adapters]           ← core/adapters/
         ↓
[Canonical Event Store]        ← core/event_store/
      ↙        ↘
[Geo Engine]  [Timing Engine]  ← ml/geographic/, ml/timing/
      ↘        ↙
  [Decision Engine]            ← ml/decision/ (NOT YET IMPLEMENTED)
         ↓
     [Alerting]
         ↓
  [Outcome Feedback Loop]
```

---

## Key Components

### 🗺️ Geographic Engine (M8 Reliability-Aware Registry)
Sequential Bayesian prediction enriched by cross-complaint entity memory.  
**Frozen parameters:** `λ=0.5, k=5.0, w_rel=2.0, T=5.17`  
→ See [`docs/ml/GEOGRAPHIC_ENGINE.md`](docs/ml/GEOGRAPHIC_ENGINE.md)

### 🕐 Intervention Window Engine (R2 XGBoost — Experimental)
Estimates remaining minutes until cash-out using pre-cashout hop features.  
Outputs P25/Median/P75 quantiles and survival probabilities.  
→ See [`docs/architecture/TIME_TO_EVENT_ENGINE.md`](docs/architecture/TIME_TO_EVENT_ENGINE.md)

### 🤖 AI Copilot (Palak's Gemini Integration)
Direct Google Gemini SDK integration in the browser via `VITE_GEMINI_API_KEY`.  
→ See [`frontend/src/screens/AICopilot.tsx`](frontend/src/screens/AICopilot.tsx)

### 🎨 Frontend (Nisha's React/Vite UI)
Screens: Command Center · Cases · Geo Intelligence · Fraud Network · Alerts · Prediction Engine · OSINT · AI Copilot · Reports · Data Sources · Security/Audit

---

## How to Run

### Frontend
```bash
cd frontend
cp .env.example .env           # Then add your VITE_GEMINI_API_KEY
npm install
npm run dev                    # Dev server at http://localhost:5173
```

### ML Smoke Tests
```bash
pip install -r requirements.txt
cd ml/geographic
python -c "import baseline_predictor" 2>&1 | head -5   # Syntax check
```

---

## Synthetic Data Disclaimer

> ⚠️ All data in `data/synthetic/` is **artificially generated**. It does not represent real crime statistics, real Indian geography distributions, or real NCRP/banking data. It exists solely as a prototype test harness.

---

## Future Real-World Integration

Real data sources (NCRP, banks, FIUs) will enter through `core/adapters/` which normalize external schemas into canonical TRINETRA events — without changing the core algorithms.

---

## Current Limitations

- Frontend is 100% mocked; no live ML inference connection yet.
- Copilot has no dynamic case context injection (RAG is future work).
- Timing model (R2) is experimental; certified survival modeling needed for production.
- Decision Engine thresholds are not yet implemented.
