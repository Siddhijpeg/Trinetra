// ─── Enhanced Mock OSINT Data ──────────────────────────────────────────────────────────
// Aligned with SIH Blueprint: Deduplication, Entity Extraction, Provenance & Prediction Correlation

export interface CredibilityBreakdown {
  sourceTrust: number;
  eventCorroboration: number;
  freshness: number;
}

export interface ExtractedEntities {
  modusOperandi?: string;
  targetInstitutions?: string[];
  identifiers?: string[];
  locationCluster?: string;
}

export interface EnhancedOsintSignal {
  signalId: string;
  source: string;
  sourceType: 'news' | 'social' | 'web' | 'forum';
  sourceUrl: string;
  headline: string;
  location: string;
  credibilityScore: number;
  credibilityBreakdown: CredibilityBreakdown;
  verification: 'VERIFIED' | 'PARTIALLY VERIFIED' | 'UNVERIFIED' | 'LIKELY MISLEADING';
  timestamp: string;
  duplicateCount: number;
  validatesPredictionId?: string;
  extractedEntities: ExtractedEntities;
  evidenceChain: string[];
}

export const MOCK_OSINT_SIGNALS: EnhancedOsintSignal[] = [
  {
    signalId: 'OST-001',
    source: 'The Hindu (Digital)',
    sourceType: 'news',
    sourceUrl: 'https://www.thehindu.com/news/national/mule-account-network-dismantled',
    headline: 'NCR mule account network dismantled; 12 arrested in Gurugram',
    location: 'Gurugram, Haryana',
    credibilityScore: 96,
    credibilityBreakdown: {
      sourceTrust: 98,
      eventCorroboration: 95,
      freshness: 94,
    },
    verification: 'VERIFIED',
    timestamp: '3h ago',
    duplicateCount: 4,
    validatesPredictionId: 'PRED-ZONE-8042',
    extractedEntities: {
      modusOperandi: 'Mule Account Network',
      targetInstitutions: ['HDFC Bank', 'ICICI Bank'],
      identifiers: ['+91 98765*****'],
      locationCluster: 'Gurugram Sector 29',
    },
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
    sourceUrl: 'https://x.com/cyber_alerts/status/178923412',
    headline: 'Multiple users report fake investment scheme from Delhi numbers',
    location: 'Delhi NCR (approximate)',
    credibilityScore: 72,
    credibilityBreakdown: {
      sourceTrust: 65,
      eventCorroboration: 75,
      freshness: 80,
    },
    verification: 'PARTIALLY VERIFIED',
    timestamp: '5h ago',
    duplicateCount: 38,
    validatesPredictionId: 'PRED-ZONE-4109',
    extractedEntities: {
      modusOperandi: 'Part-time Task/Investment Fraud',
      targetInstitutions: ['Telegram Group', 'Fake Trading Portal'],
      identifiers: ['+91 98110*****', 'paytm-mule@upi'],
      locationCluster: 'South West Delhi',
    },
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
    sourceUrl: 'https://cybercrime.gov.in/repository/case-matches',
    headline: 'ATM cluster Gurugram Sector 29 flagged in 3 previous complaints',
    location: 'Gurugram Sector 29, Haryana',
    credibilityScore: 88,
    credibilityBreakdown: {
      sourceTrust: 95,
      eventCorroboration: 90,
      freshness: 72,
    },
    verification: 'VERIFIED',
    timestamp: '6h ago',
    duplicateCount: 3,
    validatesPredictionId: 'PRED-ZONE-8042',
    extractedEntities: {
      modusOperandi: 'ATM Cash-out Corridor',
      targetInstitutions: ['SBI ATM', 'Axis Bank ATM'],
      identifiers: ['ATM-ID-GUR-29'],
      locationCluster: 'Gurugram Sector 29',
    },
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
    sourceUrl: 'https://t.me/cyber_threat_watch/54',
    headline: 'Leaked: "Withdrawal checklist" shared in private fraud group',
    location: 'Unknown',
    credibilityScore: 41,
    credibilityBreakdown: {
      sourceTrust: 30,
      eventCorroboration: 40,
      freshness: 60,
    },
    verification: 'UNVERIFIED',
    timestamp: '8h ago',
    duplicateCount: 12,
    extractedEntities: {
      modusOperandi: 'Cash-out Handoff Protocol',
      targetInstitutions: ['Crypto P2P Desk'],
      identifiers: ['TG-MULE-BOT'],
      locationCluster: 'Multi-region',
    },
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
    sourceUrl: 'https://jaipurpolice.gov.in/advisories/fake-news-alert',
    headline: '"ATM fraud network" story contradicted by official bank statement',
    location: 'Jaipur, Rajasthan',
    credibilityScore: 18,
    credibilityBreakdown: {
      sourceTrust: 15,
      eventCorroboration: 10,
      freshness: 30,
    },
    verification: 'LIKELY MISLEADING',
    timestamp: '10h ago',
    duplicateCount: 19,
    extractedEntities: {
      modusOperandi: 'Fake News / Panic Hype',
      targetInstitutions: ['Local Cooperative Bank'],
      identifiers: ['N/A'],
      locationCluster: 'Jaipur Central',
    },
    evidenceChain: [
      'Bank spokesperson denied cluster activity',
      'Content appears to be deliberate misinformation — inconsistent dates',
      'Flagged by automated credibility checker',
    ],
  },
];

