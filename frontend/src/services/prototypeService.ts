// ─── Prototype Service Layer ──────────────────────────────────────────────────
// Service layer connecting the frontend to the live TRINETRA V2 backend API.
//
// Single adapter responsibility:
//   Backend V2 JSON  →  mapBackendResponseToCasePrediction()  →  CasePrediction
//
// V2 response differences from V1:
//   • decision.decision       (was .priority)           — "CRITICAL" | "REVIEW" | "MONITOR"
//   • decision.decision_confidence  (was 0–100)          — now 0–1 float
//   • decision.reasons        (was .reason_codes)        — human-readable strings, not tokens
//   • ranked_zones[].probability                         — 0–1 float (multiply × 100 for %)
//   • ranked_zones has lat/lng/zone_name/city/district/state inline — no ZONES_RAW lookup needed
//   • No decision.recommended_action, no decision.sla_status, no decision.reason_codes

import type { Case, Alert, OsintSignal, RiskZone, CasePrediction, Zone, ExplainabilityFactor } from '../types';
import { MOCK_CASES } from '../data/mockCases';
import { MOCK_ALERTS } from '../data/mockAlerts';
import { MOCK_OSINT_SIGNALS } from '../data/mockOsint';
import { ACTIVE_RISK_ZONES } from '../data/mockZones';

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

// Build a Zone object from a V2 ranked_zone entry.
// V2 ranked_zones carry all metadata inline (no ZONES_RAW lookup needed).
export const zoneFromRankedZone = (rz: {
  zone_id: string;
  zone_name?: string;
  district?: string;
  state?: string;
  lat?: number;
  lng?: number;
}): Zone => ({
  zoneId:   rz.zone_id,
  district: rz.district || rz.zone_name || rz.zone_id,
  state:    rz.state || '',
  lat:      rz.lat ?? 20.5937,
  lng:      rz.lng ?? 78.9629,
});

// ─── Response Mapper: V2 Backend JSON → CasePrediction UI Model ──────────────
//
// ALL parsing of the backend response lives here.
// Components read from CaseContext which stores BackendPrediction; this mapper
// is used only where the legacy CasePrediction shape is still needed
// (CaseWorkspace, alerts, etc.).

export const mapBackendResponseToCasePrediction = (data: any): CasePrediction => {
  const geo  = data.geographic || {};
  const tim  = data.timing     || {};
  const fin  = data.financial_exposure || {};
  const dec  = data.decision   || {};
  const dist = tim.intervention_distribution || {};

  // ── Geographic ──────────────────────────────────────────────────────────────
  // ranked_zones[].probability is 0–1; convert to 0–100 for UI
  const rankedZones: Array<{ zone_id: string; zone_name?: string; district?: string; state?: string; lat?: number; lng?: number; probability: number }> =
    (geo.ranked_zones || []).map((rz: any) => ({ ...rz, probability: rz.probability }));

  const topRz = rankedZones[0];
  const topZone: Zone = topRz
    ? zoneFromRankedZone(topRz)
    : { zoneId: geo.predicted_destination_zone || 'UNKNOWN', district: geo.predicted_destination_zone || 'Unknown Zone', state: '', lat: 20.5937, lng: 78.9629 };

  // confidence_score from geographic is a percentage (0–100)
  const confidence = Math.round(geo.confidence_score || 0);

  // ── Timing ─────────────────────────────────────────────────────────────────
  const p50 = dist.p50_minutes !== undefined ? Math.round(dist.p50_minutes) : null;
  const p25 = dist.p25_minutes !== undefined ? Math.round(dist.p25_minutes) : null;
  const p75 = dist.p75_minutes !== undefined ? Math.round(dist.p75_minutes) : null;
  const estimatedWindow = (p50 !== null && p25 !== null && p75 !== null)
    ? `~${p50} min (${p25}–${p75} min)`
    : 'Unavailable';

  // SLA probability from timing.operational_sla or decision timing_summary
  const slaProbRaw = tim.operational_sla?.probability_remaining_beyond_sla
    ?? dec.timing_summary?.p_beyond_sla
    ?? null;
  const slaProb = slaProbRaw !== null ? Math.round(slaProbRaw * 100) : 50;
  const isUrgent = p50 !== null ? p50 <= 45 : false;

  // ── Decision ────────────────────────────────────────────────────────────────
  // V2: decision.decision = "CRITICAL" | "REVIEW" | "MONITOR"
  // V2: decision.decision_confidence = 0–1 float  → multiply × 100 for %
  const decisionLabel: string = dec.decision || 'MONITOR';  // V2 field
  const decisionConfidencePct = Math.round((dec.decision_confidence || 0) * 100);

  // Map V2 three-way label to UI decision type
  const decisionType: 'auto-alert' | 'human-review' | 'monitor' =
    decisionLabel === 'CRITICAL' ? 'auto-alert'
    : decisionLabel === 'REVIEW' ? 'human-review'
    : 'monitor';

  // decision.reasons is a human-readable string[] in V2
  const reasons: string[] = dec.reasons || [];

  // ── Explainability factors from V2 reasons ──────────────────────────────────
  const colors = ['#7C5CFC', '#5B8BFC', '#14B8A6', '#F59E0B', '#EF4444'];
  const explainabilityFactors: ExplainabilityFactor[] = reasons.slice(0, 5).map((reason: string, idx: number) => ({
    label:  reason,
    weight: Math.round(100 / Math.max(1, Math.min(5, reasons.length))),
    color:  colors[idx % colors.length],
  }));

  // Prepend financial exposure factor if available
  if (fin.amount_at_risk_inr && explainabilityFactors.length < 5) {
    explainabilityFactors.unshift({
      label:  `Financial exposure: ₹${(fin.amount_at_risk_inr / 100000).toFixed(1)}L at risk`,
      weight: 30,
      color:  '#10B981',
    });
  }

  // ── Prediction history → evolution steps ────────────────────────────────────
  // V2 prediction_history: [{stage: "T0_prior"|"HOP_1"..., top_zone, confidence (pct)}]
  const evolutionSteps = (geo.prediction_history || []).map((step: any, idx: number) => {
    // Find matching ranked zone from this step's top_zone
    const stepZoneRz = rankedZones.find(rz => rz.zone_id === step.top_zone);
    const stepZone: Zone = stepZoneRz
      ? zoneFromRankedZone(stepZoneRz)
      : { zoneId: step.top_zone || 'UNKNOWN', district: step.top_zone || 'Unknown', state: '', lat: 20.5937, lng: 78.9629 };
    const stepConf = Math.round(step.confidence || 0);
    const stageLabel =
      step.stage === 'T0_prior' ? 'Initial Prior'
      : step.stage?.startsWith('HOP_') ? `After Hop ${step.stage.split('_')[1]}`
      : step.stage || `Stage ${idx}`;

    return {
      stage: Math.min(idx, 3) as 0 | 1 | 2 | 3,
      label: stageLabel,
      topZone: stepZone.district,
      confidence: stepConf,
      zoneProbabilities: [{
        zone: stepZone,
        probability: stepConf,
        riskLevel: stepConf >= 75 ? 'critical' as const : stepConf >= 50 ? 'high' as const : 'medium' as const,
      }],
    };
  });

  // Always ensure at least one step (final decision-ready)
  if (evolutionSteps.length === 0) {
    evolutionSteps.push({
      stage: 3,
      label: 'Decision Ready',
      topZone: topZone.district,
      confidence: decisionConfidencePct,
      zoneProbabilities: [{ zone: topZone, probability: decisionConfidencePct, riskLevel: 'critical' }],
    });
  }

  return {
    caseId:          data.case_id || '',
    topZone,
    riskScore:       decisionConfidencePct,
    confidence,
    estimatedWindow,
    recoverability: {
      score:         slaProb,
      windowMinutes: p50 ?? 0,
      windowLabel:   p50 !== null ? `~${p50} min` : 'Unavailable',
      isUrgent,
    },
    decision: {
      type:          decisionType,
      label:         decisionLabel,
      reason:        reasons[0] || 'Assessment based on geographic and temporal model signals.',
      confidence:    decisionConfidencePct,
      recoverability: {
        score:         slaProb,
        windowMinutes: p50 ?? 0,
        windowLabel:   p50 !== null ? `~${p50} min` : 'Unavailable',
        isUrgent,
      },
    },
    evolutionSteps,
    explainabilityFactors,
    model: data.system?.model_versions?.timing || 'Time-to-Event v2.0',
  };
};

// ─── Async API Prediction Fetcher from FastAPI Backend ───────────────────────

export const fetchPredictionFromAPI = async (payload: any): Promise<CasePrediction> => {
  const res = await fetch(`${BACKEND_URL}/api/v1/predict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    throw new Error(`Backend API returned HTTP ${res.status}`);
  }

  const json = await res.json();
  return mapBackendResponseToCasePrediction(json);
};

// ─── Predictions ──────────────────────────────────────────────────────────────

// getPredictionForCase — kept for legacy code paths; returns null unless
// the live backend has loaded via CaseContext.
export const getPredictionForCase = (caseId: string): null => null;

// ─── OSINT ────────────────────────────────────────────────────────────────────

export const getOsintSignals = (): OsintSignal[] => MOCK_OSINT_SIGNALS;

// ─── KPI Aggregates (for Command Center) ─────────────────────────────────────
// These are dashboard-level aggregates for the prototype.
// They are intentionally isolated from model predictions.

export const getCommandCenterKPIs = () => ({
  activeCases: 1284,
  amountAtRisk: '₹18.6 Cr',
  highRiskZones: 27,
  priorityInterventions: 12,
});

// ─── Decision Display Helpers ─────────────────────────────────────────────────

// Maps V2 decision label to a human-readable display string
export const decisionDisplayLabel = (decision: string): string => {
  switch (decision) {
    case 'CRITICAL': return 'CRITICAL ALERT';
    case 'REVIEW':   return 'HUMAN REVIEW';
    case 'MONITOR':  return 'MONITOR';
    default:         return decision || 'MONITOR';
  }
};

// Maps V2 decision label to a UI risk level
export const decisionToRiskLevel = (decision: string): 'critical' | 'high' | 'medium' | 'low' => {
  switch (decision) {
    case 'CRITICAL': return 'critical';
    case 'REVIEW':   return 'high';
    default:         return 'low';
  }
};
