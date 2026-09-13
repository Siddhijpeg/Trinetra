// ─── Prototype Service Layer ──────────────────────────────────────────────────
// Service layer connecting the frontend to live TRINETRA backend API.
// Falls back gracefully if backend is unavailable.

import type { Case, Alert, OsintSignal, RiskZone, CasePrediction, Zone, ExplainabilityFactor } from '../types';
import { MOCK_CASES } from '../data/mockCases';
import { MOCK_ALERTS } from '../data/mockAlerts';
import { MOCK_OSINT_SIGNALS } from '../data/mockOsint';
import { ACTIVE_RISK_ZONES, ZONES_RAW } from '../data/mockZones';
import { DEMO_CASE_PREDICTION } from '../data/mockPredictions';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8001';

// ─── Cases ────────────────────────────────────────────────────────────────────

export const getCases = (): Case[] => MOCK_CASES;

export const getCaseById = (caseId: string): Case | undefined =>
  MOCK_CASES.find(c => c.caseId === caseId);

// ─── Alerts ───────────────────────────────────────────────────────────────────

export const getAlerts = (): Alert[] => MOCK_ALERTS;

export const getUnacknowledgedAlertCount = (): number =>
  MOCK_ALERTS.filter(a => a.status === 'unacknowledged').length;

// ─── Zones ────────────────────────────────────────────────────────────────────

export const getRiskZones = (): RiskZone[] => ACTIVE_RISK_ZONES;

export const getZoneById = (zoneId: string): Zone => {
  const found = ZONES_RAW.find(z => z.zoneId === zoneId);
  if (found) return found;
  return {
    zoneId: zoneId || 'Z000',
    district: zoneId ? `Zone ${zoneId}` : 'Central Delhi',
    state: 'India',
    lat: 28.6519,
    lng: 77.2315
  };
};

// ─── Response Mapper: Unified Backend JSON → CasePrediction UI Model ──────────

export const mapBackendResponseToCasePrediction = (data: any): CasePrediction => {
  const geo = data.geographic || {};
  const timing = data.timing || {};
  const fin = data.financial_exposure || {};
  const dec = data.decision || {};
  const dist = timing.intervention_distribution || {};

  const topZoneId = geo.predicted_destination_zone || 'Z001';
  const topZone = getZoneById(topZoneId);
  const confidence = Math.round(geo.confidence_score || dec.decision_confidence || 85);
  const p50 = dist.p50_minutes !== undefined ? Math.round(dist.p50_minutes) : 48;
  const p25 = dist.p25_minutes !== undefined ? Math.round(dist.p25_minutes) : 25;
  const p75 = dist.p75_minutes !== undefined ? Math.round(dist.p75_minutes) : 80;

  const priority = dec.priority || (confidence >= 75 ? 'CRITICAL' : 'HIGH');
  const isUrgent = priority === 'CRITICAL' || priority === 'HIGH' || p50 <= 45;
  const decisionType = priority === 'CRITICAL' ? 'auto-alert' : (priority === 'HIGH' ? 'human-review' : 'monitor');

  // Reconstruct evolution steps from M8 prediction history
  const evolutionSteps = (geo.prediction_history || []).map((step: any, idx: number) => ({
    stage: Math.min(idx, 3) as 0 | 1 | 2 | 3,
    label: step.stage === 'T0_prior' ? 'Initial Prior' : (step.stage === 'HOP_1' ? 'After Hop 1' : 'After Hop 2'),
    topZone: getZoneById(step.top_zone || 'Z000').district,
    confidence: Math.round(step.confidence || 50),
    zoneProbabilities: [
      { zone: getZoneById(step.top_zone || 'Z000'), probability: Math.round(step.confidence || 50), riskLevel: 'critical' as const }
    ]
  }));

  if (evolutionSteps.length === 0) {
    evolutionSteps.push({
      stage: 3,
      label: 'Decision Ready',
      topZone: topZone.district,
      confidence: confidence,
      zoneProbabilities: [{ zone: topZone, probability: confidence, riskLevel: 'critical' }]
    });
  }

  // Build XAI explainability factors from backend reason codes and financial signals
  const reasonCodes: string[] = dec.reason_codes || [];
  const explainabilityFactors: ExplainabilityFactor[] = reasonCodes.map((code, idx) => {
    const colors = ['#7C5CFC', '#5B8BFC', '#14B8A6', '#F59E0B', '#EF4444'];
    return {
      label: code.replace(/_/g, ' '),
      weight: Math.round(100 / Math.max(1, reasonCodes.length)),
      color: colors[idx % colors.length]
    };
  });

  if (fin.amount_at_risk_inr) {
    explainabilityFactors.unshift({
      label: `Financial Amount at Risk: ₹${(fin.amount_at_risk_inr / 100000).toFixed(1)}L`,
      weight: 35,
      color: '#10B981'
    });
  }

  return {
    caseId: data.case_id || 'NCRP-26-81942',
    topZone,
    riskScore: Math.round(dec.decision_confidence || confidence),
    confidence,
    estimatedWindow: `~${p50} min (${p25}–${p75} min)`,
    recoverability: {
      score: Math.round(dist.probability_remaining_beyond_sla ? dist.probability_remaining_beyond_sla * 100 : 74),
      windowMinutes: p50,
      windowLabel: `~${p50} min`,
      isUrgent
    },
    decision: {
      type: decisionType,
      label: priority,
      reason: dec.recommended_action || 'Priority assessment based on spatial & temporal risk',
      confidence: Math.round(dec.decision_confidence || confidence),
      recoverability: {
        score: Math.round(dist.probability_remaining_beyond_sla ? dist.probability_remaining_beyond_sla * 100 : 74),
        windowMinutes: p50,
        windowLabel: `~${p50} min`,
        isUrgent
      }
    },
    evolutionSteps,
    explainabilityFactors,
    model: data.system?.model_versions?.timing || 'Time-to-Event v1.0 (Dynamic Hazard + AFT + Quantile)'
  };
};

// Async API Prediction Fetcher from FastAPI Backend
export const fetchPredictionFromAPI = async (payload: any): Promise<CasePrediction> => {
  const res = await fetch(`${BACKEND_URL}/api/v1/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });

  if (!res.ok) {
    throw new Error(`Backend API returned status ${res.status}`);
  }

  const json = await res.json();
  return mapBackendResponseToCasePrediction(json);
};

// ─── Predictions ──────────────────────────────────────────────────────────────

export const getPredictionForCase = (caseId: string): CasePrediction | undefined => {
  if (caseId === 'NCRP-26-81942') return DEMO_CASE_PREDICTION;
  return undefined;
};

// ─── OSINT ────────────────────────────────────────────────────────────────────

export const getOsintSignals = (): OsintSignal[] => MOCK_OSINT_SIGNALS;

// ─── KPI Aggregates (for Command Center) ─────────────────────────────────────

export const getCommandCenterKPIs = () => ({
  activeCases: 1284,
  amountAtRisk: '₹18.6 Cr',
  highRiskZones: 27,
  priorityInterventions: 12,
});

// ─── Decision Logic (prototype rule-based) ───────────────────────────────────

export const evaluateDecision = (confidence: number, recoverabilityScore: number) => {
  if (confidence >= 75 && recoverabilityScore >= 50) {
    return { type: 'auto-alert', label: 'AUTO ALERT', reason: 'Confidence ≥ 75% and recoverability window open.' };
  } else if (confidence >= 50) {
    return { type: 'human-review', label: 'HUMAN REVIEW', reason: 'Moderate confidence — requires officer judgment.' };
  } else {
    return { type: 'monitor', label: 'MONITOR', reason: 'Low confidence — continue monitoring for new hops.' };
  }
};
