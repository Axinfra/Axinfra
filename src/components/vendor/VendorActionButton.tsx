'use client';

import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { glowShadow, gradientFill } from './vendorTheme';

/** Huge, full-width action button — the only style used for the vendor's key actions
 * (Accept, Send, Not OK). Text stays a single short word; the icon carries the rest. A subtle
 * gradient fill + colored glow gives it real weight instead of a flat color block. */
export default function VendorActionButton({
  onClick,
  label,
  loadingLabel,
  loading,
  disabled,
  icon: Icon,
  variant = 'primary',
}: {
  onClick: () => void;
  label: string;
  loadingLabel?: string;
  loading?: boolean;
  disabled?: boolean;
  icon?: LucideIcon;
  variant?: 'primary' | 'neutral' | 'danger';
}) {
  const styles =
    variant === 'primary'
      ? { background: gradientFill('#34d67f', '#1ea866'), color: '#052e16', boxShadow: glowShadow('#22c55e') }
      : variant === 'danger'
      ? { background: gradientFill('#f0645a', '#dc2626'), color: '#2a0a08', boxShadow: glowShadow('#ef4444') }
      : { background: 'var(--ax-overlay)', color: 'var(--ax-text)', boxShadow: 'inset 0 0 0 1.5px var(--ax-border)' };

  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="w-full flex items-center justify-center gap-2.5 rounded-2xl font-bold text-lg py-4 min-h-[60px] transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100"
      style={styles}
    >
      {loading ? (
        <>
          <Loader2 className="w-5 h-5 animate-spin" />
          {loadingLabel ?? label}
        </>
      ) : (
        <>
          {Icon && <Icon className="w-6 h-6" strokeWidth={2.5} />}
          {label}
        </>
      )}
    </button>
  );
}
