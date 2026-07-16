'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cardShadow, iconBadge } from './vendorTheme';

/** Big app-icon-style home tile: one icon, one word, an optional pending-count badge.
 * Tap target is the whole square (min 128px) — no reliance on reading fine print. Icon sits
 * in a soft gradient badge with a matching glow so it reads as a polished app icon. */
export default function VendorTile({
  href,
  icon: Icon,
  label,
  count,
  color,
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  count?: number;
  color: string;
}) {
  return (
    <Link
      href={href}
      className="relative flex flex-col items-center justify-center gap-3.5 rounded-[28px] min-h-[136px] sm:min-h-[152px] active:scale-[0.97] transition-transform"
      style={{ background: 'var(--ax-card)', ...cardShadow }}
    >
      {!!count && count > 0 && (
        <span
          className="absolute -top-2.5 -right-2.5 min-w-[32px] h-[32px] px-1.5 rounded-full flex items-center justify-center text-base font-bold text-white"
          style={{ background: 'linear-gradient(155deg, #f0645a, #dc2626)', boxShadow: '0 6px 14px -4px rgba(220,38,38,0.6)' }}
        >
          {count > 99 ? '99+' : count}
        </span>
      )}
      <div
        className="w-[68px] h-[68px] rounded-full flex items-center justify-center"
        style={iconBadge(color)}
      >
        <Icon className="w-8 h-8" style={{ color }} strokeWidth={2.25} />
      </div>
      <span className="text-xl font-bold" style={{ color: 'var(--ax-text)' }}>{label}</span>
    </Link>
  );
}
