# TRINETRA — Prototype Integration Status Document

**Document Version:** 2.0.0  
**Integration Status:** ✅ **END-TO-END WORKING PROTOTYPE**  
**Date:** 2026-09-14  

---

## 1. Executive Summary

The **TRINETRA** prototype is now fully integrated end-to-end. One unified prediction flow connects the frontend workspace UI to live backend model engines:

```
[ Frontend React UI ]
        ↓ (HTTP POST /api/v1/predict)
[ FastAPI Backend (backend/main.py) ]
        ↓ (backend/services/prediction_service.py)
  ┌─────┴─────────────────────┬───────────────────────────┬────────────────────────────────┐
  ↓                           ↓                           ↓                                ↓
[ Geographic M8 Engine ]  [ Time-to-Event Engine ]  [ Financial Exposure ]          [ Decision Engine ]
 (Bayesian Spatial Priors) (Dynamic Hazard + Calib) (Deterministic Heuristic)       (Policy Rule Layer)
  └─────┬─────────────────────┴───────────────────────────┴────────────────────────────────┘
        ↓
[ Unified JSON Response ]
        ↓ (frontend/src/services/prototypeService.ts)
[ CasePrediction UI Model ] → Rendered in Case Workspace & Prediction Engine UI
```

---

## 2. Model Engines & Layer Status

| Component | Status | Implementation Details |
| :--- | :--- | :--- |
| **Time-to-Event Engine** | **FROZEN (Phase 2B)** | Schema-first Dynamic Discrete-Time Hazard Model ($S(t)$ survival curve) with Month-5 Isotonic Calibration, companion AFT expected time, and companion Direct Quantiles ($q_{0.25}, q_{0.50}, q_{0.75}$). 10 transaction-temporal features, 0 train-serve skew. |
| **Geographic Model (M8)** | **FROZEN (Phase 2A)** | Reliability-aware registry mapping fraud telemetry to 75 spatial ATM withdrawal zones. Sequential Bayesian likelihood updates across transaction hops. |
| **Financial Exposure** | **PROTOTYPE HEURISTIC** | Deterministic risk signal packaging `amount_at_risk_inr`, `reported_loss_inr`, `amount_retained_ratio`, and `estimated_exposure_inr`. |
| **Decision Engine** | **RULE-BASED POLICY** | Centralized, explainable policy rules in `backend/services/decision_engine.py` using thresholds from `backend/config/decision_thresholds.py`. Outputs `priority` (`CRITICAL`/`HIGH`/`MEDIUM`/`LOW`), `recommended_action`, `decision_confidence`, `sla_status`, and machine-readable `reason_codes`. |

---

## 3. API Contract (`POST /api/v1/predict`)

### Endpoint
`POST http://localhost:8001/api/v1/predict`

### Example Request Payload
```json
{
  "case_id": "NCRP-26-81942",
  "prediction_time": "2025-06-01T10:15:00",
  "sla_minutes": 45.0,
  "complaint": {
    "complaint_id": "NCRP-26-81942",
    "incident_time": "2025-06-01T10:00:00",
    "available_time": "2025-06-01T10:05:00",
    "amount_inr": 480000.0,
    "typology_id": "TYP_INVESTMENT"
  },
  "hops": [
    {
      "hop_id": "HOP_1",
      "event_time": "2025-06-01T10:05:00",
      "available_time": "2025-06-01T10:10:00",
      "amount": 180000.0,
      "destination_account": "ACC_7821"
    },
    {
      "hop_id": "HOP_2",
      "event_time": "2025-06-01T10:11:00",
      "available_time": "2025-06-01T10:14:00",
      "amount": 150000.0,
      "destination_account": "ACC_3294"
    }
  ]
}
```

### Example Unified Response Payload
```json
{
  "case_id": "NCRP-26-81942",
  "prediction_time": "2025-06-01T10:15:00",
  "geographic": {
    "predicted_destination_zone": "Z009",
    "confidence_score": 1.9,
    "ranked_zones": [
      { "rank": 1, "zone_id": "Z009", "district": "Gurugram", "state": "Haryana", "probability": 0.019499 }
    ],
    "model_version": "M8_Reliability_Aware_Frozen"
  },
  "timing": {
    "intervention_distribution": {
      "survival_curve": [
        { "minutes": 0.0, "probability_remaining": 1.0 },
        { "minutes": 30.0, "probability_remaining": 0.5949 },
        { "minutes": 60.0, "probability_remaining": 0.2904 }
      ],
      "p25_minutes": 18.5,
      "p50_minutes": 39.4,
      "p75_minutes": 68.9
    },
    "companion_estimates": {
      "aft": { "expected_minutes": 34.5 },
      "direct_quantiles": { "p25_minutes": 18.9, "p50_minutes": 26.2, "p75_minutes": 56.9 }
    },
    "model_version": "Time-to-Event v1.0 (Dynamic Hazard + AFT + Quantile)"
  },
  "financial_exposure": {
    "amount_at_risk_inr": 330000.0,
    "reported_loss_inr": 480000.0,
    "amount_retained_ratio": 0.3125,
    "estimated_exposure_inr": 480000.0,
    "method": "prototype_deterministic_exposure"
  },
  "decision": {
    "priority": "HIGH",
    "recommended_action": "HUMAN REVIEW — Dispatch urgent alert to duty officer for priority account block",
    "decision_confidence": 20.1,
    "sla_status": {
      "sla_minutes": 45.0,
      "breach_risk": "HIGH",
      "status_label": "P50 window (~39.4m) within SLA target (45m)"
    },
    "reason_codes": [
      "LOW_GEO_CONFIDENCE",
      "STANDARD_TIME_WINDOW",
      "HIGH_FINANCIAL_EXPOSURE",
      "SLA_BREACH_RISK"
    ]
  },
  "system": {
    "prototype": true,
    "model_versions": {
      "geographic": "M8_Reliability_Aware_Frozen",
      "timing": "Time-to-Event v1.0 (Dynamic Hazard + AFT + Quantile)",
      "decision_engine": "Deterministic Policy v1.0"
    }
  }
}
```

---

## 4. Frontend Integration & Mock Data Status

- **Live Integration**: `frontend/src/services/prototypeService.ts` exports `fetchPredictionFromAPI(payload)` which posts directly to `http://localhost:8001/api/v1/predict` and maps the response into the UI `CasePrediction` model using `mapBackendResponseToCasePrediction`.
- **UI Components**: `CaseWorkspace.tsx` fetches and renders real API prediction results on mount and updates prediction stage, risk badge, SLA urgency, and explainability reason codes dynamically.
- **Mock Data Containment**: `mockPredictions.ts` and `mockCases.ts` are retained strictly as offline fallback fixtures and static test mocks. Main live prediction flow uses real backend outputs.

---

## 5. Known Limitations
1. **Financial Signal**: Currently computed via deterministic rules from canonical transaction/complaint amounts; not a trained financial ML loss model.
2. **Decision Engine**: Operates on explainable, deterministic rule-based policies rather than a trained reinforcement learning or multi-objective optimization agent.
3. **Database Layer**: `LocalEventStore` is in-memory for prototype demonstration.

---

## 6. Startup Commands

### Backend Server (Port 8001)
```bash
python3 -m uvicorn backend.main:app --host 0.0.0.0 --port 8001
```

### Frontend Server (Port 5173 / 8443)
```bash
cd frontend && npm run dev
```

### Test Backend API
```bash
python3 -c "import urllib.request, json; req = urllib.request.Request('http://localhost:8001/api/v1/predict', data=json.dumps({'case_id': 'TEST', 'prediction_time': '2025-06-01T10:15:00'}).encode(), headers={'Content-Type': 'application/json'}); print(urllib.request.urlopen(req).read().decode())"
```
