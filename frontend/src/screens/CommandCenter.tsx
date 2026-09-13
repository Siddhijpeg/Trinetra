import React, { useState } from 'react';
import {
  AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import { Card, Button, SparkleIcon, FeatureTag, SectionLabel } from '../components/ui';
import { PRIORITY_CASES } from '../data/mockCases';
import { getCommandCenterKPIs } from '../services/prototypeService';

const kpis = getCommandCenterKPIs();

const trendData = [
  { h: '00:00', risk: 22 }, { h: '02:00', risk: 18 }, { h: '04:00', risk: 20 },
  { h: '06:00', risk: 25 }, { h: '08:00', risk: 34 }, { h: '10:00', risk: 48 },
  { h: '12:00', risk: 55 }, { h: '14:00', risk: 63 }, { h: '16:00', risk: 71 },
  { h: '18:00', risk: 68 }, { h: '20:00', risk: 59 }, { h: '22:00', risk: 42 },
];

const fraudTypes = [
  { name: 'Investment Scam',  value: 32, color: '#7C5CFC' },
  { name: 'UPI Fraud',        value: 26, color: '#14B8A6' },
  { name: 'Impersonation',    value: 18, color: '#F59E0B' },
  { name: 'Digital Arrest',   value: 13, color: '#E5484D' },
  { name: 'Others',           value: 11, color: '#94A3B8' },
];

// SVG India map data (lightweight overview map for Command Center)
const indiaMain = "M 130,30 L 162,8 L 198,4 L 236,6 L 270,15 L 298,30 L 320,48 L 344,60 L 374,78 L 388,104 L 386,130 L 374,157 L 358,184 L 342,212 L 328,240 L 314,267 L 300,292 L 286,317 L 272,344 L 257,370 L 242,396 L 230,420 L 220,442 L 212,460 L 206,470 L 200,460 L 186,438 L 171,412 L 155,384 L 140,352 L 126,318 L 112,284 L 100,252 L 88,220 L 76,194 L 60,187 L 46,197 L 44,218 L 54,240 L 70,260 L 84,274 L 97,287 L 102,274 L 95,252 L 90,230 L 92,212 L 100,195 L 112,180 L 114,157 L 117,132 L 114,107 L 116,83 L 120,62 L 124,44 Z";

const stateBoundaries = [
  "M 96,157 L 130,165 L 200,154 L 268,162 L 305,158",
  "M 305,105 L 308,165",
  "M 97,197 L 92,230 L 86,252",
  "M 96,225 L 132,218 L 202,238 L 264,228 L 306,218",
  "M 306,218 L 330,218 L 366,202 L 375,242",
  "M 204,272 L 238,283 L 318,275",
  "M 90,308 L 128,318 L 168,313 L 204,308 L 240,300 L 282,296",
  "M 127,348 L 170,368 L 218,367 L 258,352",
  "M 90,308 L 82,338 L 88,372",
  "M 374,78 L 390,138",
];

// Hotspots with real district positions
const hotspots = [
  { id: 'gurugram', label: 'Gurugram',  x: 207, y: 120, level: 'critical', score: 0.91, cases: 13, amount: '₹4.8L', window: '48 min' },
  { id: 'jaipur',   label: 'Jaipur',    x: 170, y: 141, level: 'high',     score: 0.74, cases: 7,  amount: '₹18.2L', window: '72 min' },
  { id: 'lucknow',  label: 'Lucknow',   x: 260, y: 133, level: 'high',     score: 0.67, cases: 5,  amount: '₹12.8L', window: '95 min' },
  { id: 'mumbai',   label: 'Mumbai',    x: 107, y: 238, level: 'medium',   score: 0.55, cases: 4,  amount: '₹8.6L',  window: '2.2 hr' },
  { id: 'kolkata',  label: 'Kolkata',   x: 328, y: 182, level: 'medium',   score: 0.43, cases: 3,  amount: '₹6.2L',  window: '3 hr' },
  { id: 'bengaluru',label: 'Bengaluru', x: 210, y: 342, level: 'low',      score: 0.31, cases: 2,  amount: '₹4.1L',  window: '6+ hr' },
];

const riskColors: Record<string, string> = {
  critical: '#E5484D', high: '#F97316', medium: '#F59E0B', low: '#14B8A6',
};

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload?.length) {
    return (
      <div className="bg-white border border-[#E2E8F0] rounded-xl px-3 py-2 shadow-lg text-xs">
        <div className="font-mono font-medium text-[#14B8A6]">{payload[0].payload.h}</div>
        <div className="text-[#0F172A]">High-risk cases: <strong>{payload[0].value}</strong></div>
      </div>
    );
  }
  return null;
};

export default function CommandCenter({ onOpenCase }: { onOpenCase?: () => void }) {
  const [selectedHotspot, setSelectedHotspot] = useState<string | null>('gurugram');
  const selected = hotspots.find(h => h.id === selectedHotspot);

  return (
    <div className="p-7 space-y-7">

      {/* Page Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-[#0F172A] leading-tight">Cyber Intelligence Command Center</h1>
          <p className="text-sm text-[#64748B] mt-1.5">
            Real-time predictive view of active cyber-financial fraud cases.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select className="text-sm border border-[#E2E8F0] rounded-xl bg-white text-[#475569] px-3.5 py-2.5 focus:outline-none cursor-pointer shadow-sm">
            <option>Last 24 Hours</option>
            <option>Last 7 Days</option>
          </select>
          <Button variant="primary" icon={<PlusIcon />}>New Investigation</Button>
        </div>
      </div>

      {/* Section 1: Core KPIs */}
      <section>
        <SectionLabel type="sih">Core Metrics</SectionLabel>
        <div className="grid grid-cols-4 gap-4">
          <MetricCard
            title="Active Cases"
            value={kpis.activeCases.toLocaleString()}
            delta="+8.4% today"
            iconColor="#E5484D"
            icon={<CasesIcon />}
          />
          <MetricCard
            title="Amount at Risk"
            value={kpis.amountAtRisk}
            delta="Across active cases"
            iconColor="#E5484D"
            icon={<RupeeIcon />}
          />
          <MetricCard
            title="High-Risk Zones"
            value={String(kpis.highRiskZones)}
            delta="6 newly detected"
            iconColor="#F97316"
            icon={<ZoneIcon />}
          />
          <MetricCard
            title="Priority Interventions"
            value={String(kpis.priorityInterventions)}
            delta="Require action now"
            iconColor="#F59E0B"
            icon={<AlertIcon />}
          />
        </div>
      </section>

      {/* Section 2: Map + Priority Cases */}
      <section>
        <SectionLabel type="sih">Predictive Cash-Out Risk Map</SectionLabel>
        <div className="grid grid-cols-3 gap-5">

          {/* Map */}
          <Card className="col-span-2 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[#F1F5F9] flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-[#64748B]">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
                Live Risk View
              </div>
              <span className="text-[10px] text-[#94A3B8]">Prototype map · Real coordinates from zones.csv</span>
            </div>
            <div className="relative p-4">
              <div className="rounded-2xl overflow-hidden relative" style={{ background: '#E8F0F8' }}>
                <svg viewBox="0 0 430 490" className="w-full" style={{ maxHeight: '320px', display: 'block' }}>
                  {/* State fills */}
                  <path d="M 130,30 L 162,8 L 198,4 L 270,15 L 120,62 L 114,107 L 117,132 L 114,157 L 96,157 L 97,197 L 96,225 L 86,252 L 76,194 L 60,187 L 46,197 L 44,218 L 54,240 L 70,260 L 84,274 L 97,287 L 102,274 L 95,252 L 90,230 L 92,212 L 100,195 L 112,180 L 114,157 Z" fill="#EBE8E0"/>
                  <path d="M 200,154 L 268,162 L 305,158 L 308,105 L 270,15 L 298,30 L 320,48 L 344,60 L 374,78 L 388,104 L 386,130 L 374,157 L 342,212 L 328,240 L 306,218 L 264,228 L 202,238 L 200,154 Z" fill="#EBE8E0"/>
                  <path d="M 200,154 L 268,162 L 305,158 L 308,165 L 264,228 L 202,238 L 132,218 L 96,225 L 97,197 L 96,157 L 130,165 Z" fill="#E7E4DC"/>
                  <path d="M 306,218 L 330,218 L 366,202 L 375,242 L 360,270 L 318,278 L 300,252 Z" fill="#EBE8E0"/>
                  <path d="M 96,225 L 132,218 L 202,238 L 264,228 L 306,218 L 300,252 L 240,283 L 204,272 L 132,270 L 96,252 Z" fill="#E4E0D8"/>
                  <path d="M 204,272 L 240,283 L 318,275 L 322,308 L 270,320 L 240,300 L 204,308 L 168,313 Z" fill="#EBE8E0"/>
                  <path d="M 90,252 L 132,270 L 204,272 L 168,313 L 128,318 L 90,308 Z" fill="#E7E4DC"/>
                  <path d="M 128,348 L 170,368 L 218,367 L 242,396 L 230,420 L 220,442 L 212,460 L 206,470 L 200,460 L 186,438 L 171,412 L 155,384 L 140,352 Z" fill="#E4E0D8"/>

                  {/* Outline + boundaries */}
                  <path d={indiaMain} fill="none" stroke="#94A3B8" strokeWidth="1.2"/>
                  {stateBoundaries.map((d, i) => (
                    <path key={i} d={d} fill="none" stroke="#B0BAC8" strokeWidth="0.65" opacity={0.8}/>
                  ))}

                  {/* Hotspots */}
                  {hotspots.map(h => {
                    const color = riskColors[h.level];
                    const isSel = selectedHotspot === h.id;
                    return (
                      <g key={h.id} className="cursor-pointer" onClick={() => setSelectedHotspot(h.id === selectedHotspot ? null : h.id)}>
                        <circle cx={h.x} cy={h.y} r={isSel ? 30 : 22} fill={color} opacity={0.07}/>
                        <circle cx={h.x} cy={h.y} r={isSel ? 18 : 0} fill={color} opacity={0.11}/>
                        <circle cx={h.x} cy={h.y} r={isSel ? 10 : 7} fill={color} opacity={isSel ? 0.95 : 0.72}
                          stroke={isSel ? 'white' : 'none'} strokeWidth={isSel ? 1.5 : 0}/>
                        <text x={h.x} y={h.y + (isSel ? 22 : 18)} textAnchor="middle"
                          fill="#334155" fontSize="8" fontFamily="Inter, sans-serif" fontWeight="500">
                          {h.label}
                        </text>
                      </g>
                    );
                  })}
                </svg>

                {/* Legend */}
                <div className="absolute bottom-4 left-4 bg-white/92 backdrop-blur-sm rounded-xl px-3 py-2.5 border border-[#E2E8F0] shadow-sm text-xs space-y-1">
                  <div className="text-[9px] font-bold text-[#94A3B8] uppercase tracking-wide mb-1.5">Risk Level</div>
                  {[
                    { label: 'Critical 80%+',   color: '#E5484D' },
                    { label: 'High 60–80%',     color: '#F97316' },
                    { label: 'Moderate 40–60%', color: '#F59E0B' },
                    { label: 'Low < 40%',       color: '#14B8A6' },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: l.color }}/>
                      <span className="text-[#475569] text-[10px]">{l.label}</span>
                    </div>
                  ))}
                </div>

                {/* Zone popup */}
                {selected && (
                  <div className="absolute top-4 right-4 bg-white rounded-2xl border border-[#E2E8F0] shadow-xl p-4 w-52 fade-in">
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="text-xs font-bold text-[#0F172A]">{selected.label}</div>
                        <div className="text-[10px] text-[#94A3B8]">Active cluster</div>
                      </div>
                      <span className="text-base font-bold font-mono" style={{ color: riskColors[selected.level] }}>
                        {Math.round(selected.score * 100)}%
                      </span>
                    </div>
                    <div className="w-full h-1 bg-[#F1F5F9] rounded-full mb-3 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${Math.round(selected.score * 100)}%`, background: riskColors[selected.level] }}/>
                    </div>
                    <div className="space-y-1.5 text-xs mb-3">
                      {[
                        { k: 'Window',  v: selected.window },
                        { k: 'Exposure', v: selected.amount },
                        { k: 'Cases',   v: `${selected.cases}` },
                      ].map(r => (
                        <div key={r.k} className="flex items-center justify-between">
                          <span className="text-[#94A3B8]">{r.k}</span>
                          <span className="font-semibold font-mono text-[#0F172A]">{r.v}</span>
                        </div>
                      ))}
                    </div>
                    <button
                      onClick={onOpenCase}
                      className="w-full py-2 text-xs font-semibold text-white rounded-xl hover:opacity-90 transition-opacity"
                      style={{ background: 'linear-gradient(90deg, #14B8A6, #0D9488)' }}
                    >
                      Open Case →
                    </button>
                  </div>
                )}
              </div>
            </div>
          </Card>

          {/* Priority Cases */}
          <Card className="flex flex-col">
            <div className="px-5 py-4 border-b border-[#F1F5F9]">
              <div className="flex items-center justify-between mb-0.5">
                <span className="font-semibold text-[#0F172A] text-sm">Priority Interventions</span>
                <FeatureTag type="sih" />
              </div>
              <p className="text-xs text-[#94A3B8] mt-1">Sorted by cash-out probability</p>
            </div>
            <div className="flex-1 p-3 space-y-2 overflow-y-auto">
              {PRIORITY_CASES.map(c => (
                <div
                  key={c.id}
                  onClick={onOpenCase}
                  className="p-3.5 rounded-xl border cursor-pointer hover:border-[#14B8A6]/30 hover:bg-[#F7FFFE] transition-all group"
                  style={{ borderColor: c.level === 'critical' ? 'rgba(229,72,77,0.2)' : '#E8ECF0' }}
                >
                  <div className="flex items-start justify-between mb-1.5">
                    <span className="font-mono text-xs font-bold text-[#0F172A] group-hover:text-[#14B8A6] transition-colors">{c.id}</span>
                    <span className={`text-[10px] font-bold font-mono px-1.5 py-0.5 rounded-md ${
                      c.level === 'critical' ? 'risk-critical' : c.level === 'high' ? 'risk-high' : 'risk-medium'
                    }`}>{c.prob}%</span>
                  </div>
                  <div className="text-xs text-[#64748B]">{c.amount} · {c.zone}</div>
                  <div className="flex items-center gap-1.5 mt-1.5">
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4" stroke="#94A3B8" strokeWidth="1.1"/><path d="M5 2.5V5L6.5 6.5" stroke="#94A3B8" strokeWidth="1.1" strokeLinecap="round"/></svg>
                    <span className="text-[10px] text-[#94A3B8]">Window: {c.mins} min</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="p-3 border-t border-[#F1F5F9]">
              <button className="w-full py-2 text-sm font-medium text-[#14B8A6] border border-[#14B8A6]/20 rounded-xl hover:bg-[#14B8A6]/5 transition-colors">
                View All Alerts
              </button>
            </div>
          </Card>
        </div>
      </section>

      {/* Section 3: Analytics + AI Summary */}
      <section>
        <SectionLabel type="usp">Intelligence Layer</SectionLabel>
        <div className="grid grid-cols-3 gap-5">

          {/* Fraud Type Distribution */}
          <Card className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-semibold text-[#0F172A] text-sm">Fraud Type Distribution</div>
                <div className="text-xs text-[#94A3B8] mt-0.5">Last 24 hours · 1,284 cases</div>
              </div>
              <FeatureTag type="sih" />
            </div>
            <div className="flex items-center gap-4">
              <ResponsiveContainer width={100} height={100}>
                <PieChart>
                  <Pie data={fraudTypes} cx={45} cy={45} innerRadius={28} outerRadius={46} paddingAngle={2} dataKey="value">
                    {fraudTypes.map((entry, i) => <Cell key={i} fill={entry.color}/>)}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 flex-1">
                {fraudTypes.map(f => (
                  <div key={f.name} className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: f.color }}/>
                    <span className="text-xs text-[#475569] flex-1 truncate">{f.name}</span>
                    <span className="text-xs font-semibold font-mono text-[#0F172A]">{f.value}%</span>
                  </div>
                ))}
              </div>
            </div>
          </Card>

          {/* Risk Trend */}
          <Card className="p-5">
            <div className="flex items-start justify-between mb-4">
              <div>
                <div className="font-semibold text-[#0F172A] text-sm">Cash-Out Risk Trend</div>
                <div className="text-xs text-[#94A3B8] mt-0.5">Hourly predicted cases · Last 24h</div>
              </div>
              <FeatureTag type="sih" />
            </div>
            <ResponsiveContainer width="100%" height={110}>
              <AreaChart data={trendData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                <defs>
                  <linearGradient id="riskGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#14B8A6" stopOpacity={0.18}/>
                    <stop offset="95%" stopColor="#14B8A6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="h" tick={{ fontSize: 9, fill: '#94A3B8' }} interval={3}/>
                <YAxis tick={{ fontSize: 9, fill: '#94A3B8' }}/>
                <Tooltip content={<CustomTooltip />}/>
                <Area type="monotone" dataKey="risk" stroke="#14B8A6" strokeWidth={2} fill="url(#riskGrad)" dot={false}/>
              </AreaChart>
            </ResponsiveContainer>
          </Card>

          {/* AI Intelligence Summary */}
          <div className="rounded-2xl overflow-hidden border border-[#7C5CFC]/18">
            <div className="ai-gradient px-5 py-4 flex items-center gap-3">
              <SparkleIcon size={16}/>
              <div>
                <div className="text-white font-semibold text-sm">TRINETRA Intelligence</div>
                <div className="text-white/65 text-[10px] mt-0.5">AI-generated summary</div>
              </div>
              <div className="ml-auto"><FeatureTag type="usp" /></div>
            </div>
            <div className="p-5 bg-gradient-to-br from-[#7C5CFC]/6 to-[#4338CA]/3">
              <div className="space-y-3">
                {[
                  { icon: '🔴', text: '18 emerging withdrawal clusters detected in the last 6 hours across NCR and Rajasthan.' },
                  { icon: '⚡', text: 'Delhi NCR and Jaipur show high convergence between mule-account activity and ATM cash-out patterns.' },
                  { icon: '📡', text: '3 OSINT signals corroborate elevated fraud activity in Gurugram Sector 29.' },
                ].map((insight, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm text-[#3D2FA8]">
                    <span className="text-sm leading-snug flex-shrink-0">{insight.icon}</span>
                    <p className="leading-relaxed text-xs">{insight.text}</p>
                  </div>
                ))}
              </div>
              <button
                onClick={onOpenCase}
                className="mt-4 flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold text-white w-full justify-center transition-opacity hover:opacity-90"
                style={{ background: 'linear-gradient(135deg, #7C5CFC, #4338CA)' }}
              >
                <SparkleIcon size={11}/>
                Ask Copilot
              </button>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MetricCard({ title, value, delta, iconColor, icon }: {
  title: string; value: string; delta?: string; iconColor: string; icon: React.ReactNode;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: `${iconColor}12`, color: iconColor }}>
          {icon}
        </div>
      </div>
      <div className="text-[26px] font-bold text-[#0F172A] leading-none mb-1">{value}</div>
      <div className="text-[11px] font-medium text-[#94A3B8] uppercase tracking-wide mb-1.5">{title}</div>
      {delta && <div className="text-xs text-[#94A3B8]">{delta}</div>}
    </Card>
  );
}

function PlusIcon() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1V12M1 6.5H12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function CasesIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><rect x="2" y="3" width="12" height="11" rx="2" stroke="currentColor" strokeWidth="1.4"/><path d="M5 7H11M5 10H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function RupeeIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M4 4H12M4 7H12M8 7L10.5 13M4 7C4 7 4 5 6 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function ZoneIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="7" r="5" stroke="currentColor" strokeWidth="1.4"/><path d="M8 13L5.5 15.5M8 13L10.5 15.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>;
}
function AlertIcon() {
  return <svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M8 2L14.5 13.5H1.5L8 2Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/><path d="M8 7V9.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
