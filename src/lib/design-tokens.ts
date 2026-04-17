/**
 * Axinfra Dark Theme — Design Tokens
 * Reference: Landing page (Bloomberg Terminal × Construction Command)
 *
 * Usage: import { ax } from '@/lib/design-tokens'
 *        className={`bg-[${ax.bg.base}]`}  // or use CSS custom properties via globals.css
 */

export const ax = {
  /* ── Background scale ── */
  bg: {
    base: '#0a0c10',
    surface: 'rgba(255,255,255,0.03)',
    surfaceHover: 'rgba(255,255,255,0.05)',
    surfaceSolid: '#13151a',
    sidebar: '#0d0f13',
    input: '#1a1c22',
    modal: '#13151a',
    tableHeader: 'rgba(255,255,255,0.04)',
  },

  /* ── Border scale ── */
  border: {
    default: 'rgba(255,255,255,0.07)',
    strong: 'rgba(255,255,255,0.12)',
    input: 'rgba(255,255,255,0.1)',
  },

  /* ── Text scale ── */
  text: {
    primary: '#e8e4dc',
    white: '#ffffff',
    muted: 'rgba(232,228,220,0.55)',
    faint: 'rgba(232,228,220,0.35)',
  },

  /* ── Accent: Gold ── */
  gold: {
    DEFAULT: '#c4a35a',
    bg: 'rgba(196,163,90,0.12)',
    bgSubtle: 'rgba(196,163,90,0.08)',
    border: 'rgba(196,163,90,0.3)',
    borderSubtle: 'rgba(196,163,90,0.15)',
    text: '#c4a35a',
  },

  /* ── Accent: Green ── */
  green: {
    DEFAULT: '#5cba80',
    bg: 'rgba(50,200,120,0.1)',
    border: 'rgba(92,186,128,0.3)',
    text: '#5cba80',
  },

  /* ── Accent: Red ── */
  red: {
    DEFAULT: '#e06050',
    bg: 'rgba(220,80,60,0.1)',
    border: 'rgba(224,96,80,0.3)',
    text: '#e06050',
  },
} as const;
