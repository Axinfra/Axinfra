export type ReportPeriodType = 'WEEK' | 'MONTH';

export interface ReportPeriod {
  type: ReportPeriodType;
  start: Date;
  end: Date; // inclusive, end-of-day
  label: string;
}

const DAY_MS = 86_400_000;

function endOfDay(d: Date): Date {
  const e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

/** ISO week (Monday–Sunday) containing `anchor`. Matches how construction site reports are
 * conventionally cut — Mon-Sun, not the calendar's Sun-Sat. */
function isoWeekRange(anchor: Date): { start: Date; end: Date } {
  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);
  const dayOfWeek = start.getDay(); // 0=Sun..6=Sat
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  start.setTime(start.getTime() - daysSinceMonday * DAY_MS);
  const end = endOfDay(new Date(start.getTime() + 6 * DAY_MS));
  return { start, end };
}

function monthRange(year: number, month1to12: number): { start: Date; end: Date } {
  const start = new Date(year, month1to12 - 1, 1, 0, 0, 0, 0);
  const end = endOfDay(new Date(year, month1to12, 0)); // day 0 of next month = last day of this month
  return { start, end };
}

const WEEKDAY_FMT = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const MONTH_FMT = new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' });

/** Resolves a report period from query-string-shaped input:
 * - type=WEEK, date=YYYY-MM-DD (any date inside the desired week)
 * - type=MONTH, month=YYYY-MM
 * Falls back to the current week/month if the date/month param is missing or unparseable. */
export function resolveReportPeriod(type: ReportPeriodType, dateOrMonth: string | null): ReportPeriod {
  if (type === 'MONTH') {
    const match = dateOrMonth?.match(/^(\d{4})-(\d{2})$/);
    const now = new Date();
    const year = match ? Number(match[1]) : now.getFullYear();
    const month = match ? Number(match[2]) : now.getMonth() + 1;
    const { start, end } = monthRange(year, month);
    return { type, start, end, label: MONTH_FMT.format(start) };
  }

  const anchor = dateOrMonth && /^\d{4}-\d{2}-\d{2}$/.test(dateOrMonth) ? new Date(dateOrMonth) : new Date();
  const { start, end } = isoWeekRange(anchor);
  return { type, start, end, label: `${WEEKDAY_FMT.format(start)} – ${WEEKDAY_FMT.format(end)}` };
}
