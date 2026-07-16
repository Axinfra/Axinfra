/** Shared style builders for the Vendor Portal's "professional, not basic" visual language —
 * soft gradient icon badges with a colored glow instead of flat tinted squares, and real
 * card elevation instead of a flat border. One definition, reused everywhere, so the whole
 * portal stays visually consistent instead of each component inventing its own inline styles. */

import type { CSSProperties } from 'react';

export function iconBadge(color: string): CSSProperties {
  return {
    background: `radial-gradient(circle at 32% 28%, ${color}3d, ${color}14)`,
    boxShadow: `0 6px 16px -4px ${color}59, inset 0 0 0 1.5px ${color}33`,
  };
}

export const cardShadow: CSSProperties = {
  boxShadow: '0 12px 32px -12px rgba(0,0,0,0.45), 0 2px 10px -3px rgba(0,0,0,0.25)',
};

export function glowShadow(color: string): string {
  return `0 10px 24px -8px ${color}70`;
}

export function gradientFill(color: string, dark: string): string {
  return `linear-gradient(155deg, ${color}, ${dark})`;
}
