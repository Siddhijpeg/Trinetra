// ─── TRINETRA Shared Type Definitions ─────────────────────────────────────────
// These interfaces mirror the expected backend/model API response shapes.
// Currently populated by mock data in src/data/*.ts
// Will be replaced by real API responses in the model integration phase.

// ─── Geographic ───────────────────────────────────────────────────────────────

export interface Zone {
  zoneId: string;         // e.g. "Z000"
  district: string;       // e.g. "Central Delhi"
  state: string;          // e.g. "Delhi"
  lat: number;            // real latitude from zones.csv
  lng: number;            // real longitude from zones.csv
}

export interface RiskZone extends Zone {
  riskScore: number;      // 0–100 prototype simulation
  cases: number;          // linked active cases
  riskLevel: RiskLevel;
  atmCount?: number;
  recoverabilityMinutes?: number;
}

// ─── Risk Levels ──────────────────────────────────────────────────────────────

export type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'resolved';

// ─── Accounts / Entities ──────────────────────────────────────────────────────

export type AccountType = 'victim' | 'transit' | 'mule' | 'mule-hub' | 'beneficiary';

export interface Account {
  accountId: string;       // masked: "XXXX7821"
  bank: string;            // "HDFC Bank"
  type: AccountType;
  timesFlagged: number;    // from accounts.csv: times_flagged
  firstSeen?: string;      // from accounts.csv: first_seen
  riskLevel: RiskLevel;
  isPersistentRisk?: boolean; // true if timesFlagged >= 3
}

// ─── Transaction Hops ─────────────────────────────────────────────────────────

export interface TransactionHop {
  hopIndex: number;        // 0 = victim→first, 1 = first→mule, etc.
  fromAccount: string;     // masked account ID
  fromBank: string;
  fromLabel: string;       // "Victim", "Mule A", etc.
  toAccount: string;
  toBank: string;
  toLabel: string;
  amount: string;          // formatted: "₹1.8L"
  timestamp: string;       // "13:47 IST" or "PREDICTED"
  riskLevel: RiskLevel;
  isPredicted?: boolean;   // true for the final predicted hop
}

// ─── Prediction ───────────────────────────────────────────────────────────────

export interface ZoneProbability {
  zone: Zone;
  probability: number;     // 0–100
  riskLevel: RiskLevel;
}

export type PredictionStage = 0 | 1 | 2 | 3;

export interface PredictionEvolutionStep {
  stage: PredictionStage;
  label: string;           // "Prior", "After Hop 1", "After Hop 2"
  topZone: string;         // zone label for display
  confidence: number;      // 0–100
  zoneProbabilities: ZoneProbability[];
  registrySignal?: string; // e.g. "Account A seen in 2 prior cases"
  persistentRiskEntity?: string; // e.g. "Mule B is a known persistent risk entity"
}

export interface Recoverability {
  score: number;           // 0–100 prototype simulation
  windowMinutes: number;   // estimated minutes remaining
  windowLabel: string;     // "~48 min"
  isUrgent: boolean;
}

export type DecisionType = 'auto-alert' | 'human-review' | 'monitor';

export interface PredictionDecision {
  type: DecisionType;
  label: string;
  reason: string;
  confidence: number;
  recoverability: Recoverability;
}

export interface ExplainabilityFactor {
  label: string;
  weight: number;          // percentage contribution
  color: string;
}

export interface CasePrediction {
  caseId: string;
  topZone: Zone;
  riskScore: number;       // final: 0–100
  confidence: number;      // 0–100
  estimatedWindow: string; // "46–110 minutes"
  recoverability: Recoverability;
  decision: PredictionDecision;
  evolutionSteps: PredictionEvolutionStep[];
  explainabilityFactors: ExplainabilityFactor[];
  model: string;           // "reference_class_prior" | "pending"
}

// ─── Cases ────────────────────────────────────────────────────────────────────

export type CaseStatus = 'Active' | 'In Review' | 'Investigating' | 'Resolved';
export type FraudType = 'Investment Fraud' | 'UPI Fraud' | 'Digital Arrest' | 'Impersonation' | 'OTP Fraud' | 'Loan-App Fraud' | 'SIM-Swap' | 'Romance Scam' | 'Job Fraud';

export interface Case {
  caseId: string;
  fraudType: FraudType;
  reportedAgo: string;     // "12 min ago"
  filedTime: string;       // "13:42 IST"
  amount: string;          // "₹4.8L"
  amountRaw: number;       // 480000
  victimDistrict: string;  // "New Delhi"
  predictedZone: string;   // "Gurugram"
  riskScore: number;
  riskLevel: RiskLevel;
  status: CaseStatus;
  investigator: string;
  hops: TransactionHop[];
  linkedAccounts: Account[];
  osintSignalCount: number;
  prediction?: CasePrediction;
}

// ─── Timeline ─────────────────────────────────────────────────────────────────

export interface TimelineEntry {
  time: string;
  label: string;
  desc?: string;
  isHighlight?: boolean;
  isLast?: boolean;
}

// ─── Alerts ───────────────────────────────────────────────────────────────────

export type AlertStatus = 'unacknowledged' | 'acknowledged' | 'actioned' | 'resolved';

export interface Alert {
  alertId: string;
  caseId: string;
  type: string;            // "CRITICAL CASH-OUT RISK"
  zone: string;            // "Gurugram Sector 29"
  riskScore: number;
  riskLevel: RiskLevel;
  windowMinutes: string;   // "46–110 minutes"
  amount: string;
  bank: string;
  generatedAgo: string;
  status: AlertStatus;
  timelineSteps: string[];
  completedSteps: number;
}

// ─── OSINT ────────────────────────────────────────────────────────────────────

export type OsintVerification = 'VERIFIED' | 'PARTIALLY VERIFIED' | 'UNVERIFIED' | 'LIKELY MISLEADING';

export interface OsintSignal {
  signalId: string;
  source: string;          // "The Hindu", "Twitter Monitor", etc.
  sourceType: 'news' | 'social' | 'web' | 'forum';
  headline: string;
  location: string;
  credibilityScore: number; // 0–100
  verification: OsintVerification;
  timestamp: string;
  evidenceChain?: string[];
}

// ─── Copilot ──────────────────────────────────────────────────────────────────

export interface CopilotMessage {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  timestamp: string;
}

export interface CopilotSuggestedPrompt {
  id: string;
  text: string;
  category: 'prediction' | 'network' | 'osint' | 'case';
}

// ─── Outcome (Feedback Loop) ──────────────────────────────────────────────────

export type OutcomeType = 'funds-frozen' | 'funds-recovered' | 'false-alert' | 'no-action' | 'unknown';

export interface CaseOutcome {
  caseId: string;
  type: OutcomeType;
  label: string;
  recordedAt: string;
}
