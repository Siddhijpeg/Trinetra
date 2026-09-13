// ─── Canonical Prototype Case Input Fixtures ──────────────────────────────────
// These are the 7 prototype input cases for TRINETRA.
// They contain ONLY input event data: complaint, hops, timestamps, amounts.
//
// IMPORTANT: There are NO hardcoded prediction outputs here.
// All prediction results (zone, confidence, P25/P50/P75, priority, reason codes)
// are fetched live from POST /api/v1/predict at runtime.

export interface HopInput {
  hop_id: string;
  event_time: string;
  available_time: string;
  amount: number;
  destination_account: string;
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

export const CASE_FIXTURES: CaseInputFixture[] = [
  {
    case_id: 'NCRP-26-81942',
    fraudType: 'Investment Fraud',
    reportedAgo: '12 min ago',
    filedTime: '10:05 IST',
    victimDistrict: 'New Delhi',
    investigator: 'A. Mehta',
    status: 'Active',
    osintSignalCount: 3,
    prediction_time: '2025-06-01T10:15:00',
    sla_minutes: 45.0,
    complaint: {
      complaint_id: 'NCRP-26-81942',
      incident_time: '2025-06-01T10:00:00',
      available_time: '2025-06-01T10:05:00',
      amount_inr: 480000.0,
      typology_id: 'TYP_INVESTMENT',
    },
    hops: [
      { hop_id: 'HOP_1', event_time: '2025-06-01T10:05:00', available_time: '2025-06-01T10:10:00', amount: 180000.0, destination_account: 'ACC_7821' },
      { hop_id: 'HOP_2', event_time: '2025-06-01T10:11:00', available_time: '2025-06-01T10:14:00', amount: 150000.0, destination_account: 'ACC_3294' },
    ],
  },
  {
    case_id: 'NCRP-26-81911',
    fraudType: 'UPI Fraud',
    reportedAgo: '31 min ago',
    filedTime: '09:45 IST',
    victimDistrict: 'Lucknow',
    investigator: 'R. Sharma',
    status: 'Active',
    osintSignalCount: 1,
    prediction_time: '2025-06-01T09:50:00',
    sla_minutes: 60.0,
    complaint: {
      complaint_id: 'NCRP-26-81911',
      incident_time: '2025-06-01T09:30:00',
      available_time: '2025-06-01T09:45:00',
      amount_inr: 45000.0,
      typology_id: 'TYP_UPI',
    },
    hops: [
      { hop_id: 'HOP_1', event_time: '2025-06-01T09:35:00', available_time: '2025-06-01T09:44:00', amount: 45000.0, destination_account: 'ACC_4411' },
    ],
  },
  {
    case_id: 'NCRP-26-81895',
    fraudType: 'Digital Arrest',
    reportedAgo: '44 min ago',
    filedTime: '11:02 IST',
    victimDistrict: 'Noida',
    investigator: 'P. Verma',
    status: 'Active',
    osintSignalCount: 0,
    prediction_time: '2025-06-01T11:08:00',
    sla_minutes: 30.0,
    complaint: {
      complaint_id: 'NCRP-26-81895',
      incident_time: '2025-06-01T11:00:00',
      available_time: '2025-06-01T11:02:00',
      amount_inr: 710000.0,
      typology_id: 'TYP_DIGITAL_ARREST',
    },
    hops: [
      { hop_id: 'HOP_1', event_time: '2025-06-01T11:01:00', available_time: '2025-06-01T11:05:00', amount: 400000.0, destination_account: 'ACC_9901' },
      { hop_id: 'HOP_2', event_time: '2025-06-01T11:04:00', available_time: '2025-06-01T11:07:00', amount: 310000.0, destination_account: 'ACC_2213' },
    ],
  },
  {
    case_id: 'NCRP-26-81773',
    fraudType: 'Investment Fraud',
    reportedAgo: '1h 12min ago',
    filedTime: '08:30 IST',
    victimDistrict: 'Mumbai',
    investigator: 'S. Gupta',
    status: 'In Review',
    osintSignalCount: 2,
    prediction_time: '2025-06-01T08:55:00',
    sla_minutes: 90.0,
    complaint: {
      complaint_id: 'NCRP-26-81773',
      incident_time: '2025-06-01T08:00:00',
      available_time: '2025-06-01T08:30:00',
      amount_inr: 220000.0,
      typology_id: 'TYP_INVESTMENT',
    },
    hops: [
      { hop_id: 'HOP_1', event_time: '2025-06-01T08:10:00', available_time: '2025-06-01T08:32:00', amount: 100000.0, destination_account: 'ACC_5511' },
      { hop_id: 'HOP_2', event_time: '2025-06-01T08:30:00', available_time: '2025-06-01T08:48:00', amount: 80000.0, destination_account: 'ACC_6612' },
      { hop_id: 'HOP_3', event_time: '2025-06-01T08:45:00', available_time: '2025-06-01T08:53:00', amount: 40000.0, destination_account: 'ACC_7723' },
    ],
  },
  {
    case_id: 'NCRP-26-81742',
    fraudType: 'Impersonation',
    reportedAgo: '2h 04min ago',
    filedTime: '13:20 IST',
    victimDistrict: 'Bengaluru',
    investigator: 'M. Nair',
    status: 'Active',
    osintSignalCount: 0,
    prediction_time: '2025-06-01T13:40:00',
    sla_minutes: 60.0,
    complaint: {
      complaint_id: 'NCRP-26-81742',
      incident_time: '2025-06-01T13:00:00',
      available_time: '2025-06-01T13:20:00',
      amount_inr: 140000.0,
      typology_id: 'TYP_IMPERSONATION',
    },
    hops: [
      { hop_id: 'HOP_1', event_time: '2025-06-01T13:05:00', available_time: '2025-06-01T13:22:00', amount: 140000.0, destination_account: 'ACC_8834' },
    ],
  },
  {
    case_id: 'NCRP-26-81631',
    fraudType: 'UPI Fraud',
    reportedAgo: '3h 18min ago',
    filedTime: '15:20 IST',
    victimDistrict: 'Hyderabad',
    investigator: 'K. Reddy',
    status: 'Investigating',
    osintSignalCount: 0,
    prediction_time: '2025-06-01T15:30:00',
    sla_minutes: 60.0,
    complaint: {
      complaint_id: 'NCRP-26-81631',
      incident_time: '2025-06-01T15:10:00',
      available_time: '2025-06-01T15:20:00',
      amount_inr: 8000.0,
      typology_id: 'TYP_UPI',
    },
    hops: [
      { hop_id: 'HOP_1', event_time: '2025-06-01T15:12:00', available_time: '2025-06-01T15:21:00', amount: 8000.0, destination_account: 'ACC_3341' },
    ],
  },
  {
    case_id: 'NCRP-26-81602',
    fraudType: 'Investment Fraud',
    reportedAgo: '4h 52min ago',
    filedTime: '07:10 IST',
    victimDistrict: 'Kolkata',
    investigator: 'D. Bose',
    status: 'In Review',
    osintSignalCount: 1,
    prediction_time: '2025-06-01T07:22:00',
    sla_minutes: 45.0,
    complaint: {
      complaint_id: 'NCRP-26-81602',
      incident_time: '2025-06-01T07:00:00',
      available_time: '2025-06-01T07:10:00',
      amount_inr: 360000.0,
      typology_id: 'TYP_INVESTMENT',
    },
    hops: [
      { hop_id: 'HOP_1', event_time: '2025-06-01T07:05:00', available_time: '2025-06-01T07:12:00', amount: 200000.0, destination_account: 'ACC_9977' },
      { hop_id: 'HOP_2', event_time: '2025-06-01T07:15:00', available_time: '2025-06-01T07:20:00', amount: 160000.0, destination_account: 'ACC_1155' },
    ],
  },
];

export const getCaseFixtureById = (caseId: string): CaseInputFixture | undefined =>
  CASE_FIXTURES.find(c => c.case_id === caseId);

// Build a predict payload for a specific stage (0 = no hops, N = first N hops)
export const buildStagePayload = (fixture: CaseInputFixture, stage: number) => ({
  case_id: fixture.case_id,
  prediction_time: fixture.prediction_time,
  sla_minutes: fixture.sla_minutes,
  complaint: fixture.complaint,
  hops: fixture.hops.slice(0, stage),
});

// Formatted amount helper
export const formatAmountInr = (inr: number): string => {
  if (inr >= 10000000) return `₹${(inr / 10000000).toFixed(1)} Cr`;
  if (inr >= 100000) return `₹${(inr / 100000).toFixed(1)}L`;
  if (inr >= 1000) return `₹${(inr / 1000).toFixed(0)}K`;
  return `₹${inr.toFixed(0)}`;
};
