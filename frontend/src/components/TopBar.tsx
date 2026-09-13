import React, { useState } from 'react';

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

  return (
    <div
      className="h-14 flex items-center px-6 gap-4 border-b shrink-0"
      style={{ background: '#FFFFFF', borderColor: '#E2E8F0' }}
    >
      {/* Breadcrumb */}
      <div className="flex items-center gap-1.5 text-sm text-[#94A3B8] whitespace-nowrap">
        <span className="text-[#64748B] font-medium">TRINETRA</span>
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
          <path d="M4 2L8 6L4 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        <span className="text-[#0F172A] font-medium">{breadcrumb || 'Command Center'}</span>
      </div>

      {/* Global Search */}
      <div className={`flex-1 max-w-xl relative transition-all ${searchFocused ? 'max-w-2xl' : ''}`}>
        <div className={`flex items-center gap-2.5 px-3.5 py-2 rounded-xl border text-sm transition-all ${
          searchFocused ? 'border-[#14B8A6] ring-2 ring-[#14B8A6]/10 bg-white' : 'border-[#E2E8F0] bg-[#F7F8FA]'
        }`}>
          <svg className="text-[#94A3B8] flex-shrink-0" width="14" height="14" viewBox="0 0 15 15" fill="none">
            <circle cx="6.5" cy="6.5" r="4.5" stroke="currentColor" strokeWidth="1.4"/>
            <path d="M10 10L13 13" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search case, account, ATM, district…"
            className="flex-1 bg-transparent outline-none text-[#0F172A] placeholder:text-[#94A3B8] text-sm"
            onFocus={() => setSearchFocused(true)}
            onBlur={() => setSearchFocused(false)}
          />
          <div className="flex items-center gap-1 flex-shrink-0">
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-[#94A3B8] border border-[#E2E8F0] rounded bg-white">⌘</kbd>
            <kbd className="px-1.5 py-0.5 text-[10px] font-mono text-[#94A3B8] border border-[#E2E8F0] rounded bg-white">K</kbd>
          </div>
        </div>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-2.5 ml-auto">
        {/* Secure Session Badge */}
        <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[#E2E8F0] bg-white">
          <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 pulse-dot" />
          <span className="text-xs font-medium text-[#0F172A]">Secure Session</span>
        </div>

        {/* Notification Bell */}
        <button className="relative w-9 h-9 flex items-center justify-center rounded-xl border border-[#E2E8F0] bg-white hover:bg-[#F7F8FA] transition-colors">
          <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
            <path d="M8 1.5C5.5 1.5 3.5 3.5 3.5 6V9.5L2 11H14L12.5 9.5V6C12.5 3.5 10.5 1.5 8 1.5Z" stroke="#64748B" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M6.5 11C6.5 11.83 7.17 12.5 8 12.5C8.83 12.5 9.5 11.83 9.5 11" stroke="#64748B" strokeWidth="1.3"/>
          </svg>
          <span className="absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full bg-[#E5484D] border border-white" />
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
        <div className="w-8 h-8 rounded-xl bg-[#14B8A6]/15 flex items-center justify-center text-[#0D9488] text-xs font-bold border border-[#14B8A6]/20">
          {officerId ? officerId.slice(0, 2).toUpperCase() : 'AM'}
        </div>
      </div>
    </div>
  );
}
