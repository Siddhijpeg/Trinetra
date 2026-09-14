import React, { useState, useEffect } from 'react';
import { Card, FeatureTag, StatusDot } from '../components/ui';
import { useCaseContext, getZoneLabel } from '../context/CaseContext';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8001';

export default function PredictionEngine() {
  const [activeStage, setActiveStage]   = useState<number>(-1);  // -1 = latest
  const [sceneData,   setSceneData]     = useState<any>(null);
  const [loading,     setLoading]       = useState<boolean>(false);
  const [error,       setError]         = useState<string | null>(null);

  const { activeCaseId, activeCase } = useCaseContext();

  // Hop count from active V2 case detail
  const hopCount    = activeCase?.hop_count ?? 0;
  // Build stage buttons: -1=Latest, 0=T0, 1..N=Hop stages
  const stageButtons = [
    { label: 'Prior (T0)', value: 0 },
    ...Array.from({ length: Math.min(hopCount, 3) }, (_, i) => ({
      label: `Stage Hop ${i + 1}`, value: i + 1,
    })),
    ...(hopCount > 0 ? [{ label: 'Latest', value: -1 }] : []),
  ];

  useEffect(() => {
    if (!activeCaseId) return;
    const fetchPrediction = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/predict-case`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case_id: activeCaseId,
            stage:   activeStage,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setSceneData(data);
        } else {
          setError(`HTTP ${res.status} from backend`);
        }
      } catch (err: any) {
        setError(err.message || 'Backend connection failed');
      } finally {
        setLoading(false);
      }
    };
    fetchPrediction();
  }, [activeStage, activeCaseId]);

  const geo = sceneData?.geographic || {};
  const timing = sceneData?.timing || {};
  const dec = sceneData?.decision || {};
  const dist = timing?.intervention_distribution || {};

  // confidence_score is returned as percent (0–100) by V2 geographic engine
  const topZone = (() => {
    const rz0 = geo.ranked_zones?.[0];
    if (rz0) return rz0.district || rz0.zone_name || rz0.zone_id;
    return getZoneLabel(geo.predicted_destination_zone || '');
  })();
  const confidence = Math.round(geo.confidence_score || 0);
  const p25 = dist.p25_minutes ? Math.round(dist.p25_minutes) : null;
  const p50 = dist.p50_minutes ? Math.round(dist.p50_minutes) : null;
  const p75 = dist.p75_minutes ? Math.round(dist.p75_minutes) : null;

  // V2 decision fields: dec.decision ("CRITICAL"|"REVIEW"|"MONITOR"), dec.decision_confidence (0–1)
  const decisionLabel: string = dec.decision || '';
  const decisionConfidencePct = Math.round((dec.decision_confidence || 0) * 100);
  const decisionColor =
    decisionLabel === 'CRITICAL' ? '#E5484D'
    : decisionLabel === 'REVIEW' ? '#F97316'
    : '#14B8A6';

  // V2: ranked_zones[].probability is 0–1 float — display as percentage
  const rankedZones: Array<{ zone_id: string; zone_name?: string; district?: string; probability: number }> =
    (geo.ranked_zones || []).map((rz: any) => ({
      ...rz,
      probabilityPct: Math.round(rz.probability * 100),
    }));

  const paramBoxStyle = {
    backgroundColor: 'var(--surface-secondary)',
    borderColor: 'var(--border)',
  };

  return (
    <div className="p-7 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-[26px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Predictive Intelligence Engine</h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm max-w-3xl leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Combined Geographic (M8 Reliability-Aware) and Time-to-Event (Discrete Hazard + AFT + Direct Quantile) Intelligence Stack.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          <StatusDot status={error ? 'limited' : 'connected'} />
          <span>{error ? 'API Degraded' : 'Live FastAPI Backend'}</span>
        </div>
      </div>

      {/* Architecture Parameters */}
      <div className="grid grid-cols-2 gap-5">
        {/* Geographic M8 Engine */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#14B8A6]" />
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Geographic Engine (Frozen M8)</span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-teal-50 text-teal-700 border-teal-200">
              {sceneData?.system?.model_versions?.geographic || 'M8_Reliability_Aware_Frozen'}
            </span>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            Sequential Bayesian inference narrowing spatial withdrawal zones as hop telemetry arrives.
          </p>
          <div className="grid grid-cols-4 gap-2 text-center p-3 rounded-xl border" style={paramBoxStyle}>
            {[['Lambda (λ)','0.5'],['Top-K (k)','5.0'],['Weight Rel (w)','2.0'],['Temp (T)','5.17']].map(([k,v]) => (
              <div key={k}>
                <div className="text-[9px] font-bold uppercase" style={{ color: 'var(--text-muted)' }}>{k}</div>
                <div className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>{v}</div>
              </div>
            ))}
          </div>
        </Card>

        {/* Time-to-Event Engine */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#7C5CFC]" />
              <span className="font-bold text-sm" style={{ color: 'var(--text-primary)' }}>Time-to-Event Engine</span>
            </div>
            <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded border bg-purple-50 text-purple-700 border-purple-200">
              {sceneData?.system?.model_versions?.timing || 'Time-to-Event v2.0'}
            </span>
          </div>
          <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>
            Schema-first discrete hazard rate, AFT model, and direct quantile regression for intervention window bounding.
          </p>
          <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl border" style={paramBoxStyle}>
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

      {/* Stage Evaluation */}
      <Card className="p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>Live Telemetry Stage Evaluation</h2>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              Case ID: <span className="font-mono font-bold">{activeCaseId ?? '—'}</span>
              {activeCase?.complaint?.typology_name ? ` (${activeCase.complaint.typology_name})` : ''}
            </p>
          </div>
          <div className="flex gap-2">
            {stageButtons.map(btn => (
              <button key={btn.value} onClick={() => setActiveStage(btn.value)}
                className="px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all"
                style={activeStage === btn.value
                  ? { backgroundColor: 'var(--text-primary)', color: 'var(--text-inverted)' }
                  : { backgroundColor: 'var(--surface-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
                }>
                {btn.label}
              </button>
            ))}
          </div>
        </div>

        {/* Prediction Output */}
        <div className="grid grid-cols-3 gap-5 p-5 rounded-xl border mb-6" style={paramBoxStyle}>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Top Predicted Zone</div>
            <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>{sceneData ? topZone : '—'}</div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>Zone ID: {geo.predicted_destination_zone || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>M8 Confidence</div>
            <div className="text-xl font-bold font-mono text-[#14B8A6]">{sceneData ? `${confidence}%` : '—'}</div>
            <div className="text-xs font-semibold mt-1" style={{ color: 'var(--text-primary)' }}>
              {decisionLabel && (
                <span className="font-mono" style={{ color: decisionColor }}>
                  {decisionLabel}
                </span>
              )}
              {decisionLabel && decisionConfidencePct > 0 && (
                <span className="ml-1 font-normal" style={{ color: 'var(--text-muted)' }}>
                  ({decisionConfidencePct}% engine confidence)
                </span>
              )}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wide mb-1" style={{ color: 'var(--text-muted)' }}>Estimated Intervention Window</div>
            <div className="text-xl font-bold font-mono text-purple-600">
              {p50 !== null ? `~${p50} min` : sceneData ? 'Unavailable' : '—'}
            </div>
            <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {p25 !== null && p75 !== null ? `Quantiles: ${p25}m (P25) – ${p75}m (P75)` : 'Awaiting backend'}
            </div>
          </div>
        </div>

        {/* V2 Decision Engine output */}
        {sceneData && decisionLabel && (
          <div className="mb-6 p-4 rounded-xl border"
            style={{ backgroundColor: `${decisionColor}08`, borderColor: `${decisionColor}30` }}>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: decisionColor }} />
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
            {/* Horizon probabilities from timing_summary */}
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

        {/* Top-K Zones */}
        {rankedZones.length > 0 && (
          <div className="space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider" style={{ color: 'var(--text-primary)' }}>Top-K Geographic Probability Distribution</div>
            <div className="space-y-2">
              {rankedZones.map((rz: any, idx: number) => {
                // Use pre-computed percentagePct (V2: probability × 100)
                const prob = rz.probabilityPct;
                // Display name: prefer zone_name/district from V2 response, fall back to zone_id
                const zLabel = rz.district || rz.zone_name || getZoneLabel(rz.zone_id);
                return (
                  <div key={rz.zone_id} className="flex items-center gap-3 p-2.5 rounded-xl border"
                    style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)' }}>
                    <div className="w-6 h-6 rounded-lg font-mono text-xs font-bold flex items-center justify-center"
                      style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                      #{idx + 1}
                    </div>
                    <div className="w-36 text-xs font-semibold truncate" style={{ color: 'var(--text-primary)' }}>{zLabel}</div>
                    <div className="text-[10px] font-mono w-24 truncate" style={{ color: 'var(--text-muted)' }}>{rz.zone_id}</div>
                    <div className="flex-1 h-2 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
                      <div className="h-full rounded-full bg-[#14B8A6]" style={{ width: `${Math.min(100, prob)}%` }} />
                    </div>
                    <div className="font-mono text-xs font-bold w-12 text-right" style={{ color: 'var(--text-primary)' }}>{prob}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {loading && (
          <div className="text-xs text-center py-4 animate-pulse" style={{ color: 'var(--text-muted)' }}>Fetching prediction…</div>
        )}
        {error && !loading && (
          <div className="text-xs text-center py-3 rounded-xl border"
            style={{ color: '#E5484D', backgroundColor: 'var(--risk-critical-bg)', borderColor: 'var(--risk-critical-border)' }}>
            {error}
          </div>
        )}
      </Card>
    </div>
  );
}
