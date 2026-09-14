import React, { useState } from 'react';
import { Card, Button, FeatureTag, StatusDot } from '../components/ui';
import { useCaseContext, getZoneLabel, priorityColor, formatAmountInr } from '../context/CaseContext';

export default function AlertCenter({ onOpenCase }: { onOpenCase?: (caseId?: string) => void }) {
  const [activeTab, setActiveTab] = useState<string>('all');
  const [acknowledgedIds, setAcknowledgedIds] = useState<Set<string>>(new Set());

  const { caseList, getFinalPrediction, setActiveCase } = useCaseContext();

  const handleOpen = (caseId: string) => {
    setActiveCase(caseId);
    if (onOpenCase) onOpenCase(caseId);
  };

  const alertsDerived = caseList.map(item => {
    const pred     = getFinalPrediction(item.case_id);
    // V2 decision: dec.decision ("CRITICAL"|"REVIEW"|"MONITOR"), dec.decision_confidence (0-1)
    const decision  = pred?.decision?.decision || 'MONITOR';
    const topZoneId = pred?.geographic?.predicted_destination_zone || '';
    // Prefer inline zone metadata from ranked_zones, fall back to zone ID
    const rz0       = pred?.geographic?.ranked_zones?.[0];
    const zoneName  = rz0
      ? (rz0.district || rz0.zone_name || rz0.zone_id)
      : (getZoneLabel(topZoneId) || '—');
    const confidence = Math.round((pred?.decision?.decision_confidence ?? 0) * 100);
    const dist  = pred?.timing?.intervention_distribution;
    const p50   = dist?.p50_minutes ? Math.round(dist.p50_minutes) : 45;
    const p25   = dist?.p25_minutes ? Math.round(dist.p25_minutes) : 20;
    const p75   = dist?.p75_minutes ? Math.round(dist.p75_minutes) : 75;
    const amount = item.amount_inr;
    const isAck  = acknowledgedIds.has(item.case_id);
    const reasons = pred?.decision?.reasons ?? [];

    return {
      alertId:        `ALT-${item.case_id.slice(-5)}`,
      caseId:         item.case_id,
      decision,
      zoneName,
      confidence,
      windowStr:      `~${p50} min (${p25}–${p75} min)`,
      p50,
      amount,
      reportedAgo:    item.complaint_available_timestamp?.slice(0, 16) ?? '—',
      isAck,
      reason:         reasons[0] ?? 'Assessment based on geographic and temporal model signals.',
      timelineSteps:  ['Complaint Intake', 'Hop Ingestion', 'M8 Zone Inferred', 'Intervention Window Active'],
      completedSteps: item.hop_count + 1,
    };
  });

  const filtered = alertsDerived.filter(a => {
    if (activeTab === 'critical') return a.decision === 'CRITICAL';
    if (activeTab === 'unacknowledged') return !a.isAck;
    if (activeTab === 'acknowledged') return a.isAck;
    return true;
  });

  const acknowledge = (caseId: string) => setAcknowledgedIds(prev => new Set([...prev, caseId]));

  const statusTabs = [
    { id: 'all', label: 'All Alerts', count: alertsDerived.length },
    { id: 'critical', label: 'Critical Priority', count: alertsDerived.filter(a => a.decision === 'CRITICAL').length },
    { id: 'unacknowledged', label: 'Unacknowledged', count: alertsDerived.filter(a => !a.isAck).length },
    { id: 'acknowledged', label: 'Acknowledged', count: alertsDerived.filter(a => a.isAck).length },
  ];

  return (
    <div className="p-7 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <h1 className="text-[24px] font-bold leading-tight" style={{ color: 'var(--text-primary)' }}>Predictive Alert Center</h1>
            <FeatureTag type="sih" />
          </div>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Automated alerts derived from backend Deterministic Policy v1.0 & Geographic M8 inference.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs font-mono mr-2" style={{ color: 'var(--text-muted)' }}>
            <StatusDot status="connected" />
            <span>FastAPI Policy Engine v1.0</span>
          </div>
          <Button variant="secondary" size="sm">Export Alerts</Button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-xl p-1 border w-fit" style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)' }}>
        {statusTabs.map(tab => (
          <button key={tab.id} onClick={() => setActiveTab(tab.id)}
            className="px-4 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center gap-2"
            style={activeTab === tab.id
              ? { backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }
              : { backgroundColor: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' }
            }>
            {tab.label}
            <span className="px-1.5 py-0.5 rounded text-[10px]"
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-muted)' }}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Alert cards */}
      <div className="space-y-4">
        {filtered.map(alert => {
          const color = priorityColor(alert.decision);

          return (
            <Card key={alert.alertId} className="overflow-hidden">
              {/* Header bar */}
              <div className="px-5 py-3.5 border-b flex items-center justify-between"
                style={{ backgroundColor: `${color}08`, borderColor: 'var(--border-subtle)' }}>
                <div className="flex items-center gap-3">
                  <div className="w-2 h-2 rounded-full pulse-dot" style={{ background: color }} />
                  <span className="text-xs font-bold tracking-wide font-mono" style={{ color }}>{alert.decision} CASHOUT RISK</span>
                  <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{alert.alertId}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>{alert.reportedAgo}</span>
                  {alert.isAck && (
                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded" style={{ color: '#059669', backgroundColor: 'rgba(16,185,129,0.1)', border: '1px solid rgba(16,185,129,0.2)' }}>
                      Acknowledged
                    </span>
                  )}
                </div>
              </div>

              {/* Body */}
              <div className="p-5">
                <div className="grid grid-cols-5 gap-6 mb-4">
                  {[
                    { label: 'Case ID', val: <span className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{alert.caseId}</span> },
                    { label: 'Predicted Zone', val: <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{alert.zoneName}</span> },
                    { label: 'Decision Confidence', val: <span className="text-sm font-semibold font-mono" style={{ color }}>{alert.confidence}%</span> },
                    { label: 'Intervention Window (P50)', val: <span className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{alert.windowStr}</span> },
                    { label: 'Amount at Risk', val: <span className="text-sm font-semibold font-mono" style={{ color: 'var(--text-primary)' }}>{formatAmountInr(alert.amount)}</span> },
                  ].map(f => (
                    <div key={f.label}>
                      <div className="text-[10px] mb-0.5" style={{ color: 'var(--text-muted)' }}>{f.label}</div>
                      {f.val}
                    </div>
                  ))}
                </div>

                <div className="p-3 rounded-xl border mb-4 text-xs" style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }}>
                  <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>Action Directive:</span> {alert.reason}
                </div>

                {/* Intervention pipeline */}
                <div className="mb-4">
                  <div className="text-[10px] mb-2" style={{ color: 'var(--text-muted)' }}>Intervention Pipeline</div>
                  <div className="flex items-center gap-2">
                    {alert.timelineSteps.map((step, i) => (
                      <React.Fragment key={i}>
                        <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-medium border"
                          style={i < alert.completedSteps
                            ? { backgroundColor: 'rgba(16,185,129,0.1)', color: '#059669', borderColor: 'rgba(16,185,129,0.3)' }
                            : { backgroundColor: 'var(--surface-secondary)', color: 'var(--text-muted)', borderColor: 'var(--border)' }
                          }>
                          {i < alert.completedSteps && (
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="none">
                              <path d="M1.5 4L3 5.5L6.5 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                            </svg>
                          )}
                          {step}
                        </div>
                        {i < alert.timelineSteps.length - 1 && (
                          <div className="h-px flex-1"
                            style={{ backgroundColor: i < alert.completedSteps - 1 ? 'rgba(16,185,129,0.3)' : 'var(--border)' }} />
                        )}
                      </React.Fragment>
                    ))}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                  {!alert.isAck && (
                    <button onClick={() => acknowledge(alert.caseId)}
                      className="px-4 py-2 rounded-xl bg-[#14B8A6] text-white text-xs font-semibold hover:bg-[#0F9E8E] transition-colors">
                      Acknowledge Alert
                    </button>
                  )}
                  <button onClick={() => handleOpen(alert.caseId)}
                    className="px-4 py-2 rounded-xl text-xs font-medium border transition-colors"
                    style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)', color: 'var(--text-primary)' }}>
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

