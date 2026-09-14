// ─── CaseContext ─────────────────────────────────────────────────────────────
// Single source of truth for TRINETRA case data and predictions.
//
// Architecture:
//   - caseList: paginated V2 cases from GET /api/v1/cases
//   - activeCase: full V2 case detail from GET /api/v1/cases/{id}
//   - predictions: keyed by caseId:stage → BackendPrediction
//   - All screens read from this context — no screen maintains its own case state
//
// Data source: V2 backend API (60k cases from data/synthetic_v2/)
// Old CASE_FIXTURES / NCRP-era fixtures are no longer used.

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8001';

// ─── V2 Case types (from API) ─────────────────────────────────────────────────

export interface V2CaseListItem {
  case_id:                        string;
  typology_id:                    string;
  typology_name:                  string;
  amount_inr:                     number;
  victim_state:                   string;
  victim_district:                string;
  victim_zone_id:                 string;
  incident_timestamp:             string;
  complaint_timestamp:            string;
  complaint_available_timestamp:  string;
  hop_count:                      number;
  latest_available_evidence_time: string | null;
  has_complaint_available:        boolean;
  evaluation_status:              string;
}

export interface V2Hop {
  hop_id:             string;
  complaint_id:       string;
  hop_sequence:       number;
  from_account:       string;
  to_account:         string;
  amount_transferred: number;
  bank_channel:       string | null;
  institution:        string | null;
  event_timestamp:    string;
  available_timestamp: string;
}

export interface V2EvidenceStage {
  stage:           number;
  label:           string;
  prediction_time: string;
  hop_count:       number;
  evidence_summary: string;
}

export interface V2CaseDetail {
  case_id: string;
  complaint: {
    complaint_id:          string;
    typology_id:           string;
    typology_name:         string;
    amount_inr:            number;
    victim_state:          string;
    victim_district:       string;
    victim_zone_id:        string;
    incident_timestamp:    string;
    complaint_timestamp:   string;
    available_timestamp:   string;
  };
  hops:            V2Hop[];
  hop_count:       number;
  evidence_stages: V2EvidenceStage[];
  evaluation_truth: {
    _warning: string;
    cashout: {
      cashout_id:        string;
      final_account:     string;
      zone_id:           string;
      zone_name:         string | null;
      district:          string | null;
      state:             string | null;
      lat:               number | null;
      lng:               number | null;
      amount_cashed_out: number;
      amount_frozen:     number;
      amount_recovered:  number;
      status:            string;
      event_timestamp:   string;
      available_timestamp: string;
    } | null;
  };
}

export interface PaginationState {
  page:        number;
  page_size:   number;
  total:       number;
  total_pages: number;
}

export interface CaseListFilters {
  search:      string;
  typology_id: string;
  state:       string;
  status:      string;
  sort_by:     string;
  sort_order:  string;
}

// ─── V2 ranked zone (from geographic output) ─────────────────────────────────

export interface RankedZoneV2 {
  rank:        number;
  zone_id:     string;
  zone_name:   string;
  locality?:   string;
  city:        string;
  district:    string;
  state:       string;
  lat:         number;
  lng:         number;
  probability: number;   // 0–1 float
}

// ─── Backend prediction types (V2 contract) ───────────────────────────────────

export interface BackendPrediction {
  case_id:  string;
  stage:    number;
  geographic: {
    predicted_destination_zone: string;
    confidence_score:           number;
    calibrated_confidence?:     number;
    ranked_zones?:              RankedZoneV2[];
    registry_signals?:          Array<{
      hop: number; destination_account: string;
      historical_sightings: number; reliability: number; in_registry: boolean;
    }>;
    prediction_history?: Array<{
      stage: string; top_zone: string | null; confidence: number;
    }>;
    model_version?: string;
  };
  timing: {
    intervention_distribution: {
      p25_minutes: number; p50_minutes: number; p75_minutes: number;
      survival_curve?: Array<{ minutes: number; probability_remaining: number }>;
    };
    operational_sla?: { sla_minutes: number; probability_remaining_beyond_sla: number };
    uncertainty?: { lower_minutes: number; upper_minutes: number; method: string };
    model_version?: string;
  };
  financial_exposure: {
    amount_at_risk_inr:    number;
    reported_loss_inr:     number;
    amount_retained_ratio: number;
    estimated_exposure_inr: number;
  };
  decision: {
    decision:            'CRITICAL' | 'REVIEW' | 'MONITOR';
    decision_confidence: number;
    reasons:             string[];
    geographic_summary?: {
      top_zone?: string; top_zone_name?: string;
      top1_probability?: number; top3_mass?: number; confidence_pct?: number;
      geo_strength?: string; registry_supported?: boolean;
      best_registry_reliability?: number;
      top3_zones?: Array<{ zone_id: string; name: string; state: string; probability: number }>;
    };
    timing_summary?: {
      p25_minutes?: number; p50_minutes?: number; p75_minutes?: number;
      interval_width_minutes?: number; urgency?: string;
      sla_viability?: string; p_beyond_sla?: number;
      horizon_probs?: { p_beyond_15min?: number; p_beyond_30min?: number; p_beyond_60min?: number };
    };
    rule_engine_version?: string;
  };
  system?: { prototype?: boolean; dataset_version?: string; model_versions?: Record<string, string> };
}

// ─── Context value ────────────────────────────────────────────────────────────

interface CaseContextValue {
  // ── Case list (paginated) ──────────────────────────────────────────────────
  caseList:        V2CaseListItem[];
  caseListLoading: boolean;
  caseListError:   string | null;
  pagination:      PaginationState;
  filters:         CaseListFilters;
  setFilters:      (f: Partial<CaseListFilters>) => void;
  setPage:         (p: number) => void;

  // ── Active case ───────────────────────────────────────────────────────────
  activeCaseId:  string | null;
  setActiveCase: (caseId: string) => void;
  activeCase:    V2CaseDetail | null;
  activeCaseLoading: boolean;
  activeCaseError:   string | null;

  // ── Active prediction stage ───────────────────────────────────────────────
  activeStage:    number;   // -1 = latest
  setActiveStage: (s: number) => void;

  // ── Predictions: keyed by "caseId:stage" ─────────────────────────────────
  predictions:         Record<string, BackendPrediction | null>;
  predictionsLoading:  Record<string, boolean>;
  predictionsError:    Record<string, string | null>;
  requestPrediction:   (caseId: string, stage?: number) => void;
  getActivePrediction: () => BackendPrediction | null;

  // ── Legacy helpers (kept for backward compat with AlertCenter etc.) ────────
  // These derive from caseList rather than CASE_FIXTURES.
  getFinalPrediction: (caseId: string) => BackendPrediction | null;
  isLoadingFinal:     (caseId: string) => boolean;

  // ── Formatting helpers ────────────────────────────────────────────────────
  formatAmountInr: (n: number) => string;
}

// ─── Default filters ──────────────────────────────────────────────────────────

const DEFAULT_FILTERS: CaseListFilters = {
  search:      '',
  typology_id: '',
  state:       '',
  status:      '',
  sort_by:     'complaint_timestamp',
  sort_order:  'desc',
};

// ─── Context ──────────────────────────────────────────────────────────────────

const CaseContext = createContext<CaseContextValue | null>(null);

export const useCaseContext = (): CaseContextValue => {
  const ctx = useContext(CaseContext);
  if (!ctx) throw new Error('useCaseContext must be used inside CaseProvider');
  return ctx;
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export const formatAmountInr = (inr: number): string => {
  if (inr >= 10_000_000) return `₹${(inr / 10_000_000).toFixed(1)} Cr`;
  if (inr >= 100_000)    return `₹${(inr / 100_000).toFixed(1)}L`;
  if (inr >= 1_000)      return `₹${(inr / 1_000).toFixed(0)}K`;
  return `₹${inr.toFixed(0)}`;
};

// ─── Zone label helpers (V2 zone IDs use V2_ZID_xxx format) ──────────────────
// For V2 zones, display names are embedded in ranked_zones from the API.
// These helpers handle legacy Z000–Z019 IDs for backward compat.
export const ZONE_LABELS: Record<string, string> = {
  Z000: 'Central Delhi', Z001: 'South Delhi',    Z002: 'Mumbai City',
  Z003: 'Mumbai Suburban', Z004: 'Pune',         Z005: 'Bengaluru Urban',
  Z006: 'Hyderabad',    Z007: 'Chennai',          Z008: 'Kolkata',
  Z009: 'Jaipur',       Z010: 'Lucknow',          Z011: 'Ahmedabad',
  Z012: 'Patna',        Z013: 'Bhopal',            Z014: 'Chandigarh',
  Z015: 'Kochi',        Z016: 'Guwahati',          Z017: 'Indore',
  Z018: 'Surat',        Z019: 'Nagpur',
};

export const ZONE_COORDS: Record<string, { lat: number; lng: number }> = {
  Z000: { lat: 28.6519, lng: 77.2315 }, Z001: { lat: 28.5245, lng: 77.2066 },
  Z002: { lat: 18.9750, lng: 72.8258 }, Z003: { lat: 19.0760, lng: 72.8777 },
  Z004: { lat: 18.5204, lng: 73.8567 }, Z005: { lat: 12.9716, lng: 77.5946 },
  Z006: { lat: 17.3850, lng: 78.4867 }, Z007: { lat: 13.0827, lng: 80.2707 },
  Z008: { lat: 22.5726, lng: 88.3639 }, Z009: { lat: 26.9124, lng: 75.7873 },
  Z010: { lat: 26.8467, lng: 80.9462 }, Z011: { lat: 23.0225, lng: 72.5714 },
  Z012: { lat: 25.5941, lng: 85.1376 }, Z013: { lat: 23.2599, lng: 77.4126 },
  Z014: { lat: 30.7333, lng: 76.7794 }, Z015: { lat:  9.9312, lng: 76.2673 },
  Z016: { lat: 26.1445, lng: 91.7362 }, Z017: { lat: 22.7196, lng: 75.8577 },
  Z018: { lat: 21.1702, lng: 72.8311 }, Z019: { lat: 21.1458, lng: 79.0882 },
};

export const getZoneLabel = (zoneId: string): string =>
  ZONE_LABELS[zoneId] || zoneId;

export const priorityColor = (decision: string): string => {
  switch (decision) {
    case 'CRITICAL': return '#E5484D';
    case 'REVIEW':   return '#F97316';
    case 'MONITOR':  return '#14B8A6';
    default:         return '#94A3B8';
  }
};

export const priorityRiskLevel = (decision: string): 'critical' | 'high' | 'medium' | 'low' => {
  switch (decision) {
    case 'CRITICAL': return 'critical';
    case 'REVIEW':   return 'high';
    default:         return 'low';
  }
};

// ─── Provider ─────────────────────────────────────────────────────────────────

export function CaseProvider({ children }: { children: React.ReactNode }) {
  // ── Case list state ────────────────────────────────────────────────────────
  const [caseList,        setCaseList]        = useState<V2CaseListItem[]>([]);
  const [caseListLoading, setCaseListLoading] = useState(false);
  const [caseListError,   setCaseListError]   = useState<string | null>(null);
  const [pagination,      setPagination]      = useState<PaginationState>({
    page: 1, page_size: 50, total: 0, total_pages: 1,
  });
  const [filters, setFiltersState] = useState<CaseListFilters>(DEFAULT_FILTERS);
  const [page, setPageState]       = useState(1);

  // ── Active case state ──────────────────────────────────────────────────────
  const [activeCaseId,      setActiveCaseId]      = useState<string | null>(null);
  const [activeCase,        setActiveCaseDetail]  = useState<V2CaseDetail | null>(null);
  const [activeCaseLoading, setActiveCaseLoading] = useState(false);
  const [activeCaseError,   setActiveCaseError]   = useState<string | null>(null);
  const [activeStage,       setActiveStageState]  = useState<number>(-1);

  // ── Prediction state ───────────────────────────────────────────────────────
  const [predictions,        setPredictions]        = useState<Record<string, BackendPrediction | null>>({});
  const [predictionsLoading, setPredictionsLoading] = useState<Record<string, boolean>>({});
  const [predictionsError,   setPredictionsError]   = useState<Record<string, string | null>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  // ── Fetch case list ────────────────────────────────────────────────────────
  const fetchCaseList = useCallback(async (f: CaseListFilters, p: number) => {
    setCaseListLoading(true);
    setCaseListError(null);
    try {
      const params = new URLSearchParams({
        page:       String(p),
        page_size:  String(pagination.page_size),
        sort_by:    f.sort_by,
        sort_order: f.sort_order,
      });
      if (f.search)      params.set('search',      f.search);
      if (f.typology_id) params.set('typology_id', f.typology_id);
      if (f.state)       params.set('state',       f.state);
      if (f.status)      params.set('status',      f.status);

      const res = await fetch(`${BACKEND_URL}/api/v1/cases?${params}`);
      if (!res.ok) throw new Error(`Cases API returned HTTP ${res.status}`);
      const data = await res.json();
      setCaseList(data.items || []);
      setPagination({
        page:        data.page        ?? p,
        page_size:   data.page_size   ?? pagination.page_size,
        total:       data.total       ?? 0,
        total_pages: data.total_pages ?? 1,
      });
    } catch (err: any) {
      setCaseListError(err?.message || 'Case list unavailable');
      setCaseList([]);
    } finally {
      setCaseListLoading(false);
    }
  }, [pagination.page_size]);

  // Load case list on mount and whenever filters/page change
  useEffect(() => {
    fetchCaseList(filters, page);
  }, [filters, page]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Fetch active case detail ───────────────────────────────────────────────
  const fetchCaseDetail = useCallback(async (caseId: string) => {
    setActiveCaseLoading(true);
    setActiveCaseError(null);
    setActiveCaseDetail(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/cases/${encodeURIComponent(caseId)}`);
      if (!res.ok) throw new Error(`Case detail API returned HTTP ${res.status}`);
      const data: V2CaseDetail = await res.json();
      setActiveCaseDetail(data);
    } catch (err: any) {
      setActiveCaseError(err?.message || 'Case detail unavailable');
    } finally {
      setActiveCaseLoading(false);
    }
  }, []);

  // Fetch case detail when active case changes
  useEffect(() => {
    if (activeCaseId) {
      fetchCaseDetail(activeCaseId);
      setActiveStageState(-1);
    }
  }, [activeCaseId, fetchCaseDetail]);

  // ── Request a prediction for a V2 case ────────────────────────────────────
  const requestPrediction = useCallback(async (caseId: string, stage: number = -1) => {
    const key = `${caseId}:${stage}`;
    if (fetchedRef.current.has(key)) return;
    fetchedRef.current.add(key);

    setPredictionsLoading(prev => ({ ...prev, [key]: true }));
    setPredictionsError(prev => ({ ...prev, [key]: null }));

    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/predict-case`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseId, stage }),
      });
      if (!res.ok) throw new Error(`Prediction API returned HTTP ${res.status}`);
      const data: BackendPrediction = await res.json();
      data.case_id = caseId;
      data.stage   = stage;
      setPredictions(prev => ({ ...prev, [key]: data }));
    } catch (err: any) {
      setPredictionsError(prev => ({ ...prev, [key]: err?.message || 'Prediction unavailable' }));
      setPredictions(prev => ({ ...prev, [key]: null }));
    } finally {
      setPredictionsLoading(prev => ({ ...prev, [key]: false }));
    }
  }, []);

  // Auto-request prediction for active case when it changes
  useEffect(() => {
    if (activeCaseId) {
      requestPrediction(activeCaseId, -1);  // latest stage
    }
  }, [activeCaseId, requestPrediction]);

  // ── Convenience helpers ────────────────────────────────────────────────────
  const getActivePrediction = useCallback((): BackendPrediction | null => {
    if (!activeCaseId) return null;
    const key = `${activeCaseId}:${activeStage}`;
    return predictions[key] ?? predictions[`${activeCaseId}:-1`] ?? null;
  }, [activeCaseId, activeStage, predictions]);

  // Legacy compat: get final prediction (stage=-1/latest) for any caseId
  const getFinalPrediction = useCallback((caseId: string): BackendPrediction | null => {
    return predictions[`${caseId}:-1`] ?? null;
  }, [predictions]);

  const isLoadingFinal = useCallback((caseId: string): boolean => {
    return predictionsLoading[`${caseId}:-1`] ?? false;
  }, [predictionsLoading]);

  const setActiveCase = useCallback((caseId: string) => {
    setActiveCaseId(caseId);
  }, []);

  const setFilters = useCallback((f: Partial<CaseListFilters>) => {
    setFiltersState(prev => ({ ...prev, ...f }));
    setPageState(1);          // reset to page 1 on filter change
    fetchedRef.current.clear(); // allow re-fetching predictions for new cases
  }, []);

  const setPage = useCallback((p: number) => {
    setPageState(p);
  }, []);

  const setActiveStage = useCallback((s: number) => {
    setActiveStageState(s);
    if (activeCaseId) {
      requestPrediction(activeCaseId, s);
    }
  }, [activeCaseId, requestPrediction]);

  const value: CaseContextValue = {
    caseList, caseListLoading, caseListError,
    pagination, filters, setFilters, setPage,
    activeCaseId, setActiveCase,
    activeCase, activeCaseLoading, activeCaseError,
    activeStage, setActiveStage,
    predictions, predictionsLoading, predictionsError,
    requestPrediction, getActivePrediction,
    getFinalPrediction, isLoadingFinal,
    formatAmountInr,
  };

  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}
