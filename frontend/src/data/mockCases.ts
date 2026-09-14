// ─── Mock Cases Data ──────────────────────────────────────────────────────────
// Extracted from Cases.tsx and CaseWorkspace.tsx.
// All data is prototype simulation using realistic Indian cybercrime patterns.
// Will be replaced by API responses from the backend in integration phase.

import type { Case, TransactionHop, Account, TimelineEntry } from '../types';
import { DEMO_CASE_PREDICTION } from './mockPredictions';

// ─── Transaction Hops for demo case NCRP-26-81942 ────────────────────────────

export const DEMO_CASE_HOPS: TransactionHop[] = [
  {
    hopIndex: 0,
    fromAccount: 'XXXX1234', fromBank: 'HDFC Bank',    fromLabel: 'Victim',
    toAccount:   'XXXX7821', toBank:   'HDFC Bank',    toLabel:   'Account A',
    amount: '₹1.8L', timestamp: '13:47', riskLevel: 'medium',
  },
  {
    hopIndex: 1,
    fromAccount: 'XXXX7821', fromBank: 'HDFC Bank',    fromLabel: 'Account A',
    toAccount:   'XXXX3294', toBank:   'Paytm',        toLabel:   'Mule B',
    amount: '₹1.4L', timestamp: '13:51', riskLevel: 'high',
  },
  {
    hopIndex: 2,
    fromAccount: 'XXXX3294', fromBank: 'Paytm',        fromLabel: 'Mule B',
    toAccount:   'XXXX9234', toBank:   'SBI',           toLabel:   'Mule C (Hub)',
    amount: '₹1.1L', timestamp: '13:54', riskLevel: 'critical',
  },
  {
    hopIndex: 3,
    fromAccount: 'XXXX9234', fromBank: 'SBI',           fromLabel: 'Mule C (Hub)',
    toAccount:   'ATM-CLUSTER', toBank: 'Gurugram ATMs', toLabel: 'Gurugram ATM Cluster',
    amount: '₹1.1L', timestamp: 'PREDICTED', riskLevel: 'critical', isPredicted: true,
  },
];

// ─── Linked accounts for demo case ───────────────────────────────────────────

export const DEMO_CASE_ACCOUNTS: Account[] = [
  { accountId: 'XXXX7821', bank: 'HDFC Bank',    type: 'transit',    timesFlagged: 1, riskLevel: 'medium',   isPersistentRisk: false },
  { accountId: 'XXXX3294', bank: 'Paytm',        type: 'mule',       timesFlagged: 4, riskLevel: 'high',     isPersistentRisk: true  },
  { accountId: 'XXXX9234', bank: 'SBI',           type: 'mule-hub',   timesFlagged: 7, riskLevel: 'critical', isPersistentRisk: true  },
  { accountId: 'XXXX4417', bank: 'Axis Bank',     type: 'beneficiary',timesFlagged: 2, riskLevel: 'high',     isPersistentRisk: false },
];

// ─── Case timeline for demo case ─────────────────────────────────────────────

export const DEMO_CASE_TIMELINE: TimelineEntry[] = [
  { time: '13:42', label: 'Complaint registered', desc: 'Victim reported investment fraud via NCRP portal' },
  { time: '13:47', label: '₹1.8L transferred',    desc: 'Victim → Account A (HDFC XXXX7821)', isHighlight: true },
  { time: '13:51', label: '₹1.4L transferred',    desc: 'Account A → Mule B (Paytm XXXX3294)' },
  { time: '13:54', label: '₹1.1L transferred',    desc: 'Mule B → Mule C (SBI XXXX9234)' },
  { time: '13:58', label: 'Registry match',        desc: 'Account XXXX9234 linked to 7 prior fraud cases', isHighlight: true },
  { time: '14:01', label: 'TRINETRA prediction',   desc: 'Gurugram Sector 29 · 87% confidence' },
  { time: '14:03', label: 'Alert triggered',       desc: 'High-risk cash-out alert issued to bank', isHighlight: true, isLast: true },
];

// ─── All cases (table view) ───────────────────────────────────────────────────

export const MOCK_CASES: Case[] = [
  {
    caseId: 'NCRP-26-81942', fraudType: 'Investment Fraud',
    reportedAgo: '12 min ago', filedTime: '13:42 IST',
    amount: '₹4.8L', amountRaw: 480000,
    victimDistrict: 'New Delhi', predictedZone: 'Gurugram',
    riskScore: 91, riskLevel: 'critical', status: 'Active',
    investigator: 'A. Mehta',
    hops: DEMO_CASE_HOPS, linkedAccounts: DEMO_CASE_ACCOUNTS,
    osintSignalCount: 3, prediction: DEMO_CASE_PREDICTION,
  },
  {
    caseId: 'NCRP-26-81911', fraudType: 'Digital Arrest',
    reportedAgo: '31 min ago', filedTime: '13:23 IST',
    amount: '₹9.4L', amountRaw: 940000,
    victimDistrict: 'Lucknow', predictedZone: 'Jaipur',
    riskScore: 86, riskLevel: 'critical', status: 'Active',
    investigator: 'R. Sharma',
    hops: [], linkedAccounts: [], osintSignalCount: 1,
  },
  {
    caseId: 'NCRP-26-81895', fraudType: 'Investment Fraud',
    reportedAgo: '44 min ago', filedTime: '13:10 IST',
    amount: '₹7.1L', amountRaw: 710000,
    victimDistrict: 'Noida', predictedZone: 'Jaipur',
    riskScore: 79, riskLevel: 'high', status: 'Active',
    investigator: 'P. Verma',
    hops: [], linkedAccounts: [], osintSignalCount: 0,
  },
  {
    caseId: 'NCRP-26-81773', fraudType: 'UPI Fraud',
    reportedAgo: '1h 12min ago', filedTime: '12:42 IST',
    amount: '₹2.2L', amountRaw: 220000,
    victimDistrict: 'Mumbai', predictedZone: 'Thane',
    riskScore: 72, riskLevel: 'high', status: 'In Review',
    investigator: 'S. Gupta',
    hops: [], linkedAccounts: [], osintSignalCount: 2,
  },
  {
    caseId: 'NCRP-26-81742', fraudType: 'Impersonation',
    reportedAgo: '2h 04min ago', filedTime: '11:50 IST',
    amount: '₹1.4L', amountRaw: 140000,
    victimDistrict: 'Bengaluru', predictedZone: 'Bengaluru Central',
    riskScore: 65, riskLevel: 'high', status: 'Active',
    investigator: 'M. Nair',
    hops: [], linkedAccounts: [], osintSignalCount: 0,
  },
  {
    caseId: 'NCRP-26-81631', fraudType: 'UPI Fraud',
    reportedAgo: '3h 18min ago', filedTime: '10:36 IST',
    amount: '₹0.8L', amountRaw: 80000,
    victimDistrict: 'Hyderabad', predictedZone: 'Secunderabad',
    riskScore: 54, riskLevel: 'medium', status: 'Investigating',
    investigator: 'K. Reddy',
    hops: [], linkedAccounts: [], osintSignalCount: 0,
  },
  {
    caseId: 'NCRP-26-81602', fraudType: 'Investment Fraud',
    reportedAgo: '4h 52min ago', filedTime: '09:02 IST',
    amount: '₹3.6L', amountRaw: 360000,
    victimDistrict: 'Kolkata', predictedZone: 'Salt Lake',
    riskScore: 48, riskLevel: 'medium', status: 'In Review',
    investigator: 'D. Bose',
    hops: [], linkedAccounts: [], osintSignalCount: 1,
  },
  {
    caseId: 'NCRP-26-81540', fraudType: 'Digital Arrest',
    reportedAgo: '6h 30min ago', filedTime: '07:24 IST',
    amount: '₹12.2L', amountRaw: 1220000,
    victimDistrict: 'Chennai', predictedZone: 'T. Nagar',
    riskScore: 41, riskLevel: 'medium', status: 'Investigating',
    investigator: 'A. Kumar',
    hops: [], linkedAccounts: [], osintSignalCount: 0,
  },
  {
    caseId: 'NCRP-26-81498', fraudType: 'Impersonation',
    reportedAgo: '8h ago', filedTime: '05:54 IST',
    amount: '₹0.6L', amountRaw: 60000,
    victimDistrict: 'Pune', predictedZone: 'Pimpri',
    riskScore: 28, riskLevel: 'low', status: 'Resolved',
    investigator: 'N. Patil',
    hops: [], linkedAccounts: [], osintSignalCount: 0,
  },
  {
    caseId: 'NCRP-26-81347', fraudType: 'UPI Fraud',
    reportedAgo: '11h ago', filedTime: '02:54 IST',
    amount: '₹0.4L', amountRaw: 40000,
    victimDistrict: 'Ahmedabad', predictedZone: 'N/A',
    riskScore: 15, riskLevel: 'low', status: 'Resolved',
    investigator: 'H. Patel',
    hops: [], linkedAccounts: [], osintSignalCount: 0,
  },
];

// Priority cases for Command Center (top 4 by risk)
export const PRIORITY_CASES = MOCK_CASES.slice(0, 4).map(c => ({
  id: c.caseId,
  amount: c.amount,
  zone: c.predictedZone,
  prob: c.riskScore,
  level: c.riskLevel,
  mins: c.prediction?.recoverability.windowMinutes ?? Math.floor(Math.random() * 100 + 40),
}));
