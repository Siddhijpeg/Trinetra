import React from 'react';

// ─── Feature Tag ─────────────────────────────────────────────────────────────

export function FeatureTag({ type }: { type: 'sih' | 'usp' }) {
  if (type === 'sih') {
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest bg-blue-50 text-blue-600 border border-blue-200 dark-feature-core">
        CORE
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-widest"
      style={{ backgroundColor: 'rgba(124,92,252,0.08)', color: '#7C5CFC', border: '1px solid rgba(124,92,252,0.2)' }}>
      TRINETRA+
    </span>
  );
}

// ─── Prototype Badge ──────────────────────────────────────────────────────────

export function PrototypeBadge({ tooltip }: { tooltip?: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium cursor-default"
      style={{
        backgroundColor: 'rgba(245,158,11,0.1)',
        color: '#D97706',
        border: '1px solid rgba(245,158,11,0.25)',
      }}
      title={tooltip || 'Prototype simulation — will be driven by real model output in production.'}
    >
      SIM
    </span>
  );
}

// ─── Section Label ────────────────────────────────────────────────────────────

export function SectionLabel({ children, type }: { children: React.ReactNode; type?: 'sih' | 'usp' | 'neutral' }) {
  const styles = {
    sih: { color: '#3B82F6', borderColor: '#BFDBFE' },
    usp: { color: '#7C5CFC', borderColor: 'rgba(124,92,252,0.25)' },
    neutral: { color: 'var(--text-muted)', borderColor: 'var(--border)' },
  };
  const s = styles[type || 'neutral'];
  return (
    <div
      className="inline-flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest border-l-2 pl-2.5 mb-3"
      style={{ color: s.color, borderColor: s.borderColor }}
    >
      {children}
    </div>
  );
}

// ─── Risk Badge ──────────────────────────────────────────────────────────────

type RiskLevel = 'critical' | 'high' | 'medium' | 'low' | 'resolved' | 'verified' | 'partial' | 'misleading';

export function RiskBadge({ level, score }: { level: RiskLevel; score?: number }) {
  const classMap: Record<RiskLevel, string> = {
    critical:   'risk-critical',
    high:       'risk-high',
    medium:     'risk-medium',
    low:        'risk-low',
    resolved:   'risk-resolved',
    verified:   'risk-low',
    partial:    'risk-medium',
    misleading: 'risk-critical',
  };
  const labelMap: Record<RiskLevel, string> = {
    critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low',
    resolved: 'Resolved', verified: 'Verified', partial: 'Partial', misleading: 'Misleading',
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold font-mono ${classMap[level]}`}>
      {score !== undefined && <span>{score}</span>}
      {labelMap[level].toUpperCase()}
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
    <div
      className={`rounded-2xl border card-theme ${className}`}
      style={{ transition: 'background-color 0.2s ease, border-color 0.2s ease' }}
    >
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
        <span className="text-xs font-medium uppercase tracking-wide" style={{ color: 'var(--text-secondary)' }}>{title}</span>
        {icon && (
          <div className="w-8 h-8 rounded-lg flex items-center justify-center"
            style={{ background: `${accentColor}18` }}>
            {icon}
          </div>
        )}
      </div>
      <div>
        <div className="text-3xl font-bold leading-none" style={{ color: 'var(--text-primary)' }}>{value}</div>
        {sub && <div className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>{sub}</div>}
      </div>
      {trend && (
        <div className="text-xs font-medium text-emerald-500 flex items-center gap-1">
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M2 9L6 3L10 9" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
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
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>{title}</h1>
        {subtitle && <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>{subtitle}</p>}
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
    <div
      className="flex gap-1 rounded-xl p-1 border"
      style={{ backgroundColor: 'var(--surface-secondary)', borderColor: 'var(--border)' }}
    >
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => onChange(tab.id)}
          className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
          style={
            active === tab.id
              ? { backgroundColor: 'var(--surface)', color: 'var(--text-primary)', boxShadow: '0 1px 3px rgba(0,0,0,0.1)', border: '1px solid var(--border)' }
              : { backgroundColor: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' }
          }
        >
          {tab.label}
          {tab.count !== undefined && (
            <span
              className="ml-2 px-1.5 py-0.5 rounded text-xs"
              style={{ backgroundColor: 'var(--surface-secondary)', color: 'var(--text-muted)' }}
            >
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

  const getVariantStyle = () => {
    switch (variant) {
      case 'primary':
        return { backgroundColor: '#14B8A6', color: '#FFFFFF', border: '1px solid transparent' };
      case 'secondary':
        return { backgroundColor: 'var(--surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' };
      case 'ghost':
        return { backgroundColor: 'transparent', color: 'var(--text-secondary)', border: '1px solid transparent' };
      case 'danger':
        return { backgroundColor: 'var(--surface)', color: '#E5484D', border: '1px solid rgba(229,72,77,0.2)' };
      case 'ai':
        return { background: 'linear-gradient(135deg, #7C5CFC 0%, #4338CA 100%)', color: '#FFFFFF', border: '1px solid transparent' };
      default:
        return {};
    }
  };

  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 rounded-lg font-medium transition-all ${sizes[size]} ${className}`}
      style={getVariantStyle()}
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
        <div
          className="w-2.5 h-2.5 rounded-full border-2 mt-1"
          style={{
            backgroundColor: isHighlight ? '#14B8A6' : 'var(--surface)',
            borderColor: isHighlight ? '#14B8A6' : 'var(--border-strong)',
          }}
        />
        {!isLast && <div className="w-px flex-1 mt-1" style={{ backgroundColor: 'var(--border)' }} />}
      </div>
      <div className="pb-4">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs font-medium text-[#14B8A6]">{time}</span>
          <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{label}</span>
          {isHighlight && <span className="risk-critical px-1.5 py-0.5 rounded text-xs font-mono">ALERT</span>}
        </div>
        {desc && <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{desc}</p>}
      </div>
    </div>
  );
}

// ─── AI Card ──────────────────────────────────────────────────────────────────

export function AICard({ title, children, className = '' }: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl overflow-hidden ${className}`}
      style={{ border: '1px solid rgba(124,92,252,0.2)' }}>
      {title && (
        <div className="ai-gradient px-5 py-3.5 flex items-center gap-2">
          <SparkleIcon />
          <span className="text-sm font-semibold text-white">{title}</span>
        </div>
      )}
      <div className="ai-gradient-subtle p-5">
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
      <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="16" height="16" viewBox="0 0 16 16" fill="none"
        style={{ color: 'var(--text-muted)' }}>
        <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.5"/>
        <path d="M11 11L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      </svg>
      <input
        type="text"
        placeholder={placeholder}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        className="w-full pl-9 pr-4 py-2 text-sm rounded-xl border outline-none transition-all input-theme"
        style={{
          backgroundColor: 'var(--input-bg)',
          borderColor: 'var(--input-border)',
          color: 'var(--input-text)',
        }}
        onFocus={e => {
          (e.target as HTMLInputElement).style.borderColor = 'var(--input-border-focus)';
          (e.target as HTMLInputElement).style.boxShadow = '0 0 0 3px rgba(20,184,166,0.1)';
        }}
        onBlur={e => {
          (e.target as HTMLInputElement).style.borderColor = 'var(--input-border)';
          (e.target as HTMLInputElement).style.boxShadow = 'none';
        }}
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
      className="text-sm rounded-xl border px-3 py-2 outline-none transition-all cursor-pointer"
      style={{
        backgroundColor: 'var(--input-bg)',
        borderColor: 'var(--input-border)',
        color: 'var(--input-text)',
      }}
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
      <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: 'var(--border-subtle)' }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${value}%`, background: color }} />
      </div>
      <span className="text-xs font-mono font-medium w-8 text-right" style={{ color: 'var(--text-secondary)' }}>+{value}%</span>
      <span className="text-xs flex-[2]" style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  );
}

// ─── Chip ─────────────────────────────────────────────────────────────────────

export function Chip({ label, onClick, active }: { label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      className="px-3 py-1.5 rounded-lg text-xs font-medium border transition-all"
      style={
        active
          ? { backgroundColor: 'rgba(20,184,166,0.1)', borderColor: 'rgba(20,184,166,0.3)', color: '#0D9488' }
          : { backgroundColor: 'var(--surface)', borderColor: 'var(--border)', color: 'var(--text-secondary)' }
      }
    >
      {label}
    </button>
  );
}

// ─── Themed Recharts Tooltip ──────────────────────────────────────────────────
// Shared tooltip component that respects theme tokens.

export function ThemedTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean;
  payload?: any[];
  label?: string;
  formatter?: (value: any, payload: any) => React.ReactNode;
}) {
  if (!active || !payload?.length) return null;
  const value = payload[0]?.value;
  return (
    <div
      className="rounded-xl px-3 py-2 shadow-xl text-xs font-sans border"
      style={{
        backgroundColor: 'var(--chart-tooltip-bg)',
        color: 'var(--chart-tooltip-text)',
        borderColor: 'var(--border)',
      }}
    >
      {formatter ? formatter(value, payload[0]) : (
        <>
          <div className="font-mono font-bold" style={{ color: '#14B8A6' }}>{value}</div>
          {label && <div className="opacity-70 text-[10px] mt-0.5">{label}</div>}
        </>
      )}
    </div>
  );
}
