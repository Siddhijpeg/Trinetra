// ─── Prototype Service Layer ──────────────────────────────────────────────────
// Thin service layer that currently returns typed mock data.
// Interface matches the expected API shape — swap implementations in integration phase.
// All methods are async-ready (return promises or typed values).

import type { Case, Alert, OsintSignal, RiskZone, CasePrediction } from '../types';
import { MOCK_CASES } from '../data/mockCases';
import { MOCK_ALERTS } from '../data/mockAlerts';
import { MOCK_OSINT_SIGNALS } from '../data/mockOsint';
import { ACTIVE_RISK_ZONES } from '../data/mockZones';
import { DEMO_CASE_PREDICTION } from '../data/mockPredictions';

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
// Source: teammate's prototype cdNextStep() decision logic
// Real model will replace this with statistical threshold from trained HMM/classifier

export const evaluateDecision = (confidence: number, recoverabilityScore: number) => {
  if (confidence >= 75 && recoverabilityScore >= 50) {
    return { type: 'auto-alert', label: 'AUTO ALERT', reason: 'Confidence ≥ 75% and recoverability window open.' };
  } else if (confidence >= 50) {
    return { type: 'human-review', label: 'HUMAN REVIEW', reason: 'Moderate confidence — requires officer judgment.' };
  } else {
    return { type: 'monitor', label: 'MONITOR', reason: 'Low confidence — continue monitoring for new hops.' };
  }
};
