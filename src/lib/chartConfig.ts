/**
 * Shared Recharts dark-theme tooltip & cursor config.
 * Spread onto every <Tooltip> so every chart matches the app theme.
 *
 * Usage:
 *   import { DARK_TOOLTIP, CUSTOM_TOOLTIP_WRAPPER } from '@/lib/chartConfig';
 *   <Tooltip {...DARK_TOOLTIP} />
 *   <Tooltip content={<MyTooltip />} {...CUSTOM_TOOLTIP_WRAPPER} />
 */

export const DARK_TOOLTIP = {
  contentStyle: {
    background: '#1a1c22',
    border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 10,
    color: '#e8e4dc',
    boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
    padding: '8px 14px',
    fontSize: 13,
  },
  labelStyle: {
    color: 'rgba(232,228,220,0.55)',
    fontSize: 11.5,
    marginBottom: 3,
    fontWeight: 600,
  },
  itemStyle: {
    color: '#e8e4dc',
    fontSize: 13,
    fontWeight: 600,
  },
  cursor: { fill: 'rgba(255,255,255,0.04)' },
  wrapperStyle: { outline: 'none' },
} as const;

/**
 * Use when passing a custom content={<Component />}.
 * Prevents Recharts from adding a white wrapper box behind your component.
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
