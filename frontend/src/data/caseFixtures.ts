// ─── caseFixtures.ts ─────────────────────────────────────────────────────────
// DEPRECATED — Case data is now served by the V2 backend API.
// This file is kept only to avoid breaking import paths in code that still
// references formatAmountInr or the type definitions.
//
// CASE_FIXTURES is intentionally empty — the real case universe is 60,000 V2
// cases loaded from data/synthetic_v2/ via GET /api/v1/cases.
//
// Do not add new fixtures here.

export interface HopInput {
  hop_id: string;
  event_time: string;
  available_time: string;
  amount: number;
  destination_account: string;
  channel?: string;
}

export interface ComplaintInput {
  complaint_id: string;
  incident_time: string;
  available_time: string;
  amount_inr: number;
  typology_id: string;
}

export interface CaseInputFixture {
  case_id: string;
  fraudType: string;
  reportedAgo: string;
  filedTime: string;
  victimDistrict: string;
  investigator: string;
  status: 'Active' | 'In Review' | 'Investigating' | 'Resolved';
  osintSignalCount: number;
  prediction_time: string;
  sla_minutes: number;
  complaint: ComplaintInput;
  hops: HopInput[];
}

// Empty — real cases come from the V2 backend API
export const CASE_FIXTURES: CaseInputFixture[] = [];

export const getCaseFixtureById = (_caseId: string): CaseInputFixture | undefined => undefined;

export const buildStagePayload = (fixture: CaseInputFixture, stage: number) => ({
  case_id:         fixture.case_id,
  prediction_time: fixture.prediction_time,
  sla_minutes:     fixture.sla_minutes,
  complaint:       fixture.complaint,
  hops:            fixture.hops.slice(0, stage),
});

// ─── Formatting utility (used in several components) ─────────────────────────
export const formatAmountInr = (inr: number): string => {
  if (inr >= 10_000_000) return `₹${(inr / 10_000_000).toFixed(1)} Cr`;
  if (inr >= 100_000)    return `₹${(inr / 100_000).toFixed(1)}L`;
  if (inr >= 1_000)      return `₹${(inr / 1_000).toFixed(0)}K`;
  return `₹${inr.toFixed(0)}`;
};
