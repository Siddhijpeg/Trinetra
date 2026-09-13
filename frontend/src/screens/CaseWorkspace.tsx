import React, { useState } from 'react';
import {
  LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip,
} from 'recharts';
import { Card, RiskBadge, Button, SparkleIcon, FeatureTag, PrototypeBadge, ConfidenceBar, TimelineEvent } from '../components/ui';
import { DEMO_CASE_HOPS, DEMO_CASE_ACCOUNTS, DEMO_CASE_TIMELINE } from '../data/mockCases';
import { PREDICTION_EVOLUTION_STEPS, PREDICTION_DECISION, EXPLAINABILITY_FACTORS } from '../data/mockPredictions';
import type { OutcomeType, PredictionStage } from '../types';

// ─── Confidence level label helper ───────────────────────────────────────────
const confidenceLabel = (c: number) =>
  c >= 75 ? 'HIGH' : c >= 50 ? 'MEDIUM' : 'LOW';

const confidenceColor = (c: number) =>
  c >= 75 ? '#10B981' : c >= 50 ? '#F59E0B' : '#94A3B8';

// ─── Outcome options ──────────────────────────────────────────────────────────
const OUTCOMES: { value: OutcomeType; label: string }[] = [
  { value: 'funds-frozen',   label: 'Funds Frozen' },
  { value: 'funds-recovered',label: 'Funds Recovered' },
  { value: 'false-alert',    label: 'False Alert' },
  { value: 'no-action',      label: 'No Action Taken' },
  { value: 'unknown',        label: 'Unknown' },
];

// ─── Component ────────────────────────────────────────────────────────────────

export default function CaseWorkspace({ onBack }: { onBack?: () => void }) {
  const [predStage, setPredStage] = useState<PredictionStage>(0);
  const [xaiOpen, setXaiOpen] = useState(false);
  const [selectedOutcome, setSelectedOutcome] = useState<OutcomeType | null>(null);
  const [outcomeSubmitted, setOutcomeSubmitted] = useState(false);
  const [toastVisible, setToastVisible] = useState(false);

  const currentStep = PREDICTION_EVOLUTION_STEPS[predStage];
  const decision = PREDICTION_DECISION;

  const handleNextHop = () => {
    if (predStage < 3) setPredStage((s) => (s + 1) as PredictionStage);
  };

  const handleOutcomeSubmit = () => {
    if (!selectedOutcome) return;
    setOutcomeSubmitted(true);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3500);
  };

  // Chart data for prediction evolution
  const evolutionChartData = PREDICTION_EVOLUTION_STEPS.slice(0, predStage + 1).map(s => ({
    label: s.label,
    confidence: s.confidence,
  }));

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onBack} className="text-xs text-[#64748B] hover:text-[#0F172A] flex items-center gap-1 font-medium transition-colors">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Cases
          </button>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4 2L8 6L4 10" stroke="#CBD5E1" strokeWidth="1.3" strokeLinecap="round"/></svg>
          <span className="text-xs text-[#64748B] font-mono">NCRP-26-81942</span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-[24px] font-bold text-[#0F172A]">Case NCRP-26-81942</h1>
              <RiskBadge level="critical" />
              <FeatureTag type="sih" />
            </div>
            <p className="text-sm text-[#64748B]">Investment Fraud · ₹4,80,000 · Reported from New Delhi</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm">Generate Report</Button>
            <Button variant="secondary" size="sm">Create Alert</Button>
            <Button variant="primary" size="sm">Share with Bank</Button>
          </div>
        </div>
      </div>

      {/* ── Main Layout ── */}
      <div className="grid grid-cols-12 gap-5">

        {/* ── Left: Timeline + Snapshot ── */}
        <div className="col-span-3 space-y-4">

          {/* Case Snapshot */}
          <Card className="p-4">
            <div className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Case Details</div>
            <div className="space-y-2">
              {[
                { label: 'Complaint Time', value: '13:42 IST' },
                { label: 'Victim Location', value: 'New Delhi' },
                { label: 'Fraud Amount',    value: '₹4.8 lakh' },
                { label: 'Transaction Hops', value: '3 observed + 1 predicted' },
                { label: 'Linked Accounts', value: '4 (2 Persistent Risk)' },
              ].map(r => (
                <div key={r.label} className="flex items-start justify-between gap-2">
                  <span className="text-xs text-[#94A3B8] flex-shrink-0">{r.label}</span>
                  <span className="text-xs font-semibold text-[#0F172A] text-right">{r.value}</span>
                </div>
              ))}
            </div>
            {/* Predicted zone */}
            <div className="mt-3 pt-3 border-t border-[#F1F5F9]">
              <div className="text-xs text-[#94A3B8] mb-1">Predicted Cash-Out Zone</div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-[#E5484D] pulse-dot flex-shrink-0" />
                <span className="text-xs font-bold text-[#E5484D]">Gurugram Sector 29</span>
              </div>
              <div className="text-[10px] text-[#94A3B8] mt-0.5">Est. window: 14:28 – 15:32 IST</div>
            </div>
          </Card>

          {/* Timeline */}
          <Card className="p-4">
            <div className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Case Timeline</div>
            <div className="space-y-0">
              {DEMO_CASE_TIMELINE.map((entry, i) => (
                <TimelineEvent
                  key={i}
                  time={entry.time}
                  label={entry.label}
                  desc={entry.desc}
                  isHighlight={entry.isHighlight}
                  isLast={entry.isLast}
                />
              ))}
            </div>
          </Card>
        </div>

        {/* ── Center: Prediction Evolution ── */}
        <div className="col-span-5 space-y-4">

          {/* Sequential Prediction Card */}
          <div className="rounded-2xl border border-[#7C5CFC]/20 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="ai-gradient px-5 py-4 flex items-center gap-3">
              <SparkleIcon size={16} />
              <div>
                <div className="text-white font-bold text-sm">Live Prediction Evolution</div>
                <div className="text-white/65 text-[11px]">Sequential cash-out zone narrowing</div>
              </div>
              <div className="ml-auto flex items-center gap-2">
                <FeatureTag type="usp" />
                <PrototypeBadge tooltip="Confidence values are prototype simulations. Real model will replace this in integration phase." />
              </div>
            </div>

            {/* Body */}
            <div className="p-5 bg-gradient-to-br from-[#7C5CFC]/5 to-[#4338CA]/3">

              {/* Stage indicator */}
              <div className="flex items-center gap-2 mb-4">
                {PREDICTION_EVOLUTION_STEPS.map((s, i) => (
                  <React.Fragment key={i}>
                    <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all ${
                      i === predStage
                        ? 'bg-[#7C5CFC] text-white border-[#7C5CFC]'
                        : i < predStage
                        ? 'bg-[#7C5CFC]/10 text-[#7C5CFC] border-[#7C5CFC]/20'
                        : 'bg-white text-[#94A3B8] border-[#E2E8F0]'
                    }`}>
                      {i < predStage && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>}
                      {i === 0 ? 'Prior' : i === 3 ? 'Decision' : `Hop ${i}`}
                    </div>
                    {i < 3 && <div className={`flex-1 h-px ${i < predStage ? 'bg-[#7C5CFC]/30' : 'bg-[#E2E8F0]'}`} />}
                  </React.Fragment>
                ))}
              </div>

              {/* Confidence headline */}
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-xs text-[#64748B] mb-0.5">Current top prediction</div>
                  <div className="text-sm font-bold text-[#0F172A]">{currentStep.topZone}</div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold font-mono" style={{ color: confidenceColor(currentStep.confidence) }}>
                    {currentStep.confidence}%
                  </div>
                  <div
                    className="text-[10px] font-bold uppercase tracking-wide mt-0.5"
                    style={{ color: confidenceColor(currentStep.confidence) }}
                  >
                    {confidenceLabel(currentStep.confidence)} CONFIDENCE
                  </div>
                </div>
              </div>

              {/* Zone probability list */}
              <div className="space-y-2 mb-4">
                <div className="text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide">Zone Probabilities</div>
                {currentStep.zoneProbabilities.map((zp, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <div className="text-xs text-[#64748B] w-40 truncate">{zp.zone.district}</div>
                    <div className="flex-1 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{
                          width: `${zp.probability}%`,
                          background: zp.probability >= 75 ? '#E5484D' : zp.probability >= 50 ? '#F97316' : zp.probability >= 30 ? '#F59E0B' : '#14B8A6',
                        }}
                      />
                    </div>
                    <span className="text-xs font-mono font-bold text-[#0F172A] w-10 text-right">{zp.probability}%</span>
                  </div>
                ))}
              </div>

              {/* Registry signal */}
              {currentStep.registrySignal && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 mb-3 fade-in">
                  <svg className="text-amber-600 flex-shrink-0 mt-0.5" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
                    <path d="M6 3.5V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <circle cx="6" cy="8.5" r="0.6" fill="currentColor"/>
                  </svg>
                  <span className="text-xs text-amber-800">{currentStep.registrySignal}</span>
                </div>
              )}

              {/* Persistent risk entity alert */}
              {currentStep.persistentRiskEntity && (
                <div className="flex items-start gap-2 px-3 py-2.5 rounded-xl bg-red-50 border border-red-200 mb-3 fade-in">
                  <svg className="text-[#E5484D] flex-shrink-0 mt-0.5" width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <path d="M6 1L11 10H1L6 1Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
                    <path d="M6 5V7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                    <circle cx="6" cy="9" r="0.5" fill="currentColor"/>
                  </svg>
                  <span className="text-xs text-red-800 font-medium">{currentStep.persistentRiskEntity}</span>
                </div>
              )}

              {/* Action button */}
              {predStage < 2 && (
                <button
                  onClick={handleNextHop}
                  className="w-full py-2.5 text-xs font-semibold rounded-xl border border-[#7C5CFC]/30 text-[#7C5CFC] hover:bg-[#7C5CFC]/5 transition-colors flex items-center justify-center gap-2"
                >
                  Simulate Next Transaction Hop →
                </button>
              )}
              {predStage === 2 && (
                <button
                  onClick={handleNextHop}
                  className="w-full py-2.5 text-xs font-semibold rounded-xl text-white hover:opacity-90 transition-opacity flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #7C5CFC, #4338CA)' }}
                >
                  <SparkleIcon size={11} />
                  Evaluate Recoverability & Decision →
                </button>
              )}
            </div>
          </div>

          {/* Decision Card (stage 3) */}
          {predStage === 3 && (
            <div className="rounded-2xl border border-[#E5484D]/25 overflow-hidden fade-in">
              <div className="px-5 py-3.5 flex items-center justify-between" style={{ background: '#FFF1F1' }}>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[#E5484D] pulse-dot" />
                  <span className="text-sm font-bold text-[#E5484D]">{decision.label}</span>
                </div>
                <span className="text-[10px] text-[#94A3B8]">Prototype decision logic</span>
              </div>
              <div className="p-4 bg-white space-y-3">
                <p className="text-xs text-[#64748B]">{decision.reason}</p>

                {/* Recoverability */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl bg-[#F7F8FA] border border-[#E2E8F0]">
                    <div className="text-[10px] text-[#94A3B8] mb-1">Prediction Confidence</div>
                    <div className="text-xl font-bold font-mono text-[#10B981]">{decision.confidence}%</div>
                    <div className="w-full h-1 bg-[#E2E8F0] rounded-full mt-1.5">
                      <div className="h-full rounded-full bg-[#10B981]" style={{ width: `${decision.confidence}%` }} />
                    </div>
                  </div>
                  <div className="p-3 rounded-xl bg-[#F7F8FA] border border-[#E2E8F0]">
                    <div className="text-[10px] text-[#94A3B8] mb-1">
                      Recoverability <PrototypeBadge />
                    </div>
                    <div className="text-xl font-bold font-mono text-[#F97316]">{decision.recoverability.score}%</div>
                    <div className="text-[10px] text-[#F97316] font-semibold mt-0.5">
                      {decision.recoverability.windowLabel} remaining — ACT NOW
                    </div>
                  </div>
                </div>

                {/* XAI */}
                <button
                  onClick={() => setXaiOpen(v => !v)}
                  className="flex items-center gap-1.5 text-xs font-semibold text-[#7C5CFC] hover:underline"
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/><path d="M6 3.5V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/><circle cx="6" cy="8.5" r="0.6" fill="currentColor"/></svg>
                  Why this prediction?
                  <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`transition-transform ${xaiOpen ? 'rotate-90' : ''}`}><path d="M3 2L7 5L3 8" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/></svg>
                </button>
                {xaiOpen && (
                  <div className="space-y-1.5 fade-in">
                    {EXPLAINABILITY_FACTORS.map((f, i) => (
                      <ConfidenceBar key={i} label={f.label} value={f.weight} color={f.color} />
                    ))}
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-2 pt-1">
                  <button className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#E5484D] text-white text-xs font-semibold hover:bg-[#D43840] transition-colors">
                    Notify Bank (HDFC)
                  </button>
                  <div className="grid grid-cols-2 gap-2">
                    <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#0F172A] hover:bg-[#F7F8FA] transition-colors">
                      Notify LEA
                    </button>
                    <button className="flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-[#14B8A6] text-white text-xs font-semibold hover:bg-[#0F9E8E] transition-colors">
                      Acknowledge
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Prediction Evolution Chart */}
          {predStage > 0 && (
            <Card className="p-4 fade-in">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Prediction Evolution</div>
                <PrototypeBadge />
              </div>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={evolutionChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: '#94A3B8' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: '#94A3B8' }} />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, 'Confidence']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid #E2E8F0' }}
                  />
                  <Line type="monotone" dataKey="confidence" stroke="#7C5CFC" strokeWidth={2} dot={{ r: 4, fill: '#7C5CFC' }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>

        {/* ── Right: Transaction Trail + Accounts + Outcome ── */}
        <div className="col-span-4 space-y-4">

          {/* Transaction Trail */}
          <Card className="p-4">
            <div className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-4">Transaction Trail</div>
            <div className="space-y-0">
              {DEMO_CASE_HOPS.map((hop, i) => (
                <div key={i}>
                  {/* From */}
                  <div className={`flex items-center gap-2.5 py-2 ${hop.isPredicted ? 'opacity-60' : ''}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0 ${
                      hop.riskLevel === 'critical' ? 'bg-red-50 text-[#E5484D]' :
                      hop.riskLevel === 'high'     ? 'bg-orange-50 text-[#F97316]' :
                      hop.riskLevel === 'medium'   ? 'bg-amber-50 text-[#F59E0B]' :
                                                     'bg-teal-50 text-[#14B8A6]'
                    }`}>
                      {hop.fromLabel.split(' ')[0].slice(0, 3).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold text-[#0F172A]">{hop.fromLabel}</div>
                      <div className="text-[10px] font-mono text-[#94A3B8]">{hop.fromBank} · {hop.fromAccount}</div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className={`flex items-center gap-2 pl-3.5 ${hop.isPredicted ? 'opacity-60' : ''}`}>
                    <div className="w-px h-4 bg-[#E2E8F0] ml-3" />
                    <div className="flex items-center gap-2 ml-1">
                      <span className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white ${
                        hop.riskLevel === 'critical' ? 'bg-[#E5484D]' :
                        hop.riskLevel === 'high'     ? 'bg-[#F97316]' : 'bg-[#F59E0B]'
                      }`}>{hop.amount}</span>
                      <span className="text-[9px] font-mono text-[#94A3B8]">{hop.timestamp}</span>
                      {hop.isPredicted && (
                        <span className="text-[9px] font-semibold text-[#7C5CFC] border border-[#7C5CFC]/30 px-1 rounded">PREDICTED</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {/* Final destination */}
              <div className="flex items-center gap-2.5 py-2 opacity-60">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-50 text-[9px] font-bold text-[#E5484D] flex-shrink-0">
                  ATM
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-semibold text-[#E5484D]">Gurugram ATM Cluster</div>
                  <div className="text-[10px] text-[#94A3B8]">Predicted cash-out zone</div>
                </div>
              </div>
            </div>
          </Card>

          {/* Linked Accounts */}
          <Card className="p-4">
            <div className="flex items-center justify-between mb-3">
              <div className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Linked Accounts</div>
              <span className="text-[10px] text-[#14B8A6] font-medium">{DEMO_CASE_ACCOUNTS.length} total</span>
            </div>
            <div className="space-y-2">
              {DEMO_CASE_ACCOUNTS.map(a => (
                <div
                  key={a.accountId}
                  className="flex items-center gap-2.5 p-2.5 rounded-xl border border-[#E2E8F0] hover:border-[#14B8A6]/30 cursor-pointer transition-colors"
                >
                  <div className="w-7 h-7 rounded-lg bg-[#F7F8FA] flex items-center justify-center flex-shrink-0">
                    <svg width="13" height="13" viewBox="0 0 14 14" fill="none"><rect x="1.5" y="4" width="11" height="7.5" rx="1.5" stroke="#64748B" strokeWidth="1.2"/><path d="M4 4V3C4 2.17 4.67 1.5 5.5 1.5H8.5C9.33 1.5 10 2.17 10 3V4" stroke="#64748B" strokeWidth="1.2"/></svg>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-mono font-bold text-[#0F172A]">{a.accountId}</span>
                      {a.isPersistentRisk && (
                        <span className="text-[9px] font-bold text-[#E5484D] bg-red-50 border border-red-200 px-1 rounded">PERSISTENT RISK</span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#94A3B8]">{a.bank} · {a.type}</div>
                  </div>
                  <RiskBadge level={a.riskLevel} />
                </div>
              ))}
            </div>
          </Card>

          {/* Outcome Feedback */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-xs font-semibold text-[#64748B] uppercase tracking-wide flex-1">Record Outcome</div>
              <FeatureTag type="usp" />
            </div>
            {!outcomeSubmitted ? (
              <>
                <div className="space-y-1.5 mb-3">
                  {OUTCOMES.map(o => (
                    <label
                      key={o.value}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                        selectedOutcome === o.value
                          ? 'border-[#14B8A6]/40 bg-[#F0FDFA]'
                          : 'border-[#E2E8F0] hover:border-[#14B8A6]/20'
                      }`}
                    >
                      <input
                        type="radio"
                        name="outcome"
                        value={o.value}
                        checked={selectedOutcome === o.value}
                        onChange={() => setSelectedOutcome(o.value)}
                        className="accent-[#14B8A6]"
                      />
                      <span className="text-xs font-medium text-[#0F172A]">{o.label}</span>
                    </label>
                  ))}
                </div>
                <button
                  onClick={handleOutcomeSubmit}
                  disabled={!selectedOutcome}
                  className="w-full py-2 text-xs font-semibold rounded-xl text-white transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #14B8A6, #0D9488)' }}
                >
                  Submit Outcome
                </button>
              </>
            ) : (
              <div className="py-4 text-center">
                <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-2">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="7" stroke="#10B981" strokeWidth="1.3"/>
                    <path d="M6 9L8 11L12 7" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-sm font-semibold text-[#0F172A] mb-1">Outcome Recorded</div>
                <div className="text-xs text-[#64748B]">This feedback will support future model recalibration.</div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Toast ── */}
      {toastVisible && (
        <div className="fixed bottom-6 right-6 bg-[#0F172A] text-white px-4 py-3 rounded-2xl shadow-xl text-xs font-medium flex items-center gap-2.5 fade-in z-50">
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <circle cx="7" cy="7" r="5.5" stroke="#10B981" strokeWidth="1.3"/>
            <path d="M5 7L6.5 8.5L9.5 5.5" stroke="#10B981" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Outcome recorded. This feedback will support future model recalibration.
        </div>
      )}
    </div>
  );
}
