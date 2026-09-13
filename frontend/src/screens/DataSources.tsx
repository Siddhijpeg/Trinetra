import React from 'react';
import { Card, StatusDot, Button, FeatureTag, SectionLabel } from '../components/ui';

type SourceStatus = 'connected' | 'limited';

type Source = {
  name: string;
  desc: string;
  status: SourceStatus;
  lastSync: string;
  records: string;
  classification: 'Sensitive' | 'Restricted' | 'Public' | 'Monitored';
  icon: string;
};

const categories: { label: string; type: 'sih' | 'usp' | 'neutral'; sources: Source[] }[] = [
  {
    label: 'Core Investigation Data',
    type: 'sih',
    sources: [
      { name: 'NCRP Case Data', desc: 'National Cybercrime Reporting Portal — complaint and case records', status: 'connected', lastSync: '1 min ago', records: '8,42,918 cases', classification: 'Sensitive', icon: '⚖️' },
      { name: 'Bank Alert API', desc: 'Multi-bank suspicious transaction alert feed', status: 'connected', lastSync: '2 min ago', records: '12,847 alerts', classification: 'Restricted', icon: '🏦' },
    ],
  },
  {
    label: 'Financial & Transaction Inputs',
    type: 'sih',
    sources: [
      { name: 'Financial Transaction Feed', desc: 'RBI & NPCI real-time transaction data stream', status: 'connected', lastSync: '30 sec ago', records: '2.4M/day', classification: 'Restricted', icon: '💳' },
      { name: 'Historical Fraud Dataset', desc: 'Archived fraud case patterns and outcomes', status: 'connected', lastSync: '12h ago', records: '48,40,000 records', classification: 'Restricted', icon: '📊' },
    ],
  },
  {
    label: 'Geographic & Infrastructure',
    type: 'sih',
    sources: [
      { name: 'GIS / ATM Database', desc: 'National ATM location, density, and transaction data', status: 'connected', lastSync: '5 min ago', records: '2,38,400 ATMs', classification: 'Public', icon: '🗺️' },
    ],
  },
  {
    label: 'Public Intelligence / OSINT',
    type: 'usp',
    sources: [
      { name: 'OSINT News Feeds', desc: 'Verified news outlets and investigative publications', status: 'connected', lastSync: '8 min ago', records: '18,920 signals', classification: 'Public', icon: '📰' },
      { name: 'Public Web Sources', desc: 'Web crawler and publicly available intelligence', status: 'connected', lastSync: '15 min ago', records: '4,218 signals', classification: 'Public', icon: '🌐' },
      { name: 'Approved Social Signals', desc: 'Authorised and filtered social media monitoring', status: 'limited', lastSync: '1h ago', records: '742 signals', classification: 'Monitored', icon: '📱' },
    ],
  },
];

const classColors: Record<string, string> = {
  'Sensitive': 'bg-red-50 text-red-600 border-red-200',
  'Restricted': 'bg-amber-50 text-amber-600 border-amber-200',
  'Public': 'bg-emerald-50 text-emerald-600 border-emerald-200',
  'Monitored': 'bg-blue-50 text-blue-600 border-blue-200',
};

export default function DataSources() {
  return (
    <div className="p-7 space-y-7">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-bold text-[#0F172A] leading-tight mb-1.5">Connected Intelligence Sources</h1>
          <p className="text-sm text-[#64748B] leading-relaxed max-w-lg">
            Real-time status of all data feeds powering TRINETRA's predictive and intelligence capabilities.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">Add Source</Button>
          <Button variant="primary" size="sm">Manage Sources</Button>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Connected Sources', value: '7', sub: '1 limited access', color: '#14B8A6' },
          { label: 'Total Records', value: '51M+', sub: 'Across all feeds', color: '#7C5CFC' },
          { label: 'Live Streams', value: '4', sub: 'Real-time ingestion', color: '#F59E0B' },
          { label: 'Data Health', value: '96.8%', sub: 'Completeness score', color: '#10B981' },
        ].map(s => (
          <Card key={s.label} className="p-5">
            <div className="text-[28px] font-bold mb-1" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs font-semibold text-[#0F172A]">{s.label}</div>
            <div className="text-[10px] text-[#94A3B8] mt-0.5">{s.sub}</div>
          </Card>
        ))}
      </div>

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
                        source.status === 'connected' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-amber-50 border-amber-200 text-amber-700'
                      }`}>
                        <StatusDot status={source.status}/>
                        {source.status === 'connected' ? 'CONNECTED' : 'LIMITED'}
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-3 pt-3 border-t border-[#F1F5F9]">
                      <div>
                        <div className="text-[9px] text-[#94A3B8] uppercase font-semibold tracking-wide">Last Sync</div>
                        <div className="text-xs font-mono text-[#0F172A] mt-0.5">{source.lastSync}</div>
                      </div>
                      <div>
                        <div className="text-[9px] text-[#94A3B8] uppercase font-semibold tracking-wide">Records</div>
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
