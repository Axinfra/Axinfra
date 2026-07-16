import { startOfDay } from './activityStatus';

export type ActivityHealth =
  | 'ON_TRACK'
  | 'AT_RISK'
  | 'DELAYED'
  | 'COMPLETED_LATE'
  | 'COMPLETED_ON_TIME';

export interface ScheduleVarianceInput {
  plannedStart: string | Date | null;
  plannedEnd: string | Date | null;
  actualStart: string | Date | null;
  actualEnd: string | Date | null;
  percentComplete: number | null;
  state: string;
}

export interface ScheduleVarianceResult {
  plannedDurationDays: number | null;
  actualDurationDays: number | null;
  /** actualDurationDays - plannedDurationDays. Positive = took/is taking longer than planned. */
  scheduleVarianceDays: number | null;
  /** Positive = late. For a completed activity: actualEnd - plannedEnd. For one still running:
   * today - plannedEnd (only once today is past plannedEnd; null otherwise). */
  delayDays: number | null;
  health: ActivityHealth;
}

const DAY_MS = 86_400_000;

function toDate(v: string | Date | null): Date | null {
  if (!v) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / DAY_MS);
}

/** A single source of truth for "is this activity done" — matches the bucket-classification
 * rule already used across the Activities page/analysis (percentComplete>=100 OR VERIFIED/CLOSED
 * state), so health status never disagrees with the Today/Overdue/Upcoming/Completed tabs. */
export function isActivityComplete(input: Pick<ScheduleVarianceInput, 'percentComplete' | 'state'>): boolean {
  return (input.percentComplete ?? 0) >= 100 || input.state === 'VERIFIED' || input.state === 'CLOSED';
}

/** How far behind schedule an in-progress activity is allowed to run before it's flagged
 * "At Risk" rather than "On Track" — expressed as percentage points of expected progress. */
const AT_RISK_THRESHOLD_POINTS = 15;

/**
 * Computes planned/actual duration, schedule variance, delay, and the 5-state health taxonomy
 * for a single activity. Pure function — no DB access — so it can run identically on the
 * server (Analysis/API) and client (Activities list/detail) without ever disagreeing.
 */
export function computeScheduleVariance(input: ScheduleVarianceInput, now: Date = new Date()): ScheduleVarianceResult {
  const plannedStart = toDate(input.plannedStart);
  const plannedEnd = toDate(input.plannedEnd);
  const actualStart = toDate(input.actualStart);
  const actualEnd = toDate(input.actualEnd);
  const today = startOfDay(now);
  const completed = isActivityComplete(input);

  const plannedDurationDays = plannedStart && plannedEnd ? diffDays(plannedEnd, plannedStart) : null;
  const actualDurationDays = actualStart
    ? diffDays(actualEnd ?? now, actualStart)
    : null;
  const scheduleVarianceDays =
    plannedDurationDays !== null && actualDurationDays !== null
      ? actualDurationDays - plannedDurationDays
      : null;

  let delayDays: number | null = null;
  let health: ActivityHealth;

  if (completed) {
    delayDays = actualEnd && plannedEnd ? diffDays(startOfDay(actualEnd), startOfDay(plannedEnd)) : null;
    health = delayDays !== null && delayDays > 0 ? 'COMPLETED_LATE' : 'COMPLETED_ON_TIME';
  } else if (plannedEnd && today.getTime() > startOfDay(plannedEnd).getTime()) {
    delayDays = diffDays(today, startOfDay(plannedEnd));
    health = 'DELAYED';
  } else if (plannedStart && plannedEnd && plannedEnd.getTime() > plannedStart.getTime()) {
    // Expected progress if work were perfectly linear from plannedStart to plannedEnd —
    // compared against actual percentComplete to catch activities quietly falling behind
    // before they're technically overdue.
    const totalSpan = plannedEnd.getTime() - plannedStart.getTime();
    const elapsed = Math.min(Math.max(today.getTime() - plannedStart.getTime(), 0), totalSpan);
    const expectedPercent = (elapsed / totalSpan) * 100;
    const actualPercent = input.percentComplete ?? 0;
    health = expectedPercent - actualPercent > AT_RISK_THRESHOLD_POINTS ? 'AT_RISK' : 'ON_TRACK';
  } else {
    health = 'ON_TRACK';
  }

  return { plannedDurationDays, actualDurationDays, scheduleVarianceDays, delayDays, health };
}

export const HEALTH_LABEL: Record<ActivityHealth, string> = {
  ON_TRACK: 'On Track',
  AT_RISK: 'At Risk',
  DELAYED: 'Delayed',
  COMPLETED_LATE: 'Completed Late',
  COMPLETED_ON_TIME: 'Completed On Time',
};

export const HEALTH_COLOR: Record<ActivityHealth, { color: string; bg: string }> = {
  ON_TRACK: { color: '#5cba80', bg: 'rgba(92,186,128,0.14)' },
  AT_RISK: { color: '#eab308', bg: 'rgba(234,179,8,0.14)' },
  DELAYED: { color: '#e06050', bg: 'rgba(224,96,80,0.14)' },
  COMPLETED_LATE: { color: '#f97316', bg: 'rgba(249,115,22,0.14)' },
  COMPLETED_ON_TIME: { color: '#38bdf8', bg: 'rgba(56,189,248,0.14)' },
};
