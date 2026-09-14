import React, { useState, useEffect } from 'react';
import { Card, FeatureTag, StatusDot } from '../components/ui';
import { useCaseContext, getZoneLabel } from '../context/CaseContext';

const BACKEND_URL = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8001';

export default function PredictionEngine() {
  const [activeStage, setActiveStage] = useState<number>(2);
  const [sceneData, setSceneData] = useState<any>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const { activeCaseId, caseFixtures } = useCaseContext();
  const currentFixture = caseFixtures.find(c => c.case_id === activeCaseId) || caseFixtures[0];

  useEffect(() => {
    const fetchPrediction = async () => {
      setLoading(true);
      setError(null);

      const hopsPayload = currentFixture.hops.slice(0, activeStage);

      try {
        const res = await fetch(`${BACKEND_URL}/api/v1/predict`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            case_id: currentFixture.case_id,
            prediction_time: currentFixture.prediction_time,
            sla_minutes: currentFixture.sla_minutes,
            complaint: currentFixture.complaint,
            hops: hopsPayload
          })
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
  }, [activeStage, currentFixture]);

  const geo = sceneData?.geographic || {};
  const timing = sceneData?.timing || {};
  const dec = sceneData?.decision || {};
  const dist = timing?.intervention_distribution || {};

  const topZone = getZoneLabel(geo.predicted_destination_zone || 'Z001');
  const confidence = Math.round(geo.confidence_score || dec.decision_confidence || 85);
  const p25 = dist.p25_minutes ? Math.round(dist.p25_minutes) : 25;
  const p50 = dist.p50_minutes ? Math.round(dist.p50_minutes) : 48;
  const p75 = dist.p75_minutes ? Math.round(dist.p75_minutes) : 80;

  return (
    <div className="p-7 space-y-6 max-w-6xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-[26px] font-bold text-[#0F172A] leading-tight">Predictive Intelligence Engine</h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm text-[#64748B] max-w-3xl leading-relaxed">
            Combined Geographic (M8 Reliability-Aware) and Time-to-Event (Discrete Hazard + AFT + Direct Quantile) Intelligence Stack.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs font-mono text-[#94A3B8]">
          <StatusDot status={error ? 'limited' : 'connected'} />
          <span>{error ? 'API Degraded' : 'Live FastAPI Backend'}</span>
        </div>
      </div>

      {/* Architecture Parameters & Model Provenance */}
      <div className="grid grid-cols-2 gap-5">
        {/* Geographic M8 Engine */}
        <Card className="p-5 border-[#E2E8F0] shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#14B8A6]" />
              <span className="font-bold text-sm text-[#0F172A]">Geographic Engine (Frozen M8)</span>
            </div>
            <span className="text-[10px] font-mono font-bold bg-teal-50 text-teal-700 px-2 py-0.5 rounded border border-teal-200">
              {sceneData?.system?.model_versions?.geographic || 'M8_Reliability_Aware_Frozen'}
            </span>
          </div>
          <p className="text-xs text-[#64748B] mb-4">
            Sequential Bayesian inference narrowing spatial withdrawal zones as hop telemetry arrives.
          </p>

          <div className="grid grid-cols-4 gap-2 text-center bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
            <div>
              <div className="text-[9px] font-bold text-[#94A3B8] uppercase">Lambda (λ)</div>
              <div className="text-xs font-mono font-bold text-[#0F172A]">0.5</div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-[#94A3B8] uppercase">Top-K (k)</div>
              <div className="text-xs font-mono font-bold text-[#0F172A]">5.0</div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-[#94A3B8] uppercase">Weight Rel (w)</div>
              <div className="text-xs font-mono font-bold text-[#0F172A]">2.0</div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-[#94A3B8] uppercase">Temp (T)</div>
              <div className="text-xs font-mono font-bold text-[#0F172A]">5.17</div>
            </div>
          </div>
        </Card>

        {/* Time-to-Event Engine */}
        <Card className="p-5 border-[#E2E8F0] shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-2.5 h-2.5 rounded-full bg-[#7C5CFC]" />
              <span className="font-bold text-sm text-[#0F172A]">Time-to-Event Engine</span>
            </div>
            <span className="text-[10px] font-mono font-bold bg-purple-50 text-purple-700 px-2 py-0.5 rounded border border-purple-200">
              Time-to-Event v1.0
            </span>
          </div>
          <p className="text-xs text-[#64748B] mb-4">
            Schema-first discrete hazard rate, AFT model, and direct quantile regression for intervention window bounding.
          </p>

          <div className="grid grid-cols-3 gap-2 text-center bg-[#F8FAFC] p-3 rounded-xl border border-[#E2E8F0]">
            <div>
              <div className="text-[9px] font-bold text-[#94A3B8] uppercase">P25 Quantile</div>
              <div className="text-xs font-mono font-bold text-[#0F172A]">{p25} min</div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-purple-700 uppercase">P50 Median</div>
              <div className="text-xs font-mono font-bold text-purple-700">{p50} min</div>
            </div>
            <div>
              <div className="text-[9px] font-bold text-[#94A3B8] uppercase">P75 Quantile</div>
              <div className="text-xs font-mono font-bold text-[#0F172A]">{p75} min</div>
            </div>
          </div>
        </Card>
      </div>

      {/* Interactive Progression Stream */}
      <Card className="p-6 border-[#E2E8F0] shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-sm font-bold text-[#0F172A]">Live Telemetry Stage Evaluation</h2>
            <p className="text-xs text-[#64748B]">Case ID: <span className="font-mono font-bold">{currentFixture.case_id}</span> ({currentFixture.fraudType})</p>
          </div>
          <div className="flex gap-2">
            {[0, 1, 2].map(stg => (
              <button
                key={stg}
                onClick={() => setActiveStage(stg)}
                className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeStage === stg ? 'bg-[#0F172A] text-white shadow-sm' : 'bg-[#F1F5F9] text-[#64748B] hover:bg-[#E2E8F0]'
                }`}
              >
                {stg === 0 ? 'Prior (T0)' : `Stage Hop ${stg}`}
              </button>
            ))}
          </div>
        </div>

        {/* Prediction Output */}
        <div className="grid grid-cols-3 gap-5 bg-[#F8FAFC] p-5 rounded-xl border border-[#E2E8F0] mb-6">
          <div>
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wide mb-1">Top Predicted Zone</div>
            <div className="text-xl font-bold text-[#0F172A]">{topZone}</div>
            <div className="text-xs text-[#64748B] mt-1">Zone ID: {geo.predicted_destination_zone || 'Z001'}</div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wide mb-1">Confidence & Priority</div>
            <div className="text-xl font-bold font-mono text-[#14B8A6]">{confidence}%</div>
            <div className="text-xs font-semibold text-[#0F172A] mt-1">
              Priority: <span className="font-mono text-[#E5484D]">{dec.priority || 'HIGH'}</span>
            </div>
          </div>

          <div>
            <div className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wide mb-1">Intervention Opportunity</div>
            <div className="text-xl font-bold font-mono text-purple-700">~{p50} min window</div>
            <div className="text-xs text-[#64748B] mt-1">Quantiles: {p25}m (P25) – {p75}m (P75)</div>
          </div>
        </div>

        {/* Top-K Ranked Zones from Geographic M8 */}
        {geo.ranked_zones && (
          <div className="space-y-3">
            <div className="text-xs font-bold text-[#0F172A] uppercase tracking-wider">Top-K Geographic Probability Distribution</div>
            <div className="space-y-2">
              {geo.ranked_zones.map((rz: any, idx: number) => {
                const zLabel = getZoneLabel(rz.zone_id);
                const prob = Math.round(rz.probability);
                return (
                  <div key={rz.zone_id} className="flex items-center gap-3 p-2.5 rounded-xl bg-white border border-[#E2E8F0]">
                    <div className="w-6 h-6 rounded-lg bg-[#F1F5F9] font-mono text-xs font-bold flex items-center justify-center text-[#64748B]">
                      #{idx + 1}
                    </div>
                    <div className="w-36 text-xs font-semibold text-[#0F172A] truncate">{zLabel}</div>
                    <div className="text-[10px] font-mono text-[#94A3B8] w-14">{rz.zone_id}</div>
                    <div className="flex-1 h-2 bg-[#F1F5F9] rounded-full overflow-hidden">
                      <div className="h-full rounded-full bg-[#14B8A6]" style={{ width: `${prob}%` }} />
                    </div>
                    <div className="font-mono text-xs font-bold text-[#0F172A] w-12 text-right">{prob}%</div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}