// ─── Mock Prediction Data ─────────────────────────────────────────────────────
// Sequential prediction evolution for the Case Investigation Workspace demo.
// All confidence scores, probabilities, and zone narrowing are PROTOTYPE SIMULATIONS.
// These values will be replaced by real baseline_predictor.py output in integration phase.
//
// The 4-stage evolution simulates what the teammate's prototype demonstrated:
// Prior (reference-class) → Hop 1 observed → Hop 2 observed → Decision

import type { PredictionEvolutionStep, PredictionDecision, ExplainabilityFactor, CasePrediction } from '../types';
import { ZONES_RAW } from './mockZones';

// ─── Helper to build Zone from ZONES_RAW ──────────────────────────────────────
const z = (id: string) => ZONES_RAW.find(z => z.zoneId === id)!;

// ─── Evolution steps for case NCRP-26-81942 (Investment Fraud, Delhi → Gurugram) ──

export const PREDICTION_EVOLUTION_STEPS: PredictionEvolutionStep[] = [
  {
    stage: 0,
    label: 'Initial Prior',
    topZone: 'Delhi NCR',
    confidence: 31,
    zoneProbabilities: [
      { zone: z('Z000'), probability: 31, riskLevel: 'medium' },
      { zone: z('Z009'), probability: 22, riskLevel: 'low' },
      { zone: z('Z010'), probability: 15, riskLevel: 'low' },
      { zone: z('Z001'), probability: 11, riskLevel: 'low' },
    ],
  },
  {
    stage: 1,
    label: 'After Hop 1',
    topZone: 'Delhi NCR',
    confidence: 48,
    zoneProbabilities: [
      { zone: z('Z000'), probability: 48, riskLevel: 'medium' },
      { zone: z('Z009'), probability: 23, riskLevel: 'low' },
      { zone: z('Z010'), probability: 10, riskLevel: 'low' },
      { zone: z('Z001'), probability: 9, riskLevel: 'low' },
    ],
    registrySignal: 'Account XXXX7821 seen in 2 prior complaints in the last 30 days.',
  },
  {
    stage: 2,
    label: 'After Hop 2',
    topZone: 'Gurugram / South Delhi',
    confidence: 87,
    zoneProbabilities: [
      { zone: z('Z001'), probability: 72, riskLevel: 'critical' },
      { zone: z('Z000'), probability: 15, riskLevel: 'medium' },
      { zone: z('Z009'), probability: 8, riskLevel: 'low' },
    ],
    registrySignal: 'Account XXXX3294 seen in 4 prior complaints.',
    persistentRiskEntity: 'XXXX3294 is a Persistent Risk Entity — flagged across 4 unrelated fraud cases in the last 60 days.',
  },
  {
    stage: 3,
    label: 'Decision Ready',
    topZone: 'Gurugram Sector 29',
    confidence: 87,
    zoneProbabilities: [
      { zone: z('Z001'), probability: 87, riskLevel: 'critical' },
      { zone: z('Z000'), probability: 9, riskLevel: 'low' },
    ],
    persistentRiskEntity: 'XXXX3294 is a Persistent Risk Entity — flagged across 4 unrelated fraud cases in the last 60 days.',
  },
];

// ─── Decision engine output (prototype rule: confidence >= 75 → auto-alert) ──

export const PREDICTION_DECISION: PredictionDecision = {
  type: 'auto-alert',
  label: 'AUTO ALERT',
  reason: 'Confidence ≥ 75% and recoverability window still open.',
  confidence: 87,
  recoverability: {
    score: 74,
    windowMinutes: 48,
    windowLabel: '~48 min',
    isUrgent: true,
  },
};

// ─── XAI (Explainability) factors for case NCRP-26-81942 ──────────────────────

export const EXPLAINABILITY_FACTORS: ExplainabilityFactor[] = [
  { label: '3 accounts linked to prior NCRP fraud trails', weight: 29, color: '#7C5CFC' },
  { label: 'Transaction velocity matches known cash-out pattern', weight: 23, color: '#5B8BFC' },
  { label: 'Destination geographically linked to Gurugram cluster', weight: 18, color: '#14B8A6' },
  { label: 'Similar fraud cases cashed out within 90 minutes', weight: 13, color: '#14B8A6' },
  { label: 'OSINT corroboration (3 signals)', weight: 8, color: '#94A3B8' },
];

// ─── Full prediction object for main demo case ────────────────────────────────

export const DEMO_CASE_PREDICTION: CasePrediction = {
  caseId: 'NCRP-26-81942',
  topZone: { zoneId: 'Z001', district: 'South Delhi / Gurugram', state: 'Delhi / Haryana', lat: 28.4595, lng: 77.0266 },
  riskScore: 91,
  confidence: 87,
  estimatedWindow: '46–110 minutes',
  recoverability: {
    score: 74,
    windowMinutes: 48,
    windowLabel: '~48 min',
    isUrgent: true,
  },
  decision: PREDICTION_DECISION,
  evolutionSteps: PREDICTION_EVOLUTION_STEPS,
  explainabilityFactors: EXPLAINABILITY_FACTORS,
  model: 'reference_class_prior',
};
