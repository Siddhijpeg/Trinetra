import React, { useState } from 'react';
import { Card, Button, FeatureTag, StatusDot } from '../components/ui';
import { useCaseContext, getZoneLabel, priorityColor } from '../context/CaseContext';
import { formatAmountInr } from '../data/caseFixtures';

export default function AlertCenter({ onOpenCase }: { onOpenCase?: (caseId?: string) => void }) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());

  const { caseFixtures, getFinalPrediction, setActiveCase } = useCaseContext();

  const handleOpen = (caseId: string) => {
    setActiveCase(caseId);
    if (onOpenCase) onOpenCase(caseId);
  };

  const alertsDerived = caseFixtures.map(fixture => {
    const pred = getFinalPrediction(fixture.case_id);
    const priority = pred?.decision?.priority || 'MEDIUM';
    const topZoneId = pred?.geographic?.predicted_destination_zone || 'Z000';
    const zoneName = getZoneLabel(topZoneId);
    const confidence = Math.round(pred?.decision?.decision_confidence || pred?.geographic?.confidence_score || 50);
    const dist = pred?.timing?.intervention_distribution;
    const p50 = dist?.p50_minutes ? Math.round(dist.p50_minutes) : 45;
    const p25 = dist?.p25_minutes ? Math.round(dist.p25_minutes) : 20;
    const p75 = dist?.p75_minutes ? Math.round(dist.p75_minutes) : 75;
    const amount = fixture.complaint.amount_inr;
    const isAck = acknowledgedIds.has(fixture.case_id);

    return {
      alertId: `ALT-${fixture.case_id.slice(-5)}`,
      caseId: fixture.case_id,
      priority,
      zoneName,
      confidence,
      windowStr: `~${p50} min (${p25}–${p75} min)`,
      p50,
      amount,
      reportedAgo: fixture.reportedAgo,
      isAck,
      reason: pred?.decision?.recommended_action || 'Priority assessment based on spatial & temporal risk',
      timelineSteps: ['Complaint Intake', 'Hop 1 Ingestion', 'M8 Zone Inferred', 'Intervention Window Active'],
      completedSteps: fixture.hops.length + 1,
    };
  });

  const filtered = alertsDerived.filter(a => {
    if (activeTab === 'critical') return a.priority === 'CRITICAL';
    if (activeTab === 'unacknowledged') return !a.isAck;
    if (activeTab === 'acknowledged') return a.isAck;
    return true;
  });

  const acknowledge = (caseId: string) => setAcknowledgedIds(prev => new Set([...prev, caseId]));

  const statusTabs = [
    { id: 'all', label: 'All Alerts', count: alertsDerived.length },
    { id: 'critical', label: 'Critical Priority', count: alertsDerived.filter(a => a.priority === 'CRITICAL').length },
    { id: 'unacknowledged', label: 'Unacknowledged', count: alertsDerived.filter(a => !a.isAck).length },
    { id: 'acknowledged', label: 'Acknowledged', count: alertsDerived.filter(a => a.isAck).length },
  ];

  return (
    <div className="p-7 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[24px] font-bold text-[#0F172A] leading-tight">Predictive Alert Center</h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm text-[#64748B]">
            Automated alerts derived from backend Deterministic Policy v1.0 & Geographic M8 inference.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-mono text-[#94A3B8] mr-2">
            <StatusDot status="connected" />
            <span>FastAPI Policy Engine v1.0</span>
          </div>
          <Button variant="secondary" size="sm">Export Alerts</Button>
        </div>
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
        {filtered.map(alert => {
          const color = priorityColor(alert.priority);

          return (
            <Card key={alert.alertId} className="overflow-hidden">
              {/* Header bar */}
              <div
                className="px-5 py-3.5 border-b border-[#F1F5F9] flex items-center justify-between"
                style={{ background: `${color}08` }}
              >
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: color }} />
                  <span className="text-xs font-bold tracking-wide font-mono" style={{ color }}>{alert.priority} CASHOUT RISK</span>
                  <span className="text-xs text-[#94A3B8] font-mono">{alert.alertId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-[#94A3B8]">{alert.reportedAgo}</span>
                  {alert.isAck && (
                    <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded">
                      Acknowledged
                    </span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="p-5">
                <div className="grid grid-cols-5 gap-6 mb-4">
                  <div>
                    <div className="text-[10px] text-[#94A3B8] mb-0.5">Case ID</div>
                    <div className="text-sm font-semibold font-mono text-[#0F172A]">{alert.caseId}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#94A3B8] mb-0.5">Predicted Zone</div>
                    <div className="text-sm font-semibold text-[#0F172A]">{alert.zoneName}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#94A3B8] mb-0.5">Decision Confidence</div>
                    <div className="text-sm font-semibold font-mono" style={{ color }}>{alert.confidence}%</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#94A3B8] mb-0.5">Intervention Window (P50)</div>
                    <div className="text-sm font-semibold font-mono text-[#0F172A]">{alert.windowStr}</div>
                  </div>
                  <div>
                    <div className="text-[10px] text-[#94A3B8] mb-0.5">Amount at Risk</div>
                    <div className="text-sm font-semibold font-mono text-[#0F172A]">{formatAmountInr(alert.amount)}</div>
                  </div>
                </div>

                <div className="p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0] mb-4 text-xs text-[#64748B]">
                  <span className="font-semibold text-[#0F172A]">Action Directive:</span> {alert.reason}
                </div>

                {/* Intervention pipeline */}
                <div className="mb-4">
                  <div className="text-[10px] text-[#94A3B8] mb-2">Intervention Pipeline</div>
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
                  {!alert.isAck && (
                    <button
                      onClick={() => acknowledge(alert.caseId)}
                      className="px-4 py-2 rounded-xl bg-[#14B8A6] text-white text-xs font-semibold hover:bg-[#0F9E8E] transition-colors"
                    >
                      Acknowledge Alert
                    </button>
                  )}
                  <button
                    onClick={() => handleOpen(alert.caseId)}
                    className="px-4 py-2 rounded-xl border border-[#E2E8F0] text-xs font-medium text-[#0F172A] hover:bg-[#F7F8FA] transition-colors"
                  >
                    Open Case Workspace →
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

