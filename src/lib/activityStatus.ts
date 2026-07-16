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
