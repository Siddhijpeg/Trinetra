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
    <Card className="p-5 hover:border-[#14B8A6]/35 transition-colors group cursor-pointer">
      <div className="flex items-start gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-[#F7F8FA] border border-[#E2E8F0] flex items-center justify-center text-xl flex-shrink-0 group-hover:border-[#14B8A6]/30 transition-colors">
          {r.icon}
        </div>
        <div className="flex-1">
          <div className="flex items-center gap-2 mb-1">
            <span className="font-semibold text-[#0F172A] text-sm">{r.title}</span>
            {r.isBadge && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 border border-blue-200">{r.isBadge}</span>
            )}
            {r.isAI && (
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-[#7C5CFC]/8 text-[#7C5CFC] border border-[#7C5CFC]/20">AI</span>
            )}
          </div>
          <p className="text-xs text-[#64748B] leading-relaxed">{r.desc}</p>
        </div>
      </div>
      <div className="mb-4">
        <div className="text-[9px] text-[#94A3B8] uppercase tracking-wide font-semibold mb-1.5">Includes</div>
        <div className="flex flex-wrap gap-1">
          {r.sections.map(s => (
            <span key={s} className="text-[9px] px-1.5 py-0.5 rounded bg-[#F7F8FA] border border-[#E2E8F0] text-[#64748B]">{s}</span>
          ))}
        </div>
      </div>
      <button
        onClick={() => { setGenerating(true); setTimeout(() => setGenerating(false), 2000); }}
        className={`w-full py-2 text-xs font-semibold rounded-xl transition-all ${
          generating
            ? (isUSP ? 'bg-[#7C5CFC] text-white' : 'bg-[#14B8A6] text-white')
            : 'border border-[#E2E8F0] text-[#64748B] hover:border-[#14B8A6]/30 hover:text-[#14B8A6]'
        }`}
      >
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
          <h1 className="text-[26px] font-bold text-[#0F172A] leading-tight mb-1.5">Intelligence Reports</h1>
          <p className="text-sm text-[#64748B] leading-relaxed max-w-lg">
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
        <div className="font-semibold text-[#0F172A] mb-4">Recent Reports</div>
        <Card className="overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                {['Report Type', 'Reference', 'Generated', 'Status', 'Size', 'Category', 'Actions'].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-[10px] font-semibold text-[#94A3B8] uppercase tracking-wide whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recentReports.map((r, i) => (
                <tr key={i} className="border-b border-[#F1F5F9] hover:bg-[#F7FFFE] transition-colors">
                  <td className="px-5 py-3.5 text-xs font-bold text-[#0F172A]">{r.type}</td>
                  <td className="px-4 py-3.5 text-xs text-[#64748B]">{r.ref}</td>
                  <td className="px-4 py-3.5 text-xs font-mono text-[#94A3B8]">{r.generated}</td>
                  <td className="px-4 py-3.5">
                    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-lg border ${r.status === 'Ready' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-[#F7F8FA] border-[#E2E8F0] text-[#94A3B8]'}`}>
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs font-mono text-[#94A3B8]">{r.size}</td>
                  <td className="px-4 py-3.5">
                    <FeatureTag type={r.isCore ? 'sih' : 'usp'} />
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2.5">
                      <button className="text-xs font-medium text-[#14B8A6] hover:underline">Preview</button>
                      <button className="text-xs font-medium text-[#64748B] hover:underline">Export PDF</button>
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
