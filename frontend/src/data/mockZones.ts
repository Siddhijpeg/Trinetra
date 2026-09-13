// ─── Zone Data ────────────────────────────────────────────────────────────────
// Real lat/lng from data/out/zones.csv
// These 20 Indian districts are the actual zones used by the baseline_predictor.py
// Prototype risk scores are simulated — will be replaced by model output in integration phase.

import type { RiskZone } from '../types';

export const ZONES_RAW = [
  { zoneId: 'Z000', district: 'Central Delhi',    state: 'Delhi',             lat: 28.6519, lng: 77.2315 },
  { zoneId: 'Z001', district: 'South Delhi',      state: 'Delhi',             lat: 28.5245, lng: 77.2066 },
  { zoneId: 'Z002', district: 'Mumbai City',      state: 'Maharashtra',       lat: 18.9750, lng: 72.8258 },
  { zoneId: 'Z003', district: 'Mumbai Suburban',  state: 'Maharashtra',       lat: 19.0760, lng: 72.8777 },
  { zoneId: 'Z004', district: 'Pune',             state: 'Maharashtra',       lat: 18.5204, lng: 73.8567 },
  { zoneId: 'Z005', district: 'Bengaluru Urban',  state: 'Karnataka',         lat: 12.9716, lng: 77.5946 },
  { zoneId: 'Z006', district: 'Hyderabad',        state: 'Telangana',         lat: 17.3850, lng: 78.4867 },
  { zoneId: 'Z007', district: 'Chennai',          state: 'Tamil Nadu',        lat: 13.0827, lng: 80.2707 },
  { zoneId: 'Z008', district: 'Kolkata',          state: 'West Bengal',       lat: 22.5726, lng: 88.3639 },
  { zoneId: 'Z009', district: 'Jaipur',           state: 'Rajasthan',         lat: 26.9124, lng: 75.7873 },
  { zoneId: 'Z010', district: 'Lucknow',          state: 'Uttar Pradesh',     lat: 26.8467, lng: 80.9462 },
  { zoneId: 'Z011', district: 'Ahmedabad',        state: 'Gujarat',           lat: 23.0225, lng: 72.5714 },
  { zoneId: 'Z012', district: 'Patna',            state: 'Bihar',             lat: 25.5941, lng: 85.1376 },
  { zoneId: 'Z013', district: 'Bhopal',           state: 'Madhya Pradesh',    lat: 23.2599, lng: 77.4126 },
  { zoneId: 'Z014', district: 'Chandigarh',       state: 'Chandigarh',        lat: 30.7333, lng: 76.7794 },
  { zoneId: 'Z015', district: 'Kochi',            state: 'Kerala',            lat: 9.9312,  lng: 76.2673 },
  { zoneId: 'Z016', district: 'Guwahati',         state: 'Assam',             lat: 26.1445, lng: 91.7362 },
  { zoneId: 'Z017', district: 'Indore',           state: 'Madhya Pradesh',    lat: 22.7196, lng: 75.8577 },
  { zoneId: 'Z018', district: 'Surat',            state: 'Gujarat',           lat: 21.1702, lng: 72.8311 },
  { zoneId: 'Z019', district: 'Nagpur',           state: 'Maharashtra',       lat: 21.1458, lng: 79.0882 },
];

// Prototype risk scores — these will be replaced by model output in integration phase
// Simulated based on fraud typology concentration from baseline_predictor.py patterns
export const ACTIVE_RISK_ZONES: RiskZone[] = [
  {
    zoneId: 'Z000', district: 'Central Delhi', state: 'Delhi',
    lat: 28.6519, lng: 77.2315,
    riskScore: 87, cases: 17, riskLevel: 'critical',
    atmCount: 23, recoverabilityMinutes: 42,
  },
  {
    zoneId: 'Z001', district: 'South Delhi / Gurugram', state: 'Delhi / Haryana',
    lat: 28.4595, lng: 77.0266,
    riskScore: 91, cases: 13, riskLevel: 'critical',
    atmCount: 14, recoverabilityMinutes: 48,
  },
  {
    zoneId: 'Z009', district: 'Jaipur', state: 'Rajasthan',
    lat: 26.9124, lng: 75.7873,
    riskScore: 74, cases: 7, riskLevel: 'high',
    atmCount: 11, recoverabilityMinutes: 72,
  },
  {
    zoneId: 'Z010', district: 'Lucknow', state: 'Uttar Pradesh',
    lat: 26.8467, lng: 80.9462,
    riskScore: 67, cases: 5, riskLevel: 'high',
    atmCount: 8, recoverabilityMinutes: 95,
  },
  {
    zoneId: 'Z002', district: 'Mumbai City', state: 'Maharashtra',
    lat: 18.9750, lng: 72.8258,
    riskScore: 55, cases: 4, riskLevel: 'medium',
    atmCount: 19, recoverabilityMinutes: 130,
  },
  {
    zoneId: 'Z008', district: 'Kolkata', state: 'West Bengal',
    lat: 22.5726, lng: 88.3639,
    riskScore: 43, cases: 3, riskLevel: 'medium',
    atmCount: 12, recoverabilityMinutes: 160,
  },
  {
    zoneId: 'Z005', district: 'Bengaluru Urban', state: 'Karnataka',
    lat: 12.9716, lng: 77.5946,
    riskScore: 31, cases: 2, riskLevel: 'low',
    atmCount: 16, recoverabilityMinutes: 240,
  },
];
