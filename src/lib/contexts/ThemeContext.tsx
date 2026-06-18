'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export type Theme =
  | 'obsidian' | 'sapphire' | 'emerald' | 'violet'
  | 'pearl'    | 'frost'    | 'sage'    | 'blush';

export interface ThemeDefinition {
  id: Theme;
  name: string;
  description: string;
  mode: 'dark' | 'light';
  accent: string;
  bg: string;
  surface: string;
}

export const themes: ThemeDefinition[] = [
  /* ── Dark ──────────────────────────────────── */
  { id: 'obsidian', name: 'Obsidian', description: 'Black & Gold',     mode: 'dark',  accent: '#c4a35a', bg: '#0a0c10', surface: '#141414' },
  { id: 'sapphire', name: 'Sapphire', description: 'Navy & Blue',      mode: 'dark',  accent: '#60a5fa', bg: '#060d1a', surface: '#0f1830' },
  { id: 'emerald',  name: 'Emerald',  description: 'Forest & Teal',    mode: 'dark',  accent: '#34d399', bg: '#050d07', surface: '#0d1c13' },
  { id: 'violet',   name: 'Violet',   description: 'Dark & Purple',    mode: 'dark',  accent: '#a78bfa', bg: '#09060e', surface: '#16102a' },
  /* ── Light ─────────────────────────────────── */
  { id: 'pearl',    name: 'Pearl',    description: 'White & Gold',     mode: 'light', accent: '#8f6115', bg: '#f5f2eb', surface: '#ede9e0' },
  { id: 'frost',    name: 'Frost',    description: 'White & Blue',     mode: 'light', accent: '#1a4fc4', bg: '#eef3fc', surface: '#e3eaf8' },
  { id: 'sage',     name: 'Sage',     description: 'White & Green',    mode: 'light', accent: '#027a54', bg: '#edf5ef', surface: '#e1ede3' },
  { id: 'blush',    name: 'Blush',    description: 'White & Violet',   mode: 'light', accent: '#6020c8', bg: '#f0ecfc', surface: '#e6e0f8' },
];

interface ThemeContextType {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeContextType>({
  theme: 'obsidian',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>('obsidian');

  useEffect(() => {
    const saved = localStorage.getItem('axinfra_theme') as Theme | null;
    if (saved && themes.find((t) => t.id === saved)) {
      setThemeState(saved);
      document.documentElement.setAttribute('data-theme', saved);
    }
  }, []);

  function setTheme(t: Theme) {
    setThemeState(t);
    localStorage.setItem('axinfra_theme', t);
    document.documentElement.setAttribute('data-theme', t);
  }

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
