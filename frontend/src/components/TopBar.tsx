import React, { useState } from 'react';
import { useTheme } from '../context/ThemeContext';

export default function TopBar({
  breadcrumb,
  onCopilotOpen,
  officerId,
}: {
  breadcrumb?: string;
  onCopilotOpen?: () => void;
  officerId?: string;
}) {
  const [searchFocused, setSearchFocused] = useState(false);
  const { theme, toggleTheme } = useTheme();

  return (
    <div
      className="h-14 flex items-center px-6 gap-4 border-b shrink-0 topbar-theme"
      style={{ transition: 'background-color 0.2s ease, border-color 0.2s ease' }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>
        <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>TRINETRA</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{breadcrumb || 'Command Center'}</span>
      </div>

      {/* Global Search */}
      <div className={`flex-1 max-w-xl relative transition-all ${searchFocused ? 'max-w-2xl' : ''}`}>
        <div
          className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-sm transition-all"
          style={{
            backgroundColor: searchFocused ? 'var(--input-bg-focus)' : 'var(--input-bg)',
            borderColor: searchFocused ? 'var(--input-border-focus)' : 'var(--input-border)',
            boxShadow: searchFocused ? '0 0 0 3px rgba(20,184,166,0.1)' : 'none',
          }}
        >
          <svg style={{ color: 'var(--text-muted)', flexShrink: 0 }} width="14" height="14" viewBox="0 0 15 15" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search case, account, ATM, district…"
            className="flex-1 bg-transparent outline-none text-sm"
            style={{ color: 'var(--input-text)' }}
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <div className="flex items-center gap-1 flex-shrink-0">
            <kbd
              className="px-1.5 py-0.5 text-[10px] font-mono rounded"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', border: '1px solid var(--border)', backgroundColor: 'var(--surface-secondary)' }}
            >⌘</kbd>
            <kbd
              className="px-1.5 py-0.5 text-[10px] font-mono rounded"
              style={{ color: 'var(--text-muted)', borderColor: 'var(--border)', border: '1px solid var(--border)', backgroundColor: 'var(--surface-secondary)' }}
            >K</kbd>
          </div>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-2.5 ml-auto">

        {/* Secure Session Badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
          <span className="text-xs font-medium" style={{ color: 'var(--text-primary)' }}>Secure Session</span>
        </div>

        {/* ── Theme Toggle ── */}
        <button
          onClick={toggleTheme}
          title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
          className="relative w-9 h-9 flex items-center justify-center rounded-xl border transition-colors"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          {theme === 'light' ? (
            /* Moon icon — clicking switches to dark */
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-secondary)' }}>
              <path
                d="M14 10.5A6.5 6.5 0 0 1 5.5 2a6.5 6.5 0 1 0 8.5 8.5Z"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
              />
            </svg>
          ) : (
            /* Sun icon — clicking switches to light */
            <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-secondary)' }}>
              <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4"/>
              <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3.22 3.22l1.06 1.06M11.72 11.72l1.06 1.06M3.22 12.78l1.06-1.06M11.72 4.28l1.06-1.06"
                stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
            </svg>
          )}
        </button>

        {/* Notification Bell */}
        <button
          className="relative w-9 h-9 flex items-center justify-center rounded-xl border transition-colors"
          style={{ borderColor: 'var(--border)', backgroundColor: 'var(--surface)' }}
        >
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none" style={{ color: 'var(--text-secondary)' }}>
            <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6V9.5L2 11H14L12.5 9.5V6C12.5 3.5 10.5 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M6.5 11C6.5 11.83 7.17 12.5 8 12.5C8.83 12.5 9.5 11.83 9.5 11" stroke="currentColor" strokeWidth="1.3"/>
          </svg>
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#E5484D] border-2"
            style={{ borderColor: 'var(--surface)' }} />
        </button>

        {/* AI Copilot Button */}
        <button
          onClick={onCopilotOpen}
          className="flex items-center gap-2 px-3 py-2 rounded-xl text-white text-xs font-semibold transition-opacity hover:opacity-90"
          style={{ background: 'linear-gradient(135deg, #7C5CFC 0%, #4338CA 100%)' }}
        >
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
            <path d="M6.5 1L7.8 5.2L12 6.5L7.8 7.8L6.5 12L5.2 7.8L1 6.5L5.2 5.2L6.5 1Z" fill="white" opacity="0.9"/>
          </svg>
          Copilot
        </button>

        {/* Avatar */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center text-[#0D9488] text-xs font-bold border"
          style={{ backgroundColor: 'rgba(20,184,166,0.15)', borderColor: 'rgba(20,184,166,0.2)' }}
        >
          {officerId ? officerId.slice(0, 2).toUpperCase() : 'AM'}
        </div>
      </div>
    </div>
  );
}
