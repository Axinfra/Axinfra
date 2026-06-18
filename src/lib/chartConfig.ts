/**
 * Shared Recharts tooltip & cursor config — theme-aware via CSS variables.
 * Spread onto every <Tooltip> so every chart adapts to all 8 themes.
 *
 * Usage:
 *   import { CHART_TOOLTIP, CUSTOM_TOOLTIP_WRAPPER } from '@/lib/chartConfig';
 *   <Tooltip {...CHART_TOOLTIP} />
 *   <Tooltip content={<MyTooltip />} {...CUSTOM_TOOLTIP_WRAPPER} />
 */

export const CHART_TOOLTIP = {
  contentStyle: {
    background: 'var(--ax-modal)',
    border: '1px solid var(--ax-border)',
    borderRadius: 10,
    color: 'var(--ax-text)',
    boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
    padding: '8px 14px',
    fontSize: 13,
  },
  labelStyle: {
    color: 'rgba(var(--ax-text-rgb),0.55)',
    fontSize: 11.5,
    marginBottom: 3,
    fontWeight: 600,
  },
  itemStyle: {
    color: 'var(--ax-text)',
    fontSize: 13,
    fontWeight: 600,
  },
  cursor: { fill: 'var(--ax-chart-row-hover)' },
  wrapperStyle: { outline: 'none' },
} as const;

/** @deprecated use CHART_TOOLTIP */
export const DARK_TOOLTIP = CHART_TOOLTIP;

/**
 * Use when passing a custom content={<Component />}.
 * Prevents Recharts from adding a wrapper box behind your component.
 */
export const CUSTOM_TOOLTIP_WRAPPER = {
  wrapperStyle: {
    background: 'transparent',
    border: 'none',
    boxShadow: 'none',
    padding: 0,
    outline: 'none',
  },
} as const;
