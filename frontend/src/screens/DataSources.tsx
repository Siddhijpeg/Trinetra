import React from 'react';
import { Card, StatusDot, Button, FeatureTag, SectionLabel } from '../components/ui';

type SourceStatus = 'connected' | 'prototype' | 'planned';

type Source = {
  name: string;
  desc: string;
  status: SourceStatus;
  lastSync: string;
  records: string;
  classification: 'Sensitive' | 'Restricted' | 'Public' | 'Prototype';
  icon: string;
};

const categories: { label: string; type: 'sih' | 'usp' | 'neutral'; sources: Source[] }[] = [
  {
    label: 'Canonical Event Architecture (Schema-First)',
    type: 'sih',
    sources: [
      { name: 'Synthetic Dataset Adapter', desc: 'Official 40,000-case synthetic dataset converted via SyntheticAdapter to canonical schema', status: 'connected', lastSync: 'Real-time', records: '40,000 cases', classification: 'Prototype', icon: '⚡' },
      { name: 'As-Of-Time Event Store', desc: 'In-memory temporal event store enforcing non-negotiable temporal visibility rules', status: 'connected', lastSync: 'Real-time', records: 'Canonical Stream', classification: 'Restricted', icon: '⌛' },
    ],
  },
  {
    label: 'Planned Future Bank & Rail Connectors',
    type: 'sih',
    sources: [
      { name: 'Core Banking API Connector', desc: 'Direct connection to financial institution transfer feeds and account registries', status: 'planned', lastSync: 'Not Connected', records: '0 records', classification: 'Restricted', icon: '🏦' },
      { name: 'Payment Rail Feed (UPI/IMPS)', desc: 'Real-time transaction event stream from central payment rails', status: 'planned', lastSync: 'Not Connected', records: '0 records', classification: 'Restricted', icon: '💳' },
      { name: 'NCRP / I4C Portal Feed', desc: 'Official incident report ingestion connector from national cybercrime portal', status: 'planned', lastSync: 'Not Connected', records: '0 records', classification: 'Sensitive', icon: '⚖️' },
    ],
  },
  {
    label: 'Geographic & Intelligence Sources',
    type: 'usp',
    sources: [
      { name: 'Frozen M8 Zone Registry', desc: 'Reliability-aware geographic registry (zones.csv & accounts.csv)', status: 'connected', lastSync: 'Static Frozen', records: '20 Indian Zones', classification: 'Public', icon: '🗺️' },
      { name: 'OSINT Intelligence Monitor', desc: 'Open-source news & community feed corroboration prototype', status: 'prototype', lastSync: '12 min ago', records: '7 Signals', classification: 'Public', icon: '📰' },
    ],
  },
];

const classColors: Record<string, string> = {
  'Sensitive': 'bg-red-50 text-red-600 border-red-200',
  'Restricted': 'bg-amber-50 text-amber-600 border-amber-200',
  'Public': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'Prototype': 'bg-purple-50 text-purple-700 border-purple-200',
};

export default function DataSources() {
  return (
    <div className="p-7 space-y-7">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-[26px] font-bold text-[#0F172A] leading-tight">Data Sources & Adapter Architecture</h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm text-[#64748B] leading-relaxed max-w-xl">
            Schema-first pipeline architecture: External Source → Source Adapter → Canonical Events → As-Of Event Store → Prediction Context.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">Pipeline Config</Button>
          <Button variant="primary" size="sm">View Schemas</Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Prototype Feeds', value: '3 Active', sub: 'Synthetic + Event Store + M8', color: '#14B8A6' },
          { label: 'Canonical Records', value: '40,000+', sub: 'Parsed into canonical schema', color: '#7C5CFC' },
          { label: 'Planned Connectors', value: '3 Feeds', sub: 'Banks, UPI, NCRP', color: '#F59E0B' },
          { label: 'Temporal Guarantee', value: 'Strict AS-OF', sub: 'No future leaks', color: '#10B981' },
        ].map(s => (
          <Card key={s.label} className="p-5">
            <div className="text-[26px] font-bold mb-1" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs font-semibold text-[#0F172A]">{s.label}</div>
            <div className="text-[10px] text-[#94A3B8] mt-0.5">{s.sub}</div>
          </Card>
        ))}
      </div>

      {/* Pipeline Diagram Card */}
      <Card className="p-5 bg-gradient-to-r from-[#0F172A] to-[#1E293B] text-white">
        <div className="text-xs font-bold text-[#14B8A6] uppercase tracking-widest mb-3">Schema-First Data Pipeline Visualizer</div>
        <div className="flex items-center justify-between text-center gap-2">
          {[
            { step: '1. External Feed', detail: 'Synthetic / Bank Feed' },
            { step: '2. Source Adapter', detail: 'SyntheticAdapter' },
            { step: '3. Canonical Events', detail: 'TransactionEvent / Complaint' },
            { step: '4. As-Of Store', detail: 'Temporal Filtering' },
            { step: '5. Prediction Engines', detail: 'Geographic M8 + Timing' },
          ].map((item, i) => (
            <React.Fragment key={i}>
              <div className="p-3 bg-white/5 rounded-xl border border-white/10 flex-1">
                <div className="text-xs font-bold text-white mb-0.5">{item.step}</div>
                <div className="text-[10px] text-white/60 font-mono">{item.detail}</div>
              </div>
              {i < 4 && <span className="text-white/40 font-bold">→</span>}
            </React.Fragment>
          ))}
        </div>
      </Card>

      {/* Categorized sources */}
      {categories.map(cat => (
        <section key={cat.label}>
          <SectionLabel type={cat.type}>{cat.label}</SectionLabel>
          <div className="grid grid-cols-2 gap-4">
            {cat.sources.map(source => (
              <Card key={source.name} className="p-5">
                <div className="flex items-start gap-4">
                  <div className="w-10 h-10 rounded-xl bg-[#F7F8FA] border border-[#E2E8F0] flex items-center justify-center text-xl flex-shrink-0">
                    {source.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <div className="font-semibold text-[#0F172A] text-sm">{source.name}</div>
                        <div className="text-xs text-[#64748B] mt-0.5 leading-relaxed">{source.desc}</div>
                      </div>
                      <div className={`flex items-center gap-1.5 px-2 py-1 rounded-lg border text-[10px] font-bold flex-shrink-0 ${
                        source.status === 'connected' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                        source.status === 'prototype' ? 'bg-purple-50 border-purple-200 text-purple-700' :
                        'bg-slate-100 border-slate-200 text-slate-500'
                      }`}>
                        <StatusDot status={source.status === 'connected' ? 'connected' : 'limited'} />
                        {source.status === 'connected' ? 'CONNECTED' : source.status === 'prototype' ? 'PROTOTYPE' : 'PLANNED'}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#F1F5F9]">
                      <div>
                        <div className="text-[9px] text-[#94A3B8] uppercase font-semibold tracking-wide">Last Sync</div>
                        <div className="text-xs font-mono text-[#0F172A] mt-0.5">{source.lastSync}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-[#94A3B8] uppercase font-semibold tracking-wide">Volume</div>
                        <div className="text-xs font-mono text-[#0F172A] mt-0.5">{source.records}</div>
                      </div>
                      <div className="ml-auto">
                        <span className={`text-[9px] font-bold px-2 py-1 rounded-lg border ${classColors[source.classification]}`}>
                          {source.classification.toUpperCase()}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

