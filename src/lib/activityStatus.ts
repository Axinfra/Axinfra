/** Local-midnight `Date` for `d` — built from `getFullYear/getMonth/getDate`, so it's
 * inherently correct for whatever timezone the browser is running in (no UTC-shift bugs from
 * comparing raw ISO strings near midnight). */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type ActivityStatusBucket = 'DUE_TODAY' | 'UPCOMING' | 'OVERDUE' | 'COMPLETED';

export interface ClassifiableActivity {
  state: string;
  plannedEnd: string | Date | null;
  percentComplete: number | null;
}

/** Single exhaustive classification so every activity lands in exactly one bucket — no
 * duplicates (an activity counted in two lists) and none dropped (an activity that fits no
 * filter and silently vanishes), which is how the old Today page's separate `todaysWork`/
 * `pendingWork` filters could disagree with each other. `today` should be `startOfDay(new
 * Date())`, computed once per render/classification pass. */
export function classifyActivity(activity: ClassifiableActivity, today: Date): ActivityStatusBucket {
  if ((activity.percentComplete ?? 0) >= 100 || activity.state === 'VERIFIED' || activity.state === 'CLOSED') {
    return 'COMPLETED';
  }
  if (!activity.plannedEnd) return 'UPCOMING';
  const due = startOfDay(new Date(activity.plannedEnd));
  if (due.getTime() === today.getTime()) return 'DUE_TODAY';
  if (due.getTime() < today.getTime()) return 'OVERDUE';
  return 'UPCOMING';
}

/** Groups activities into all four buckets in a single pass via `classifyActivity` — the
 * `reduce` mirrors `classifyActivity`'s exhaustiveness so every input activity appears in
 * exactly one output array. */
export function groupActivitiesByStatus<T extends ClassifiableActivity>(
  activities: T[],
  today: Date = startOfDay(new Date()),
): Record<ActivityStatusBucket, T[]> {
  const groups: Record<ActivityStatusBucket, T[]> = {
    DUE_TODAY: [],
    UPCOMING: [],
    OVERDUE: [],
    COMPLETED: [],
  };
  for (const activity of activities) {
    groups[classifyActivity(activity, today)].push(activity);
  }
  return groups;
}

/** Whole-day difference between `plannedEnd` and `today` — positive means days remaining,
 * negative means days overdue. Null when there's no due date to compute against. */
export function daysFromToday(plannedEnd: string | Date | null, today: Date = startOfDay(new Date())): number | null {
  if (!plannedEnd) return null;
  const due = startOfDay(new Date(plannedEnd));
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

/** The 6 valid, user-facing lifecycle labels for an activity — as opposed to the raw
 * `Milestone.state` column, which is a plain unconstrained `String` in the DB (no Postgres
 * enum, no CHECK constraint) and only ever holds DRAFT/IN_PROGRESS/SUBMITTED/VERIFIED/CLOSED
 * by application convention. This taxonomy folds SUBMITTED into IN_PROGRESS and layers real
 * schedule data (plannedStart/plannedEnd) on top, so "Upcoming" and "Delayed" reflect actual
 * dates rather than just workflow state. */
export type LifecycleStatus = 'DRAFT' | 'UPCOMING' | 'IN_PROGRESS' | 'DELAYED' | 'COMPLETE' | 'CLOSED';

export const LIFECYCLE_LABEL: Record<LifecycleStatus, string> = {
  DRAFT: 'Draft',
  UPCOMING: 'Upcoming',
  IN_PROGRESS: 'In Progress',
  DELAYED: 'Delayed',
  COMPLETE: 'Complete',
  CLOSED: 'Closed',
};

export const LIFECYCLE_COLOR: Record<LifecycleStatus, string> = {
  DRAFT: 'bg-gray-400',
  UPCOMING: 'bg-yellow-500',
  IN_PROGRESS: 'bg-blue-500',
  DELAYED: 'bg-[#e06050]',
  COMPLETE: 'bg-green-500',
  CLOSED: 'bg-purple-500',
};

export interface LifecycleClassifiable {
  state: string;
  plannedStart: string | Date | null;
  plannedEnd: string | Date | null;
}

/** Single exhaustive classification into the 6 lifecycle buckets above — every activity lands
 * in exactly one, same discipline as `classifyActivity`. `state` (CLOSED/VERIFIED) always wins
 * first since those are genuine terminal DB states; everything still "open" (DRAFT/IN_PROGRESS/
 * SUBMITTED) is then split by real dates rather than the raw workflow string. */
export function classifyLifecycleStatus(activity: LifecycleClassifiable, today: Date = startOfDay(new Date())): LifecycleStatus {
  if (activity.state === 'CLOSED') return 'CLOSED';
  if (activity.state === 'VERIFIED') return 'COMPLETE';

  const end = activity.plannedEnd ? startOfDay(new Date(activity.plannedEnd)) : null;
  if (end && end.getTime() < today.getTime()) return 'DELAYED';

  if (activity.state === 'DRAFT') {
    const start = activity.plannedStart ? startOfDay(new Date(activity.plannedStart)) : null;
    if (start && start.getTime() > today.getTime()) return 'UPCOMING';
    return 'DRAFT';
  }

  // IN_PROGRESS or SUBMITTED, not yet overdue.
  return 'IN_PROGRESS';
}
