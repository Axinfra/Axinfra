'use client';

import { useState, useRef, useEffect } from 'react';
import { useTheme, themes } from '@/lib/contexts/ThemeContext';

export default function ThemeNavbarPicker() {
  const { theme, setTheme } = useTheme();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const current = themes.find((t) => t.id === theme) ?? themes[0];
  const dark  = themes.filter((t) => t.mode === 'dark');
  const light = themes.filter((t) => t.mode === 'light');

  /* Close on outside click */
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  /* Close on Escape */
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false);
    }
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      {/* ── Trigger button ── */}
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Change appearance"
        aria-expanded={open}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg transition-all select-none active:scale-[0.97]"
        style={{
          backgroundColor: 'var(--ax-accent-subtle)',
          border: '1px solid rgba(var(--ax-accent-rgb), 0.22)',
        }}
      >
        {/* Sun / moon icon */}
        <svg
          className="w-[15px] h-[15px] shrink-0"
          fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={2}
          style={{ color: 'var(--ax-accent)' }}
        >
          {current.mode === 'dark' ? (
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z" />
          ) : (
            <path strokeLinecap="round" strokeLinejoin="round"
              d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
          )}
        </svg>

        {/* Theme name — hidden on very small screens */}
        <span className="text-[11px] font-semibold hidden sm:block" style={{ color: 'var(--ax-accent)' }}>
          {current.name}
        </span>

        {/* Chevron */}
        <svg
          className={`w-3 h-3 shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24"
          stroke="currentColor" strokeWidth={2.5}
          style={{ color: 'var(--ax-accent)', opacity: 0.65 }}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* ── Dropdown panel ── */}
      {open && (
        <div
          className="absolute right-0 top-full mt-2 z-[200] rounded-2xl border shadow-2xl overflow-hidden"
          style={{
            backgroundColor: 'var(--ax-modal)',
            borderColor: 'var(--ax-border)',
            width: 288,
            maxWidth: 'calc(100vw - 16px)',
          }}
        >
          <div className="p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-3">
              <p
                className="text-[10px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: 'rgba(var(--ax-text-rgb), 0.4)' }}
              >
                Appearance
              </p>
              <button
                onClick={() => setOpen(false)}
                className="p-0.5 rounded ax-hover-overlay"
                style={{ color: 'rgba(var(--ax-text-rgb), 0.35)' }}
                aria-label="Close"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Dark themes */}
            <p
              className="text-[9px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'rgba(var(--ax-text-rgb), 0.3)' }}
            >
              Dark
            </p>
            <div className="grid grid-cols-4 gap-2 mb-4">
              {dark.map((t) => (
                <ThemeBox
                  key={t.id}
                  def={t}
                  active={theme === t.id}
                  onClick={() => { setTheme(t.id); setOpen(false); }}
                />
              ))}
            </div>

            {/* Light themes */}
            <p
              className="text-[9px] font-semibold uppercase tracking-widest mb-2"
              style={{ color: 'rgba(var(--ax-text-rgb), 0.3)' }}
            >
              Light
            </p>
            <div className="grid grid-cols-4 gap-2">
              {light.map((t) => (
                <ThemeBox
                  key={t.id}
                  def={t}
                  active={theme === t.id}
                  onClick={() => { setTheme(t.id); setOpen(false); }}
                />
              ))}
            </div>

            {/* Active theme label */}
            <div
              className="mt-3 pt-3 border-t text-center"
              style={{ borderColor: 'var(--ax-border-subtle)' }}
            >
              <p className="text-[11px] font-semibold" style={{ color: 'var(--ax-accent)' }}>
                {current.name}
                <span className="ml-1 font-normal" style={{ color: 'rgba(var(--ax-text-rgb), 0.4)' }}>
                  — {current.description}
                </span>
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Mini theme preview box ── */
function ThemeBox({
  def,
  active,
  onClick,
}: {
  def: (typeof themes)[number];
  active: boolean;
  onClick: () => void;
}) {
  const isLight   = def.mode === 'light';
  const muted     = isLight ? 'rgba(0,0,0,0.14)' : 'rgba(255,255,255,0.2)';
  const idleBorder = isLight ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)';

  return (
    <button
      onClick={onClick}
      title={`${def.name} — ${def.description}`}
      aria-label={`Switch to ${def.name} theme`}
      className="group flex flex-col items-center gap-1 focus:outline-none"
    >
      {/* Swatch */}
      <div
        className="relative w-full overflow-hidden rounded-lg transition-all duration-150 group-hover:scale-105"
        style={{
          aspectRatio: '1 / 1',
          backgroundColor: def.bg,
          border: active ? `2px solid ${def.accent}` : `2px solid ${idleBorder}`,
          boxShadow: active ? `0 0 0 2px ${def.accent}55` : undefined,
        }}
      >
        {/* Mini sidebar strip */}
        <div
          className="absolute inset-y-0 left-0 w-[32%] flex flex-col justify-end pb-[3px] gap-[2px]"
          style={{ backgroundColor: def.surface }}
        >
          <div className="w-3/4 mx-auto rounded-full" style={{ height: 2, backgroundColor: def.accent }} />
          <div className="w-1/2 mx-auto rounded-full" style={{ height: 2, backgroundColor: muted }} />
          <div className="w-2/3 mx-auto rounded-full" style={{ height: 2, backgroundColor: muted }} />
        </div>
        {/* Content line */}
        <div
          className="absolute top-[28%] right-[6%] left-[38%] rounded-full"
          style={{ height: 2, backgroundColor: muted }}
        />
        {/* Accent bottom bar */}
        <div
          className="absolute bottom-0 right-0 left-[32%]"
          style={{ height: 3, backgroundColor: def.accent }}
        />
      </div>

      {/* Label */}
      <span
        className="text-[9px] font-medium text-center w-full truncate leading-tight"
        style={{ color: active ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb), 0.45)' }}
      >
        {def.name}
      </span>
    </button>
  );
}
