import React from 'react';
import { Card } from '../components/ui';

const auditLogs = [
  { time: '14:03', officer: 'Aarav Mehta', action: 'VIEW_CASE', case: 'NCRP-26-81942', resource: 'Financial Trail', ip: '10.14.2.88', result: 'Authorised' },
  { time: '14:01', officer: 'Aarav Mehta', action: 'CREATE_ALERT', case: 'NCRP-26-81942', resource: 'Alert System', ip: '10.14.2.88', result: 'Authorised' },
  { time: '13:58', officer: 'R. Sharma', action: 'EXPORT_REPORT', case: 'NCRP-26-81911', resource: 'Report Engine', ip: '10.14.1.22', result: 'Authorised' },
  { time: '13:54', officer: 'P. Verma', action: 'VIEW_NETWORK', case: 'NCRP-26-81895', resource: 'Fraud Graph', ip: '10.14.3.51', result: 'Authorised' },
  { time: '13:51', officer: 'Admin', action: 'MODEL_RETRAIN', case: '—', resource: 'Prediction Engine', ip: '10.10.0.1', result: 'Authorised' },
  { time: '13:45', officer: 'S. Gupta', action: 'PII_ACCESS', case: 'NCRP-26-81773', resource: 'Victim Details', ip: '10.14.2.14', result: 'Authorised' },
  { time: '13:22', officer: 'Unknown', action: 'LOGIN_FAILED', case: '—', resource: 'Auth Gateway', ip: '192.168.9.212', result: 'Denied' },
  { time: '13:10', officer: 'K. Reddy', action: 'VIEW_CASE', case: 'NCRP-26-81631', resource: 'Case Overview', ip: '10.14.4.77', result: 'Authorised' },
  { time: '12:48', officer: 'D. Bose', action: 'SHARE_BANK', case: 'NCRP-26-81602', resource: 'Bank Portal', ip: '10.14.5.33', result: 'Authorised' },
  { time: '12:30', officer: 'Unknown', action: 'LOGIN_FAILED', case: '—', resource: 'Auth Gateway', ip: '203.45.12.77', result: 'Denied' },
];

const actionColors: Record<string, string> = {
  'VIEW_CASE': 'bg-blue-50 border-blue-200 text-blue-700',
  'CREATE_ALERT': 'bg-amber-50 border-amber-200 text-amber-700',
  'EXPORT_REPORT': 'bg-[#F7F8FA] border-[#E2E8F0] text-[#64748B]',
  'VIEW_NETWORK': 'bg-[#7C5CFC]/5 border-[#7C5CFC]/20 text-[#7C5CFC]',
  'MODEL_RETRAIN': 'bg-purple-50 border-purple-200 text-purple-700',
  'PII_ACCESS': 'bg-orange-50 border-orange-200 text-orange-700',
  'LOGIN_FAILED': 'bg-red-50 border-red-200 text-red-700',
  'SHARE_BANK': 'bg-teal-50 border-teal-200 text-teal-700',
};

const securityControls = [
  { label: 'Role Based Access Control', status: 'Active', icon: '🔐' },
  { label: 'Data Encryption (AES-256)', status: 'Active', icon: '🔒' },
  { label: 'Audit Trails', status: 'Active', icon: '📝' },
  { label: 'PII Masking', status: 'Active', icon: '🎭' },
  { label: 'Secure API Access', status: 'Active', icon: '🔑' },
  { label: 'Session Monitoring', status: 'Active', icon: '👁️' },
];

export default function AuditLogs() {
  return (
    <div className="p-6 space-y-5">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[#0F172A]">Security & Audit</h1>
          <p className="text-sm text-[#64748B] mt-0.5">Activity monitoring, access control, and security status for the TRINETRA platform.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-600 text-xs font-semibold">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
            All critical controls operational
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Active Users', value: '43', sub: 'Authenticated sessions', color: '#14B8A6' },
          { label: 'Privileged Sessions', value: '7', sub: 'Admin/analyst level', color: '#7C5CFC' },
          { label: 'Failed Access Attempts', value: '2', sub: 'Last 24 hours', color: '#E5484D' },
          { label: 'Sensitive Record Views', value: '184', sub: 'Today', color: '#F59E0B' },
        ].map(s => (
          <Card key={s.label} className="p-4">
            <div className="text-xs text-[#64748B] font-medium mb-2">{s.label}</div>
            <div className="text-3xl font-bold" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-[#94A3B8] mt-1">{s.sub}</div>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-4 gap-4">
        {/* Security Controls */}
        <Card className="p-4">
          <div className="font-semibold text-[#0F172A] text-sm mb-3">Security Controls</div>
          <div className="space-y-2">
            {securityControls.map(c => (
              <div key={c.label} className="flex items-center gap-3 p-2 rounded-xl bg-[#F7F8FA] border border-[#E2E8F0]">
                <span className="text-sm">{c.icon}</span>
                <span className="text-xs text-[#0F172A] flex-1">{c.label}</span>
                <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded">ACTIVE</span>
              </div>
            ))}
          </div>
        </Card>

        {/* Audit Table */}
        <div className="col-span-3">
          <Card className="overflow-hidden">
            <div className="px-4 py-3 border-b border-[#E2E8F0] flex items-center justify-between">
              <div className="font-semibold text-[#0F172A] text-sm">Audit Log</div>
              <div className="flex items-center gap-2">
                <select className="text-xs border border-[#E2E8F0] rounded-lg bg-white text-[#64748B] px-2.5 py-1.5 focus:outline-none cursor-pointer">
                  <option>All Actions</option>
                  <option>Failed Only</option>
                  <option>PII Access</option>
                </select>
                <button className="text-xs font-medium text-[#14B8A6] border border-[#14B8A6]/20 px-3 py-1.5 rounded-lg hover:bg-[#14B8A6]/5 transition-colors">
                  Export Logs
                </button>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC]">
                    {['Timestamp', 'Officer', 'Action', 'Case', 'Resource', 'IP / Device', 'Result'].map(h => (
                      <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-[#64748B] uppercase tracking-wide whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {auditLogs.map((log, i) => (
                    <tr key={i} className={`border-b border-[#F1F5F9] hover:bg-[#F7FFFE] transition-colors ${log.result === 'Denied' ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3 font-mono text-xs font-medium text-[#94A3B8]">{log.time}</td>
                      <td className="px-4 py-3 text-xs font-medium text-[#0F172A]">{log.officer}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-mono font-bold px-2 py-0.5 rounded border ${actionColors[log.action] || 'bg-[#F7F8FA] border-[#E2E8F0] text-[#64748B]'}`}>
                          {log.action}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-mono text-xs text-[#64748B]">{log.case}</td>
                      <td className="px-4 py-3 text-xs text-[#64748B]">{log.resource}</td>
                      <td className="px-4 py-3 font-mono text-xs text-[#94A3B8]">{log.ip}</td>
                      <td className="px-4 py-3">
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${log.result === 'Authorised' ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-red-50 border-red-200 text-red-600'}`}>
                          {log.result}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}
