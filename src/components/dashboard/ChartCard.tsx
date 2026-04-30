'use client';

import { ReactNode } from 'react';
import { Skeleton } from '@/components/ui/Skeleton';

interface Props {
  title: string;
  subtitle?: string;
  isLoading?: boolean;
  error?: unknown;
  isEmpty?: boolean;
  children: ReactNode;
}

/**
 * Shared chart shell — consistent header, dark theme, and loading/empty states
 * so the three Project Overview charts render with no layout shift.
 */
export default function ChartCard({
  title,
  subtitle,
  isLoading,
  error,
  isEmpty,
  children,
}: Props) {
  return (
    <div className="card flex flex-col">
      <div className="card-header">
        <h3 className="text-sm font-semibold text-[#f5f1e8]">{title}</h3>
        {subtitle && (
          <p className="text-xs text-[rgba(232,228,220,0.5)] mt-0.5">{subtitle}</p>
        )}
      </div>
      <div className="card-body flex-1 min-h-[280px] flex items-center justify-center">
        {isLoading ? (
          <Skeleton className="h-[220px] w-full" />
        ) : error ? (
          <p className="text-sm text-red-300">Failed to load chart data.</p>
        ) : isEmpty ? (
          <p className="text-sm text-[rgba(232,228,220,0.5)]">No data to display yet.</p>
        ) : (
          <div className="w-full">{children}</div>
        )}
      </div>
    </div>
  );
}
