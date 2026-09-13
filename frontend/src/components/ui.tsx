import React from 'react';

// ─── Feature Tag ─────────────────────────────────────────────────────────────

export function FeatureTag({ type }: { type: 'sih' | 'usp' }) {
  if (type === 'sih') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-blue-50 text-blue-600 border border-blue-200">
        CORE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-[#7C5CFC]/8 text-[#7C5CFC] border border-[#7C5CFC]/20">
      TRINETRA+
    </span>
  );
}

// ─── Prototype Badge ──────────────────────────────────────────────────────────
// Used sparingly to label frontend-simulated features without cluttering the UI

export function PrototypeBadge({ tooltip }: { tooltip?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium bg-amber-50 text-amber-600 border border-amber-200 cursor-default"
      title={tooltip || 'Prototype simulation — will be driven by real model output in production.'}
    >
      SIM
    </span>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────

export function SectionLabel({ children, type }: { children: React.ReactNode; type?: 'sih' | 'usp' | 'neutral' }) {
  const styles = {
    sih: 'text-blue-500 border-blue-200',
    usp: 'text-[#7C5CFC] border-[#7C5CFC]/25',
    neutral: 'text-[#94A3B8] border-[#E2E8F0]',
  };
  const s = styles[type || 'neutral'];
  return (
    <div className={`inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border-l-2 pl-2.5 mb-3 ${s}`}>
      {children}
    </div>
  );
}

// ─── Risk Badge ──────────────────────────────────────────────────────────────

type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'resolved' | 'verified' | 'partial' | 'misleading';

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const configs: Record<RiskLevel, { label: string; className: string }> = {
    critical: { label: 'Critical', className: 'risk-critical' },
    high: { label: 'High', className: 'risk-high' },
    medium: { label: 'Medium', className: 'risk-medium' },
    low: { label: 'Low', className: 'risk-low' },
    resolved: { label: 'Resolved', className: 'risk-resolved' },
    verified: { label: 'Verified', className: 'risk-low' },
    partial: { label: 'Partial', className: 'risk-medium' },
    misleading: { label: 'Misleading', className: 'risk-critical' },
  };
  const c = configs[level];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold font-mono ${c.className}`}>
      {score !== undefined && <span>{score}</span>}
      {c.label.toUpperCase()}
    </span>
  );
}

// ─── Status Dot ──────────────────────────────────────────────────────────────

export function StatusDot({ status }: { status: 'live' | 'connected' | 'limited' | 'offline' }) {
  const colors = {
    live: 'bg-emerald-400',
    connected: 'bg-emerald-400',
    limited: 'bg-amber-400',
    offline: 'bg-red-400',
  };
  return <span className={`inline-block w-2 h-2 rounded-full ${colors[status]}`} />;
}

// ─── Card ─────────────────────────────────────────────────────────────────────

export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`bg-white rounded-2xl border border-[#E2E8F0] shadow-[0_1px_4px_rgba(0,0,0,0.06)] ${className}`}>
      {children}
    </div>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

export function KPICard({
  title, value, sub, trend, icon, accentColor = '#14B8A6',
}: {
  title: string; value: string; sub?: string; trend?: string; icon?: React.ReactNode; accentColor?: string;
}) {
  return (
    <Card className="p-5 flex flex-col gap-3">
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium text-[#64748B] uppercase tracking-wide">{title}</span>
        {icon && <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${accentColor}18` }}>{icon}</div>}
      </div>
      <div>
        <div className="text-3xl font-bold text-[#0F172A] leading-none">{value}</div>
        {sub && <div className="text-xs text-[#64748B] mt-1">{sub}</div>}
      </div>
      {trend && (
        <div className="text-xs font-medium text-emerald-600 flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M2 9L6 3L10 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
          {trend}
        </div>
      )}
    </Card>
  );
}

// ─── Section Header ───────────────────────────────────────────────────────────

export function SectionHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-6">
      <div>
        <h1 className="text-2xl font-bold text-[#0F172A]">{title}</h1>
        {subtitle && <p className="text-sm text-[#64748B] mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────

export function Tabs({
  tabs, active, onChange,
}: {
  tabs: { id: string; label: string; count?: number }[];
  active: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex gap-1 bg-[#F7F8FA] rounded-xl p-1 border border-[#E2E8F0]">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
            active === tab.id
              ? 'bg-white text-[#0F172A] shadow-sm border border-[#E2E8F0]'
              : 'text-[#64748B] hover:text-[#0F172A]'
          }`}
        >
          {tab.label}
          {tab.count !== undefined && (
            <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${active === tab.id ? 'bg-[#F1F5F9]' : 'bg-[#E2E8F0]'}`}>
              {tab.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

// ─── Button ───────────────────────────────────────────────────────────────────

export function Button({
  children, variant = 'primary', size = 'md', onClick, className = '', icon,
}: {
  children: React.ReactNode;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'ai';
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
  icon?: React.ReactNode;
}) {
  const sizes = { sm: 'px-3 py-1.5 text-xs', md: 'px-4 py-2 text-sm', lg: 'px-5 py-2.5 text-sm' };
  const variants = {
    primary: 'bg-[#14B8A6] text-white hover:bg-[#0F9E8E] border border-transparent',
    secondary: 'bg-white text-[#0F172A] hover:bg-[#F7F8FA] border border-[#E2E8F0]',
    ghost: 'bg-transparent text-[#64748B] hover:bg-[#F7F8FA] hover:text-[#0F172A] border border-transparent',
    danger: 'bg-white text-[#E5484D] hover:bg-[#FFF1F1] border border-[#E5484D]/20',
    ai: 'ai-gradient text-white border border-transparent hover:opacity-90',
  };
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg font-medium transition-all ${sizes[size]} ${variants[variant]} ${className}`}
    >
      {icon && icon}
      {children}
    </button>
  );
}

// ─── Timeline Event ───────────────────────────────────────────────────────────

export function TimelineEvent({
  time, label, desc, isLast, isHighlight,
}: {
  time: string; label: string; desc?: string; isLast?: boolean; isHighlight?: boolean;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex flex-col items-center">
        <div className={`w-2.5 h-2.5 rounded-full border-2 mt-1 ${isHighlight ? 'bg-[#14B8A6] border-[#14B8A6]' : 'bg-white border-[#CBD5E1]'}`} />
        {!isLast && <div className="w-px bg-[#E2E8F0] flex-1 mt-1" />}
      </div>
      <div className="pb-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-[#14B8A6]">{time}</span>
          <span className="text-sm font-medium text-[#0F172A]">{label}</span>
          {isHighlight && <span className="risk-critical px-1.5 py-0.5 rounded text-xs font-mono">ALERT</span>}
        </div>
        {desc && <p className="text-xs text-[#64748B] mt-0.5">{desc}</p>}
      </div>
    </div>
  );
}

// ─── AI Card ──────────────────────────────────────────────────────────────────

export function AICard({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-[#7C5CFC]/20 overflow-hidden ${className}`}>
      {title && (
        <div className="ai-gradient px-5 py-3.5 flex items-center gap-2">
          <SparkleIcon />
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
      )}
      <div className="bg-gradient-to-br from-[#7C5CFC]/5 to-[#4338CA]/3 p-5">
        {children}
      </div>
    </div>
  );
}

// ─── Icons ────────────────────────────────────────────────────────────────────

export function SparkleIcon({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" fill="none">
      <path d="M8 1L9.5 6.5L15 8L9.5 9.5L8 15L6.5 9.5L1 8L6.5 6.5L8 1Z" fill="white" opacity="0.9"/>
    </svg>
  );
}

export function ChevronRightIcon({ size = 14 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 14 14" fill="none">
      <path d="M5 3L9 7L5 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
}

// ─── Search Bar ───────────────────────────────────────────────────────────────

export function SearchBar({
  placeholder, value, onChange, className = '',
}: {
  placeholder?: string; value?: string; onChange?: (v: string) => void; className?: string;
}) {
  return (
    <div className={`relative ${className}`}>
      <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-[#94A3B8]" width="16" height="16" viewBox="0 0 16 16" fill="none">
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        className="w-full pl-9 pr-4 py-2 text-sm border border-[#E2E8F0] rounded-xl bg-white text-[#0F172A] placeholder:text-[#94A3B8] focus:outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/10 transition-all"
      />
    </div>
  );
}

// ─── Filter Select ────────────────────────────────────────────────────────────

export function FilterSelect({
  label, options, value, onChange,
}: {
  label: string;
  options: string[];
  value?: string;
  onChange?: (v: string) => void;
}) {
  return (
    <select
      value={value}
      onChange={e => onChange?.(e.target.value)}
      className="text-sm border border-[#E2E8F0] rounded-xl bg-white text-[#0F172A] px-3 py-2 focus:outline-none focus:border-[#14B8A6] focus:ring-2 focus:ring-[#14B8A6]/10 transition-all cursor-pointer"
    >
      <option value="">{label}</option>
      {options.map(o => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}

// ─── Confidence Bar ───────────────────────────────────────────────────────────

export function ConfidenceBar({ label, value, color = '#14B8A6' }: { label: string; value: number; color?: string }) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-1.5 bg-[#F1F5F9] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-mono font-medium text-[#64748B] w-8 text-right">+{value}%</span>
      <span className="text-xs text-[#64748B] flex-[2]">{label}</span>
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({ label, onClick, active }: { label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
        active
          ? 'bg-[#14B8A6]/10 border-[#14B8A6]/30 text-[#0F9E8E]'
          : 'bg-white border-[#E2E8F0] text-[#64748B] hover:border-[#14B8A6]/30 hover:text-[#0F172A]'
      }`}
    >
      {label}
    </button>
  );
}
