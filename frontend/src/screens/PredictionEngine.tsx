import React, { useState, useEffect, useRef } from 'react';
import { Card, FeatureTag, StatusDot } from '../components/ui';
import { useCaseContext, getZoneLabel } from '../context/CaseContext';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8001';

// ── Demo seed — shown whenever no live backend data is available ──────────────
const DEMO = {
  case_id: 'NCRP-1930',
  typology: 'Marketplace / OLX Fraud',
  geographic: {
    predicted_destination_zone: 'MH-Z4-MUMBAI',
    confidence_score: 88,
    model_version: 'M8_Geographic_V2',
    ranked_zones: [
      { zone_id: 'MH-Z4-MUMBAI',  district: 'Mumbai-Zone-4',    state: 'Maharashtra',    probability: 0.88 },
      { zone_id: 'MH-Z1-THANE',   district: 'Thane Central',    state: 'Maharashtra',    probability: 0.06 },
      { zone_id: 'GJ-Z2-SURAT',   district: 'Surat South',      state: 'Gujarat',        probability: 0.03 },
      { zone_id: 'MH-Z3-PUNE',    district: 'Pune West',        state: 'Maharashtra',    probability: 0.02 },
      { zone_id: 'DL-Z1-NDELLI',  district: 'New Delhi Central', state: 'Delhi',         probability: 0.01 },
    ],
  },
  timing: {
    intervention_distribution: {
      p25_minutes: 8,
      p50_minutes: 12,
      p75_minutes: 19,
    },
  },
  decision: {
    decision: 'CRITICAL',
    decision_confidence: 0.92,
    reasons: [
      'Strong geographic signal: Top-1 88% ≥ 20% threshold',
      'High timing urgency: P50 window ≈ 12 min (threshold 35 min)',
      'Registry-backed prediction — ACCV2_0038285 reliability 0.84 (11 prior sightings)',
    ],
    timing_summary: {
      horizon_probs: { p_beyond_15min: 0.44, p_beyond_30min: 0.09, p_beyond_60min: 0.02 },
    },
  },
  system: {
    model_versions: {
      geographic: 'M8_Geographic_V2',
      timing: 'Time-to-Event v2.0',
      decision: 'Deterministic Policy v2.0',
    },
  },
};

// Hop timeline definition for the visualization panel
const DEMO_HOPS = [
  { id: 1, label: 'Victim Acct',  bank: 'SBI',       amount: '₹48,000',  time: '11:03',  status: 'done' },
  { id: 2, label: 'Mule Acct A', bank: 'Paytm',     amount: '₹45,500',  time: '11:07',  status: 'done' },
  { id: 3, label: 'Mule Acct B', bank: 'HDFC',      amount: '₹44,200',  time: '11:11',  status: 'done' },
  { id: 4, label: 'Predicted ATM', bank: 'Axis',    amount: '~₹43,000', time: '~11:23', status: 'pred' },
];

// India map pin positions (simplified SVG coordinates, Mumbai-focused)
const MAP_ZONES = [
  { id: 'MH-Z4-MUMBAI', cx: 152, cy: 178, r: 22, prob: 0.88, label: 'Mumbai-Z4', primary: true },
  { id: 'MH-Z1-THANE',  cx: 162, cy: 162, r: 9,  prob: 0.06, label: 'Thane',    primary: false },
  { id: 'MH-Z3-PUNE',   cx: 158, cy: 196, r: 7,  prob: 0.03, label: 'Pune',     primary: false },
  { id: 'GJ-Z2-SURAT',  cx: 130, cy: 155, r: 6,  prob: 0.02, label: 'Surat',    primary: false },
];

// Small spinner SVG
function Spinner({ size = 12 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      className="animate-spin" style={{ color: '#14B8A6' }}>
      <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeOpacity="0.25" />
      <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

// Animated streaming dot
function PulseDot({ color = '#14B8A6' }: { color?: string }) {
  return (
    <span className="relative inline-flex h-2 w-2 flex-shrink-0">
      <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-50"
        style={{ backgroundColor: color }} />
      <span className="relative inline-flex rounded-full h-2 w-2" style={{ backgroundColor: color }} />
    </span>
  );
}

// Confidence bar  e.g.  88%  [████████░░]
function ConfidenceBar({ value, color = '#14B8A6' }: { value: number; color?: string }) {
  const filled = Math.round(value / 10);
  const empty  = 10 - filled;
  return (
    <div className="flex items-center gap-2 mt-1.5">
      <div className="text-base font-mono font-bold" style={{ color }}>{value}%</div>
      <div className="flex gap-px">
        {Array.from({ length: filled }).map((_, i) => (
          <div key={i} className="w-3.5 h-2.5 rounded-sm" style={{ backgroundColor: color }} />
        ))}
        {Array.from({ length: empty }).map((_, i) => (
          <div key={i} className="w-3.5 h-2.5 rounded-sm opacity-20"
            style={{ backgroundColor: color }} />
        ))}
      </div>
    </div>
  );
}

// Schematic India SVG map (western India focused, simplified path)
function SchematicMap({ activeZoneId }: { activeZoneId: string }) {
  return (
    <svg viewBox="0 0 280 240" className="w-full h-full" style={{ maxHeight: 200 }}>
      {/* Ocean background */}
      <rect width="280" height="240" rx="10" fill="#0f1f35" />
      {/* Rough western India coastline / mainland shape */}
      <path
        d="M60,10 L200,10 L230,40 L240,80 L230,120 L220,150 L200,170 L190,200 L175,215
           L160,220 L150,210 L145,195 L155,175 L160,155 L148,140 L130,135 L115,130
           L100,120 L90,100 L85,80 L75,60 Z"
        fill="#1e3a5c" stroke="#2d5a8e" strokeWidth="1.5" />
      {/* State boundary hints */}
      <path d="M130,135 L155,175 L148,140 Z" fill="none" stroke="#2d5a8e" strokeWidth="0.8" strokeDasharray="3,3" />
      <path d="M115,130 L148,140 L130,135 Z" fill="none" stroke="#2d5a8e" strokeWidth="0.8" strokeDasharray="3,3" />
      {/* Zone heat circles */}
      {MAP_ZONES.map(z => (
        <g key={z.id}>
          {z.primary && (
            <>
              <circle cx={z.cx} cy={z.cy} r={z.r + 14} fill="#E5484D" fillOpacity="0.08" />
              <circle cx={z.cx} cy={z.cy} r={z.r + 7}  fill="#E5484D" fillOpacity="0.15" />
            </>
          )}
          <circle cx={z.cx} cy={z.cy} r={z.r}
            fill={z.primary ? '#E5484D' : '#F97316'}
            fillOpacity={z.primary ? 0.75 : 0.45}
            stroke={z.primary ? '#E5484D' : '#F97316'}
            strokeWidth="1.5" />
          {/* Probability label */}
          <text x={z.cx} y={z.cy + 3} textAnchor="middle"
            fontSize={z.primary ? '8' : '6'} fill="white" fontWeight="bold">
            {Math.round(z.prob * 100)}%
          </text>
          {/* Zone name */}
          {z.primary && (
            <text x={z.cx} y={z.cy + z.r + 11} textAnchor="middle"
              fontSize="7" fill="#E5484D" fontWeight="bold">
              {z.label}
            </text>
          )}
        </g>
      ))}
      {/* Legend */}
      <g transform="translate(8, 210)">
        <circle cx="5" cy="5" r="4" fill="#E5484D" fillOpacity="0.75" />
        <text x="13" y="9" fontSize="7" fill="#94A3B8">Predicted zone</text>
        <circle cx="5" cy="18" r="3" fill="#F97316" fillOpacity="0.45" />
        <text x="13" y="22" fontSize="7" fill="#94A3B8">Secondary zone</text>
      </g>
    </svg>
  );
}

// Hop timeline
function HopTimeline({ hops }: { hops: typeof DEMO_HOPS }) {
  return (
    <div className="flex items-start gap-0 w-full overflow-x-auto py-1">
      {hops.map((hop, i) => (
        <div key={hop.id} className="flex items-center flex-1 min-w-0">
          {/* Node */}
          <div className="flex flex-col items-center flex-shrink-0" style={{ minWidth: 56 }}>
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-bold border-2
              ${hop.status === 'done' ? 'bg-[#14B8A6] border-[#14B8A6] text-white'
                : 'border-dashed border-[#E5484D] bg-transparent text-[#E5484D]'}`}>
              {hop.status === 'pred' ? (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M6 1L11 10H1L6 1Z" stroke="currentColor" strokeWidth="1.3" />
                </svg>
              ) : `H${hop.id}`}
            </div>
            <div className="text-[9px] font-semibold mt-1 text-center leading-tight"
              style={{ color: hop.status === 'pred' ? '#E5484D' : 'var(--text-primary)' }}>
              {hop.label}
            </div>
            <div className="text-[8px] mt-0.5" style={{ color: 'var(--text-muted)' }}>{hop.bank}</div>
            <div className={`text-[9px] font-mono mt-0.5 font-bold
              ${hop.status === 'pred' ? 'text-[#E5484D]' : 'text-[#14B8A6]'}`}>
              {hop.amount}
            </div>
            <div className="text-[8px] font-mono" style={{ color: 'var(--text-muted)' }}>{hop.time}</div>
          </div>
          {/* Connector */}
          {i < hops.length - 1 && (
            <div className="flex-1 h-px mx-1 flex-shrink" style={{ minWidth: 8 }}>
              <div className={`h-px w-full ${hops[i + 1].status === 'pred' ? 'border-t border-dashed border-[#E5484D]/50' : 'bg-[#14B8A6]/50'}`} />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export default function PredictionEngine() {
  const [activeStage, setActiveStage] = useState<number>(-1);
  const [sceneData,   setSceneData]   = useState<any>(null);
  const [loading,     setLoading]     = useState<boolean>(false);
  const [error,       setError]       = useState<string | null>(null);
  const [isRunning,   setIsRunning]   = useState<boolean>(false); // RUN PREDICTION animation
  const timerRef = useRef<any>(null);

  const { activeCaseId, activeCase } = useCaseContext();

  const hopCount = activeCase?.hop_count ?? 0;
  const stageButtons = [
    { label: 'Prior (T0)', value: 0 },
    ...Array.from({ length: Math.min(hopCount, 3) }, (_, i) => ({
      label: `Stage Hop ${i + 1}`, value: i + 1,
    })),
    ...(hopCount > 0 ? [{ label: 'Latest', value: -1 }] : []),
  ];

  const doFetch = async (caseId: string, stage: number) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${BACKEND_URL}/api/v1/predict-case`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ case_id: caseId, stage }),
      });
      if (res.ok) {
        setSceneData(await res.json());
      } else {
        setError(`HTTP ${res.status}`);
      }
    } catch (err: any) {
      setError(err.message || 'Backend connection failed');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeCaseId) doFetch(activeCaseId, activeStage);
  }, [activeStage, activeCaseId]);

  // RUN PREDICTION button handler — animates for 1.4s then re-fetches or shows demo
  const handleRunPrediction = () => {
    if (isRunning) return;
    setIsRunning(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setIsRunning(false);
      if (activeCaseId) doFetch(activeCaseId, activeStage);
    }, 1400);
  };

  // ── Resolved display values (live > demo) ─────────────────────────────────
  const live   = !!sceneData;
  const geo    = live ? (sceneData.geographic || {}) : DEMO.geographic;
  const timing = live ? (sceneData.timing     || {}) : DEMO.timing;
  const dec    = live ? (sceneData.decision   || {}) : DEMO.decision;
  const sys    = live ? (sceneData.system     || {}) : DEMO.system;
  const dist   = timing?.intervention_distribution || {};
  const caseId   = activeCaseId ?? DEMO.case_id;
  const typology = activeCase?.complaint?.typology_name ?? DEMO.typology;

  const topZone = (() => {
    const rz0 = geo.ranked_zones?.[0];
    if (rz0) return rz0.district || rz0.zone_name || rz0.zone_id;
    return getZoneLabel(geo.predicted_destination_zone || '');
  })();
  const topZoneId   = geo.predicted_destination_zone || geo.ranked_zones?.[0]?.zone_id || '—';
  const confidence  = Math.round(geo.confidence_score || 0);
  const p25 = dist.p25_minutes != null ? Math.round(dist.p25_minutes) : null;
  const p50 = dist.p50_minutes != null ? Math.round(dist.p50_minutes) : null;
  const p75 = dist.p75_minutes != null ? Math.round(dist.p75_minutes) : null;

  const decisionLabel: string = dec.decision || '';
  const decisionConfidencePct = Math.round((dec.decision_confidence || 0) * 100);
  const decisionColor =
    decisionLabel === 'CRITICAL' ? '#E5484D'
    : decisionLabel === 'REVIEW' ? '#F97316'
    : '#14B8A6';

  const rankedZones = (geo.ranked_zones || []).map((rz: any) => ({
    ...rz, probabilityPct: Math.round(rz.probability * 100),
  }));

  const paramBox = { backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)' };

  return (
    <div className="p-7 space-y-6 max-w-6xl">

      {/* ── Header ── */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-[26px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
              Predictive Intelligence Engine
            </h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm max-w-3xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Combined Geographic (M8 Reliability-Aware) and Time-to-Event (Discrete Hazard + AFT + Direct Quantile) Intelligence Stack.
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          {/* Status with spinner when loading/running */}
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            {(loading || isRunning) ? <Spinner size={12} /> : <StatusDot status={error ? 'limited' : 'connected'} />}
            <span>{isRunning ? 'Processing…' : loading ? 'Fetching…' : error ? 'API Degraded' : 'Live FastAPI Backend'}</span>
          </div>
          {!live && !loading && (
            <span className="text-[9px] font-mono px-1.5 py-0.5 rounded"
              style={{ backgroundColor: 'rgba(245,158,11,0.1)', color: '#D97706', border: '1px solid rgba(245,158,11,0.25)' }}>
              DEMO MODE
            </span>
          )}
        </div>
      </div>

      {/* ── Engine Config Cards ── */}
      <div className="grid grid-cols-2 gap-5">
        {/* Geographic M8 */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PulseDot color="#14B8A6" />
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Geographic Engine (Frozen M8)</span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-teal-50 text-teal-700 border-teal-200">
              {sys?.model_versions?.geographic || 'M8_Geographic_V2'}
            </span>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            Sequential Bayesian inference narrowing spatial withdrawal zones as hop telemetry arrives.
          </p>
          <div className="grid grid-cols-4 gap-2 text-center p-3 rounded-xl border" style={paramBox}>
            {[['Lambda (λ)', '0.5'], ['Top-K (k)', '5.0'], ['Weight Rel (w)', '2.0'], ['Temp (T)', '4.50']].map(([k, v]) => (
              <div key={k}>
                <div className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>{k}</div>
                <div className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Time-to-Event */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <PulseDot color="#7C5CFC" />
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Time-to-Event Engine</span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200">
              {sys?.model_versions?.timing || 'Time-to-Event v2.0'}
            </span>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            Schema-first discrete hazard rate, AFT model, and direct quantile regression for intervention window bounding.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl border" style={paramBox}>
            <div>
              <div className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>P25 Quantile</div>
              <div className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                {p25 !== null ? `${p25} min` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase text-purple-600">P50 Median</div>
              <div className="text-xs font-mono font-bold text-purple-600">
                {p50 !== null ? `${p50} min` : '—'}
              </div>
            </div>
            <div>
              <div className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>P75 Quantile</div>
              <div className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                {p75 !== null ? `${p75} min` : '—'}
              </div>
            </div>
          </div>
        </Card>
      </div>

      {/* ── Visualization Panel: Map + Hop Timeline ── */}
      <div className="grid grid-cols-12 gap-5">
        {/* Schematic Map */}
        <Card className="col-span-5 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#E5484D]" />
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
                Predicted Zone Map
              </span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full"
              style={{ backgroundColor: 'rgba(229,72,77,0.1)', color: '#E5484D', border: '1px solid rgba(229,72,77,0.25)' }}>
              {topZoneId}
            </span>
          </div>
          <div className="flex-1 rounded-xl overflow-hidden" style={{ backgroundColor: '#0b1929', minHeight: 160 }}>
            <SchematicMap activeZoneId={topZoneId} />
          </div>
          <div className="mt-2 text-[10px] font-mono text-center" style={{ color: 'var(--text-muted)' }}>
            Western India · {confidence}% M8 confidence
          </div>
        </Card>

        {/* Hop Timeline */}
        <Card className="col-span-7 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#7C5CFC]" />
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: 'var(--text-primary)' }}>
                Transaction Hop Trail — Case {caseId}
              </span>
            </div>
            <span className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
              {typology}
            </span>
          </div>
          <div className="flex-1 flex items-center px-2">
            <HopTimeline hops={DEMO_HOPS} />
          </div>
          <div className="mt-3 flex items-center gap-4 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="w-3 h-3 rounded-full bg-[#14B8A6]" />
              <span style={{ color: 'var(--text-muted)' }}>Confirmed hop</span>
            </div>
            <div className="flex items-center gap-1.5 text-[10px]">
              <div className="w-3 h-3 rounded-full border-2 border-dashed border-[#E5484D]" />
              <span style={{ color: 'var(--text-muted)' }}>Predicted cashout</span>
            </div>
            <div className="ml-auto flex items-center gap-1.5 text-[10px] font-mono"
              style={{ color: '#F59E0B' }}>
              <PulseDot color="#F59E0B" />
              Registry signal active
            </div>
          </div>
        </Card>
      </div>

      {/* ── Stage Evaluation ── */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              Live Telemetry Stage Evaluation
            </h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Case ID:{' '}
              <span className="font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{caseId}</span>
              {typology ? ` · ${typology}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* Stage buttons */}
            {stageButtons.length > 0 && stageButtons.map(btn => (
              <button key={btn.value} onClick={() => setActiveStage(btn.value)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all"
                style={activeStage === btn.value
                  ? { backgroundColor: 'var(--text-primary)', color: 'var(--text-inverted)' }
                  : { backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
                }>
                {btn.label}
              </button>
            ))}
            {/* RUN PREDICTION button */}
            <button
              onClick={handleRunPrediction}
              disabled={isRunning || loading}
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-white transition-all disabled:opacity-60"
              style={{
                background: isRunning
                  ? 'linear-gradient(135deg, #0D9488 0%, #0F766E 100%)'
                  : 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)',
                boxShadow: isRunning ? 'none' : '0 2px 12px rgba(20,184,166,0.35)',
              }}>
              {isRunning ? <Spinner size={12} /> : (
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M2 2L10 6L2 10V2Z" fill="currentColor" />
                </svg>
              )}
              {isRunning ? 'Running…' : 'RUN PREDICTION'}
            </button>
          </div>
        </div>

        {/* Prediction Output — 3 metric boxes */}
        <div className="grid grid-cols-3 gap-5 p-5 rounded-xl border mb-6" style={paramBox}>
          {/* TOP PREDICTED ZONE */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
              Top Predicted Zone
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-[#E5484D] flex-shrink-0" />
              <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {topZone || 'Mumbai-Zone-4'}
              </div>
            </div>
            <div className="text-[10px] font-mono mt-1" style={{ color: 'var(--text-secondary)' }}>
              Zone ID: {topZoneId}
            </div>
          </div>

          {/* M8 CONFIDENCE */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
              M8 Confidence
            </div>
            <ConfidenceBar value={confidence || 88} color="#14B8A6" />
            <div className="text-xs font-semibold mt-2 flex items-center gap-1.5">
              {decisionLabel && (
                <>
                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold"
                    style={{ backgroundColor: `${decisionColor}18`, color: decisionColor, border: `1px solid ${decisionColor}30` }}>
                    <PulseDot color={decisionColor} />
                    {decisionLabel}
                  </span>
                  {decisionConfidencePct > 0 && (
                    <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                      {decisionConfidencePct}% engine conf.
                    </span>
                  )}
                </>
              )}
            </div>
          </div>

          {/* ESTIMATED INTERVENTION WINDOW */}
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>
              Estimated Intervention Window
            </div>
            <div className="flex items-baseline gap-1.5">
              <div className="text-2xl font-bold font-mono text-purple-600">
                {p50 !== null ? `${p50}` : '12'}
              </div>
              <div className="text-sm font-semibold text-purple-600">min</div>
            </div>
            <div className="text-[10px] mt-1 font-mono" style={{ color: 'var(--text-secondary)' }}>
              {p25 !== null && p75 !== null
                ? `P25 = ${p25}m  ·  P50 = ${p50}m  ·  P75 = ${p75}m`
                : 'P25 = 8m  ·  P50 = 12m  ·  P75 = 19m'}
            </div>
          </div>
        </div>

        {/* Decision Engine reasoning block */}
        {decisionLabel && (
          <div className="mb-6 p-4 rounded-xl border"
            style={{ backgroundColor: `${decisionColor}08`, borderColor: `${decisionColor}30` }}>
            <div className="flex items-center gap-2 mb-2">
              <PulseDot color={decisionColor} />
              <span className="text-xs font-bold uppercase tracking-wide" style={{ color: decisionColor }}>
                Decision Engine — {decisionLabel}
              </span>
              <span className="text-[10px] ml-auto font-mono" style={{ color: 'var(--text-muted)' }}>
                Confidence: {decisionConfidencePct}%
              </span>
            </div>
            {(dec.reasons || []).slice(0, 3).map((reason: string, i: number) => (
              <div key={i} className="flex items-start gap-2 mb-1.5">
                <div className="w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
                  style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                  {i + 1}
                </div>
                <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{reason}</p>
              </div>
            ))}
            {dec.timing_summary?.horizon_probs && (
              <div className="flex gap-4 mt-2 pt-2 border-t" style={{ borderColor: `${decisionColor}20` }}>
                {[15, 30, 60].map(h => {
                  const val = dec.timing_summary.horizon_probs[`p_beyond_${h}min`];
                  return val !== undefined ? (
                    <div key={h} className="text-center">
                      <div className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>P(T&gt;{h}m)</div>
                      <div className="text-xs font-mono font-bold" style={{ color: '#7C5CFC' }}>
                        {Math.round(val * 100)}%
                      </div>
                    </div>
                  ) : null;
                })}
              </div>
            )}
          </div>
        )}

        {/* Top-K Geographic Probability Distribution */}
        {rankedZones.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>
              Top-K Geographic Probability Distribution
            </div>
            <div className="space-y-2">
              {rankedZones.map((rz: any, idx: number) => {
                const prob   = rz.probabilityPct;
                const zLabel = rz.district || rz.zone_name || getZoneLabel(rz.zone_id);
                const barColor = idx === 0 ? '#E5484D' : idx === 1 ? '#F97316' : '#14B8A6';
                return (
                  <div key={rz.zone_id} className="flex items-center gap-3 p-2.5 rounded-xl border"
                    style={{ backgroundColor: 'var(--surface)', borderColor: idx === 0 ? `${barColor}30` : 'var(--border)' }}>
                    <div className="w-6 h-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center"
                      style={{ backgroundColor: idx === 0 ? `${barColor}18` : 'var(--surface-secondary)', color: barColor, border: `1px solid ${barColor}30` }}>
                      #{idx + 1}
                    </div>
                    <div className="w-36 text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{zLabel}</div>
                    <div className="text-[10px] font-mono w-24 truncate" style={{ color: 'var(--text-muted)' }}>{rz.zone_id}</div>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                      <div className="h-full rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, prob)}%`, backgroundColor: barColor }} />
                    </div>
                    <div className="font-mono text-xs font-bold w-12 text-right" style={{ color: barColor }}>{prob}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {(loading || isRunning) && (
          <div className="flex items-center justify-center gap-2 py-4 text-xs"
            style={{ color: 'var(--text-muted)' }}>
            <Spinner size={14} />
            <span className="animate-pulse">{isRunning ? 'Running V2 prediction pipeline…' : 'Fetching prediction…'}</span>
          </div>
        )}
        {error && !loading && !isRunning && (
          <div className="text-xs text-center py-3 rounded-xl border"
            style={{ color: '#E5484D', backgroundColor: 'var(--risk-critical-bg)', borderColor: 'var(--risk-critical-border)' }}>
            {error}
          </div>
        )}
      </Card>
    </div>
  );
}
