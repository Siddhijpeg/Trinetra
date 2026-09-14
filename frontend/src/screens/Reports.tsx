import React, { useState } from 'react';
import { Card, Button, FeatureTag, SectionLabel } from '../components/ui';

type ReportItem = { id: string; title: string; desc: string; icon: string; sections: string[]; isBadge?: string; isAI?: boolean };

const coreReports = [
  {
    id: 'case-brief',
    title: 'Case Intelligence Brief',
    desc: 'Comprehensive case summary with predictions, transaction trail, and recommended actions.',
    icon: '📋',
    sections: ['Case Summary', 'Transaction Trail', 'Risk Prediction', 'Intervention History'],
  },
  {
    id: 'cashout-prediction',
    title: 'Cash-Out Prediction Report',
    desc: 'Predictive zone analysis with confidence scores and time-window estimates.',
    icon: '🎯',
    sections: ['Prediction Summary', 'Zone Analysis', 'Confidence Breakdown'],
  },
  {
    id: 'hotspot',
    title: 'Hotspot Analysis Report',
    desc: 'Geospatial risk mapping with ATM cluster data and historical withdrawal patterns.',
    icon: '🗺️',
    sections: ['Zone Risk Map', 'ATM Clusters', 'Historical Comparison'],
  },
  {
    id: 'daily-brief',
    title: 'Daily Command Center Brief',
    desc: 'Executive overview of daily fraud intelligence, alerts issued, and outcomes.',
    icon: '📊',
    sections: ['KPI Overview', 'Critical Cases', 'Predictions', 'Outcomes'],
    isBadge: 'Daily',
  },
];

const uspReports = [
  {
    id: 'osint',
    title: 'OSINT Verification Report',
    desc: 'Open-source signal analysis with credibility scores and evidence corroboration chains.',
    icon: '🔍',
    sections: ['Signal Summary', 'Credibility Scores', 'Evidence Chain', 'Misinformation Flags'],
  },
  {
    id: 'fraud-network',
    title: 'Fraud Network Intelligence Report',
    desc: 'Entity relationship analysis across mule accounts, clusters, and cash-out infrastructure.',
    icon: '🕸️',
    sections: ['Network Overview', 'Entity Profiles', 'Risk Scores', 'Connection Map'],
  },
  {
    id: 'copilot-brief',
    title: 'AI Copilot Summary Brief',
    desc: 'AI-generated investigation brief with explainable model reasoning and source citations.',
    icon: '✨',
    sections: ['AI Summary', 'Evidence Sources', 'Model Explanation', 'Recommended Actions'],
    isAI: true,
  },
];

const recentReports = [
  { type: 'Case Intelligence Brief', ref: 'NCRP-26-81942', generated: '14:16 IST', status: 'Ready', size: '2.4 MB', isCore: true },
  { type: 'Fraud Network Report', ref: 'NCRP-26-81911', generated: '13:54 IST', status: 'Ready', size: '1.8 MB', isCore: false },
  { type: 'Daily Command Center Brief', ref: '9 Sep 2026', generated: '08:00 IST', status: 'Ready', size: '4.1 MB', isCore: true },
  { type: 'Hotspot Analysis', ref: 'Gurugram / Jaipur / Noida', generated: '12:00 IST', status: 'Ready', size: '3.2 MB', isCore: true },
  { type: 'OSINT Verification Report', ref: 'NCR Signal Cluster', generated: 'Yesterday', status: 'Archived', size: '1.1 MB', isCore: false },
];

function ReportCard({ r, isUSP }: { r: ReportItem; isUSP?: boolean }) {
  const [generating, setGenerating] = useState(false);
  return (
    <Card className="p-5 group cursor-pointer transition-colors">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl flex-shrink-0 border transition-colors"
          style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)' }}>
          {r.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>{r.title}</span>
            {r.isBadge && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">{r.isBadge}</span>
            )}
            {r.isAI && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ backgroundColor: 'rgba(124,92,252,0.08)', color: '#7C5CFC', border: '1px solid rgba(124,92,252,0.2)' }}>AI</span>
            )}
          </div>
          <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{r.desc}</p>
        </div>
      </div>
      <div className="mb-4">
        <div className="text-[9px] uppercase tracking-wide font-semibold mb-1.5" style={{ color: 'var(--text-muted)' }}>Includes</div>
        <div className="flex flex-wrap gap-1">
          {r.sections.map(s => (
            <span key={s} className="text-[9px] px-1.5 py-0.5 rounded border"
              style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>{s}</span>
          ))}
        </div>
      </div>
      <button
        onClick={() => { setGenerating(true); setTimeout(() => setGenerating(false), 2000); }}
        className="w-full py-2 text-xs font-semibold rounded-xl transition-all border"
        style={generating
          ? { backgroundColor: isUSP ? '#7C5CFC' : '#14B8A6', color: '#FFFFFF', borderColor: 'transparent' }
          : { backgroundColor: 'transparent', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
        }>
        {generating ? 'Generating…' : 'Generate Report'}
      </button>
    </Card>
  );
}

export default function Reports() {
  return (
    <div className="p-7 space-y-8">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[26px] font-bold leading-tight mb-1.5" style={{ color: 'var(--text-primary)' }}>Intelligence Reports</h1>
          <p className="text-sm leading-relaxed max-w-lg" style={{ color: 'var(--text-secondary)' }}>
            Generate, export, and securely share intelligence reports for investigations and command briefings.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm">Templates</Button>
          <Button variant="primary" size="sm">Custom Report</Button>
        </div>
      </div>

      {/* SIH Core Reports */}
      <section>
        <SectionLabel type="sih">SIH Core Deliverable Reports</SectionLabel>
        <div className="grid grid-cols-4 gap-4">
          {coreReports.map(r => <ReportCard key={r.id} r={r} />)}
        </div>
      </section>

      {/* USP Enhanced Reports */}
      <section>
        <SectionLabel type="usp">TRINETRA USP Enhanced Reports</SectionLabel>
        <div className="grid grid-cols-3 gap-4">
          {uspReports.map(r => <ReportCard key={r.id} r={r} isUSP />)}
        </div>
      </section>

      {/* Recent Reports */}
      <section>
        <div className="font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Recent Reports</div>
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ backgroundColor: 'var(--table-header-bg)', borderColor: 'var(--border)' }}>
                {['Report Type', 'Reference', 'Generated', 'Status', 'Size', 'Category', 'Actions'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentReports.map((r, i) => (
                <tr key={i} className="border-b transition-colors"
                  style={{ borderColor: 'var(--border-subtle)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--table-row-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <td className="px-5 py-3.5 text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{r.type}</td>
                  <td className="px-4 py-3.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{r.ref}</td>
                  <td className="px-4 py-3.5 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{r.generated}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-lg border"
                      style={r.status === 'Ready'
                        ? { backgroundColor: 'rgba(16,185,129,0.1)', borderColor: 'rgba(16,185,129,0.3)', color: '#059669' }
                        : { backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)', color: 'var(--text-muted)' }
                      }>{r.status}</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{r.size}</td>
                  <td className="px-4 py-3.5"><FeatureTag type={r.isCore ? 'sih' : 'usp'} /></td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <button className="text-xs font-medium text-[#14B8A6] hover:underline">Preview</button>
                      <button className="text-xs font-medium hover:underline" style={{ color: 'var(--text-secondary)' }}>Export PDF</button>
                      <button className="text-xs font-medium text-[#7C5CFC] hover:underline">Share</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </section>

    </div>
  );
}
