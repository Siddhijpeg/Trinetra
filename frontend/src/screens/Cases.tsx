import React, { useState } from 'react';
import { Card, Button, SearchBar, FilterSelect, FeatureTag } from '../components/ui';
import { MOCK_CASES } from '../data/mockCases';

const statusColors: Record<string, string> = {
  'Active': 'bg-red-50 text-red-600 border-red-200',
  'In Review': 'bg-amber-50 text-amber-600 border-amber-200',
  'Investigating': 'bg-blue-50 text-blue-600 border-blue-200',
  'Resolved': 'bg-emerald-50 text-emerald-600 border-emerald-200',
};

export default function Cases({ onOpenCase }: { onOpenCase: () => void }) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');

  const tabs = [
    { id: 'all', label: 'All Cases', count: MOCK_CASES.length },
    { id: 'critical', label: 'Critical', count: MOCK_CASES.filter(c => c.riskLevel === 'critical').length },
    { id: 'active', label: 'Active', count: MOCK_CASES.filter(c => c.status === 'Active').length },
    { id: 'reviewing', label: 'In Review', count: MOCK_CASES.filter(c => c.status === 'In Review').length },
    { id: 'resolved', label: 'Resolved', count: MOCK_CASES.filter(c => c.status === 'Resolved').length },
  ];

  return (
    <div className="p-7 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-[26px] font-bold text-[#0F172A] leading-tight">Cybercrime Cases</h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm text-[#64748B] leading-relaxed">Investigate complaints and prioritise cases using predictive risk intelligence.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<DownloadIcon />} size="sm">Export</Button>
          <Button variant="primary" icon={<PlusIcon />} size="sm">New Case</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 bg-[#F7F8FA] rounded-xl p-1 border border-[#E2E8F0]">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2 ${
                activeTab === tab.id
                  ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              {tab.label}
              <span className={`px-1.5 py-0.5 rounded text-xs ${activeTab === tab.id ? 'bg-[#F1F5F9] text-[#64748B]' : 'bg-[#E2E8F0] text-[#94A3B8]'}`}>
                {tab.count.toLocaleString()}
              </span>
            </button>
          ))}
        </div>
        <div className="text-xs text-[#94A3B8] font-mono">Auto-refresh: 30s</div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <SearchBar
            placeholder="Search case ID, account, phone, UPI…"
            value={search}
            onChange={setSearch}
            className="w-72"
          />
          <FilterSelect label="Fraud Type" options={['Investment Fraud', 'UPI Fraud', 'Digital Arrest', 'Impersonation']} />
          <FilterSelect label="State" options={['Delhi', 'Maharashtra', 'UP', 'Rajasthan', 'Karnataka', 'West Bengal']} />
          <FilterSelect label="Risk Level" options={['Critical', 'High', 'Medium', 'Low']} />
          <FilterSelect label="Amount" options={['< ₹1L', '₹1L–5L', '₹5L–20L', '> ₹20L']} />
          <FilterSelect label="Status" options={['Active', 'In Review', 'Investigating', 'Resolved']} />
          <button className="ml-auto text-xs text-[#14B8A6] font-medium hover:underline">Reset Filters</button>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[#E2E8F0]" style={{ background: '#F8FAFC' }}>
                <th className="text-left px-5 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Case ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Complaint Type</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Reported</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Amount</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Source</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Predicted Zone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Risk Score</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Status</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-[#64748B] uppercase tracking-wide">Investigator</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {MOCK_CASES.map((c, i) => (
                <tr
                  key={c.caseId}
                  onClick={onOpenCase}
                  className={`border-b border-[#F1F5F9] hover:bg-[#F7FFFE] cursor-pointer transition-colors ${i % 2 === 0 ? '' : 'bg-[#FAFBFC]'}`}
                >
                  <td className="px-5 py-3.5">
                    <div className="font-mono text-xs font-bold text-[#0F172A]">{c.caseId}</div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm text-[#0F172A]">{c.fraudType}</span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-[#64748B] font-mono">{c.reportedAgo}</td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-semibold text-[#0F172A]">{c.amount}</span>
                  </td>
                  <td className="px-4 py-3.5 text-sm text-[#64748B]">{c.sourceLocation}</td>
                  <td className="px-4 py-3.5">
                    {c.predictedZone ? (
                      <div className="flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: c.riskLevel === 'critical' ? '#E5484D' : c.riskLevel === 'high' ? '#F97316' : '#F59E0B' }} />
                        <span className="text-xs font-medium text-[#0F172A]">{c.predictedZone}</span>
                      </div>
                    ) : <span className="text-xs text-[#94A3B8]">—</span>}
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="w-16 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
                        <div className="h-full rounded-full" style={{
                          width: `${c.riskScore}%`,
                          background: c.riskScore > 80 ? '#E5484D' : c.riskScore > 60 ? '#F97316' : c.riskScore > 40 ? '#F59E0B' : '#14B8A6',
                        }} />
                      </div>
                      <span className="font-mono text-xs font-semibold text-[#0F172A]">{c.riskScore}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className={`px-2 py-1 text-xs font-medium rounded-lg border ${statusColors[c.status] || ''}`}>
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs text-[#64748B]">{c.investigator}</td>
                  <td className="px-4 py-3.5">
                    <button className="text-[#14B8A6] hover:text-[#0D9488] text-xs font-medium">Open →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t border-[#E2E8F0]">
          <span className="text-xs text-[#64748B]">Showing {MOCK_CASES.length} cases</span>
          <div className="flex items-center gap-1">
            <button className="w-8 h-8 text-xs rounded-lg transition-colors bg-[#14B8A6] text-white font-semibold">1</button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function PlusIcon() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5V11.5M1.5 6.5H11.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>;
}
function DownloadIcon() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5V9M4 7L6.5 9.5L9 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><path d="M2 10.5H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/></svg>;
}
