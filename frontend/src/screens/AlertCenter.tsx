import React, { useState } from 'react';
import { Card, RiskBadge, Button, FeatureTag } from '../components/ui';
import { MOCK_ALERTS } from '../data/mockAlerts';
import type { AlertStatus } from '../types';

const statusTabs = [
  { id: 'all',              label: 'All Alerts',   count: MOCK_ALERTS.length },
  { id: 'unacknowledged',   label: 'Unacknowledged', count: MOCK_ALERTS.filter(a => a.status === 'unacknowledged').length },
  { id: 'actioned',         label: 'Actioned',     count: MOCK_ALERTS.filter(a => a.status === 'actioned').length },
];

const riskColors: Record<string, string> = {
  critical: '#E5484D', high: '#F97316', medium: '#F59E0B', low: '#14B8A6',
};

export default function AlertCenter({ onOpenCase }: { onOpenCase: () => void }) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());

  const filtered = MOCK_ALERTS.filter(a =>
    activeTab === 'all' ? true : a.status === activeTab || acknowledgedIds.has(a.alertId)
  );

  const acknowledge = (id: string) => setAcknowledgedIds(prev => new Set([...prev, id]));

  return (
    <div className="p-7 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[24px] font-bold text-[#0F172A] leading-tight">Alert Center</h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm text-[#64748B]">Predictive cash-out alerts requiring officer attention.</p>
        </div>
        <Button variant="secondary" size="sm">Export</Button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-[#F7F8FA] rounded-xl p-1 border border-[#E2E8F0] w-fit">
        {statusTabs.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2 ${
              activeTab === tab.id
                ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]'
                : 'text-[#64748B] hover:text-[#0F172A]'
            }`}
          >
            {tab.label}
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${activeTab === tab.id ? 'bg-[#F1F5F9] text-[#64748B]' : 'bg-[#E2E8F0] text-[#94A3B8]'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Alert cards */}
      <div className="space-y-4">
        {MOCK_ALERTS.map(alert => {
          const isAcknowledged = acknowledgedIds.has(alert.alertId) || alert.status !== 'unacknowledged';
          const color = riskColors[alert.riskLevel];

          return (
            <Card key={alert.alertId} className="overflow-hidden">
              {/* Header bar */}
              <div className="px-5 py-3.5 border-b border-[#F1F5F9] flex items-center justify-between"
                style={{ background: `${color}08` }}>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: color }} />
                  <span className="text-xs font-bold tracking-wide" style={{ color }}>{alert.type}</span>
                  <span className="text-xs text-[#94A3B8] font-mono">{alert.alertId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#94A3B8]">{alert.generatedAgo}</span>
                  {isAcknowledged && (
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      Acknowledged
                    </span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="p-5">
                <div className="grid grid-cols-4 gap-6 mb-4">
                  {[
                    { label: 'Case',        value: alert.caseId,          mono: true },
                    { label: 'Predicted Zone', value: alert.zone,         mono: false },
                    { label: 'Confidence',  value: `${alert.riskScore}%`, mono: true, color },
                    { label: 'Time Remaining', value: alert.windowMinutes, mono: false },
                  ].map(f => (
                    <div key={f.label}>
                      <div className="text-[10px] text-[#94A3B8] mb-0.5">{f.label}</div>
                      <div className={`text-sm font-semibold ${f.mono ? 'font-mono' : ''}`}
                        style={{ color: f.color ?? '#0F172A' }}>
                        {f.value}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Intervention pipeline */}
                <div className="mb-4">
                  <div className="text-[10px] text-[#94A3B8] mb-2">Intervention Status</div>
                  <div className="flex items-center gap-2">
                    {alert.timelineSteps.map((step, i) => (
                      <React.Fragment key={i}>
                        <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium ${
                          i < alert.completedSteps
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                            : 'bg-[#F7F8FA] text-[#94A3B8] border border-[#E2E8F0]'
                        }`}>
                          {i < alert.completedSteps && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                          )}
                          {step}
                        </div>
                        {i < alert.timelineSteps.length - 1 && (
                          <div className={`h-px flex-1 ${i < alert.completedSteps - 1 ? 'bg-emerald-200' : 'bg-[#E2E8F0]'}`} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {!isAcknowledged && (
                    <button
                      onClick={() => acknowledge(alert.alertId)}
                      className="px-4 py-2 rounded-xl bg-[#14B8A6] text-white text-xs font-semibold hover:bg-[#0F9E8E] transition-colors"
                    >
                      Acknowledge
                    </button>
                  )}
                  <button
                    onClick={onOpenCase}
                    className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#0F172A] hover:bg-[#F7F8FA] transition-colors"
                  >
                    Open Case
                  </button>
                  <button className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#0F172A] hover:bg-[#F7F8FA] transition-colors">
                    Notify Bank
                  </button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
