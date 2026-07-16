'use client';

import Link from 'next/link';
import { Building2, User, CalendarDays, CalendarClock } from 'lucide-react';
import { formatDate } from '@/lib/utils';
import { daysFromToday } from '@/lib/activityStatus';
import ActivityStateBadge from '@/components/ActivityStateBadge';
import type { ActivityStatusBucket } from '@/lib/activityStatus';

export interface ActivityRow {
  id: string;
  title: string;
  projectName: string;
  assignedTo: string | null;
  priority: string;
  state: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  percentComplete: number | null;
  remarks: string | null;
}

const PRIORITY_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  LOW: { label: 'Low', color: 'rgba(232,228,220,0.55)', bg: 'rgba(255,255,255,0.06)' },
  NORMAL: { label: 'Normal', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
  HIGH: { label: 'High', color: '#f97316', bg: 'rgba(249,115,22,0.12)' },
  URGENT: { label: 'Urgent', color: '#e06050', bg: 'rgba(224,96,80,0.14)' },
};

function Pill({ label, color, bg }: { label: string; color: string; bg: string }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ color, background: bg }}>
      {label}
    </span>
  );
}

function PriorityBadge({ priority }: { priority: string }) {
  const s = PRIORITY_STYLE[priority] ?? PRIORITY_STYLE.NORMAL;
  return <Pill label={s.label} color={s.color} bg={s.bg} />;
}

/** Same visual weight as PriorityBadge/ActivityStateBadge — this pill *is* the answer to "how
 * urgent is this," so it should read at a glance, not as quieter inline text. */
function DueSignalPill({ plannedEnd, bucket }: { plannedEnd: string | null; bucket: ActivityStatusBucket }) {
  if (bucket === 'COMPLETED') return <Pill label="Done" color="#5cba80" bg="rgba(92,186,128,0.14)" />;
  const days = daysFromToday(plannedEnd);
  if (days === null) return <Pill label="No due date" color="rgba(232,228,220,0.45)" bg="rgba(255,255,255,0.06)" />;
  if (days === 0) return <Pill label="Due today" color="#f97316" bg="rgba(249,115,22,0.14)" />;
  if (days < 0) return <Pill label={`${Math.abs(days)}d overdue`} color="#e06050" bg="rgba(224,96,80,0.14)" />;
  return <Pill label={`${days}d left`} color="#eab308" bg="rgba(234,179,8,0.14)" />;
}

/** The single, currently-active status bucket's activity list. Lives directly under the tab
 * strip in `milestones/page.tsx` — deliberately has no title/count header of its own (the tab
 * button right above it already says e.g. "Today (1)"), so the tab and its content read as one
 * connected panel instead of two separate, redundantly-labeled blocks. */
export default function ActivityStatusSection({
  bucket,
  items,
  emptyMessage,
  projectId,
}: {
  bucket: ActivityStatusBucket;
  items: ActivityRow[];
  emptyMessage: string;
  projectId: string;
}) {
  return (
    <div
      className="rounded-b-xl rounded-tr-xl border overflow-hidden -mt-px"
      style={{ borderColor: 'var(--ax-border)', background: 'var(--ax-card)' }}
    >
      {items.length === 0 ? (
        <p className="text-sm text-center py-12" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>{emptyMessage}</p>
      ) : (
        <div className="divide-y" style={{ borderColor: 'var(--ax-border-subtle)' }}>
          {items.map((item) => (
            <Link
              key={item.id}
              href={`/projects/${projectId}/activities/${item.id}`}
              className="flex items-start justify-between gap-4 px-5 py-4 hover:bg-[rgba(var(--ax-accent-rgb),0.04)] transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                  <p className="text-[15px] font-semibold truncate" style={{ color: 'var(--ax-text)' }}>{item.title}</p>
                  <PriorityBadge priority={item.priority} />
                  <ActivityStateBadge state={item.state as any} />
                  <DueSignalPill plannedEnd={item.plannedEnd} bucket={bucket} />
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs" style={{ color: 'rgba(232,228,220,0.5)' }}>
                  <span className="flex items-center gap-1"><Building2 className="w-3 h-3 shrink-0" />{item.projectName}</span>
                  {item.assignedTo && <span className="flex items-center gap-1"><User className="w-3 h-3 shrink-0" />{item.assignedTo}</span>}
                  <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3 shrink-0" />Start {item.plannedStart ? formatDate(item.plannedStart) : '—'}</span>
                  <span className="flex items-center gap-1"><CalendarClock className="w-3 h-3 shrink-0" />Due {item.plannedEnd ? formatDate(item.plannedEnd) : '—'}</span>
                </div>
                {item.remarks && (
                  <p className="text-xs mt-1.5 italic truncate" style={{ color: 'rgba(232,228,220,0.4)' }} title={item.remarks}>
                    "{item.remarks}"
                  </p>
                )}
              </div>
              <div className="shrink-0 flex flex-col items-end gap-1.5 w-24">
                <span className="text-sm font-bold" style={{ color: (item.percentComplete ?? 0) >= 100 ? '#5cba80' : 'var(--ax-text)' }}>
                  {Math.round(item.percentComplete ?? 0)}%
                </span>
                <div className="w-full bg-[rgba(255,255,255,0.06)] rounded-full h-1.5">
                  <div
                    className="h-1.5 rounded-full"
                    style={{
                      width: `${item.percentComplete ?? 0}%`,
                      background: (item.percentComplete ?? 0) >= 100 ? '#5cba80' : 'var(--ax-accent)',
                    }}
                  />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
