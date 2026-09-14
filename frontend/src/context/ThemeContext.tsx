// ─── ThemeContext ─────────────────────────────────────────────────────────────
// Global light / dark theme provider for TRINETRA.
//
// Architecture:
//   - Reads from localStorage (key: 'trinetra-theme')
//   - Applies data-theme="light" | "dark" to <html> element
//   - Exposes useTheme() hook — theme, toggleTheme(), setTheme()
//   - Default: 'light' when no preference is stored
//   - Theme is applied synchronously before first paint (inline script in html)
//     to avoid flash — see index.html for the blocking script.

import React, { createContext, useContext, useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'trinetra-theme';

interface ThemeContextValue {
  theme: Theme;
  toggleTheme: () => void;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
}

function applyTheme(t: Theme) {
  document.documentElement.setAttribute('data-theme', t);
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Read preference set by the blocking inline script (or fall back to light)
    const stored = localStorage.getItem(STORAGE_KEY) as Theme | null;
    return stored === 'dark' ? 'dark' : 'light';
  });

  // Keep the data-theme attribute in sync whenever theme changes
  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const setTheme = (t: Theme) => setThemeState(t);
  const toggleTheme = () => setThemeState(prev => (prev === 'light' ? 'dark' : 'light'));

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}
