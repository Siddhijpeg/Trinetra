// ─── Mock OSINT Data ──────────────────────────────────────────────────────────
// Extracted from OSINTIntelligence.tsx
// Will be replaced by real OSINT scraping pipeline in integration phase.
// OSINT is a TRINETRA+ USP layer — it supports investigation but is NOT
// a primary input to the prediction score in prototype phase.

import type { OsintSignal } from '../types';

export const MOCK_OSINT_SIGNALS: OsintSignal[] = [
  {
    signalId: 'OST-001',
    source: 'The Hindu (Digital)',
    sourceType: 'news',
    headline: 'NCR mule account network dismantled; 12 arrested in Gurugram',
    location: 'Gurugram, Haryana',
    credibilityScore: 96,
    verification: 'VERIFIED',
    timestamp: '3h ago',
    evidenceChain: [
      'Source: Established national newspaper',
      'Cross-referenced with NCRP complaint surge on same date',
      'Geographical match to active Gurugram zone cluster',
    ],
  },
  {
    signalId: 'OST-002',
    source: 'Social Monitor (X/Twitter)',
    sourceType: 'social',
    headline: 'Multiple users report fake investment scheme from Delhi numbers',
    location: 'Delhi NCR (approximate)',
    credibilityScore: 72,
    verification: 'PARTIALLY VERIFIED',
    timestamp: '5h ago',
    evidenceChain: [
      '38 independent reports with similar phone number prefix',
      'No media corroboration yet',
      'Pattern matches investment fraud typology in active case',
    ],
  },
  {
    signalId: 'OST-003',
    source: 'Fraud Database Cross-Match',
    sourceType: 'web',
    headline: 'ATM cluster Gurugram Sector 29 flagged in 3 previous complaints',
    location: 'Gurugram Sector 29, Haryana',
    credibilityScore: 88,
    verification: 'VERIFIED',
    timestamp: '6h ago',
    evidenceChain: [
      'Matched against internal TRINETRA zone registry',
      'Cluster appeared in NCRP-26-78901, NCRP-26-79334, NCRP-26-80112',
      'Consistent cash-out timing pattern: 45–90 min post-complaint',
    ],
  },
  {
    signalId: 'OST-004',
    source: 'Forum Monitor (Telegram)',
    sourceType: 'forum',
    headline: 'Leaked: "Withdrawal checklist" shared in private fraud group',
    location: 'Unknown',
    credibilityScore: 41,
    verification: 'UNVERIFIED',
    timestamp: '8h ago',
    evidenceChain: [
      'Channel is unverified; could be unrelated',
      'Language patterns match known fraud network jargon',
      'Not corroborated by any secondary source',
    ],
  },
  {
    signalId: 'OST-005',
    source: 'Counter-Signal (Web)',
    sourceType: 'web',
    headline: '"ATM fraud network" story contradicted by official bank statement',
    location: 'Jaipur, Rajasthan',
    credibilityScore: 18,
    verification: 'LIKELY MISLEADING',
    timestamp: '10h ago',
    evidenceChain: [
      'Bank spokesperson denied cluster activity',
      'Content appears to be deliberate misinformation — inconsistent dates',
      'Flagged by automated credibility checker',
    ],
  },
];

