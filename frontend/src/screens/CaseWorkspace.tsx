// ─── Case Workspace ───────────────────────────────────────────────────────────
// Displays the active V2 case — transaction trail, timeline, prediction
// evolution and decision support.
//
// All case data comes from CaseContext.activeCase (V2 backend detail).
// Prediction data comes from CaseContext.getActivePrediction().
// No hardcoded NCRP fixtures. No DEMO_CASE_* imports.

import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, ResponsiveContainer, Tooltip } from 'recharts';
import {
  Card, RiskBadge, Button, SparkleIcon, FeatureTag,
  PrototypeBadge, ConfidenceBar, TimelineEvent,
} from '../components/ui';
import { useCaseContext, priorityColor, priorityRiskLevel } from '../context/CaseContext';
import type { V2Hop } from '../context/CaseContext';
import type { OutcomeType } from '../types';

// ── Formatting helpers ─────────────────────────────────────────────────────────

function formatAmount(inr: number): string {
  if (inr >= 10_000_000) return `₹${(inr / 10_000_000).toFixed(1)} Cr`;
  if (inr >= 100_000)    return `₹${(inr / 100_000).toFixed(1)}L`;
  if (inr >= 1_000)      return `₹${(inr / 1_000).toFixed(0)}K`;
  return `₹${inr.toFixed(0)}`;
}

function shortTime(ts: string): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return ts.slice(11, 16);
  }
}

function shortDate(ts: string): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return ts.slice(0, 16);
  }
}

// ── Outcome options ────────────────────────────────────────────────────────────
const OUTCOMES: { value: OutcomeType; label: string }[] = [
  { value: 'funds-frozen',    label: 'Funds Frozen'     },
  { value: 'funds-recovered', label: 'Funds Recovered'  },
  { value: 'false-alert',     label: 'False Alert'      },
  { value: 'no-action',       label: 'No Action Taken'  },
  { value: 'unknown',         label: 'Unknown'          },
];

// ── Component ─────────────────────────────────────────────────────────────────

export default function CaseWorkspace({ onBack }: { onBack?: () => void }) {
  const {
    activeCaseId, activeCase, activeCaseLoading, activeCaseError,
    activeStage, setActiveStage,
    getActivePrediction, requestPrediction,
    predictionsLoading, predictionsError,
  } = useCaseContext();

  const [xaiOpen,            setXaiOpen]            = useState(false);
  const [selectedOutcome,    setSelectedOutcome]    = useState<OutcomeType | null>(null);
  const [outcomeSubmitted,   setOutcomeSubmitted]   = useState(false);
  const [toastVisible,       setToastVisible]       = useState(false);
  const [displayedStageIdx,  setDisplayedStageIdx] = useState(0);  // index into evidence_stages

  const pred     = getActivePrediction();
  const stages   = activeCase?.evidence_stages ?? [];
  const hops     = activeCase?.hops            ?? [];
  const complaint = activeCase?.complaint;

  // On new case load, advance display to latest stage
  useEffect(() => {
    if (stages.length > 0) {
      setDisplayedStageIdx(stages.length - 1);
    }
  }, [activeCase?.case_id]);

  // When stage display changes, request that stage's prediction
  useEffect(() => {
    const st = stages[displayedStageIdx];
    if (st && activeCaseId) {
      setActiveStage(st.stage);
    }
  }, [displayedStageIdx]);

  const predLoading = activeCaseId
    ? (predictionsLoading[`${activeCaseId}:${activeStage}`] || predictionsLoading[`${activeCaseId}:-1`] || false)
    : false;
  const predError = activeCaseId
    ? (predictionsError[`${activeCaseId}:${activeStage}`] || predictionsError[`${activeCaseId}:-1`] || null)
    : null;

  // Decision data
  const dec  = pred?.decision;
  const geo  = pred?.geographic;
  const tim  = pred?.timing;
  const dist = tim?.intervention_distribution;
  const fin  = pred?.financial_exposure;

  const decisionLabel    = dec?.decision ?? null;
  const decisionConfPct  = Math.round((dec?.decision_confidence ?? 0) * 100);
  const decisionColor    = decisionLabel ? priorityColor(decisionLabel) : '#94A3B8';
  const reasons          = dec?.reasons ?? [];
  const topZoneStr       = geo?.ranked_zones?.[0]
    ? `${geo.ranked_zones[0].district || geo.ranked_zones[0].zone_name} (${geo.ranked_zones[0].zone_id})`
    : geo?.predicted_destination_zone ?? '—';

  const p25 = dist?.p25_minutes != null ? Math.round(dist.p25_minutes) : null;
  const p50 = dist?.p50_minutes != null ? Math.round(dist.p50_minutes) : null;
  const p75 = dist?.p75_minutes != null ? Math.round(dist.p75_minutes) : null;

  // Chart: confidence over stages (from prediction_history if available)
  const predHistory = geo?.prediction_history ?? [];
  const evolutionChartData = predHistory.map(h => ({
    label:      h.stage === 'T0_prior' ? 'Prior' : h.stage,
    confidence: Math.round(h.confidence ?? 0),
  }));
  if (evolutionChartData.length === 0 && pred) {
    evolutionChartData.push({
      label:      'Latest',
      confidence: Math.round(geo?.confidence_score ?? 0),
    });
  }

  // Outcome submission
  const handleOutcomeSubmit = () => {
    if (!selectedOutcome) return;
    setOutcomeSubmitted(true);
    setToastVisible(true);
    setTimeout(() => setToastVisible(false), 3500);
  };

  // ── Loading / error / no-case states ─────────────────────────────────────────
  if (!activeCaseId) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center space-y-2">
          <div className="text-sm font-semibold" style={{ color: 'var(--text-secondary)' }}>
            No case selected
          </div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            Open a case from the Cases table to view its workspace.
          </div>
        </div>
      </div>
    );
  }

  if (activeCaseLoading) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-sm animate-pulse" style={{ color: 'var(--text-muted)' }}>
          Loading case {activeCaseId}…
        </div>
      </div>
    );
  }

  if (activeCaseError || !activeCase) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="text-center space-y-2">
          <div className="text-sm font-semibold text-[#E5484D]">Case data unavailable</div>
          <div className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {activeCaseError || 'Could not load case detail from backend.'}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-5">

      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <button onClick={onBack}
            className="text-xs flex items-center gap-1 font-medium transition-colors"
            style={{ color: 'var(--text-secondary)' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Cases
          </button>
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M4 2L8 6L4 10" stroke="#CBD5E1" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
            {activeCaseId}
          </span>
        </div>

        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <h1 className="text-[24px] font-bold" style={{ color: 'var(--text-primary)' }}>
                Case {activeCaseId}
              </h1>
              {decisionLabel && (
                <RiskBadge level={priorityRiskLevel(decisionLabel)} />
              )}
              <FeatureTag type="sih" />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
              {complaint?.typology_name ?? complaint?.typology_id ?? '—'}
              {complaint?.amount_inr ? ` · ${formatAmount(complaint.amount_inr)}` : ''}
              {complaint?.victim_district ? ` · Reported from ${complaint.victim_district}, ${complaint.victim_state}` : ''}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm">Generate Report</Button>
            <Button variant="secondary" size="sm">Create Alert</Button>
            <Button variant="primary" size="sm">Share with Bank</Button>
          </div>
        </div>
      </div>

      {/* ── Main Layout ───────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-12 gap-5">

        {/* ── LEFT: Case details + Timeline ─────────────────────────────────── */}
        <div className="col-span-3 space-y-4">

          {/* Case snapshot */}
          <Card className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide mb-3"
              style={{ color: 'var(--text-secondary)' }}>Case Details</div>
            <div className="space-y-2">
              {[
                { label: 'Complaint ID',   value: activeCaseId },
                { label: 'Typology',       value: complaint?.typology_name ?? '—' },
                { label: 'Incident Time',  value: complaint?.incident_timestamp ? shortDate(complaint.incident_timestamp) : '—' },
                { label: 'Victim',         value: complaint ? `${complaint.victim_district}, ${complaint.victim_state}` : '—' },
                { label: 'Amount',         value: complaint?.amount_inr ? formatAmount(complaint.amount_inr) : '—' },
                { label: 'Observed Hops',  value: String(hops.length) },
              ].map(r => (
                <div key={r.label} className="flex items-start justify-between gap-2">
                  <span className="text-xs flex-shrink-0" style={{ color: 'var(--text-muted)' }}>{r.label}</span>
                  <span className="text-xs font-semibold text-right font-mono" style={{ color: 'var(--text-primary)' }}>
                    {r.value}
                  </span>
                </div>
              ))}
            </div>

            {/* Predicted zone from V2 prediction */}
            {pred && (
              <div className="mt-3 pt-3 border-t" style={{ borderColor: 'var(--border-subtle)' }}>
                <div className="text-xs mb-1" style={{ color: 'var(--text-muted)' }}>
                  Predicted Cash-Out Zone
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0 pulse-dot"
                    style={{ backgroundColor: decisionColor }} />
                  <span className="text-xs font-bold" style={{ color: decisionColor }}>
                    {topZoneStr}
                  </span>
                </div>
                {p50 !== null && (
                  <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Median intervention window: ~{p50} min
                  </div>
                )}
              </div>
            )}
          </Card>

          {/* Evidence stage selector */}
          {stages.length > 0 && (
            <Card className="p-4">
              <div className="text-xs font-semibold uppercase tracking-wide mb-3"
                style={{ color: 'var(--text-secondary)' }}>Evidence Stages</div>
              <div className="space-y-1">
                {stages.map((st, i) => {
                  const isActive = i === displayedStageIdx;
                  return (
                    <button key={st.stage}
                      onClick={() => setDisplayedStageIdx(i)}
                      className="w-full flex items-start gap-2 px-2.5 py-2 rounded-lg text-left transition-all"
                      style={isActive
                        ? { backgroundColor: 'rgba(20,184,166,0.1)', border: '1px solid rgba(20,184,166,0.25)' }
                        : { backgroundColor: 'transparent', border: '1px solid transparent' }
                      }>
                      <div className="mt-0.5 w-3 h-3 rounded-full flex-shrink-0 border-2 flex items-center justify-center"
                        style={isActive
                          ? { borderColor: '#14B8A6', backgroundColor: '#14B8A6' }
                          : { borderColor: 'var(--border-strong)', backgroundColor: 'transparent' }
                        }>
                        {isActive && <div className="w-1 h-1 rounded-full bg-white" />}
                      </div>
                      <div>
                        <div className="text-xs font-semibold leading-tight"
                          style={{ color: isActive ? '#14B8A6' : 'var(--text-primary)' }}>
                          {st.label}
                        </div>
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          {st.evidence_summary}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Case timeline derived from V2 timestamps */}
          <Card className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide mb-3"
              style={{ color: 'var(--text-secondary)' }}>Case Timeline</div>
            <div className="space-y-0">
              {[
                complaint ? {
                  time: shortTime(complaint.incident_timestamp),
                  label: 'Incident occurred',
                  desc: `Victim in ${complaint.victim_district}`,
                } : null,
                complaint ? {
                  time: shortTime(complaint.complaint_timestamp),
                  label: 'Complaint filed',
                  desc: `${complaint.typology_name ?? complaint.typology_id}`,
                  isHighlight: true,
                } : null,
                ...hops.map((h, i) => ({
                  time:  shortTime(h.event_timestamp),
                  label: `Hop ${h.hop_sequence} observed`,
                  desc:  `${h.from_account} → ${h.to_account}  ·  ${formatAmount(h.amount_transferred)}${h.bank_channel ? '  ·  ' + h.bank_channel : ''}`,
                })),
                pred ? {
                  time: '—',
                  label: 'TRINETRA prediction',
                  desc: `${topZoneStr} · ${Math.round(geo?.confidence_score ?? 0)}% confidence`,
                  isHighlight: true,
                  isLast: true,
                } : null,
              ].filter(Boolean).map((entry: any, i, arr) => (
                <TimelineEvent
                  key={i}
                  time={entry.time}
                  label={entry.label}
                  desc={entry.desc}
                  isHighlight={entry.isHighlight}
                  isLast={i === arr.length - 1}
                />
              ))}
            </div>
          </Card>
        </div>

        {/* ── CENTRE: Prediction evolution ────────────────────────────────────── */}
        <div className="col-span-5 space-y-4">

          {/* Prediction card */}
          <div className="rounded-2xl border overflow-hidden shadow-sm"
            style={{ borderColor: 'rgba(124,92,252,0.2)' }}>
            <div className="ai-gradient px-5 py-4 flex items-center gap-3">
              <SparkleIcon size={16} />
              <div>
                <div className="text-white font-bold text-sm">Live Prediction</div>
                <div className="text-white/65 text-[11px]">
                  {stages[displayedStageIdx]?.evidence_summary ?? 'V2 Evidence'}
                </div>
              </div>
              <div className="ml-auto">
                <FeatureTag type="usp" />
              </div>
            </div>

            <div className="p-5 bg-gradient-to-br from-[#7C5CFC]/5 to-[#4338CA]/3">
              {predLoading && (
                <div className="py-6 text-center text-sm animate-pulse"
                  style={{ color: 'var(--text-muted)' }}>
                  Running V2 prediction pipeline…
                </div>
              )}
              {predError && !predLoading && (
                <div className="py-4 text-center text-xs rounded-xl border"
                  style={{ color: '#E5484D', backgroundColor: 'var(--risk-critical-bg)', borderColor: 'var(--risk-critical-border)' }}>
                  Prediction temporarily unavailable — {predError}
                </div>
              )}
              {pred && !predLoading && (
                <>
                  {/* WHERE */}
                  <div className="mb-4">
                    <div className="text-[10px] font-bold uppercase tracking-wide mb-1"
                      style={{ color: 'var(--text-muted)' }}>WHERE</div>
                    <div className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                      {topZoneStr}
                    </div>
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      M8 confidence: {Math.round(geo?.confidence_score ?? 0)}%
                    </div>
                  </div>

                  {/* Top-3 zone probabilities */}
                  {(geo?.ranked_zones ?? []).slice(0, 3).length > 0 && (
                    <div className="space-y-2 mb-4">
                      <div className="text-[10px] font-semibold uppercase"
                        style={{ color: 'var(--text-muted)' }}>Zone Probabilities</div>
                      {(geo!.ranked_zones!).slice(0, 3).map((rz, i) => {
                        const probPct = Math.round(rz.probability * 100);
                        return (
                          <div key={rz.zone_id} className="flex items-center gap-2">
                            <div className="text-xs w-44 truncate"
                              style={{ color: 'var(--text-secondary)' }}>
                              {rz.district || rz.zone_name}
                            </div>
                            <div className="flex-1 h-1.5 rounded-full overflow-hidden"
                              style={{ backgroundColor: 'var(--border-subtle)' }}>
                              <div className="h-full rounded-full transition-all duration-500"
                                style={{
                                  width: `${probPct}%`,
                                  background: probPct >= 10 ? '#E5484D' : probPct >= 5 ? '#F97316' : '#14B8A6',
                                }} />
                            </div>
                            <span className="text-xs font-mono font-bold w-10 text-right"
                              style={{ color: 'var(--text-primary)' }}>
                              {probPct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* WHEN */}
                  {p50 !== null && (
                    <div className="mb-4 p-3 rounded-xl border"
                      style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)' }}>
                      <div className="text-[10px] font-bold uppercase mb-1"
                        style={{ color: 'var(--text-muted)' }}>WHEN — Estimated Intervention Window</div>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold font-mono text-purple-600">~{p50} min</span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          P50 median
                        </span>
                      </div>
                      {p25 !== null && p75 !== null && (
                        <div className="text-[10px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
                          P25–P75: {p25}–{p75} min
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* DECISION */}
              {dec && !predLoading && (
                <div className="rounded-xl border p-3.5"
                  style={{ backgroundColor: `${decisionColor}08`, borderColor: `${decisionColor}30` }}>
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: decisionColor }} />
                    <span className="text-xs font-bold uppercase" style={{ color: decisionColor }}>
                      {decisionLabel}
                    </span>
                    <span className="text-[10px] ml-auto font-mono" style={{ color: 'var(--text-muted)' }}>
                      {decisionConfPct}% confidence
                    </span>
                  </div>
                  {reasons.slice(0, 3).map((r, i) => (
                    <div key={i} className="flex items-start gap-2 mb-1.5">
                      <div className="w-4 h-4 rounded text-[9px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5"
                        style={{ backgroundColor: 'var(--surface)', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
                        {i + 1}
                      </div>
                      <p className="text-[11px] leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{r}</p>
                    </div>
                  ))}
                  {/* XAI toggle */}
                  <button onClick={() => setXaiOpen(v => !v)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-[#7C5CFC] hover:underline mt-2">
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                      <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2"/>
                      <path d="M6 3.5V6.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
                      <circle cx="6" cy="8.5" r="0.6" fill="currentColor"/>
                    </svg>
                    Why this decision?
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Prediction evolution chart */}
          {evolutionChartData.length > 1 && (
            <Card className="p-4 fade-in">
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: 'var(--text-secondary)' }}>Prediction Evolution</div>
              </div>
              <ResponsiveContainer width="100%" height={90}>
                <LineChart data={evolutionChartData} margin={{ top: 5, right: 5, left: -25, bottom: 0 }}>
                  <XAxis dataKey="label" tick={{ fontSize: 9, fill: 'var(--chart-axis-color)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--chart-axis-color)' }} />
                  <Tooltip
                    formatter={(v: number) => [`${v}%`, 'Confidence']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, backgroundColor: 'var(--chart-tooltip-bg)', color: 'var(--chart-tooltip-text)', border: '1px solid var(--border)' }}
                  />
                  <Line type="monotone" dataKey="confidence" stroke="#7C5CFC" strokeWidth={2} dot={{ r: 4, fill: '#7C5CFC' }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          )}
        </div>

        {/* ── RIGHT: Transaction trail + Outcome ──────────────────────────────── */}
        <div className="col-span-4 space-y-4">

          {/* Transaction trail from real V2 hops */}
          <Card className="p-4">
            <div className="text-xs font-semibold uppercase tracking-wide mb-4"
              style={{ color: 'var(--text-secondary)' }}>
              Transaction Trail — {hops.length} hop{hops.length !== 1 ? 's' : ''} observed
            </div>

            {hops.length === 0 && (
              <div className="text-xs text-center py-4" style={{ color: 'var(--text-muted)' }}>
                No transaction hops recorded for this case.
              </div>
            )}

            <div className="space-y-0">
              {hops.map((hop, i) => (
                <div key={hop.hop_id}>
                  {/* From */}
                  <div className="flex items-center gap-2.5 py-2">
                    <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0 bg-teal-50 text-[#14B8A6]">
                      {hop.hop_sequence === 1 ? 'VCT' : `H${hop.hop_sequence - 1}`}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold truncate"
                        style={{ color: 'var(--text-primary)' }}>
                        {hop.from_account}
                      </div>
                      <div className="text-[10px] font-mono truncate"
                        style={{ color: 'var(--text-muted)' }}>
                        {hop.institution ?? '—'}
                      </div>
                    </div>
                  </div>

                  {/* Arrow */}
                  <div className="flex items-center gap-2 pl-3.5">
                    <div className="w-px h-4 ml-3" style={{ backgroundColor: 'var(--border)' }} />
                    <div className="flex items-center gap-2 ml-1">
                      <span className="text-[9px] font-mono font-bold px-1.5 py-0.5 rounded text-white bg-[#14B8A6]">
                        {formatAmount(hop.amount_transferred)}
                      </span>
                      <span className="text-[9px] font-mono" style={{ color: 'var(--text-muted)' }}>
                        {shortTime(hop.event_timestamp)}
                      </span>
                      {hop.bank_channel && (
                        <span className="text-[9px] px-1 rounded border font-mono"
                          style={{ color: 'var(--text-muted)', borderColor: 'var(--border)' }}>
                          {hop.bank_channel}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* To (last hop → to account) */}
                  {i === hops.length - 1 && (
                    <div className="flex items-center gap-2.5 py-2">
                      <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[9px] font-bold flex-shrink-0 bg-orange-50 text-[#F97316]">
                        H{hop.hop_sequence}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-xs font-semibold truncate"
                          style={{ color: 'var(--text-primary)' }}>
                          {hop.to_account}
                        </div>
                        <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                          Latest observed
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              ))}

              {/* Predicted destination */}
              {pred && (
                <div className="flex items-center gap-2.5 py-2 opacity-70">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-red-50 text-[9px] font-bold text-[#E5484D] flex-shrink-0">
                    PRED
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-[#E5484D]">{topZoneStr}</div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      Predicted cash-out zone
                    </div>
                  </div>
                </div>
              )}
            </div>
          </Card>

          {/* Outcome Feedback */}
          <Card className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide flex-1"
                style={{ color: 'var(--text-secondary)' }}>Record Outcome</div>
              <FeatureTag type="usp" />
            </div>
            {!outcomeSubmitted ? (
              <>
                <div className="space-y-1.5 mb-3">
                  {OUTCOMES.map(o => (
                    <label key={o.value}
                      className="flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-all"
                      style={selectedOutcome === o.value
                        ? { borderColor: 'rgba(20,184,166,0.4)', backgroundColor: 'var(--surface-active)' }
                        : { borderColor: 'var(--border)', backgroundColor: 'transparent' }
                      }>
                      <input type="radio" name="outcome" value={o.value}
                        checked={selectedOutcome === o.value}
                        onChange={() => setSelectedOutcome(o.value)}
                        className="accent-[#14B8A6]" />
                      <span className="text-xs font-medium"
                        style={{ color: 'var(--text-primary)' }}>{o.label}</span>
                    </label>
                  ))}
                </div>
                <button onClick={handleOutcomeSubmit} disabled={!selectedOutcome}
                  className="w-full py-2 text-xs font-semibold rounded-xl text-white transition-all disabled:opacity-40"
                  style={{ background: 'linear-gradient(135deg, #14B8A6, #0D9488)' }}>
                  Submit Outcome
                </button>
              </>
            ) : (
              <div className="py-4 text-center">
                <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-2"
                  style={{ backgroundColor: 'rgba(16,185,129,0.1)' }}>
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <circle cx="9" cy="9" r="7" stroke="#10B981" strokeWidth="1.3"/>
                    <path d="M6 9L8 11L12 7" stroke="#10B981" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </div>
                <div className="text-sm font-semibold mb-1" style={{ color: 'var(--text-primary)' }}>
                  Outcome Recorded
                </div>
                <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  This feedback will support future model recalibration.
                </div>
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* ── Toast ─────────────────────────────────────────────────────────────── */}
      {toastVisible && (
        <div className="fixed bottom-6 right-6 px-4 py-3 rounded-2xl shadow-xl text-xs font-medium flex items-center gap-2.5 fade-in z-50"
          style={{ backgroundColor: 'var(--surface-elevated)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
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
