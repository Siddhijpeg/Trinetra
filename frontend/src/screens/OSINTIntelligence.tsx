import React, { useState } from 'react';
import { Card, FeatureTag } from '../components/ui';
import { MOCK_OSINT_SIGNALS, EnhancedOsintSignal } from '../data/mockOsint';
import type { OsintVerification } from '../types';

const VERIFICATION_CONFIG: Record<OsintVerification, { label: string; cls: string }> = {
  'VERIFIED':            { label: 'VERIFIED',            cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  'PARTIALLY VERIFIED':  { label: 'PARTIAL',             cls: 'bg-amber-50 text-amber-700 border-amber-200' },
  'UNVERIFIED':          { label: 'UNVERIFIED',          cls: 'bg-[#F7F8FA] text-[#94A3B8] border-[#E2E8F0]' },
  'LIKELY MISLEADING':   { label: 'MISLEADING',          cls: 'bg-red-50 text-[#E5484D] border-red-200' },
};

export default function OSINTIntelligence() {
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedFilter, setSelectedFilter] = useState<string>('ALL');

  // Filter signals based on selection
  const filteredSignals = (MOCK_OSINT_SIGNALS as EnhancedOsintSignal[]).filter((signal) => {
    if (selectedFilter === 'VERIFIED') return signal.verification === 'VERIFIED';
    if (selectedFilter === 'PARTIAL') return signal.verification === 'PARTIALLY VERIFIED';
    if (selectedFilter === 'UNVERIFIED') return signal.verification === 'UNVERIFIED';
    return true;
  });

  return (
    <div className="p-7 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[24px] font-bold text-[#0F172A] leading-tight">OSINT Intelligence</h1>
            <FeatureTag type="usp" />
          </div>
          <p className="text-sm text-[#64748B]">
            Open-source signals supporting active investigations & validating prediction engine hotspots.
          </p>
        </div>
      </div>

      {/* Active Corroboration & Risk Fusion Banner (Replaced Prototype Warning) */}
      <div className="bg-emerald-50/70 border border-emerald-200/80 rounded-xl px-4 py-3 flex items-center justify-between text-xs text-emerald-900 shadow-sm">
        <div className="flex items-center gap-2.5">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-600"></span>
          </span>
          <div>
            <span className="font-bold">OSINT Active Corroboration Engine:</span>{' '}
            <span className="text-emerald-800">Cross-referencing web & social signals with spatial prediction model.</span>
          </div>
        </div>
        <span className="font-mono text-[10px] bg-emerald-100 text-emerald-800 px-2.5 py-1 rounded-md font-bold tracking-wide border border-emerald-300">
          RISK FUSION ENABLED
        </span>
      </div>

      {/* Signal feed container */}
      <Card className="overflow-hidden border-[#E2E8F0]">
        
        {/* Feed Header with Interactive Filters */}
        <div className="px-5 py-4 border-b border-[#F1F5F9] flex flex-wrap items-center justify-between gap-3 bg-slate-50/50">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setSelectedFilter('ALL')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                selectedFilter === 'ALL'
                  ? 'bg-[#0F172A] text-white shadow-sm'
                  : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
              }`}
            >
              All Signals ({MOCK_OSINT_SIGNALS.length})
            </button>
            <button
              onClick={() => setSelectedFilter('VERIFIED')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                selectedFilter === 'VERIFIED'
                  ? 'bg-emerald-700 text-white shadow-sm'
                  : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100 border border-emerald-200'
              }`}
            >
              Verified Only
            </button>
            <button
              onClick={() => setSelectedFilter('PARTIAL')}
              className={`px-3 py-1 rounded-md text-xs font-semibold transition-all ${
                selectedFilter === 'PARTIAL'
                  ? 'bg-amber-600 text-white shadow-sm'
                  : 'bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200'
              }`}
            >
              Partial
            </button>
          </div>
          <span className="text-xs text-[#94A3B8] font-mono">{filteredSignals.length} signals displayed · Updated 12 min ago</span>
        </div>

        {/* Signals List */}
        <div className="divide-y divide-[#F1F5F9]">
          {filteredSignals.map((signal) => {
            const verif = VERIFICATION_CONFIG[signal.verification];
            const isExpanded = expandedId === signal.signalId;
            return (
              <div key={signal.signalId} className="px-5 py-5 hover:bg-slate-50/40 transition-colors space-y-3">
                
                {/* Main Info Row */}
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-4 flex-1">
                    
                    {/* Credibility Score + Breakdown */}
                    <div className="flex flex-col items-center flex-shrink-0 group relative">
                      <div
                        className="text-lg font-bold font-mono px-2.5 py-1 rounded-lg border bg-slate-50 text-center min-w-[50px]"
                        style={{
                          borderColor: signal.credibilityScore >= 80 ? '#10B981' : signal.credibilityScore >= 60 ? '#F59E0B' : '#E5484D',
                          color: signal.credibilityScore >= 80 ? '#047857' : signal.credibilityScore >= 60 ? '#B45309' : '#E5484D',
                        }}
                      >
                        {signal.credibilityScore}
                      </div>
                      <div className="text-[9px] text-[#94A3B8] font-bold uppercase mt-0.5">Cred.</div>
                    </div>

                    {/* Content Section */}
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[9px] font-bold uppercase tracking-wide px-2 py-0.5 rounded border ${verif.cls}`}>
                          {verif.label}
                        </span>

                        <span className="text-xs text-[#7C5CFC] font-semibold">{signal.source}</span>
                        <span className="text-xs text-[#94A3B8]">· {signal.timestamp}</span>

                        {/* Deduplication Cluster Badge */}
                        {signal.duplicateCount && signal.duplicateCount > 1 && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            {signal.duplicateCount} Duplicate Reports Merged
                          </span>
                        )}
                      </div>

                      <h3 className="text-sm text-[#0F172A] font-bold leading-snug">{signal.headline}</h3>
                      <div className="text-xs text-[#64748B]">{signal.location}</div>
                    </div>
                  </div>

                  {/* Right Action & Hotspot Correlation Link */}
                  <div className="flex flex-col items-end gap-2 flex-shrink-0">
                    {signal.validatesPredictionId && (
                      <span className="px-2 py-1 rounded-md bg-purple-50 border border-purple-200 text-purple-700 text-[11px] font-bold flex items-center gap-1 shadow-2xs">
                        <span className="w-1.5 h-1.5 rounded-full bg-purple-600 animate-pulse"></span>
                        Validates #{signal.validatesPredictionId}
                      </span>
                    )}
                    
                    {signal.sourceUrl && (
                      <a
                        href={signal.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-blue-600 hover:text-blue-800 hover:underline font-semibold flex items-center gap-1"
                      >
                        Source Link ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* Extracted Entities Badges */}
                {signal.extractedEntities && (
                  <div className="flex items-center gap-2 flex-wrap pt-2 border-t border-slate-100">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Extracted Entities:</span>
                    {signal.extractedEntities.modusOperandi && (
                      <span className="px-2 py-0.5 rounded text-[10px] bg-slate-100 font-mono text-slate-700 font-medium">
                        MO: {signal.extractedEntities.modusOperandi}
                      </span>
                    )}
                    {signal.extractedEntities.targetInstitutions?.map((inst, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-blue-50 text-blue-700 border border-blue-100 font-mono font-medium">
                        Target: {inst}
                      </span>
                    ))}
                    {signal.extractedEntities.identifiers?.map((id, i) => (
                      <span key={i} className="px-2 py-0.5 rounded text-[10px] bg-amber-50 text-amber-800 border border-amber-200 font-mono font-medium">
                        ID: {id}
                      </span>
                    ))}
                  </div>
                )}

                {/* Evidence Chain & Credibility Breakdown Expandable */}
                <div className="pt-1">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : signal.signalId)}
                    className="text-[11px] font-semibold text-[#14B8A6] hover:underline flex items-center gap-1"
                  >
                    {isExpanded ? '▲ Hide Provenance & Evidence Details' : '▼ Show Provenance & Credibility Breakdown'}
                  </button>

                  {isExpanded && (
                    <div className="mt-2.5 p-3 bg-slate-50/80 rounded-xl border border-slate-200 space-y-3">
                      
                      {/* Credibility Score Breakdown */}
                      {signal.credibilityBreakdown && (
                        <div>
                          <div className="text-[10px] font-bold uppercase text-slate-500 mb-1.5">Credibility Vector Breakdown</div>
                          <div className="grid grid-cols-3 gap-2">
                            <div className="p-2 bg-white rounded-lg border border-slate-200 text-center">
                              <div className="text-xs font-bold text-slate-800">{signal.credibilityBreakdown.sourceTrust}%</div>
                              <div className="text-[9px] text-slate-400">Source Trust</div>
                            </div>
                            <div className="p-2 bg-white rounded-lg border border-slate-200 text-center">
                              <div className="text-xs font-bold text-slate-800">{signal.credibilityBreakdown.eventCorroboration}%</div>
                              <div className="text-[9px] text-slate-400">Corroboration</div>
                            </div>
                            <div className="p-2 bg-white rounded-lg border border-slate-200 text-center">
                              <div className="text-xs font-bold text-slate-800">{signal.credibilityBreakdown.freshness}%</div>
                              <div className="text-[9px] text-slate-400">Freshness</div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Evidence Chain Items */}
                      {signal.evidenceChain && (
                        <div>
                          <div className="text-[10px] font-bold uppercase text-slate-500 mb-1">Evidence Chain</div>
                          <div className="space-y-1">
                            {signal.evidenceChain.map((e, i) => (
                              <div key={i} className="flex items-start gap-2 text-xs text-[#64748B]">
                                <span className="text-[#14B8A6] flex-shrink-0 font-bold">•</span>
                                <span>{e}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      </Card>
    </div>
  );
}
