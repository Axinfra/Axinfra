/**
 * Schedule metrics calculations for Execution Intelligence.
 * All functions are pure and deterministic; no DB calls.
 */

import { differenceInDays, isAfter, isBefore, startOfDay } from 'date-fns';
import type {
  MilestoneScheduleMetrics,
  ProjectScheduleKPIs,
  VendorScorecard,
  SCurvePoint,
  BurndownPoint,
} from '@/types';

// -------------------------------------------------------------------------
// Per-milestone time saved / overrun
// -------------------------------------------------------------------------

export interface RawMilestone {
  id: string;
  title: string;
  state: string;
  plannedEnd: Date | null;
  actualEnd: Date | null; // actualVerification for VERIFIED/CLOSED; else null
  value: number;
  vendorId: string | null;
}

const COMPLETE_STATES = new Set(['VERIFIED', 'CLOSED']);

/**
 * Compute schedule metrics for a single milestone.
 */
export function computeMilestoneScheduleMetrics(
  m: RawMilestone,
  today: Date = new Date(),
): MilestoneScheduleMetrics {
  const todayStart = startOfDay(today);
  const isComplete = COMPLETE_STATES.has(m.state);

  let timeSavedDays = 0;
  let overrunDays = 0;
  let projectedOverrun = 0;
  let remainingBuffer = 0;
  let isOverdue = false;

  if (m.plannedEnd) {
    const plannedEndDay = startOfDay(m.plannedEnd);

    if (isComplete && m.actualEnd) {
      const actualEndDay = startOfDay(m.actualEnd);
      const diff = differenceInDays(plannedEndDay, actualEndDay); // positive = saved
      timeSavedDays = diff > 0 ? diff : 0;
      overrunDays = diff < 0 ? Math.abs(diff) : 0;
    } else if (!isComplete) {
      if (isAfter(todayStart, plannedEndDay)) {
        // Already past planned end and not complete
        projectedOverrun = differenceInDays(todayStart, plannedEndDay);
        isOverdue = true;
      } else {
        remainingBuffer = differenceInDays(plannedEndDay, todayStart);
      }
    }
  }

  return {
    milestoneId: m.id,
    title: m.title,
    state: m.state,
    plannedEnd: m.plannedEnd,
    actualEnd: m.actualEnd,
    isComplete,
    isOverdue,
    timeSavedDays,
    overrunDays,
    projectedOverrun,
    remainingBuffer,
  };
}

// -------------------------------------------------------------------------
// Project-level KPIs
// -------------------------------------------------------------------------

export interface ProjectKpiInput {
  milestones: RawMilestone[];
  /** Average approval cycle days (evidenceSubmittedAt → pmcReviewedAt) */
  avgApprovalCycleDays: number;
  criticalMilestoneCount: number;
  escalationsLast30Days: number;
}

export function computeProjectScheduleKPIs(
  input: ProjectKpiInput,
  today: Date = new Date(),
): ProjectScheduleKPIs {
  const metrics = input.milestones.map((m) => computeMilestoneScheduleMetrics(m, today));

  const totalSavedDays = metrics.reduce((s, m) => s + m.timeSavedDays, 0);
  const totalOverrunDays = metrics.reduce(
    (s, m) => s + m.overrunDays + m.projectedOverrun,
    0,
  );
  const netScheduleDays = totalSavedDays - totalOverrunDays;

  const completed = metrics.filter((m) => m.isComplete);
  const onTime = completed.filter((m) => m.overrunDays === 0);
  const onTimePct = completed.length > 0 ? (onTime.length / completed.length) * 100 : 0;

  return {
    netScheduleDays,
    totalSavedDays,
    totalOverrunDays,
    onTimePct: Math.round(onTimePct * 10) / 10,
    avgApprovalCycleDays: Math.round(input.avgApprovalCycleDays * 10) / 10,
    criticalMilestoneCount: input.criticalMilestoneCount,
    escalationsLast30Days: input.escalationsLast30Days,
    completedMilestones: completed.length,
    totalMilestones: metrics.length,
  };
}

// -------------------------------------------------------------------------
// Vendor scorecard
// -------------------------------------------------------------------------

export interface VendorMilestone extends RawMilestone {
  vendorId: string;
  vendorName: string;
  approvalCycleDays: number | null; // null if not yet completed approval cycle
  isEscalated: boolean;
}

export function computeVendorScorecards(
  milestones: VendorMilestone[],
  today: Date = new Date(),
): VendorScorecard[] {
  // Group by vendorId
  const byVendor = new Map<string, { name: string; rows: VendorMilestone[] }>();
  for (const m of milestones) {
    if (!byVendor.has(m.vendorId)) {
      byVendor.set(m.vendorId, { name: m.vendorName, rows: [] });
    }
    byVendor.get(m.vendorId)!.rows.push(m);
  }

  const scorecards: VendorScorecard[] = [];
  for (const [vendorId, entry] of Array.from(byVendor)) {
    const { name, rows } = entry;
    const completed = rows.filter((r: VendorMilestone) => COMPLETE_STATES.has(r.state));
    const onTime = completed.filter((r: VendorMilestone) => {
      if (!r.plannedEnd || !r.actualEnd) return false;
      return !isAfter(startOfDay(r.actualEnd), startOfDay(r.plannedEnd));
    });
    const lateMilestones = completed.filter((r: VendorMilestone) => {
      if (!r.plannedEnd || !r.actualEnd) return false;
      return isAfter(startOfDay(r.actualEnd), startOfDay(r.plannedEnd));
    });
    const totalDelayDays = lateMilestones.reduce((sum: number, r: VendorMilestone) => {
      if (!r.plannedEnd || !r.actualEnd) return sum;
      return sum + differenceInDays(startOfDay(r.actualEnd), startOfDay(r.plannedEnd));
    }, 0);
    const avgDelayDays =
      lateMilestones.length > 0 ? totalDelayDays / lateMilestones.length : 0;

    const cycleTimes = rows
      .map((r: VendorMilestone) => r.approvalCycleDays)
      .filter((d: number | null): d is number => d !== null);
    const avgApprovalCycleDays =
      cycleTimes.length > 0
        ? cycleTimes.reduce((s: number, d: number) => s + d, 0) / cycleTimes.length
        : 0;

    const escalationCount = rows.filter((r: VendorMilestone) => r.isEscalated).length;
    const onTimePct =
      completed.length > 0 ? (onTime.length / completed.length) * 100 : 0;

    scorecards.push({
      vendorId,
      vendorName: name,
      totalMilestones: rows.length,
      completedOnTime: onTime.length,
      completedLate: lateMilestones.length,
      inProgress: rows.filter((r: VendorMilestone) => !COMPLETE_STATES.has(r.state)).length,
      onTimePct: Math.round(onTimePct * 10) / 10,
      avgDelayDays: Math.round(avgDelayDays * 10) / 10,
      avgApprovalCycleDays: Math.round(avgApprovalCycleDays * 10) / 10,
      escalationCount,
      rank: 0, // filled after sorting
    });
  }

  // Rank by onTimePct desc, then avgDelayDays asc
  scorecards.sort((a, b) => {
    if (b.onTimePct !== a.onTimePct) return b.onTimePct - a.onTimePct;
    return a.avgDelayDays - b.avgDelayDays;
  });
  scorecards.forEach((s, i) => (s.rank = i + 1));

  return scorecards;
}

// -------------------------------------------------------------------------
// S-Curve (Planned vs Actual cumulative completions)
// -------------------------------------------------------------------------

export interface SCurveMilestone {
  id: string;
  plannedEnd: Date | null;
  actualEnd: Date | null; // null if not complete
  value: number; // weight
}

export function computeSCurve(
  milestones: SCurveMilestone[],
  from: Date,
  to: Date,
  stepDays = 7,
): SCurvePoint[] {
  const totalValue = milestones.reduce((s, m) => s + m.value, 0) || 1;
  const points: SCurvePoint[] = [];

  let cursor = startOfDay(from);
  const end = startOfDay(to);

  while (!isAfter(cursor, end)) {
    const dateStr = cursor.toISOString().slice(0, 10);
    const plannedCumulative =
      milestones
        .filter((m) => m.plannedEnd && !isAfter(startOfDay(m.plannedEnd), cursor))
        .reduce((s, m) => s + m.value, 0) / totalValue;

    const actualCumulative =
      milestones
        .filter((m) => m.actualEnd && !isAfter(startOfDay(m.actualEnd), cursor))
        .reduce((s, m) => s + m.value, 0) / totalValue;

    points.push({
      date: dateStr,
      plannedCumulative: Math.round(plannedCumulative * 1000) / 10, // 0–100%
      actualCumulative: Math.round(actualCumulative * 1000) / 10,
    });

    // Advance cursor by stepDays
    cursor = new Date(cursor.getTime() + stepDays * 24 * 60 * 60 * 1000);
  }

  return points;
}

// -------------------------------------------------------------------------
// Burn-down chart
// -------------------------------------------------------------------------

export function computeBurndown(
  milestones: SCurveMilestone[],
  from: Date,
  to: Date,
  stepDays = 7,
): BurndownPoint[] {
  const totalValue = milestones.reduce((s, m) => s + m.value, 0) || 1;
  const points: BurndownPoint[] = [];

  let cursor = startOfDay(from);
  const end = startOfDay(to);

  while (!isAfter(cursor, end)) {
    const dateStr = cursor.toISOString().slice(0, 10);

    // Planned remaining: milestones whose plannedEnd is after cursor
    const plannedRemaining =
      milestones
        .filter((m) => !m.plannedEnd || isAfter(startOfDay(m.plannedEnd), cursor))
        .reduce((s, m) => s + m.value, 0) / totalValue;

    // Actual remaining: milestones not yet completed as of cursor
    const actualRemaining =
      milestones
        .filter((m) => !m.actualEnd || isAfter(startOfDay(m.actualEnd), cursor))
        .reduce((s, m) => s + m.value, 0) / totalValue;

    points.push({
      date: dateStr,
      plannedRemaining: Math.round(plannedRemaining * 1000) / 10,
      actualRemaining: Math.round(actualRemaining * 1000) / 10,
    });

    cursor = new Date(cursor.getTime() + stepDays * 24 * 60 * 60 * 1000);
  }

  return points;
}

// -------------------------------------------------------------------------
// Delay cost estimation
// -------------------------------------------------------------------------

export interface DelayCostConfig {
  dailyOverheadCost: number;
  penaltyRatePerDay: number;      // fraction of total project value per day
  opportunityCostFactor: number;
  totalProjectValue: number;
}

export interface DelayCostResult {
  overheadCost: number;
  penaltyCost: number;
  opportunityCost: number;
  totalEstimatedCost: number;
  totalOverrunDays: number;
  isConfigured: boolean;
}

export function estimateDelayCost(
  totalOverrunDays: number,
  config: DelayCostConfig,
): DelayCostResult {
  const isConfigured =
    config.dailyOverheadCost > 0 ||
    config.penaltyRatePerDay > 0 ||
    config.opportunityCostFactor !== 1.0;

  if (!isConfigured || totalOverrunDays <= 0) {
    return {
      overheadCost: 0,
      penaltyCost: 0,
      opportunityCost: 0,
      totalEstimatedCost: 0,
      totalOverrunDays,
      isConfigured,
    };
  }

  const overheadCost = config.dailyOverheadCost * totalOverrunDays;
  const penaltyCost =
    config.penaltyRatePerDay * config.totalProjectValue * totalOverrunDays;
  const opportunityCost =
    overheadCost * (config.opportunityCostFactor - 1);

  return {
    overheadCost,
    penaltyCost,
    opportunityCost,
    totalEstimatedCost: overheadCost + penaltyCost + opportunityCost,
    totalOverrunDays,
    isConfigured: true,
  };
}
