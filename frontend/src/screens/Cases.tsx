import React, { useState } from 'react';
import { Card, Button, SearchBar, FilterSelect, FeatureTag, StatusDot } from '../components/ui';
import { useCaseContext, getZoneLabel, priorityColor } from '../context/CaseContext';
import { formatAmountInr } from '../data/caseFixtures';

const statusStyles: Record<string, React.CSSProperties> = {
  'Active':        { backgroundColor: 'rgba(229,72,77,0.08)',   color: '#E5484D',  border: '1px solid rgba(229,72,77,0.2)' },
  'In Review':     { backgroundColor: 'rgba(245,158,11,0.08)',  color: '#D97706',  border: '1px solid rgba(245,158,11,0.25)' },
  'Investigating': { backgroundColor: 'rgba(59,130,246,0.08)',  color: '#2563EB',  border: '1px solid rgba(59,130,246,0.2)' },
  'Resolved':      { backgroundColor: 'rgba(16,185,129,0.08)',  color: '#059669',  border: '1px solid rgba(16,185,129,0.2)' },
};

export default function Cases({ onOpenCase }: { onOpenCase?: (caseId?: string) => void }) {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [selectedFraudType, setSelectedFraudType] = useState('All');
  const [selectedStatus, setSelectedStatus] = useState('All');
  const [selectedRisk, setSelectedRisk] = useState('All');

  const { caseFixtures, getFinalPrediction, isLoadingFinal, setActiveCase } = useCaseContext();

  const handleOpen = (caseId: string) => {
    setActiveCase(caseId);
    if (onOpenCase) onOpenCase(caseId);
  };

  const casesWithPredictions = caseFixtures.map(fixture => {
    const pred = getFinalPrediction(fixture.case_id);
    const topZoneId = pred?.geographic?.predicted_destination_zone || 'Z000';
    const zoneName = getZoneLabel(topZoneId);
    const riskScore = Math.round(pred?.decision?.decision_confidence || pred?.geographic?.confidence_score || 50);
    const priority = pred?.decision?.priority || 'MEDIUM';
    const p50 = pred?.timing?.intervention_distribution?.p50_minutes ? Math.round(pred.timing.intervention_distribution.p50_minutes) : 45;
    const amount = fixture.complaint.amount_inr;
    return { fixture, pred, zoneName, riskScore, priority, p50, amount };
  });

  const criticalCount = casesWithPredictions.filter(c => c.priority === 'CRITICAL').length;
  const activeCount = caseFixtures.filter(c => c.status === 'Active').length;
  const reviewCount = caseFixtures.filter(c => c.status === 'In Review').length;

  const tabs = [
    { id: 'all',       label: 'All Cases',        count: caseFixtures.length },
    { id: 'critical',  label: 'Critical Priority', count: criticalCount },
    { id: 'active',    label: 'Active',             count: activeCount },
    { id: 'reviewing', label: 'In Review',          count: reviewCount },
  ];

  const filteredCases = casesWithPredictions.filter(item => {
    const { fixture, zoneName, priority } = item;
    if (activeTab === 'critical' && priority !== 'CRITICAL') return false;
    if (activeTab === 'active' && fixture.status !== 'Active') return false;
    if (activeTab === 'reviewing' && fixture.status !== 'In Review') return false;
    if (selectedFraudType !== 'All' && fixture.fraudType !== selectedFraudType) return false;
    if (selectedStatus !== 'All' && fixture.status !== selectedStatus) return false;
    if (selectedRisk !== 'All' && priority !== selectedRisk.toUpperCase()) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!fixture.case_id.toLowerCase().includes(q) && !fixture.fraudType.toLowerCase().includes(q) &&
          !zoneName.toLowerCase().includes(q) && !fixture.victimDistrict.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <div className="p-7 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-[26px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Cybercrime Cases</h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            Investigate complaints and prioritise cases using real-time predictive risk intelligence.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" icon={<DownloadIcon />} size="sm">Export CSV</Button>
          <Button variant="primary" icon={<PlusIcon />} size="sm">New Investigation</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex gap-1 rounded-xl p-1 border" style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)' }}>
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className="px-3.5 py-2 rounded-lg text-sm font-medium transition-all flex items-center gap-2"
              style={activeTab === tab.id
                ? { backgroundColor: 'var(--surface)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid var(--border)' }
                : { backgroundColor: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' }
              }>
              {tab.label}
              <span className="px-1.5 py-0.5 rounded text-xs"
                style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-muted)' }}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
          <StatusDot status="connected" />
          <span>Live API Connection (Port 8001)</span>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <SearchBar placeholder="Search case ID, typology, victim district, zone…" value={search} onChange={setSearch} className="w-72" />
          <FilterSelect label="Fraud Type" value={selectedFraudType} onChange={setSelectedFraudType}
            options={['All', 'Investment Fraud', 'UPI Fraud', 'Digital Arrest', 'Impersonation']} />
          <FilterSelect label="Priority" value={selectedRisk} onChange={setSelectedRisk}
            options={['All', 'Critical', 'High', 'Medium', 'Low']} />
          <FilterSelect label="Status" value={selectedStatus} onChange={setSelectedStatus}
            options={['All', 'Active', 'In Review', 'Investigating', 'Resolved']} />
          <button onClick={() => { setSearch(''); setSelectedFraudType('All'); setSelectedStatus('All'); setSelectedRisk('All'); }}
            className="ml-auto text-xs font-medium text-[#14B8A6] hover:underline">
            Reset Filters
          </button>
        </div>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b" style={{ backgroundColor: 'var(--table-header-bg)', borderColor: 'var(--border)' }}>
                {['Case ID','Typology','Reported','Amount at Risk','Victim Origin','Predicted Destination Zone','Priority & Confidence','Status','Investigator',''].map(h => (
                  <th key={h} className="text-left px-5 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredCases.map(({ fixture, zoneName, riskScore, priority, p50, amount }, i) => {
                const color = priorityColor(priority);
                const isLoading = isLoadingFinal(fixture.case_id);
                return (
                  <tr key={fixture.case_id}
                    onClick={() => handleOpen(fixture.case_id)}
                    className="border-b cursor-pointer transition-colors"
                    style={{
                      borderColor: 'var(--border-subtle)',
                      backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--table-row-alt)',
                    }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--table-row-hover)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'transparent' : 'var(--table-row-alt)')}
                  >
                    <td className="px-5 py-3.5">
                      <div className="font-mono text-xs font-bold" style={{ color: 'var(--text-primary)' }}>{fixture.case_id}</div>
                      <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{fixture.hops.length} hop(s)</div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{fixture.fraudType}</span>
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{fixture.reportedAgo}</td>
                    <td className="px-4 py-3.5">
                      <span className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{formatAmountInr(amount)}</span>
                    </td>
                    <td className="px-4 py-3.5 text-sm" style={{ color: 'var(--text-secondary)' }}>{fixture.victimDistrict}</td>
                    <td className="px-4 py-3.5">
                      {isLoading ? (
                        <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Calculating…</span>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full" style={{ background: color }} />
                          <span className="text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{zoneName}</span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {isLoading ? (
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>Loading M8…</span>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
                              style={{ color, backgroundColor: `${color}15` }}>{priority}</span>
                            <span className="font-mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{riskScore}%</span>
                          </div>
                          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>Est. Window ~{p50} min</div>
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="px-2 py-1 text-xs font-medium rounded-lg" style={statusStyles[fixture.status] || {}}>
                        {fixture.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs" style={{ color: 'var(--text-secondary)' }}>{fixture.investigator}</td>
                    <td className="px-4 py-3.5">
                      <button className="text-xs font-semibold text-[#14B8A6] hover:text-[#0D9488]">Inspect →</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between px-5 py-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Showing {filteredCases.length} of {caseFixtures.length} cases (Live Backend Evaluated)
          </span>
          <div className="flex items-center gap-1">
            <button className="w-8 h-8 text-xs rounded-lg bg-[#14B8A6] text-white font-semibold">1</button>
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
