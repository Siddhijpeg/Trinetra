import React, { useState } from 'react';

interface LoginProps {
  onLogin: (role: string, name: string) => void;
}

const ROLES = [
  { value: 'investigator',  label: 'Investigator' },
  { value: 'bank-officer',  label: 'Bank Officer' },
  { value: 'analyst',       label: 'Intelligence Analyst' },
  { value: 'supervisor',    label: 'Supervisor' },
];

export default function Login({ onLogin }: LoginProps) {
  const [officerId, setOfficerId]     = useState('');
  const [password, setPassword]       = useState('');
  const [role, setRole]               = useState('investigator');
  const [error, setError]             = useState('');
  const [loading, setLoading]         = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!officerId.trim()) { setError('Officer ID is required.'); return; }
    if (!password.trim())  { setError('Password is required.'); return; }
    setError('');
    setLoading(true);
    // Prototype: accepts any credentials
    setTimeout(() => {
      const roleName = ROLES.find(r => r.value === role)?.label ?? 'Investigator';
      onLogin(role, officerId.trim());
      setLoading(false);
    }, 800);
  };

  return (
    <div className="min-h-screen flex" style={{ background: '#F7F8FA' }}>

      {/* ── Left Branding Panel ── */}
      <div
        className="hidden lg:flex flex-col justify-between w-[45%] min-h-screen p-12"
        style={{ background: 'linear-gradient(160deg, #0F172A 0%, #15171A 60%, #14B8A6 200%)' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-2xl flex items-center justify-center"
            style={{ background: 'linear-gradient(135deg, #14B8A6, #0D9488)' }}
          >
            <TrinetraLogoMark />
          </div>
          <span className="text-white font-bold text-lg tracking-tight">TRINETRA</span>
        </div>

        {/* Center Content */}
        <div>
          <div className="mb-6">
            <div className="text-5xl font-bold text-white leading-tight mb-3">
              Predict.<br />Prevent.<br />Protect.
            </div>
            <p className="text-[#94A3B8] text-base leading-relaxed max-w-sm">
              Proactive financial fraud intervention through explainable geospatial intelligence.
            </p>
          </div>

          {/* Security indicators */}
          <div className="space-y-3">
            {[
              { icon: <LockIcon />, label: 'End-to-End Encrypted Session' },
              { icon: <ShieldIcon />, label: 'Role-Based Access Control' },
              { icon: <AuditIcon />, label: 'Full Audit Trail Enabled' },
            ].map((item, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-[#14B8A6]"
                  style={{ background: 'rgba(20,184,166,0.1)' }}>
                  {item.icon}
                </div>
                <span className="text-sm text-[#94A3B8]">{item.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="text-[11px] text-[#475569]">
          TRINETRA · SIH 2026 · Authorized Personnel Only
        </div>
      </div>

      {/* ── Right Login Panel ── */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">

          {/* Mobile logo */}
          <div className="flex items-center gap-3 mb-8 lg:hidden">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center"
              style={{ background: 'linear-gradient(135deg, #14B8A6, #0D9488)' }}>
              <TrinetraLogoMark />
            </div>
            <span className="font-bold text-[#0F172A] text-base">TRINETRA</span>
          </div>

          <div className="bg-white rounded-2xl border border-[#E2E8F0] p-8 shadow-sm">
            {/* Header */}
            <div className="mb-8">
              <h1 className="text-2xl font-bold text-[#0F172A] mb-1.5">Sign in to TRINETRA</h1>
              <p className="text-sm text-[#64748B]">Authorized personnel only. This session is audited.</p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Officer ID */}
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
                  Officer ID / Official Email
                </label>
                <input
                  id="officer-id"
                  type="text"
                  value={officerId}
                  onChange={e => setOfficerId(e.target.value)}
                  placeholder="officer.id@cybercell.gov.in"
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F7F8FA] text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/30 focus:border-[#14B8A6] transition-all"
                />
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F7F8FA] text-sm text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/30 focus:border-[#14B8A6] transition-all"
                />
              </div>

              {/* Role */}
              <div>
                <label className="block text-xs font-semibold text-[#64748B] mb-1.5 uppercase tracking-wide">
                  Role
                </label>
                <select
                  id="role-select"
                  value={role}
                  onChange={e => setRole(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl border border-[#E2E8F0] bg-[#F7F8FA] text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#14B8A6]/30 focus:border-[#14B8A6] transition-all cursor-pointer"
                >
                  {ROLES.map(r => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </select>
              </div>

              {/* Error */}
              {error && (
                <div className="text-xs text-[#E5484D] bg-red-50 border border-red-100 px-3 py-2 rounded-lg">
                  {error}
                </div>
              )}

              {/* Submit */}
              <button
                id="login-submit"
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl text-white text-sm font-semibold flex items-center justify-center gap-2 transition-opacity hover:opacity-90 disabled:opacity-60"
                style={{ background: 'linear-gradient(135deg, #14B8A6 0%, #0D9488 100%)' }}
              >
                {loading ? (
                  <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="4"/>
                    <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                  </svg>
                ) : (
                  <>Secure Sign In <span className="text-white/80">→</span></>
                )}
              </button>
            </form>

            {/* Divider */}
            <div className="flex items-center gap-3 my-5">
              <div className="flex-1 h-px bg-[#E2E8F0]" />
              <span className="text-xs text-[#94A3B8]">or</span>
              <div className="flex-1 h-px bg-[#E2E8F0]" />
            </div>

            {/* SSO (disabled for prototype) */}
            <button
              disabled
              className="w-full py-2.5 rounded-xl border border-[#E2E8F0] text-sm text-[#94A3B8] flex items-center justify-center gap-2 cursor-not-allowed"
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <rect x="1.5" y="4" width="11" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M4 4V3C4 2.17 4.67 1.5 5.5 1.5H8.5C9.33 1.5 10 2.17 10 3V4" stroke="currentColor" strokeWidth="1.2"/>
              </svg>
              Sign in with Government SSO
              <span className="text-[10px] bg-[#F1F5F9] text-[#94A3B8] px-1.5 py-0.5 rounded ml-1">Prototype</span>
            </button>

            {/* Bottom note */}
            <p className="text-center text-[11px] text-[#94A3B8] mt-6">
              Authorized personnel only · Unauthorized access is a criminal offence
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

function TrinetraLogoMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="5" r="2.5" fill="white" opacity="0.95"/>
      <circle cx="4.5" cy="13" r="2.5" fill="white" opacity="0.75"/>
      <circle cx="13.5" cy="13" r="2.5" fill="white" opacity="0.75"/>
      <path d="M9 7.5L4.5 10.5M9 7.5L13.5 10.5M4.5 10.5L13.5 10.5" stroke="white" strokeWidth="1.2" opacity="0.5"/>
    </svg>
  );
}
function LockIcon() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><rect x="2" y="5" width="9" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.2"/><path d="M4 5V4C4 2.9 4.9 2 6 2H7C8.1 2 9 2.9 9 4V5" stroke="currentColor" strokeWidth="1.2"/></svg>;
}
function ShieldIcon() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M6.5 1.5L11 3.5V7C11 9.5 9 11.5 6.5 12C4 11.5 2 9.5 2 7V3.5L6.5 1.5Z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/></svg>;
}
function AuditIcon() {
  return <svg width="13" height="13" viewBox="0 0 13 13" fill="none"><path d="M2.5 3.5H10.5M2.5 6.5H8M2.5 9.5H6" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/></svg>;
}
