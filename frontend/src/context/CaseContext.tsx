// ─── CaseContext ─────────────────────────────────────────────────────────────
// Single source of truth for all case predictions in TRINETRA.
//
// Architecture:
//   - On mount: background-fetches the final-stage prediction for all 7 cases
//     (used by Command Center, Cases table, Alert Center, Geo Intelligence)
//   - When setActiveCase(id) is called: also fetches T0, Hop1, Hop2 stages
//     for that case (used by Prediction Engine, CaseWorkspace)
//   - All screens read from this context — no screen maintains its own API state
//
// Error behavior: If backend is unreachable, predictions[caseId] stays null.
//   Screens MUST show an explicit "Backend unavailable" state — NOT fall back
//   to hardcoded mock values.

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { CASE_FIXTURES, buildStagePayload, type CaseInputFixture } from '../data/caseFixtures';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8001';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BackendPrediction {
  case_id: string;
  stage: number;          // 0 = T0, 1 = after hop 1, etc.
  geographic: {
    predicted_destination_zone: string;
    confidence_score: number;
    ranked_zones?: Array<{ zone_id: string; district?: string; probability: number }>;
    prediction_history?: any[];
  };
  timing: {
    intervention_distribution: {
      p25_minutes: number;
      p50_minutes: number;
      p75_minutes: number;
      survival_curve?: Array<{ minutes: number; probability_remaining: number }>;
    };
    operational_sla?: {
      sla_minutes: number;
      probability_remaining_beyond_sla: number;
    };
    model_version?: string;
  };
  financial_exposure: {
    amount_at_risk_inr: number;
    reported_loss_inr: number;
    amount_retained_ratio: number;
    estimated_exposure_inr: number;
  };
  decision: {
    priority: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    recommended_action: string;
    decision_confidence: number;
    sla_status?: {
      sla_minutes: number;
      breach_risk: string;
      status_label: string;
    };
    reason_codes: string[];
  };
  system?: {
    model_versions?: Record<string, string>;
  };
}

interface StagedPredictions {
  [stage: number]: BackendPrediction | null;
}

interface CaseContextValue {
  // Fixtures (input data only)
  caseFixtures: CaseInputFixture[];
  getCaseFixture: (caseId: string) => CaseInputFixture | undefined;

  // Active case navigation
  activeCaseId: string;
  setActiveCase: (caseId: string) => void;

  // Predictions: keyed by case_id → stage → BackendPrediction | null
  predictions: Record<string, StagedPredictions>;
  predictionsLoading: Record<string, boolean>;
  predictionsError: Record<string, string | null>;

  // Convenience helpers
  getFinalPrediction: (caseId: string) => BackendPrediction | null;
  getStagedPrediction: (caseId: string, stage: number) => BackendPrediction | null;
  isLoadingFinal: (caseId: string) => boolean;
  isStagedLoading: (caseId: string) => boolean;
}

// ─── Context ──────────────────────────────────────────────────────────────────

const CaseContext = createContext<CaseContextValue | null>(null);

export const useCaseContext = (): CaseContextValue => {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error('useCaseContext must be used inside CaseProvider');
  return ctx;
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CaseProvider({ children }: { children: React.ReactNode }) {
  const [activeCaseId, setActiveCaseId] = useState<string>('NCRP-26-81942');
  const [predictions, setPredictions] = useState<Record<string, StagedPredictions>>({});
  const [predictionsLoading, setPredictionsLoading] = useState<Record<string, boolean>>({});
  const [predictionsError, setPredictionsError] = useState<Record<string, string | null>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  // ── Core fetch function ──────────────────────────────────────────────────────
  const fetchPrediction = useCallback(async (caseId: string, stage: number) => {
    const key = `${caseId}:${stage}`;
    if (fetchedRef.current.has(key)) return; // Already fetched or in-flight
    fetchedRef.current.add(key);

    const fixture = CASE_FIXTURES.find(c => c.case_id === caseId);
    if (!fixture) return;

    // Mark global loading for this case
    setPredictionsLoading(prev => ({ ...prev, [caseId]: true }));
    setPredictionsError(prev => ({ ...prev, [caseId]: null }));

    try {
      const payload = buildStagePayload(fixture, stage);
      const res = await fetch(`${BACKEND_URL}/api/v1/predict`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        throw new Error(`Backend returned HTTP ${res.status}`);
      }

      const data: BackendPrediction = await res.json();
      data.case_id = caseId;
      data.stage = stage;

      setPredictions(prev => ({
        ...prev,
        [caseId]: {
          ...(prev[caseId] || {}),
          [stage]: data,
        },
      }));
    } catch (err: any) {
      const msg = err?.message || 'Backend unavailable';
      setPredictionsError(prev => ({ ...prev, [caseId]: msg }));
      // Mark as fetched even on error so we don't retry infinitely
    } finally {
      setPredictionsLoading(prev => ({ ...prev, [caseId]: false }));
    }
  }, []);

  // ── On mount: fetch final stage for ALL 7 cases (for Cases table / Command Center) ──
  useEffect(() => {
    CASE_FIXTURES.forEach(fixture => {
      const finalStage = fixture.hops.length;
      fetchPrediction(fixture.case_id, finalStage);
    });
  }, [fetchPrediction]);

  // ── When active case changes: fetch all stages for that case (for Prediction Engine) ──
  useEffect(() => {
    const fixture = CASE_FIXTURES.find(c => c.case_id === activeCaseId);
    if (!fixture) return;
    const maxStage = fixture.hops.length;
    for (let stage = 0; stage <= maxStage; stage++) {
      fetchPrediction(activeCaseId, stage);
    }
  }, [activeCaseId, fetchPrediction]);

  // ── Convenience helpers ───────────────────────────────────────────────────────
  const getCaseFixture = useCallback((caseId: string) =>
    CASE_FIXTURES.find(c => c.case_id === caseId), []);

  const getFinalPrediction = useCallback((caseId: string): BackendPrediction | null => {
    const fixture = CASE_FIXTURES.find(c => c.case_id === caseId);
    if (!fixture) return null;
    const finalStage = fixture.hops.length;
    return predictions[caseId]?.[finalStage] ?? null;
  }, [predictions]);

  const getStagedPrediction = useCallback((caseId: string, stage: number): BackendPrediction | null => {
    return predictions[caseId]?.[stage] ?? null;
  }, [predictions]);

  const isLoadingFinal = useCallback((caseId: string): boolean => {
    return predictionsLoading[caseId] ?? false;
  }, [predictionsLoading]);

  const isStagedLoading = useCallback((caseId: string): boolean => {
    return predictionsLoading[caseId] ?? false;
  }, [predictionsLoading]);

  const setActiveCase = useCallback((caseId: string) => {
    setActiveCaseId(caseId);
  }, []);

  const value: CaseContextValue = {
    caseFixtures: CASE_FIXTURES,
    getCaseFixture,
    activeCaseId,
    setActiveCase,
    predictions,
    predictionsLoading,
    predictionsError,
    getFinalPrediction,
    getStagedPrediction,
    isLoadingFinal,
    isStagedLoading,
  };

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

// ─── Zone label helper (ZONES_RAW subset used for display) ────────────────────
export const ZONE_LABELS: Record<string, string> = {
  Z000: 'Central Delhi', Z001: 'South Delhi', Z002: 'Mumbai City',
  Z003: 'Mumbai Suburban', Z004: 'Pune', Z005: 'Bengaluru Urban',
  Z006: 'Hyderabad', Z007: 'Chennai', Z008: 'Kolkata',
  Z009: 'Jaipur', Z010: 'Lucknow', Z011: 'Ahmedabad',
  Z012: 'Patna', Z013: 'Bhopal', Z014: 'Chandigarh',
  Z015: 'Kochi', Z016: 'Guwahati', Z017: 'Indore',
  Z018: 'Surat', Z019: 'Nagpur',
};

export const ZONE_COORDS: Record<string, { lat: number; lng: number }> = {
  Z000: { lat: 28.6519, lng: 77.2315 }, Z001: { lat: 28.5245, lng: 77.2066 },
  Z002: { lat: 18.9750, lng: 72.8258 }, Z003: { lat: 19.0760, lng: 72.8777 },
  Z004: { lat: 18.5204, lng: 73.8567 }, Z005: { lat: 12.9716, lng: 77.5946 },
  Z006: { lat: 17.3850, lng: 78.4867 }, Z007: { lat: 13.0827, lng: 80.2707 },
  Z008: { lat: 22.5726, lng: 88.3639 }, Z009: { lat: 26.9124, lng: 75.7873 },
  Z010: { lat: 26.8467, lng: 80.9462 }, Z011: { lat: 23.0225, lng: 72.5714 },
  Z012: { lat: 25.5941, lng: 85.1376 }, Z013: { lat: 23.2599, lng: 77.4126 },
  Z014: { lat: 30.7333, lng: 76.7794 }, Z015: { lat: 9.9312,  lng: 76.2673 },
  Z016: { lat: 26.1445, lng: 91.7362 }, Z017: { lat: 22.7196, lng: 75.8577 },
  Z018: { lat: 21.1702, lng: 72.8311 }, Z019: { lat: 21.1458, lng: 79.0882 },
};

export const getZoneLabel = (zoneId: string): string =>
  ZONE_LABELS[zoneId] || zoneId;

export const priorityColor = (priority: string): string => {
  switch (priority) {
    case 'CRITICAL': return '#E5484D';
    case 'HIGH':     return '#F97316';
    case 'MEDIUM':   return '#F59E0B';
    default:         return '#14B8A6';
  }
};

export const priorityRiskLevel = (priority: string): 'critical' | 'high' | 'medium' | 'low' => {
  switch (priority) {
    case 'CRITICAL': return 'critical';
    case 'HIGH':     return 'high';
    case 'MEDIUM':   return 'medium';
    default:         return 'low';
  }
};
