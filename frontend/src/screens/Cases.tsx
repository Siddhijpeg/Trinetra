// ─── Cases Screen ─────────────────────────────────────────────────────────────
// Paginated V2 case catalogue.
// All data comes from GET /api/v1/cases via CaseContext.
// Server-side filtering, pagination, and search — no local fixture arrays.

import React, { useState } from 'react';
import { Card, Button, SearchBar, FilterSelect, FeatureTag, StatusDot } from '../components/ui';
import { useCaseContext, priorityColor } from '../context/CaseContext';
import type { V2CaseListItem } from '../context/CaseContext';

const TYPOLOGY_OPTIONS = [
  'All',
  'TYP_01', 'TYP_02', 'TYP_03', 'TYP_04', 'TYP_05',
  'TYP_06', 'TYP_07', 'TYP_08', 'TYP_09', 'TYP_10',
];

const TYPOLOGY_LABELS: Record<string, string> = {
  TYP_01: 'OTP / KYC Fraud',
  TYP_02: 'Fake Loan App',
  TYP_03: 'Part-Time Job Scam',
  TYP_04: 'Investment / Crypto Scam',
  TYP_05: 'Sextortion',
  TYP_06: 'Marketplace / OLX Fraud',
  TYP_07: 'Digital Arrest',
  TYP_08: 'SIM Swap / Account Takeover',
  TYP_09: 'Romance / Honey Trap Scam',
  TYP_10: 'Courier / Parcel Scam',
};

const STATUS_OPTIONS = ['All', 'COMPLETED', 'FROZEN', 'PARTIAL_FREEZE', 'CENSORED', 'REVERSED'];

const statusStyles: Record<string, React.CSSProperties> = {
  COMPLETED:     { backgroundColor: 'rgba(16,185,129,0.08)',  color: '#059669', border: '1px solid rgba(16,185,129,0.2)' },
  FROZEN:        { backgroundColor: 'rgba(59,130,246,0.08)',  color: '#2563EB', border: '1px solid rgba(59,130,246,0.2)' },
  PARTIAL_FREEZE:{ backgroundColor: 'rgba(245,158,11,0.08)',  color: '#D97706', border: '1px solid rgba(245,158,11,0.25)' },
  CENSORED:      { backgroundColor: 'rgba(148,163,184,0.08)', color: '#64748B', border: '1px solid rgba(148,163,184,0.2)' },
  REVERSED:      { backgroundColor: 'rgba(124,92,252,0.08)',  color: '#7C5CFC', border: '1px solid rgba(124,92,252,0.2)' },
  UNKNOWN:       { backgroundColor: 'rgba(148,163,184,0.08)', color: '#64748B', border: '1px solid rgba(148,163,184,0.2)' },
};

function formatAmount(inr: number): string {
  if (inr >= 10_000_000) return `₹${(inr / 10_000_000).toFixed(1)} Cr`;
  if (inr >= 100_000)    return `₹${(inr / 100_000).toFixed(1)}L`;
  if (inr >= 1_000)      return `₹${(inr / 1_000).toFixed(0)}K`;
  return `₹${inr.toFixed(0)}`;
}

function formatTimestamp(ts: string): string {
  if (!ts) return '—';
  try {
    const d = new Date(ts);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return ts.slice(0, 16);
  }
}

export default function Cases({ onOpenCase }: { onOpenCase?: (caseId?: string) => void }) {
  const {
    caseList, caseListLoading, caseListError,
    pagination, filters, setFilters, setPage,
    setActiveCase, getFinalPrediction, isLoadingFinal,
  } = useCaseContext();

  const [searchInput, setSearchInput] = useState(filters.search);

  const handleOpen = (caseId: string) => {
    setActiveCase(caseId);
    if (onOpenCase) onOpenCase(caseId);
  };

  // Debounce search: submit on Enter or blur
  const handleSearchSubmit = () => {
    setFilters({ search: searchInput });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearchSubmit();
  };

  const handleReset = () => {
    setSearchInput('');
    setFilters({ search: '', typology_id: '', state: '', status: '' });
  };

  const renderDecisionBadge = (item: V2CaseListItem) => {
    const pred = getFinalPrediction(item.case_id);
    if (isLoadingFinal(item.case_id)) {
      return <span className="text-xs animate-pulse" style={{ color: 'var(--text-muted)' }}>Loading…</span>;
    }
    if (!pred) return <span className="text-xs" style={{ color: 'var(--text-muted)' }}>—</span>;
    const dec    = pred.decision?.decision || '—';
    const conf   = Math.round((pred.decision?.decision_confidence ?? 0) * 100);
    const color  = priorityColor(dec);
    const p50    = pred.timing?.intervention_distribution?.p50_minutes
      ? Math.round(pred.timing.intervention_distribution.p50_minutes)
      : null;
    return (
      <div className="space-y-0.5">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] font-bold font-mono px-1.5 py-0.5 rounded"
            style={{ color, backgroundColor: `${color}15` }}>{dec}</span>
          <span className="font-mono text-xs font-semibold" style={{ color: 'var(--text-primary)' }}>{conf}%</span>
        </div>
        {p50 !== null && (
          <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>~{p50} min window</div>
        )}
      </div>
    );
  };

  // Build pagination buttons
  const { page, total_pages, total } = pagination;
  const pageButtons: number[] = [];
  const startPage = Math.max(1, page - 2);
  const endPage   = Math.min(total_pages, page + 2);
  for (let i = startPage; i <= endPage; i++) pageButtons.push(i);

  return (
    <div className="p-7 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <h1 className="text-[26px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>
              Cybercrime Cases
            </h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            V2 Dataset — {total.toLocaleString()} cases · server-side search, filter, pagination
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
            <StatusDot status={caseListError ? 'limited' : 'connected'} />
            <span>{caseListError ? 'API Error' : 'Live V2 API (Port 8001)'}</span>
          </div>
          <Button variant="secondary" size="sm" icon={<DownloadIcon />}>Export CSV</Button>
        </div>
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex items-center gap-3 flex-wrap">
          <SearchBar
            placeholder="Search complaint ID, typology, state, district… (press Enter)"
            value={searchInput}
            onChange={setSearchInput}
            onKeyDown={handleKeyDown}
            onBlur={handleSearchSubmit}
            className="w-80"
          />
          <FilterSelect
            label="Typology"
            value={filters.typology_id || 'All'}
            onChange={v => setFilters({ typology_id: v === 'All' ? '' : v })}
            options={TYPOLOGY_OPTIONS}
          />
          <FilterSelect
            label="Evaluation Status"
            value={filters.status || 'All'}
            onChange={v => setFilters({ status: v === 'All' ? '' : v })}
            options={STATUS_OPTIONS}
          />
          <FilterSelect
            label="Sort By"
            value={filters.sort_by}
            onChange={v => setFilters({ sort_by: v })}
            options={['complaint_timestamp', 'incident_timestamp', 'amount_inr', 'complaint_id']}
          />
          <FilterSelect
            label="Order"
            value={filters.sort_order}
            onChange={v => setFilters({ sort_order: v })}
            options={['desc', 'asc']}
          />
          <button onClick={handleReset}
            className="ml-auto text-xs font-medium text-[#14B8A6] hover:underline">
            Reset Filters
          </button>
        </div>
      </Card>

      {/* Error state */}
      {caseListError && (
        <div className="p-4 rounded-xl border text-sm text-center"
          style={{ color: '#E5484D', backgroundColor: 'var(--risk-critical-bg)', borderColor: 'var(--risk-critical-border)' }}>
          Case data unavailable — {caseListError}
        </div>
      )}

      {/* Table */}
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b"
                style={{ backgroundColor: 'var(--table-header-bg)', borderColor: 'var(--border)' }}>
                {[
                  'Complaint ID', 'Typology', 'Amount', 'Victim Location',
                  'Hops', 'Incident Time', 'Available Time',
                  'Eval. Status', 'Decision', '',
                ].map(h => (
                  <th key={h}
                    className="text-left px-4 py-3 text-xs font-semibold uppercase tracking-wide whitespace-nowrap"
                    style={{ color: 'var(--text-secondary)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {caseListLoading && (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-center text-sm animate-pulse"
                    style={{ color: 'var(--text-muted)' }}>
                    Loading V2 cases…
                  </td>
                </tr>
              )}
              {!caseListLoading && caseList.length === 0 && !caseListError && (
                <tr>
                  <td colSpan={10} className="px-5 py-8 text-center text-sm"
                    style={{ color: 'var(--text-muted)' }}>
                    No cases match the current filters.
                  </td>
                </tr>
              )}
              {!caseListLoading && caseList.map((item, i) => (
                <tr key={item.case_id}
                  onClick={() => handleOpen(item.case_id)}
                  className="border-b cursor-pointer transition-colors"
                  style={{
                    borderColor: 'var(--border-subtle)',
                    backgroundColor: i % 2 === 0 ? 'transparent' : 'var(--table-row-alt)',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--table-row-hover)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = i % 2 === 0 ? 'transparent' : 'var(--table-row-alt)')}
                >
                  <td className="px-4 py-3.5">
                    <div className="font-mono text-xs font-bold" style={{ color: 'var(--text-primary)' }}>
                      {item.case_id}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>
                      {TYPOLOGY_LABELS[item.typology_id] || item.typology_name}
                    </div>
                    <div className="text-[10px] font-mono" style={{ color: 'var(--text-muted)' }}>
                      {item.typology_id}
                    </div>
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>
                      {formatAmount(item.amount_inr)}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    <div className="text-xs" style={{ color: 'var(--text-primary)' }}>
                      {item.victim_district}
                    </div>
                    <div className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {item.victim_state}
                    </div>
                  </td>
                  <td className="px-4 py-3.5 text-center">
                    <span className="text-xs font-mono font-bold" style={{ color: 'var(--text-primary)' }}>
                      {item.hop_count}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {formatTimestamp(item.incident_timestamp)}
                  </td>
                  <td className="px-4 py-3.5 text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>
                    {item.complaint_available_timestamp
                      ? formatTimestamp(item.complaint_available_timestamp)
                      : '—'}
                  </td>
                  <td className="px-4 py-3.5">
                    <span className="px-2 py-1 text-[10px] font-semibold rounded-lg"
                      style={statusStyles[item.evaluation_status] || statusStyles.UNKNOWN}>
                      {item.evaluation_status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5">
                    {renderDecisionBadge(item)}
                  </td>
                  <td className="px-4 py-3.5">
                    <button className="text-xs font-semibold text-[#14B8A6] hover:text-[#0D9488]">
                      Inspect →
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t"
          style={{ borderColor: 'var(--border)' }}>
          <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {caseListLoading
              ? 'Loading…'
              : `Page ${page} of ${total_pages} · ${total.toLocaleString()} total cases`}
          </span>
          <div className="flex items-center gap-1">
            {/* Prev */}
            <button
              onClick={() => setPage(page - 1)}
              disabled={page <= 1 || caseListLoading}
              className="w-8 h-8 text-xs rounded-lg flex items-center justify-center border transition-colors disabled:opacity-40"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              ‹
            </button>
            {/* Page numbers */}
            {pageButtons.map(n => (
              <button key={n} onClick={() => setPage(n)} disabled={caseListLoading}
                className="w-8 h-8 text-xs rounded-lg font-semibold transition-colors"
                style={n === page
                  ? { backgroundColor: '#14B8A6', color: '#fff' }
                  : { backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }
                }>
                {n}
              </button>
            ))}
            {/* Next */}
            <button
              onClick={() => setPage(page + 1)}
              disabled={page >= total_pages || caseListLoading}
              className="w-8 h-8 text-xs rounded-lg flex items-center justify-center border transition-colors disabled:opacity-40"
              style={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
              ›
            </button>
          </div>
        </div>
      </Card>
    </div>
  );
}

function DownloadIcon() {
  return (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <path d="M6.5 1.5V9M4 7L6.5 9.5L9 7" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M2 10.5H11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
    </svg>
  );
}
