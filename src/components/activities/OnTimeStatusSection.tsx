'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { formatDate } from '@/lib/utils';
import { HEALTH_LABEL, HEALTH_COLOR, HEALTH_SEVERITY, type ActivityHealth } from '@/lib/scheduleVariance';

export interface OnTimeActivityRow {
  id: string;
  title: string;
  plannedEnd: string | null;
  percentComplete: number | null;
  health: ActivityHealth;
}

const MAX_PER_COLUMN = 20;

type SortKey = 'health' | 'dueDate' | 'name' | 'percent';

const SORT_OPTIONS: Array<{ value: SortKey; label: string }> = [
  { value: 'health', label: 'Health' },
  { value: 'dueDate', label: 'Due Date' },
  { value: 'percent', label: '% Complete' },
  { value: 'name', label: 'Name (A–Z)' },
];

function sortRows(rows: OnTimeActivityRow[], sortBy: SortKey): OnTimeActivityRow[] {
  const sorted = [...rows];
  switch (sortBy) {
    case 'health':
      sorted.sort((a, b) => HEALTH_SEVERITY[a.health] - HEALTH_SEVERITY[b.health]);
      break;
    case 'dueDate':
      // Soonest due first; no due date sorts last regardless of direction.
      sorted.sort((a, b) => (a.plannedEnd ?? '9999').localeCompare(b.plannedEnd ?? '9999'));
      break;
    case 'percent':
      sorted.sort((a, b) => (b.percentComplete ?? 0) - (a.percentComplete ?? 0));
      break;
    case 'name':
      sorted.sort((a, b) => a.title.localeCompare(b.title));
      break;
  }
  return sorted;
}

function ActivityRowItem({ item, projectId }: { item: OnTimeActivityRow; projectId: string }) {
  const c = HEALTH_COLOR[item.health];
  return (
    <Link
      href={`/projects/${projectId}/activities/${item.id}`}
      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-[rgba(var(--ax-accent-rgb),0.04)] transition-colors"
    >
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium truncate" style={{ color: 'var(--ax-text)' }}>{item.title}</p>
        <p className="text-xs mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
          Due {item.plannedEnd ? formatDate(item.plannedEnd) : '—'}
        </p>
      </div>
      <div className="shrink-0 flex items-center gap-3">
        <span className="text-xs font-semibold" style={{ color: 'var(--ax-text)' }}>
          {Math.round(item.percentComplete ?? 0)}%
        </span>
        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: c.color, background: c.bg }}>
          {HEALTH_LABEL[item.health]}
        </span>
      </div>
    </Link>
  );
}

function Column({
  title,
  accentColor,
  items,
  projectId,
  emptyMessage,
}: {
  title: string;
  accentColor: string;
  items: OnTimeActivityRow[];
  projectId: string;
  emptyMessage: string;
}) {
  const shown = items.slice(0, MAX_PER_COLUMN);
  return (
    <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--ax-border)', background: 'var(--ax-card)' }}>
      <div className="px-4 py-3 border-b flex items-center justify-between" style={{ borderColor: 'var(--ax-border-subtle)' }}>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: accentColor }} />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--ax-text)' }}>{title}</h3>
        </div>
        <span className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>{items.length}</span>
      </div>
      {shown.length === 0 ? (
        <p className="text-sm text-center py-10" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>{emptyMessage}</p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--ax-border-subtle)' }}>
          {shown.map((item) => <ActivityRowItem key={item.id} item={item} projectId={projectId} />)}
        </div>
      )}
      {items.length > MAX_PER_COLUMN && (
        <p className="text-xs text-center py-2 border-t" style={{ borderColor: 'var(--ax-border-subtle)', color: 'rgba(var(--ax-text-rgb),0.35)' }}>
          Showing {MAX_PER_COLUMN} of {items.length} — sort by Due Date or use the All Activities tab for the rest.
        </p>
      )}
    </div>
  );
}

/**
 * "Which activities make up the on-time % and which don't" — the same ON_TRACK/AT_RISK/
 * DELAYED/COMPLETED_LATE/COMPLETED_ON_TIME classification the All Activities table already
 * shows per-row (and Analysis's onTimePercent stat rolls up), just split into the two groups
 * that answer that question directly instead of requiring someone to scan every row.
 */
export default function OnTimeStatusSection({
  onTime,
  notOnTime,
  onTimePercent,
  projectId,
}: {
  onTime: OnTimeActivityRow[];
  notOnTime: OnTimeActivityRow[];
  onTimePercent: number;
  projectId: string;
}) {
  // Health first — the ordering that matters most: on the Not On Time side it puts already-late
  // activities ahead of ones only running behind pace; same rule applied to On Time keeps both
  // columns consistent with each other rather than sorting by two different criteria by default.
  const [sortBy, setSortBy] = useState<SortKey>('health');

  const sortedOnTime = useMemo(() => sortRows(onTime, sortBy), [onTime, sortBy]);
  const sortedNotOnTime = useMemo(() => sortRows(notOnTime, sortBy), [notOnTime, sortBy]);

  return (
    <div className="pt-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 px-1">
          <div
            className="text-3xl font-bold shrink-0"
            style={{ color: onTimePercent >= 80 ? '#5cba80' : onTimePercent >= 60 ? '#eab308' : '#e06050' }}
          >
            {onTimePercent}%
          </div>
          <div>
            <p className="text-sm font-medium" style={{ color: 'var(--ax-text)' }}>On time</p>
            <p className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
              {onTime.length} on track or finished on time · {notOnTime.length} at risk, delayed, or finished late
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <label className="text-sm text-[rgba(232,228,220,0.55)] shrink-0" htmlFor="on-time-sort">Sort by:</label>
          <select
            id="on-time-sort"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as SortKey)}
            className="input text-sm"
          >
            {SORT_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
          </select>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Column
          title="On Time"
          accentColor="#5cba80"
          items={sortedOnTime}
          projectId={projectId}
          emptyMessage="Nothing on-time yet."
        />
        <Column
          title="Not On Time"
          accentColor="#e06050"
          items={sortedNotOnTime}
          projectId={projectId}
          emptyMessage="Nothing falling behind — every activity is on track or finished on time."
        />
      </div>
    </div>
  );
}
