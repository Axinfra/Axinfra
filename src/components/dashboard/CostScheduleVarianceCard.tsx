'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ExternalLink } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';

interface VarianceData {
  schedule: {
    totalActivities: number;
    overdueCount: number;
    onTimePercent: number;
  };
  bills: {
    totals: {
      totalPlannedValue: number;
      totalReleasedValue: number;
      totalVariance: number; // totalPlannedValue - totalReleasedValue; positive = not yet released
      totalVariancePercent: number;
    };
  };
  overallVarianceScore: number; // 0-100, higher = more time/money drift
}

/** Condensed read of the same numbers Analysis > Time & Money Variance computes — so Client
 * gets a plain-English cost/schedule health summary right on Overview, without opening
 * Analysis (which is also where the full activity-by-activity and bill-by-bill breakdown lives). */
export default function CostScheduleVarianceCard({ projectId, currency }: { projectId: string; currency?: string }) {
  const { data, isLoading, error } = useSWR<{ variance: VarianceData }>(
    projectId ? `/api/projects/${projectId}/analysis?tab=variance` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const v = data?.variance;

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[#f5f1e8]">Cost &amp; Schedule Variance</h2>
          <p className="text-xs text-[rgba(232,228,220,0.5)] mt-0.5">How the project is tracking against plan</p>
        </div>
        <Link
          href={`/projects/${projectId}/analysis`}
          className="text-xs font-medium text-[var(--ax-accent)] hover:underline inline-flex items-center gap-1 shrink-0"
        >
          Full breakdown <ExternalLink className="w-3 h-3" />
        </Link>
      </div>
      <div className="card-body">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : error || !v ? (
          <p className="text-sm text-red-300">Failed to load variance data.</p>
        ) : (
          <VarianceBody data={v} currency={currency} />
        )}
      </div>
    </div>
  );
}

function VarianceBody({ data, currency }: { data: VarianceData; currency?: string }) {
  const { schedule, bills, overallVarianceScore } = data;
  const { totalVariance, totalVariancePercent, totalPlannedValue } = bills.totals;
  const absPercent = Math.abs(totalVariancePercent);

  const scoreColor = overallVarianceScore > 50 ? 'text-red-400' : overallVarianceScore > 25 ? 'text-yellow-300' : 'text-green-300';
  const costColor = absPercent > 20 ? 'text-red-400' : absPercent > 10 ? 'text-yellow-300' : 'text-green-300';
  const scheduleColor = schedule.overdueCount > 0 ? (schedule.onTimePercent < 60 ? 'text-red-400' : 'text-yellow-300') : 'text-green-300';

  const costSentence = totalPlannedValue === 0
    ? 'No BOQ planned value recorded yet.'
    : totalVariance >= 0
      ? `${formatCurrency(totalVariance, currency)} (${absPercent}% of planned value) not yet released.`
      : `${formatCurrency(Math.abs(totalVariance), currency)} (${absPercent}% of planned value) released over the BOQ plan.`;

  const scheduleSentence = schedule.totalActivities === 0
    ? 'No scheduled activities yet.'
    : schedule.overdueCount === 0
      ? `All ${schedule.totalActivities} activities are on schedule.`
      : `${schedule.overdueCount} of ${schedule.totalActivities} activities overdue (${schedule.onTimePercent}% on-time overall).`;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-xs text-[rgba(232,228,220,0.5)]">Overall Variance Score</p>
          <p className={`text-3xl font-bold ${scoreColor}`}>{overallVarianceScore}</p>
        </div>
        <div>
          <p className="text-xs text-[rgba(232,228,220,0.5)]">Cost Variance</p>
          <p className={`text-2xl font-bold ${costColor}`}>{totalVariancePercent >= 0 ? '+' : ''}{totalVariancePercent}%</p>
        </div>
        <div>
          <p className="text-xs text-[rgba(232,228,220,0.5)]">Activities On-Time</p>
          <p className={`text-2xl font-bold ${scheduleColor}`}>{schedule.onTimePercent}%</p>
        </div>
      </div>
      <div className="space-y-1.5 pt-3 border-t border-[rgba(255,255,255,0.06)] text-sm text-[rgba(232,228,220,0.7)]">
        <p><span className="text-[rgba(232,228,220,0.45)]">Cost:</span> {costSentence}</p>
        <p><span className="text-[rgba(232,228,220,0.45)]">Schedule:</span> {scheduleSentence}</p>
      </div>
    </div>
  );
}
