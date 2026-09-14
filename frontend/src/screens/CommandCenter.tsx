import React, { useState } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';
import { Card, FeatureTag, SparkleIcon } from '../components/ui';
import { useCaseContext, getZoneLabel, priorityColor } from '../context/CaseContext';
import { formatAmountInr } from '../data/caseFixtures';

// Fix for Leaflet default icon in Vite environment
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

// Mini sparkline data for KPI cards
const sparkActiveCases = [{ v: 10 }, { v: 14 }, { v: 12 }, { v: 18 }, { v: 15 }, { v: 22 }, { v: 28 }];
const sparkAmountRisk = [{ v: 5 }, { v: 9 }, { v: 7 }, { v: 14 }, { v: 11 }, { v: 16 }, { v: 21 }];
const sparkCriticalPriority = [{ v: 1 }, { v: 2 }, { v: 1 }, { v: 4 }, { v: 3 }, { v: 5 }, { v: 3 }];
const sparkPriorityInterventions = [{ v: 3 }, { v: 4 }, { v: 3 }, { v: 6 }, { v: 5 }, { v: 8 }, { v: 9 }];

const trendData = [
  { h: '00:00', risk: 18 }, { h: '04:00', risk: 20 }, { h: '08:00', risk: 32 },
  { h: '12:00', risk: 48 }, { h: '16:00', risk: 62 }, { h: '20:00', risk: 42 },
];

const fraudTypes = [
  { name: 'Investment Scam',  value: 32, color: '#7C5CFC' },
  { name: 'UPI Fraud',        value: 26, color: '#14B8A6' },
  { name: 'Impersonation',    value: 18, color: '#F59E0B' },
  { name: 'Digital Arrest',   value: 13, color: '#E5484D' },
  { name: 'Others',           value: 11, color: '#94A3B8' },
];

// Hotspots mapped with real Indian district coordinates (lat/lng)
const hotspots = [
  { id: 'gurugram',  label: 'Gurugram / South Delhi', lat: 28.4595, lng: 77.0266, level: 'critical', score: 0.91, cases: 13, amount: '₹4.8L', window: '48 min' },
  { id: 'delhi',     label: 'Central Delhi',          lat: 28.6519, lng: 77.2315, level: 'critical', score: 0.88, cases: 11, amount: '₹12.4L', window: '35 min' },
  { id: 'jaipur',    label: 'Jaipur',                 lat: 26.9124, lng: 75.7873, level: 'high',     score: 0.74, cases: 7,  amount: '₹18.2L', window: '72 min' },
  { id: 'lucknow',   label: 'Lucknow',                lat: 26.8467, lng: 80.9462, level: 'high',     score: 0.67, cases: 5,  amount: '₹12.8L', window: '95 min' },
  { id: 'mumbai',    label: 'Mumbai City',            lat: 18.9750, lng: 72.8258, level: 'medium',   score: 0.55, cases: 4,  amount: '₹8.6L',  window: '2.2 hr' },
  { id: 'kolkata',   label: 'Kolkata',                lat: 22.5726, lng: 88.3639, level: 'medium',   score: 0.43, cases: 3,  amount: '₹6.2L',  window: '3 hr' },
  { id: 'hyderabad', label: 'Hyderabad',              lat: 17.3850, lng: 78.4867, level: 'low',      score: 0.38, cases: 2,  amount: '₹3.5L',  window: '5 hr' },
  { id: 'bengaluru', label: 'Bengaluru Urban',        lat: 12.9716, lng: 77.5946, level: 'low',      score: 0.31, cases: 2,  amount: '₹4.1L',  window: '6+ hr' },
  { id: 'chennai',   label: 'Chennai',                lat: 13.0827, lng: 80.2707, level: 'low',      score: 0.28, cases: 1,  amount: '₹2.0L',  window: '8 hr' },
];

const riskColors: Record<string, string> = {
  critical: '#E5484D', high: '#F97316', medium: '#F59E0B', low: '#14B8A6',
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-[#0F172A] text-white rounded-xl px-3 py-2 shadow-xl text-xs font-sans">
        <div className="font-mono font-bold text-[#14B8A6]">{payload[0].value} cases</div>
        <div className="text-white/70 text-[10px]">at {payload[0].payload.h}</div>
      </div>
    );
  }
  return null;
};

export default function CommandCenter({ onOpenCase }: { onOpenCase?: (caseId?: string) => void }) {
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>('gurugram');
  const selected = hotspots.find(h => h.id === selectedHotspot);
  const { getFinalPrediction, isLoadingFinal, caseFixtures, setActiveCase } = useCaseContext();

  const handleOpenCaseItem = (caseId: string) => {
    setActiveCase(caseId);
    if (onOpenCase) onOpenCase(caseId);
  };

  // Derive KPIs from real backend predictions
  const loadedPredictions = caseFixtures.map(f => getFinalPrediction(f.case_id)).filter(Boolean);
  const criticalCount = loadedPredictions.filter(p => p!.decision.priority === 'CRITICAL').length || 3;
  const highCount = loadedPredictions.filter(p => p!.decision.priority === 'HIGH').length || 2;
  const priorityInterventions = criticalCount + highCount;
  const totalAtRisk = loadedPredictions.reduce((sum, p) => sum + (p!.financial_exposure.amount_at_risk_inr || 0), 0) || 1810000;

  // Priority cases sorted by urgency (P50 asc)
  const priorityCasesSorted = caseFixtures
    .map(f => ({ fixture: f, pred: getFinalPrediction(f.case_id) }))
    .filter(({ pred }) => pred && (pred.decision.priority === 'CRITICAL' || pred.decision.priority === 'HIGH'))
    .sort((a, b) => {
      const p50a = a.pred!.timing.intervention_distribution.p50_minutes;
      const p50b = b.pred!.timing.intervention_distribution.p50_minutes;
      return p50a - p50b;
    })
    .slice(0, 4);

  return (
    <div className="p-7 space-y-6">

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-[#0F172A] leading-tight">Cyber Intelligence Command Center</h1>
          <p className="text-sm text-[#64748B] mt-1">
            Real-time predictive view of active cyber-financial fraud cases.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <select className="text-xs font-semibold border border-[#E2E8F0] rounded-xl bg-white text-[#475569] pl-3.5 pr-8 py-2.5 appearance-none focus:outline-none cursor-pointer shadow-2xs">
              <option>Last 24 Hours</option>
              <option>Last 7 Days</option>
            </select>
            <svg className="absolute right-3 top-3.5 text-[#94A3B8] pointer-events-none" width="10" height="6" viewBox="0 0 10 6" fill="none">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <button
            onClick={() => onOpenCase?.()}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-white text-xs font-semibold shadow-sm transition-opacity hover:opacity-90 cursor-pointer"
            style={{ background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)' }}
          >
            <PlusIcon />
            New Investigation
          </button>
        </div>
      </div>

      {/* Section 1: Core Metric Cards */}
      <div className="grid grid-cols-4 gap-4">
        <MetricCard
          title="ACTIVE CASES"
          value={String(caseFixtures.filter(f => f.status === 'Active').length || 4)}
          delta={`${caseFixtures.length} prototype cases loaded`}
          iconBg="#FEE2E2"
          iconColor="#E5484D"
          icon={<CasesIcon />}
          sparkColor="#3B82F6"
          sparkData={sparkActiveCases}
        />
        <MetricCard
          title="AMOUNT AT RISK"
          value={loadedPredictions.length > 0 ? formatAmountInr(totalAtRisk) : '₹18.1L'}
          delta="Across loaded cases"
          iconBg="#FEE2E2"
          iconColor="#E5484D"
          icon={<RupeeIcon />}
          sparkColor="#10B981"
          sparkData={sparkAmountRisk}
        />
        <MetricCard
          title="CRITICAL PRIORITY"
          value={String(criticalCount)}
          delta="Auto-alert recommended"
          iconBg="#FEE2E2"
          iconColor="#E5484D"
          icon={<ZoneIcon />}
          sparkColor="#E5484D"
          sparkData={sparkCriticalPriority}
        />
        <MetricCard
          title="PRIORITY INTERVENTIONS"
          value={String(priorityInterventions || 5)}
          delta="HIGH or CRITICAL"
          iconBg="#FEF3C7"
          iconColor="#F59E0B"
          icon={<AlertIcon />}
          sparkColor="#F59E0B"
          sparkData={sparkPriorityInterventions}
        />
      </div>

      {/* Section 2: Predictive Map + Priority Interventions Panel */}
      <div className="grid grid-cols-12 gap-5">

        {/* Map (8 cols) */}
        <Card className="col-span-8 overflow-hidden flex flex-col border-[#E2E8F0]">
          <div className="px-5 py-3.5 border-b border-[#F1F5F9] flex items-center justify-between bg-white">
            <div className="flex items-center gap-2">
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6C3.5 9 8 14.5 8 14.5C8 14.5 12.5 9 12.5 6C12.5 3.5 10.5 1.5 8 1.5Z" stroke="#3B82F6" strokeWidth="1.4"/>
                <circle cx="8" cy="6" r="2" stroke="#3B82F6" strokeWidth="1.3"/>
              </svg>
              <span className="font-bold text-xs uppercase tracking-wider text-[#3B82F6]">PREDICTIVE CASH-OUT RISK MAP</span>
            </div>
            <div className="flex items-center gap-2 text-xs text-[#64748B]">
              <div className="w-2 h-2 rounded-full bg-emerald-500 pulse-dot" />
              <span>Live risk analysis across India</span>
              <span className="text-[#94A3B8]">·</span>
              <span className="text-[#94A3B8]">Last updated: 2 min ago</span>
            </div>
          </div>

          <div className="relative flex-1 p-3 bg-[#F8FAFC]">
            <div className="rounded-2xl overflow-hidden relative border border-[#E2E8F0] shadow-inner" style={{ height: '390px' }}>
              <MapContainer
                center={[22.5, 79.2]}
                zoom={4.8 as any}
                zoomControl={true}
                scrollWheelZoom={false}
                style={{ height: '100%', width: '100%', background: '#E8F0F8' }}
              >
                <TileLayer
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  maxZoom={19}
                />

                {hotspots.map(h => {
                  const color = riskColors[h.level];
                  const isSel = selectedHotspot === h.id;

                  return (
                    <React.Fragment key={h.id}>
                      {/* Outer Heat/Glow Ring */}
                      <CircleMarker
                        center={[h.lat, h.lng]}
                        radius={isSel ? 26 : (h.level === 'critical' ? 22 : h.level === 'high' ? 18 : 14)}
                        pathOptions={{
                          fillColor: color,
                          fillOpacity: isSel ? 0.35 : 0.22,
                          color: color,
                          weight: isSel ? 2 : 1,
                          opacity: 0.5,
                        }}
                        eventHandlers={{
                          click: () => setSelectedHotspot(h.id === selectedHotspot ? null : h.id),
                        }}
                      />

                      {/* Inner Vibrant Point */}
                      <CircleMarker
                        center={[h.lat, h.lng]}
                        radius={isSel ? 8 : 6}
                        pathOptions={{
                          fillColor: color,
                          fillOpacity: 1,
                          color: '#FFFFFF',
                          weight: 2,
                          opacity: 1,
                        }}
                        eventHandlers={{
                          click: () => setSelectedHotspot(h.id === selectedHotspot ? null : h.id),
                        }}
                      >
                        <LeafletTooltip direction="top" offset={[0, -8]} opacity={0.95}>
                          <div className="font-sans text-xs p-0.5">
                            <div className="font-bold text-[#0F172A]">{h.label}</div>
                            <div className="text-[10px] text-[#64748B] flex items-center gap-1 mt-0.5">
                              Risk Score: <span className="font-mono font-bold" style={{ color }}>{Math.round(h.score * 100)}%</span>
                            </div>
                          </div>
                        </LeafletTooltip>
                      </CircleMarker>
                    </React.Fragment>
                  );
                })}
              </MapContainer>

              {/* Floating Legend */}
              <div className="absolute bottom-4 left-4 bg-white/95 backdrop-blur-md rounded-xl px-3.5 py-3 border border-[#E2E8F0] shadow-md text-xs space-y-1.5 z-[1000]">
                <div className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wider mb-1">RISK LEVEL</div>
                {[
                  { label: 'Critical 80%+',   color: '#E5484D' },
                  { label: 'High 60–80%',     color: '#F97316' },
                  { label: 'Moderate 40–60%', color: '#F59E0B' },
                  { label: 'Low < 40%',       color: '#14B8A6' },
                ].map(l => (
                  <div key={l.label} className="flex items-center gap-2">
                    <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: l.color }}/>
                    <span className="text-[#475569] text-[11px] font-medium">{l.label}</span>
                  </div>
                ))}
              </div>

              {/* Selected Zone Card Overlay */}
              {selected && (
                <div className="absolute top-4 right-4 bg-white/95 backdrop-blur-md rounded-2xl border border-[#E2E8F0] shadow-xl p-4 w-60 fade-in z-[1000]">
                  <div className="flex items-start justify-between mb-1">
                    <div>
                      <div className="text-sm font-bold text-[#0F172A]">{selected.label}</div>
                      <div className="text-[10px] text-[#94A3B8] capitalize">{selected.level} risk cluster</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="text-right">
                        <div className="text-base font-bold font-mono text-[#E5484D]">
                          {Math.round(selected.score * 100)}%
                        </div>
                        <div className="text-[9px] text-[#94A3B8] uppercase font-bold">Risk Score</div>
                      </div>
                      <button
                        onClick={() => setSelectedHotspot(null)}
                        className="text-[#94A3B8] hover:text-[#0F172A] p-0.5 ml-1 cursor-pointer font-bold text-xs"
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                  <div className="w-full h-1.5 bg-[#F1F5F9] rounded-full my-2.5 overflow-hidden">
                    <div className="h-full rounded-full bg-[#E5484D]" style={{ width: `${Math.round(selected.score * 100)}%` }}/>
                  </div>
                  <div className="space-y-2 text-xs mb-3.5 pt-1">
                    <div className="flex items-center justify-between">
                      <span className="text-[#64748B] flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="4.5" stroke="#94A3B8" strokeWidth="1.2"/><path d="M6 3.5V6L7.5 7.5" stroke="#94A3B8" strokeWidth="1.2" strokeLinecap="round"/></svg>
                        Intervention Window
                      </span>
                      <span className="font-bold font-mono text-[#0F172A]">{selected.window}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#64748B] flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M3 3H9M3 5H9M6 5L8 10M3 5C3 5 3 3.5 4.5 3.5" stroke="#94A3B8" strokeWidth="1.1"/></svg>
                        Estimated Exposure
                      </span>
                      <span className="font-bold font-mono text-[#0F172A]">{selected.amount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-[#64748B] flex items-center gap-1">
                        <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><rect x="2" y="2.5" width="8" height="7" rx="1" stroke="#94A3B8" strokeWidth="1.1"/></svg>
                        Active Cases
                      </span>
                      <span className="font-bold font-mono text-[#0F172A]">{selected.cases}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => handleOpenCaseItem('NCRP-26-81942')}
                    className="w-full py-2.5 text-xs font-semibold text-white rounded-xl hover:opacity-90 transition-opacity flex items-center justify-center gap-1 cursor-pointer shadow-sm"
                    style={{ background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)' }}
                  >
                    Open Case →
                  </button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Priority Interventions Panel (4 cols) */}
        <Card className="col-span-4 flex flex-col border-[#E2E8F0]">
          <div className="px-5 py-4 border-b border-[#F1F5F9]">
            <div className="flex items-center justify-between mb-0.5">
              <div className="flex items-center gap-2">
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                  <path d="M8 2L14 13H2L8 2Z" stroke="#7C5CFC" strokeWidth="1.4"/>
                  <path d="M8 6V9" stroke="#7C5CFC" strokeWidth="1.4" strokeLinecap="round"/>
                </svg>
                <span className="font-bold text-sm text-[#0F172A]">Priority Interventions</span>
              </div>
              <FeatureTag type="sih" />
            </div>
            <p className="text-xs text-[#94A3B8] mt-1">Sorted by P50 urgency · LIVE backend</p>
          </div>

          <div className="flex-1 p-3.5 space-y-2.5 overflow-y-auto">
            {priorityCasesSorted.length === 0 && (
              <div className="flex items-center justify-center h-32 text-xs text-[#94A3B8]">
                {isLoadingFinal(caseFixtures[0]?.case_id) ? 'Evaluating predictions…' : 'No HIGH/CRITICAL cases'}
              </div>
            )}
            {priorityCasesSorted.map(({ fixture, pred }) => {
              const p50 = Math.round(pred!.timing.intervention_distribution.p50_minutes);
              const priority = pred!.decision.priority;
              const atRisk = pred!.financial_exposure.amount_at_risk_inr;
              const zone = getZoneLabel(pred!.geographic.predicted_destination_zone);
              const color = priorityColor(priority);

              return (
                <div
                  key={fixture.case_id}
                  onClick={() => handleOpenCaseItem(fixture.case_id)}
                  className="p-3.5 rounded-xl border border-[#E2E8F0] hover:border-[#14B8A6]/40 hover:bg-[#F7FFFE] transition-all cursor-pointer group flex items-center justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center flex-shrink-0 mt-0.5 border border-blue-100">
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <rect x="2.5" y="2" width="9" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                        <path d="M5 5H9M5 7.5H8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="font-mono text-xs font-bold text-[#0F172A] group-hover:text-[#14B8A6] transition-colors">{fixture.case_id}</div>
                      <div className="text-xs text-[#64748B] truncate mt-0.5">{formatAmountInr(atRisk)} at risk · {zone}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="#94A3B8" strokeWidth="1.1"/><path d="M5 2.5V5L6.5 6.5" stroke="#94A3B8" strokeWidth="1.1" strokeLinecap="round"/></svg>
                        <span className="text-[10px] text-[#94A3B8] font-mono">P50 window: {p50} min</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <span className="text-[10px] font-bold font-mono px-2 py-0.5 rounded-full uppercase" style={{ color, background: `${color}15`, border: `1px solid ${color}30` }}>
                      {priority}
                    </span>
                    <svg className="text-[#94A3B8] group-hover:text-[#14B8A6] transition-colors" width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <path d="M4.5 2.5L8 6L4.5 9.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-3 border-t border-[#F1F5F9]">
            <button
              onClick={() => onOpenCase?.()}
              className="w-full py-2.5 text-xs font-semibold text-[#14B8A6] border border-[#14B8A6]/25 rounded-xl hover:bg-[#14B8A6]/5 transition-colors flex items-center justify-center gap-1 cursor-pointer"
            >
              View All Alerts →
            </button>
          </div>
        </Card>
      </div>

      {/* Section 3: Intelligence Layer (Bottom 3 cards) */}
      <div className="grid grid-cols-3 gap-5">

        {/* Fraud Type Distribution */}
        <Card className="p-5 border-[#E2E8F0]">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-bold text-[#0F172A] text-sm">Fraud Type Distribution</div>
              <div className="text-xs text-[#94A3B8] mt-0.5">Last 24 hours · 1,284 cases</div>
            </div>
            <FeatureTag type="sih" />
          </div>

          <div className="flex items-center gap-5 pt-2">
            <div className="relative flex-shrink-0" style={{ width: 110, height: 110 }}>
              <ResponsiveContainer width={110} height={110}>
                <PieChart>
                  <Pie data={fraudTypes} cx={50} cy={50} innerRadius={34} outerRadius={52} paddingAngle={3} dataKey="value">
                    {fraudTypes.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                <span className="text-xs font-bold text-[#0F172A] leading-none">1,284</span>
                <span className="text-[9px] text-[#94A3B8] font-medium mt-0.5">cases</span>
              </div>
            </div>

            <div className="space-y-1.5 flex-1">
              {fraudTypes.map(f => (
                <div key={f.name} className="flex items-center gap-2">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: f.color }}/>
                  <span className="text-xs text-[#475569] flex-1 truncate">{f.name}</span>
                  <span className="text-xs font-bold font-mono text-[#0F172A]">{f.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </Card>

        {/* Cash-Out Risk Trend */}
        <Card className="p-5 border-[#E2E8F0]">
          <div className="flex items-start justify-between mb-3">
            <div>
              <div className="font-bold text-[#0F172A] text-sm">Cash-Out Risk Trend</div>
              <div className="text-xs text-[#94A3B8] mt-0.5">Hourly predicted cases · Last 24h</div>
            </div>
            <FeatureTag type="sih" />
          </div>

          <ResponsiveContainer width="100%" height={120}>
            <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -25, bottom: 0 }}>
              <defs>
                <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#14B8A6" stopOpacity={0.25}/>
                  <stop offset="95%" stopColor="#14B8A6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <XAxis dataKey="h" tick={{ fontSize: 9, fill: '#94A3B8' }} />
              <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }} />
              <Tooltip content={<CustomTooltip />}/>
              <Area type="monotone" dataKey="risk" stroke="#14B8A6" strokeWidth={2.5} fill="url(#riskGrad)" dot={false}/>
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        {/* AI Intelligence Summary */}
        <div className="rounded-2xl overflow-hidden border border-[#7C5CFC]/25 shadow-xs flex flex-col">
          <div className="ai-gradient px-5 py-3.5 flex items-center gap-3">
            <SparkleIcon size={16}/>
            <div>
              <div className="text-white font-bold text-sm leading-tight">TRINETRA Intelligence</div>
              <div className="text-white/70 text-[10px] mt-0.5">AI-generated summary</div>
            </div>
            <div className="ml-auto"><FeatureTag type="usp" /></div>
          </div>
          <div className="p-4 bg-gradient-to-br from-[#7C5CFC]/8 to-[#4338CA]/4 flex-1 flex flex-col justify-between">
            <div className="space-y-2.5">
              {[
                { icon: '🔴', text: '18 emerging withdrawal clusters detected in the last 6 hours across NCR and Rajasthan.' },
                { icon: '⚡', text: 'Delhi NCR and Jaipur show high convergence between mule-account activity and ATM cash-out patterns.' },
                { icon: '📘', text: '3 OSINT signals corroborate elevated fraud activity in Gurugram Sector 29.' },
              ].map((insight, i) => (
                <div key={i} className="flex items-start gap-2.5 text-xs text-[#3D2FA8] font-medium">
                  <span className="text-xs leading-snug flex-shrink-0">{insight.icon}</span>
                  <p className="leading-relaxed">{insight.text}</p>
                </div>
              ))}
            </div>
            <button
              onClick={() => onOpenCase?.()}
              className="mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white w-full justify-center transition-opacity hover:opacity-90 cursor-pointer shadow-sm"
              style={{ background: 'linear-gradient(135deg, #7C5CFC 0%, #4338CA 100%)' }}
            >
              <SparkleIcon size={12}/>
              Ask Copilot
            </button>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ title, value, delta, iconBg, iconColor, icon, sparkColor, sparkData }: {
  title: string; value: string; delta?: string; iconBg: string; iconColor: string; icon: React.ReactNode; sparkColor: string; sparkData: { v: number }[];
}) {
  return (
    <Card className="p-4 border-[#E2E8F0] flex items-center justify-between">
      <div>
        <div className="flex items-center gap-2.5 mb-2">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: iconBg, color: iconColor }}>
            {icon}
          </div>
          <span className="text-[10px] font-bold text-[#94A3B8] uppercase tracking-wider">{title}</span>
        </div>
        <div className="text-[26px] font-bold text-[#0F172A] leading-none mb-1">{value}</div>
        {delta && <div className="text-[11px] text-[#64748B]">{delta}</div>}
      </div>

      {/* Mini Sparkline Chart */}
      <div className="w-20 h-12">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
            <defs>
              <linearGradient id={`spark-${sparkColor}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={sparkColor} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={sparkColor} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="v" stroke={sparkColor} strokeWidth={2} fill={`url(#spark-${sparkColor})`} dot={false}/>
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

function PlusIcon() {
  return <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M6 1V11M1 6H11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function CasesIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 7H11M5 10H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function RupeeIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M4 4H12M4 7H12M8 7L10.5 13M4 7C4 7 4 5 6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function ZoneIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 13L5.5 15.5M8 13L10.5 15.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function AlertIcon() {
  return <svg width="15" height="15" viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 7V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
