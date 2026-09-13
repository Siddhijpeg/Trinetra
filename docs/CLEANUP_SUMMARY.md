# TRINETRA — Repository Cleanup Summary

**Branch:** `refactor/trinetra-production-architecture`  
**Backup:** `backup/pre-production-cleanup`  
**Date:** 2026-09-13

---

## COMPLETED

### ✅ Phase 1 — Frontend Consolidation
- Archived `frontend/` (old HTML) → `archive/legacy/frontend/old-frontend/`
- Archived `forntend/` (typo folder) → `archive/legacy/frontend/old-forntend/`
- Moved `frontend-nisha/frontend-Nisha/` → `frontend/` (canonical, git-history preserved)
- Frontend build: **✓ PASSED** (658 modules, `dist/` generated)
- `@google/genai` dependency added to `frontend/package.json`
- `frontend/.env.example` created with `VITE_GEMINI_API_KEY=` (no key)

### ✅ Phase 2 — Palak's Copilot Preserved
- `AICopilot.tsx` untouched — full Gemini SDK flow intact
- Missing personal API key is an expected developer-local config issue
- `frontend/.env.example` documents the required variable

### ✅ Phase 3 — Data Cleanup
- `data/generated/full/` → `data/synthetic/` (official 40k dataset, active)
- `data/synthetic/splits/` preserved (train/val/test splits for ML)
- `data/generated/pilot/` → `archive/legacy/data/pilot/`
- `data/out/` → `archive/legacy/data/out/`
- Root stray CSVs → `archive/legacy/data/root_stray/`
- `data/README.md` created with synthetic-data disclaimer

### ✅ Phase 4 — Canonical Domain Model
| File | Status |
|------|--------|
| `core/canonical/entities.py` | Created |
| `core/canonical/events.py` | Created |
| `core/canonical/schemas.py` | Created |
| `core/canonical/__init__.py` | Created |

### ✅ Phase 5 — Adapter Layer
| File | Status |
|------|--------|
| `core/adapters/base_adapter.py` | Created |
| `core/adapters/synthetic_adapter.py` | Created |
- Smoke test parsed **116,205 transactions** from `data/synthetic/hops.csv` ✓

### ✅ Phase 6 — As-Of-Time Event Store
| File | Status |
|------|--------|
| `core/event_store/store.py` | Created |
- Temporal leakage test: **PASSED** — future complaint correctly hidden from past prediction ✓

### ✅ Phase 7 — Geographic Engine Refactor
| Action | Result |
|--------|--------|
| `ml/baseline_predictor.py` → `ml/geographic/` | ✓ |
| `ml/registry_models.py` → `ml/geographic/` | ✓ |
| `ml/registry_evaluate.py` → `ml/geographic/` | ✓ |
| `ml/registry_bootstrap.py` → `ml/geographic/` | ✓ |
| `ml/geographic/interface.py` created | ✓ |
| M8 parameters unchanged | ✓ |
| All `data/generated` paths → `data/synthetic` | ✓ |
| Artifact paths → `artifacts/models/` | ✓ |

### ✅ Phase 8 — Timing Engine Refactor
| Action | Result |
|--------|--------|
| `ml/recoverability_data.py` → `ml/timing/` | ✓ |
| `ml/recoverability_models.py` → `ml/timing/` | ✓ |
| `ml/timing/interface.py` created (labeled EXPERIMENTAL) | ✓ |
| Artifact paths → `artifacts/metrics/` | ✓ |

### ✅ Phase 9 — Artifact Cleanup
| Artifact | Action |
|----------|--------|
| `ml/trained_model.json` (1.5MB — active M8) | → `artifacts/models/trained_model_m8.json` |
| `ml/xgboost_model.json` (26MB — active M8) | → `artifacts/models/xgboost_model_m8.json` |
| `ml/rich_registry.json` | → `artifacts/models/rich_registry.json` |
| `ml/ml/` (verified MD5 duplicate of ml/) | → `archive/legacy/ml/ml_duplicate/` |
| `artifacts/models/trained_model.json` (old 60-case) | → `archive/legacy/artifacts/` |
| Evaluation metrics JSONs | → `artifacts/metrics/` |
| Recoverability CSVs | → `artifacts/metrics/` |
| Root stray payload JSONs | → `artifacts/metrics/` |

### ✅ Phase 10 — Decision Engine Placeholder
- `ml/decision/README.md` created documenting future inputs/outputs

### ✅ Phase 11 — Backend Foundation
- `backend/main.py` scaffold created
- `backend/api/` and `backend/services/copilot/` directories created
- No fake government APIs implemented

### ✅ Phase 12 — Dependencies
- `requirements.txt` created (pandas, numpy, scikit-learn, xgboost)
- Root `package.json` / `package-lock.json` removed (Node ownership moved to `frontend/`)
- `node_modules` confirmed not tracked in git ✓
- No `.env` files committed ✓

### ✅ Phase 13 — Documentation
| Document | Status |
|----------|--------|
| `README.md` | Rewritten for SIH judges |
| `docs/architecture/CURRENT_ARCHITECTURE.md` | Created |
| `docs/architecture/TARGET_ARCHITECTURE.md` | Created |
| `docs/architecture/TIME_TO_EVENT_ENGINE.md` | Created |
| `docs/architecture/FEEDBACK_LOOP.md` | Created |
| `docs/ml/GEOGRAPHIC_ENGINE.md` | Created |
| `docs/ml/REGISTRY_M8.md` | Created |
| `data/README.md` | Created |
| Old root .md files | → `docs/reports/` |

### ✅ Phase 14 — Validation
| Test | Result |
|------|--------|
| Frontend build (`npm run build`) | ✓ PASSED |
| Python syntax checks (9 files) | ✓ ALL PASSED |
| `TransactionEvent` / `ComplaintEvent` construction | ✓ PASSED |
| As-of-time leakage test | ✓ PASSED |
| Synthetic adapter (116,205 txns parsed) | ✓ PASSED |
| `predict_geography` interface shape | ✓ PASSED |
| `estimate_intervention_window` interface shape | ✓ PASSED |
| archive/ import scan | ✓ CLEAN |
| data/generated path scan | ✓ CLEAN |
| node_modules tracked | ✓ NOT TRACKED |
| .env committed | ✓ NOT COMMITTED |

---

## WARNINGS (Non-Blocking)

1. **Vite config warnings**: `vite.config.ts` uses `__dirname` and JSON import without attributes. These are forward-compatibility warnings only; build succeeds. To be addressed when Vite 9 becomes default.
2. **Chunk size**: `index-L468WmjD.js` is 1,016 kB (>500 kB limit). Code-splitting is a future optimization.
3. **`archive/legacy/ml/train_engine.py`** still references `data/generated` paths — acceptable since it is in the archive and no longer executed.

---

## UNRESOLVED / NOT STARTED

- `ml/geographic/interface.py` — stub only; does not call M8 logic yet
- `ml/timing/interface.py` — stub only; does not call R2 logic yet
- Backend is a stub; no live API routes
- Copilot has no backend context injection (RAG)
- Decision Engine not yet implemented (by design)
- `frontend/src/data/mockCopilot.ts` unused (mock copilot data from before Palak's live Gemini work)

---

## FILES MOVED
See git diff --stat for complete listing (164 files, 1887 insertions, 1284 deletions)

---

## HOW TO RUN

```bash
# Frontend
cd frontend && npm install && npm run dev

# Smoke Tests
cd <repo_root> && python3 tests/smoke_tests.py

# Geographic Engine (from ml/geographic/ after pip install -r requirements.txt)
cd ml/geographic && python baseline_predictor.py

# Timing Engine (from ml/timing/)
cd ml/timing && python recoverability_data.py && python recoverability_models.py
```

---

## NEXT EXACT STEP

**Decision Engine Integration** or **Frontend → Backend API Connection**:
1. Wire `ml/geographic/interface.py` → actual M8 registry logic
2. Wire `ml/timing/interface.py` → actual R2 model
3. Create a simple FastAPI or Flask backend at `backend/main.py`
4. Connect frontend `prototypeService.ts` to the backend API endpoint
5. Pass real ML prediction payloads into the frontend screens
