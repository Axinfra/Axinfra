'use client';

import { CalendarClock } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { computeScheduleVariance, HEALTH_LABEL, HEALTH_COLOR, type ScheduleVarianceInput } from '@/lib/scheduleVariance';

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-wider" style={{ color: 'rgba(232,228,220,0.4)' }}>{label}</p>
      <p className="text-sm font-medium mt-0.5" style={{ color: '#e8e4dc' }}>{value}</p>
    </div>
  );
}

function fmtDays(n: number | null, suffix = 'd'): string {
  if (n === null) return '—';
  return `${n > 0 ? '+' : ''}${n}${suffix}`;
}

/** Planned vs actual dates/durations, schedule variance, delay, and the 5-state health
 * taxonomy (On Track / At Risk / Delayed / Completed Late / Completed On Time) for a single
 * activity — the same `computeScheduleVariance` function the Activities list, bucket tabs, and
 * Analysis Variance tab all use, so this card never disagrees with them. */
export default function ScheduleVarianceCard({ activity }: { activity: ScheduleVarianceInput }) {
  const v = computeScheduleVariance(activity);
  const health = HEALTH_COLOR[v.health];

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarClock className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
          <h2 className="text-base font-semibold">Schedule Variance</h2>
        </div>
        <span className="text-xs font-semibold px-2.5 py-1 rounded-full" style={{ color: health.color, background: health.bg }}>
          {HEALTH_LABEL[v.health]}
        </span>
      </div>
      <div className="card-body space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <Field label="Planned Start" value={activity.plannedStart ? formatDate(activity.plannedStart as string) : '—'} />
          <Field label="Planned End" value={activity.plannedEnd ? formatDate(activity.plannedEnd as string) : '—'} />
          <Field label="Actual Start" value={activity.actualStart ? formatDate(activity.actualStart as string) : '—'} />
          <Field label="Actual End" value={activity.actualEnd ? formatDate(activity.actualEnd as string) : '—'} />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-3 border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <Field label="Planned Duration" value={v.plannedDurationDays !== null ? `${v.plannedDurationDays}d` : '—'} />
          <Field label="Actual Duration" value={v.actualDurationDays !== null ? `${v.actualDurationDays}d` : '—'} />
          <Field label="Schedule Variance" value={fmtDays(v.scheduleVarianceDays)} />
          <Field label="Delay" value={fmtDays(v.delayDays)} />
        </div>
      </div>
    </div>
  );
}
