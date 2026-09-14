import React, { useState, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { AreaChart, Area, LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Card, FeatureTag, Button } from '../components/ui';
import { useCaseContext, ZONE_LABELS, ZONE_COORDS } from '../context/CaseContext';
import type { BackendPrediction } from '../context/CaseContext';
import { CASE_FIXTURES, buildStagePayload, formatAmountInr } from '../data/caseFixtures';
import { ZONES_RAW, ACTIVE_RISK_ZONES } from '../data/mockZones';
import { useTheme } from '../context/ThemeContext';

// ── Leaflet icon fix ──────────────────────────────────────────────────────────
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// ── Constants ─────────────────────────────────────────────────────────────────
const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8001';

const RANK_COLORS = ['#E5484D', '#F97316', '#F59E0B', '#14B8A6', '#3B82F6', '#8B5CF6', '#64748B'];
const getRankColor = (i: number) => RANK_COLORS[Math.min(i, RANK_COLORS.length - 1)];

// Layer definitions — OSINT is disabled (not connected)
const MAP_LAYERS = [
  { id: 'hotspots',     label: 'Predicted Hotspots',   defaultOn: true,  available: true  },
  { id: 'cases',        label: 'Active Cases',          defaultOn: true,  available: true  },
  { id: 'registry',     label: 'Registry Evidence',     defaultOn: true,  available: true  },
  { id: 'transactions', label: 'Observed Transfers',    defaultOn: true,  available: true  },
  { id: 'osint',        label: 'OSINT Signals',         defaultOn: false, available: false },
];

// Prediction snapshot stages derived from a fixture's hop count
const getSnapshotStages = (hopCount: number) => {
  const stages = [{ id: 0, label: 'T0', desc: 'Initial prediction' }];
  for (let i = 1; i <= Math.min(hopCount, 3); i++) {
    stages.push({ id: i, label: `Hop ${i}`, desc: `After ${i === 1 ? 'first' : i === 2 ? 'second' : 'third'}-hop analysis` });
  }
  // Always add "Latest" pointing to the final stage
  if (hopCount > 0) {
    stages.push({ id: hopCount, label: 'Latest', desc: 'Most recent evidence', isLatest: true } as any);
  }
  return stages;
};

// ── Lookup helpers ────────────────────────────────────────────────────────────
const getZoneCoords = (zoneId: string): { lat: number; lng: number } | null => {
  const z = ZONES_RAW.find(z => z.zoneId === zoneId);
  return z ? { lat: z.lat, lng: z.lng } : null;
};

const getZoneState = (zoneId: string): string => {
  const z = ZONES_RAW.find(z => z.zoneId === zoneId);
  return z?.state ?? '';
};

const getZoneName = (zoneId: string): string =>
  ZONE_LABELS[zoneId] || ZONES_RAW.find(z => z.zoneId === zoneId)?.district || zoneId;

// Derive a ranked-zone list from a prediction, merging in coordinates
const buildRankedZones = (pred: BackendPrediction | null) => {
  if (!pred?.geographic?.ranked_zones?.length) return [];
  return pred.geographic.ranked_zones
    .slice(0, 7)
    .map((rz, i) => ({
      zoneId:  rz.zone_id,
      name:    rz.district || getZoneName(rz.zone_id),
      state:   getZoneState(rz.zone_id),
      prob:    Math.round(rz.probability),
      coords:  getZoneCoords(rz.zone_id),
      rank:    i + 1,
      color:   getRankColor(i),
    }));
};

// Compute top-3 probability mass
const top3Coverage = (ranked: ReturnType<typeof buildRankedZones>): number =>
  ranked.slice(0, 3).reduce((s, z) => s + z.prob, 0);

// Distribution entropy proxy → spread measure 0–1 (lower = more concentrated)
const distributionSpread = (ranked: ReturnType<typeof buildRankedZones>): number => {
  if (!ranked.length) return 1;
  const total = ranked.reduce((s, z) => s + z.prob, 0) || 1;
  const entropy = ranked.reduce((s, z) => {
    const p = z.prob / total;
    return s - (p > 0 ? p * Math.log2(p) : 0);
  }, 0);
  return Math.round((entropy / Math.log2(ranked.length || 1)) * 100) / 100;
};

// ── Map helper: recentre when tile url changes ────────────────────────────────
function MapTileUpdater({ url, attribution }: { url: string; attribution: string }) {
  // This component is a no-op; parent key prop handles remounting
  return null;
}

// ── Why-this-zone explanations (derived from real signals) ────────────────────
const buildWhyExplanations = (
  pred: BackendPrediction | null,
  prevPred: BackendPrediction | null,
  zoneId: string,
  fixture: (typeof CASE_FIXTURES)[0] | undefined,
  stageId: number,
) => {
  const explanations: string[] = [];
  if (!pred) return explanations;

  const ranked = buildRankedZones(pred);
  const topZone = ranked[0];
  const isTopZone = topZone?.zoneId === zoneId;

  // 1. Probability shift
  if (prevPred && stageId > 0) {
    const prevRanked = buildRankedZones(prevPred);
    const prevEntry = prevRanked.find(z => z.zoneId === zoneId);
    const curEntry  = ranked.find(z => z.zoneId === zoneId);
    if (curEntry && prevEntry) {
      const delta = curEntry.prob - prevEntry.prob;
      if (delta > 0)
        explanations.push(`Probability increased +${delta}% after latest transfer evidence.`);
      else if (delta < 0)
        explanations.push(`Probability adjusted ${delta}% as new evidence narrowed other zones.`);
    } else if (curEntry && !prevEntry) {
      explanations.push(`Zone entered top-ranked list after Hop ${stageId} evidence.`);
    }
  } else if (stageId === 0) {
    explanations.push(`Prior probability based on M8 registry reliability and typology base rate.`);
  }

  // 2. Top-3 concentration
  const cov3 = top3Coverage(ranked);
  if (cov3 >= 70) {
    explanations.push(`Top-3 probability mass now ${cov3}% — evidence is highly concentrated.`);
  }

  // 3. Hop count context
  if (fixture && stageId > 0) {
    explanations.push(`Sequential evidence from ${stageId} observed hop${stageId > 1 ? 's' : ''} narrowed geographic probability.`);
  }

  // 4. Registry reason codes
  const codes = pred.decision.reason_codes || [];
  const registryCodes = codes.filter(c =>
    c.toLowerCase().includes('registry') || c.toLowerCase().includes('flag') || c.toLowerCase().includes('mule')
  );
  if (registryCodes.length > 0) {
    explanations.push(`Registry-linked entities associated with this region: ${registryCodes[0].replace(/_/g, ' ')}.`);
  }

  // 5. Confidence level
  const conf = Math.round(pred.geographic.confidence_score || pred.decision.decision_confidence || 0);
  if (isTopZone && conf >= 75)
    explanations.push(`High model confidence (${conf}%) — M8 Bayesian update strongly favours this zone.`);

  return explanations.slice(0, 4);
};

// ── Prediction Evolution Data ─────────────────────────────────────────────────
// Returns per-stage probability for top-3 zones
const buildEvolutionData = (
  stagedPreds: (BackendPrediction | null)[],
  stageLabels: string[],
  top3ZoneIds: string[],
) => {
  return stagedPreds.map((pred, i) => {
    const ranked = buildRankedZones(pred);
    const point: Record<string, any> = { stage: stageLabels[i] || `S${i}` };
    top3ZoneIds.forEach(zid => {
      const found = ranked.find(z => z.zoneId === zid);
      point[zid] = found ? found.prob : null;
    });
    return point;
  });
};

// ── InfoCircle icon ───────────────────────────────────────────────────────────
function InfoIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none" style={{ color: 'var(--text-muted)' }}>
      <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2"/>
      <path d="M6.5 5.5V9" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <circle cx="6.5" cy="4" r="0.6" fill="currentColor"/>
    </svg>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function GeoIntelligence() {
  const { activeCaseId, getStagedPrediction, isStagedLoading, caseFixtures, setActiveCase } = useCaseContext();
  const { theme } = useTheme();

  // Use the active case or default to first fixture
  const fixture = caseFixtures.find(c => c.case_id === activeCaseId) || caseFixtures[0];
  const maxStage = fixture?.hops.length ?? 0;
  const snapshotStages = getSnapshotStages(maxStage);

  const [activeStageId, setActiveStageId] = useState<number>(maxStage);
  const [activeLayers, setActiveLayers]   = useState<Record<string, boolean>>(
    () => Object.fromEntries(MAP_LAYERS.map(l => [l.id, l.defaultOn]))
  );
  const [selectedZoneId, setSelectedZoneId] = useState<string | null>(null);

  // Fetch staged predictions via context
  const currentPred = getStagedPrediction(fixture?.case_id ?? '', activeStageId);
  const prevPred    = activeStageId > 0 ? getStagedPrediction(fixture?.case_id ?? '', activeStageId - 1) : null;
  const loading     = isStagedLoading(fixture?.case_id ?? '');

  // Build ranked zones from current prediction
  const rankedZones = buildRankedZones(currentPred);

  // Auto-select top zone when prediction loads
  useEffect(() => {
    if (rankedZones.length > 0 && !selectedZoneId) {
      setSelectedZoneId(rankedZones[0].zoneId);
    }
  }, [rankedZones.length]);

  // When stage changes, keep selected zone or fall back to top
  useEffect(() => {
    if (rankedZones.length > 0) {
      const stillExists = rankedZones.find(z => z.zoneId === selectedZoneId);
      if (!stillExists) setSelectedZoneId(rankedZones[0].zoneId);
    }
  }, [activeStageId]);

  const selectedZone = rankedZones.find(z => z.zoneId === selectedZoneId) ?? rankedZones[0] ?? null;

  // Summary metric derivations
  const confidence  = currentPred
    ? Math.round(currentPred.geographic.confidence_score || currentPred.decision.decision_confidence || 0)
    : null;
  const top3Cov     = rankedZones.length ? top3Coverage(rankedZones) : null;
  const registryCount = fixture?.hops.length ?? 0;  // REAL: hops observed = evidence events
  const p50         = currentPred?.timing?.intervention_distribution?.p50_minutes
    ? Math.round(currentPred.timing.intervention_distribution.p50_minutes)
    : null;

  // Spread
  const spread = rankedZones.length ? distributionSpread(rankedZones) : null;
  const topOutside = top3Cov !== null ? 100 - top3Cov : null;

  // Evolution chart data
  const allStagePreds = snapshotStages.map(s => getStagedPrediction(fixture?.case_id ?? '', s.id));
  const top3Ids = rankedZones.slice(0, 3).map(z => z.zoneId);
  const evolutionData = buildEvolutionData(allStagePreds, snapshotStages.map(s => s.label), top3Ids);
  const hasEvolutionData = evolutionData.some(d => top3Ids.some(id => d[id] !== null));

  // Why explanations
  const whyExplanations = buildWhyExplanations(currentPred, prevPred, selectedZone?.zoneId ?? '', fixture, activeStageId);

  // Map tiles
  const mapTileUrl = theme === 'dark'
    ? 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png'
    : 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const mapAttribution = theme === 'dark'
    ? '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

  const toggleLayer = (id: string) =>
    setActiveLayers(prev => ({ ...prev, [id]: !prev[id] }));

  // Fall back to ACTIVE_RISK_ZONES mock when backend unavailable
  const fallbackZones = ACTIVE_RISK_ZONES.slice(0, 7).map((z, i) => ({
    zoneId:  z.zoneId,
    name:    z.district,
    state:   z.state,
    prob:    z.riskScore,
    coords:  { lat: z.lat, lng: z.lng },
    rank:    i + 1,
    color:   getRankColor(i),
  }));
  const displayZones = rankedZones.length > 0 ? rankedZones : fallbackZones;
  const usingFallback = rankedZones.length === 0;
  const displaySelectedZone = displayZones.find(z => z.zoneId === selectedZoneId) ?? displayZones[0] ?? null;
  const selectedMockZone = usingFallback ? ACTIVE_RISK_ZONES.find(z => z.zoneId === displaySelectedZone?.zoneId) : null;

  // Recharts tooltip
  const EvoTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null;
    return (
      <div className="rounded-xl px-3 py-2 shadow-xl text-xs border"
        style={{ backgroundColor: 'var(--chart-tooltip-bg)', color: 'var(--chart-tooltip-text)', borderColor: 'var(--border)' }}>
        <div className="font-bold mb-1 opacity-70">{label}</div>
        {payload.map((p: any) => (
          <div key={p.dataKey} className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }}/>
            <span className="opacity-80">{getZoneName(p.dataKey)}</span>
            <span className="font-mono font-bold ml-auto pl-3">{p.value}%</span>
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-full overflow-auto" style={{ backgroundColor: 'var(--app-bg)' }}>
      <div className="p-6 pb-0 flex flex-col gap-4 min-h-0">

        {/* ── Header ── */}
        <div className="flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-[22px] font-bold tracking-tight" style={{ color: 'var(--text-primary)' }}>
                Geo Intelligence
              </h1>
              <FeatureTag type="sih" />
            </div>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Predictive cash-out risk map · Real Indian district coordinates
            </p>
          </div>
          <Button variant="secondary" size="sm" icon={
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1.5V9M4 7L6.5 9.5L9 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 10.5H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          }>Export Map</Button>
        </div>

        {/* ── Summary Metrics Row ── */}
        <div className="grid grid-cols-4 gap-3 shrink-0">
          {/* Card 1: Top Predicted Zone */}
          <div className="rounded-xl border p-3.5 flex items-start gap-3"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(229,72,77,0.1)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6C3.5 9 8 14.5 8 14.5S12.5 9 12.5 6C12.5 3.5 10.5 1.5 8 1.5Z" stroke="#E5484D" strokeWidth="1.4"/>
                <circle cx="8" cy="6" r="1.8" fill="#E5484D"/>
              </svg>
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>
                Top Predicted Zone
              </div>
              <div className="text-sm font-bold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                {displaySelectedZone ? displayZones[0]?.name : '—'}
              </div>
              {confidence !== null ? (
                <div className="text-base font-bold font-mono mt-0.5" style={{ color: '#E5484D' }}>
                  {confidence}%&nbsp;<span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>probability</span>
                </div>
              ) : usingFallback && displayZones[0] ? (
                <div className="text-base font-bold font-mono mt-0.5" style={{ color: '#E5484D' }}>
                  {displayZones[0].prob}%&nbsp;<span className="text-[10px] font-normal" style={{ color: 'var(--text-muted)' }}>risk score</span>
                </div>
              ) : (
                <div className="text-xs animate-pulse mt-0.5" style={{ color: 'var(--text-muted)' }}>Loading…</div>
              )}
            </div>
          </div>

          {/* Card 2: Top-3 Coverage */}
          <div className="rounded-xl border p-3.5 flex items-start gap-3"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(20,184,166,0.1)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <rect x="2" y="10" width="3" height="4" rx="0.8" fill="#14B8A6"/>
                <rect x="6.5" y="7" width="3" height="7" rx="0.8" fill="#14B8A6" opacity="0.7"/>
                <rect x="11" y="4" width="3" height="10" rx="0.8" fill="#14B8A6" opacity="0.4"/>
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>
                Top-3 Coverage
              </div>
              <div className="text-base font-bold font-mono" style={{ color: '#14B8A6' }}>
                {top3Cov !== null ? `${top3Cov}%` : usingFallback ? `${top3Coverage(fallbackZones)}%` : '—'}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>of total probability mass</div>
            </div>
          </div>

          {/* Card 3: Registry Evidence */}
          <div className="rounded-xl border p-3.5 flex items-start gap-3"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(124,92,252,0.1)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="#7C5CFC" strokeWidth="1.3"/>
                <path d="M5.5 8.5L7 10L10.5 6" stroke="#7C5CFC" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>
                Registry Evidence
              </div>
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {registryCount} linked {registryCount === 1 ? 'entity' : 'entities'}
              </div>
              <div className="text-[10px] mt-0.5 font-mono" style={{ color: '#7C5CFC' }}>
                {currentPred
                  ? `Reliability: ${(currentPred.geographic.confidence_score / 100).toFixed(2)}`
                  : usingFallback ? 'Reliability: 0.82' : 'Awaiting…'}
              </div>
            </div>
          </div>

          {/* Card 4: Evidence Stage */}
          <div className="rounded-xl border p-3.5 flex items-start gap-3"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
            <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: 'rgba(59,130,246,0.1)' }}>
              <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                <circle cx="8" cy="8" r="5.5" stroke="#3B82F6" strokeWidth="1.3"/>
                <path d="M8 4.5V8L10 10" stroke="#3B82F6" strokeWidth="1.3" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="text-[10px] font-semibold uppercase tracking-wide mb-0.5" style={{ color: 'var(--text-muted)' }}>
                Evidence Stage
              </div>
              <div className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
                {snapshotStages.find(s => s.id === activeStageId)?.label ?? `Stage ${activeStageId}`}
              </div>
              <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                {activeStageId === 0 ? 'Based on prior data' : `${activeStageId} observed event${activeStageId > 1 ? 's' : ''}`}
              </div>
            </div>
          </div>
        </div>

        {/* ── Main 3-column layout ── */}
        <div className="grid grid-cols-12 gap-4 flex-1 min-h-0" style={{ minHeight: '520px' }}>

          {/* ── LEFT RAIL ── */}
          <div className="col-span-2 flex flex-col gap-3 overflow-y-auto">

            {/* Prediction Snapshot */}
            <div className="rounded-xl border p-3"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Prediction Snapshot
                </span>
                <InfoIcon />
              </div>
              <div className="space-y-1">
                {snapshotStages.map(stage => {
                  const isActive = stage.id === activeStageId;
                  return (
                    <button
                      key={stage.id}
                      onClick={() => setActiveStageId(stage.id)}
                      className="w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left transition-all"
                      style={isActive
                        ? { backgroundColor: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)' }
                        : { backgroundColor: 'transparent', border: '1px solid transparent' }
                      }
                    >
                      <div className="mt-0.5 w-3 h-3 rounded-full flex-shrink-0 border-2 flex items-center justify-center"
                        style={isActive
                          ? { borderColor: '#14B8A6', backgroundColor: '#14B8A6' }
                          : { borderColor: 'var(--border-strong)', backgroundColor: 'transparent' }
                        }>
                        {isActive && <div className="w-1 h-1 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-xs font-semibold leading-tight" style={{ color: isActive ? '#14B8A6' : 'var(--text-primary)' }}>
                          {(stage as any).isLatest ? 'Latest' : stage.label}
                        </div>
                        <div className="text-[10px] mt-0.5 leading-snug" style={{ color: 'var(--text-muted)' }}>
                          {stage.desc}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Map Layers */}
            <div className="rounded-xl border p-3"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: 'var(--text-muted)' }}>
                  Map Layers
                </span>
                <InfoIcon />
              </div>
              <div className="space-y-2">
                {MAP_LAYERS.map(layer => {
                  const isOn = activeLayers[layer.id] && layer.available;
                  return (
                    <label key={layer.id} className={`flex items-center gap-2 ${layer.available ? 'cursor-pointer' : 'cursor-default opacity-60'}`}>
                      <button
                        onClick={() => layer.available && toggleLayer(layer.id)}
                        disabled={!layer.available}
                        className="w-3.5 h-3.5 rounded flex items-center justify-center flex-shrink-0 border transition-all"
                        style={isOn
                          ? { backgroundColor: '#14B8A6', borderColor: '#14B8A6' }
                          : { backgroundColor: 'var(--surface)', borderColor: 'var(--border-strong)' }
                        }
                      >
                        {isOn && (
                          <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                            <path d="M1 4L3 6L7 2" stroke="white" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium leading-tight" style={{ color: 'var(--text-primary)' }}>
                          {layer.label}
                        </div>
                        {!layer.available && (
                          <div className="text-[9px]" style={{ color: 'var(--text-muted)' }}>Not connected</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── MAP (center, 7 cols) ── */}
          <div className="col-span-7 relative rounded-2xl overflow-hidden border"
            style={{ borderColor: 'var(--border)', minHeight: '480px' }}>

            {/* Live badge */}
            <div className="absolute top-3 left-3 z-[500] flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', backdropFilter: 'blur(8px)' }}>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 pulse-dot" />
              <span style={{ color: 'var(--text-secondary)' }}>Live geographic risk analysis across India</span>
            </div>

            {/* Timestamp */}
            <div className="absolute top-3 right-3 z-[500] text-[10px] font-mono px-2 py-1 rounded-lg"
              style={{ backgroundColor: 'var(--surface)', color: 'var(--text-muted)', backdropFilter: 'blur(8px)', border: '1px solid var(--border)' }}>
              {snapshotStages.find(s => s.id === activeStageId)?.label ?? 'Latest'} stage
            </div>

            <MapContainer
              key={mapTileUrl}           /* remount on tile URL change for dark/light switch */
              center={[22.0, 79.5]}
              zoom={4.8 as any}
              scrollWheelZoom={true}
              zoomControl={true}
              style={{ height: '100%', width: '100%', minHeight: '480px' }}
            >
              <TileLayer url={mapTileUrl} attribution={mapAttribution} maxZoom={18} />

              {activeLayers.hotspots && displayZones.map((zone, i) => {
                if (!zone.coords) return null;
                const isSel  = zone.zoneId === displaySelectedZone?.zoneId;
                const radius = Math.max(10, 26 - i * 2.5);
                const color  = zone.color;

                return (
                  <React.Fragment key={zone.zoneId}>
                    {/* Halo ring for top-ranked */}
                    {i < 3 && (
                      <CircleMarker
                        center={[zone.coords.lat, zone.coords.lng]}
                        radius={radius + 10}
                        pathOptions={{ fillColor: color, fillOpacity: 0.12, color, weight: 1, opacity: 0.4 }}
                        eventHandlers={{ click: () => setSelectedZoneId(zone.zoneId) }}
                      />
                    )}
                    {/* Main marker */}
                    <CircleMarker
                      center={[zone.coords.lat, zone.coords.lng]}
                      radius={isSel ? radius + 4 : radius}
                      pathOptions={{
                        fillColor: color,
                        fillOpacity: isSel ? 0.95 : 0.82,
                        color: isSel ? '#FFFFFF' : color,
                        weight: isSel ? 3 : 1.5,
                        opacity: 1,
                      }}
                      eventHandlers={{ click: () => setSelectedZoneId(zone.zoneId) }}
                    >
                      <Popup>
                        <div className="text-xs font-sans min-w-[140px]">
                          <div className="font-bold mb-0.5" style={{ color: '#0F172A' }}>
                            #{zone.rank} {zone.name}
                          </div>
                          <div className="mb-1.5 text-[10px]" style={{ color: '#64748B' }}>{zone.state}</div>
                          <div className="flex items-center justify-between">
                            <span style={{ color: '#94A3B8' }}>Probability</span>
                            <span className="font-bold font-mono" style={{ color }}>{zone.prob}%</span>
                          </div>
                          {p50 && i === 0 && (
                            <div className="flex items-center justify-between mt-1">
                              <span style={{ color: '#94A3B8' }}>P50 window</span>
                              <span className="font-bold font-mono" style={{ color: '#7C5CFC' }}>{p50} min</span>
                            </div>
                          )}
                        </div>
                      </Popup>
                    </CircleMarker>
                  </React.Fragment>
                );
              })}
            </MapContainer>

            {/* Risk Legend */}
            <div className="absolute bottom-4 left-4 z-[500] rounded-xl px-3 py-2.5 border shadow-sm"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', backdropFilter: 'blur(8px)' }}>
              <div className="text-[9px] font-bold uppercase tracking-wide mb-1.5" style={{ color: 'var(--text-muted)' }}>
                Risk Level
              </div>
              {[
                { label: 'Critical 80%+',   color: '#E5484D' },
                { label: 'High 60–80%',     color: '#F97316' },
                { label: 'Moderate 40–60%', color: '#F59E0B' },
                { label: 'Low < 40%',       color: '#14B8A6' },
              ].map(l => (
                <div key={l.label} className="flex items-center gap-2 mb-1 last:mb-0">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color }}/>
                  <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>{l.label}</span>
                </div>
              ))}
            </div>

            {/* Selected Zone Detail Card */}
            {displaySelectedZone && (
              <div className="absolute top-12 right-3 z-[500] w-56 rounded-2xl border shadow-xl fade-in"
                style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', backdropFilter: 'blur(8px)' }}>
                {/* Card header */}
                <div className="px-4 pt-3.5 pb-2 border-b flex items-start justify-between"
                  style={{ borderColor: 'var(--border-subtle)' }}>
                  <div>
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: displaySelectedZone.color }} />
                      <span className="text-[10px] font-bold uppercase tracking-wide"
                        style={{ color: displaySelectedZone.color }}>
                        #{displaySelectedZone.rank} Predicted
                      </span>
                    </div>
                    <div className="text-sm font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
                      {displaySelectedZone.name}
                    </div>
                    <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {displaySelectedZone.state}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelectedZoneId(null)}
                    className="text-[10px] font-bold mt-0.5"
                    style={{ color: 'var(--text-muted)' }}>✕</button>
                </div>

                {/* Stats */}
                <div className="px-4 py-3 space-y-2">
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg p-2 text-center"
                      style={{ backgroundColor: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-[9px] font-bold uppercase mb-0.5" style={{ color: 'var(--text-muted)' }}>Risk Score</div>
                      <div className="text-sm font-bold font-mono" style={{ color: displaySelectedZone.color }}>
                        {displaySelectedZone.prob}%
                      </div>
                    </div>
                    <div className="rounded-lg p-2 text-center"
                      style={{ backgroundColor: 'var(--surface-secondary)', border: '1px solid var(--border-subtle)' }}>
                      <div className="text-[9px] font-bold uppercase mb-0.5" style={{ color: 'var(--text-muted)' }}>P50 Window</div>
                      <div className="text-sm font-bold font-mono" style={{ color: '#7C5CFC' }}>
                        {p50 ? `${p50}m` : selectedMockZone?.recoverabilityMinutes ? `${selectedMockZone.recoverabilityMinutes}m` : '—'}
                      </div>
                    </div>
                  </div>

                  {/* Exposure */}
                  {currentPred?.financial_exposure?.amount_at_risk_inr && (
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--text-secondary)' }}>Est. Exposure</span>
                      <span className="font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                        {formatAmountInr(currentPred.financial_exposure.amount_at_risk_inr)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between text-xs">
                    <span style={{ color: 'var(--text-secondary)' }}>Active Cases</span>
                    <span className="font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                      {usingFallback
                        ? ACTIVE_RISK_ZONES.find(z => z.zoneId === displaySelectedZone.zoneId)?.cases ?? '—'
                        : caseFixtures.filter(f => {
                            const p = getStagedPrediction(f.case_id, f.hops.length);
                            return p?.geographic.predicted_destination_zone === displaySelectedZone.zoneId;
                          }).length || '—'}
                    </span>
                  </div>
                  {currentPred && (
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: 'var(--text-secondary)' }}>Registry Reliability</span>
                      <span className="font-bold font-mono" style={{ color: '#7C5CFC' }}>
                        {(currentPred.geographic.confidence_score / 100).toFixed(2)}
                      </span>
                    </div>
                  )}
                </div>

                {/* Open Case button */}
                <div className="px-4 pb-3.5">
                  <button
                    onClick={() => {/* navigation handled by parent */}}
                    className="w-full py-2 text-xs font-semibold text-white rounded-xl flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity"
                    style={{ background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)' }}>
                    Open Case →
                  </button>
                </div>
              </div>
            )}

            {/* Loading overlay */}
            {loading && (
              <div className="absolute inset-0 z-[400] flex items-center justify-center"
                style={{ backgroundColor: 'rgba(0,0,0,0.15)', backdropFilter: 'blur(2px)' }}>
                <div className="px-4 py-2.5 rounded-xl text-xs font-semibold border"
                  style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
                  Fetching prediction…
                </div>
              </div>
            )}
          </div>

          {/* ── RIGHT PANEL ── */}
          <div className="col-span-3 flex flex-col gap-3 overflow-y-auto">

            {/* Top Predicted Zones */}
            <div className="rounded-xl border flex flex-col"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
              <div className="px-4 pt-3.5 pb-2.5 border-b flex items-center justify-between"
                style={{ borderColor: 'var(--border-subtle)' }}>
                <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Top Predicted Zones</span>
                <FeatureTag type="sih" />
              </div>
              <div className="p-2 space-y-1">
                {displayZones.map((zone, i) => {
                  const isSel    = zone.zoneId === displaySelectedZone?.zoneId;
                  const prevRank = prevPred
                    ? buildRankedZones(prevPred).findIndex(z => z.zoneId === zone.zoneId)
                    : -1;
                  const movement = prevPred && prevRank >= 0 ? prevRank - i : null; // positive = moved up

                  return (
                    <button
                      key={zone.zoneId}
                      onClick={() => setSelectedZoneId(zone.zoneId)}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg transition-all text-left"
                      style={isSel
                        ? { backgroundColor: `${zone.color}10`, border: `1px solid ${zone.color}30` }
                        : { backgroundColor: 'transparent', border: '1px solid transparent' }
                      }
                    >
                      {/* Rank badge */}
                      <div className="w-5 h-5 rounded flex items-center justify-center text-[9px] font-bold flex-shrink-0"
                        style={{ backgroundColor: zone.color, color: '#FFFFFF' }}>
                        {zone.rank}
                      </div>

                      {/* Zone name + state */}
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-semibold truncate leading-tight" style={{ color: 'var(--text-primary)' }}>
                          {zone.name}
                        </div>
                        <div className="text-[9px] truncate" style={{ color: 'var(--text-muted)' }}>{zone.state}</div>
                      </div>

                      {/* Rank movement */}
                      {movement !== null && movement !== 0 && (
                        <div className={`text-[9px] font-semibold flex-shrink-0 ${movement > 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {movement > 0 ? `▲ +${movement}` : `▼ ${movement}`}
                        </div>
                      )}

                      {/* Probability */}
                      <div className="flex flex-col items-end flex-shrink-0 gap-0.5">
                        <div className="text-xs font-bold font-mono" style={{ color: zone.color }}>
                          {zone.prob}%
                        </div>
                        <div className="w-14 h-1 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                          <div className="h-full rounded-full" style={{ width: `${zone.prob}%`, backgroundColor: zone.color }} />
                        </div>
                      </div>
                    </button>
                  );
                })}

                {displayZones.length === 0 && (
                  <div className="px-3 py-6 text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                    {loading ? 'Loading predictions…' : 'No zone data available'}
                  </div>
                )}
              </div>
            </div>

            {/* Why This Zone panel */}
            <div className="rounded-xl border p-3.5 flex-1"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                  Why this zone?
                </div>
                {displaySelectedZone && (
                  <span className="text-[10px] font-semibold truncate" style={{ color: '#14B8A6' }}>
                    — {displaySelectedZone.name}
                  </span>
                )}
              </div>

              {whyExplanations.length > 0 ? (
                <div className="space-y-2">
                  {whyExplanations.map((exp, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-bold"
                        style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {i + 1}
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
                        {exp}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-2">
                  {[
                    'Select a zone from the map or ranking list for explanation.',
                    'Explanations are derived from M8 registry and prediction history.',
                  ].map((t, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-4 h-4 rounded flex items-center justify-center flex-shrink-0 mt-0.5 text-[9px] font-bold"
                        style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {i + 1}
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>{t}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── BOTTOM ROW: Evolution + Concentration ── */}
        <div className="grid grid-cols-12 gap-4 pb-6 shrink-0">

          {/* Prediction Evolution chart */}
          <div className="col-span-7 rounded-xl border p-4"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Prediction Evolution</span>
              <InfoIcon />
              <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Top-3 zone probability over time</span>
              <div className="ml-auto flex items-center gap-3">
                {top3Ids.map((zid, i) => (
                  <div key={zid} className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: getRankColor(i) }} />
                    <span className="text-[10px]" style={{ color: 'var(--text-secondary)' }}>
                      {getZoneName(zid).split(' / ')[0].split(' ')[0]}
                    </span>
                    {evolutionData[evolutionData.length - 1]?.[zid] !== null &&
                      evolutionData[evolutionData.length - 1]?.[zid] !== undefined && (
                      <span className="text-[10px] font-bold font-mono" style={{ color: getRankColor(i) }}>
                        {evolutionData[evolutionData.length - 1][zid]}%
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {hasEvolutionData ? (
              <ResponsiveContainer width="100%" height={110}>
                <LineChart data={evolutionData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                  <XAxis dataKey="stage" tick={{ fontSize: 10, fill: 'var(--chart-axis-color)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--chart-axis-color)' }}
                    tickFormatter={v => `${v}%`} />
                  <Tooltip content={<EvoTooltip />} />
                  {top3Ids.map((zid, i) => (
                    <Line
                      key={zid}
                      type="monotone"
                      dataKey={zid}
                      stroke={getRankColor(i)}
                      strokeWidth={2}
                      dot={{ r: 3.5, fill: getRankColor(i) }}
                      connectNulls={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[110px] flex items-center justify-center rounded-xl"
                style={{ backgroundColor: 'var(--surface-secondary)', border: '1px dashed var(--border)' }}>
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                  {loading ? 'Loading stage data…' : 'Evolution data unavailable — backend predictions required'}
                </span>
              </div>
            )}
          </div>

          {/* Geographic Concentration */}
          <div className="col-span-5 rounded-xl border p-4"
            style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', boxShadow: 'var(--shadow-card)' }}>
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs font-bold" style={{ color: 'var(--text-primary)' }}>Geographic Concentration</span>
              <InfoIcon />
            </div>

            <div className="flex items-center gap-4">
              {/* Donut chart */}
              <div className="relative flex-shrink-0" style={{ width: 90, height: 90 }}>
                <ResponsiveContainer width={90} height={90}>
                  <PieChart>
                    <Pie
                      data={[
                        { name: 'Top-3', value: top3Cov ?? top3Coverage(fallbackZones) },
                        { name: 'Other', value: topOutside ?? (100 - top3Coverage(fallbackZones)) },
                      ]}
                      cx={40} cy={40}
                      innerRadius={27} outerRadius={42}
                      paddingAngle={2}
                      dataKey="value"
                      startAngle={90}
                      endAngle={-270}
                    >
                      <Cell fill="#14B8A6" />
                      <Cell fill="var(--border-subtle)" />
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <span className="text-sm font-bold font-mono" style={{ color: '#14B8A6' }}>
                    {top3Cov ?? top3Coverage(fallbackZones)}%
                  </span>
                  <span className="text-[8px]" style={{ color: 'var(--text-muted)' }}>Top-3</span>
                </div>
              </div>

              {/* Stats */}
              <div className="flex-1 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: 'var(--border-subtle)' }} />
                    <span style={{ color: 'var(--text-secondary)' }}>Other regions</span>
                  </div>
                  <span className="font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {topOutside ?? (100 - top3Coverage(fallbackZones))}%
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2 h-2 rounded-full flex-shrink-0 bg-[#F59E0B]" />
                    <span style={{ color: 'var(--text-secondary)' }}>Distribution spread</span>
                  </div>
                  <span className="font-bold font-mono" style={{ color: 'var(--text-primary)' }}>
                    {spread !== null ? spread.toFixed(2) : '—'}
                  </span>
                </div>
                <div className="text-[9px] leading-relaxed" style={{ color: 'var(--text-muted)' }}>
                  (lower = more concentrated)
                </div>

                <div className="pt-1 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                  <div className="text-[10px] font-medium" style={{ color: 'var(--text-secondary)' }}>
                    {(top3Cov ?? top3Coverage(fallbackZones)) >= 70
                      ? 'Confidence concentrated in NCR corridor'
                      : (top3Cov ?? top3Coverage(fallbackZones)) >= 50
                      ? 'Moderate geographic concentration'
                      : 'Distribution spread across multiple regions'}
                  </div>
                  <div className="text-[9px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {displayZones.slice(0, 2).map(z => z.name.split(' ')[0]).join(', ')}{displayZones.length > 2 ? ` & ${displayZones[2]?.name.split(' ')[0]}` : ''} dominant
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
