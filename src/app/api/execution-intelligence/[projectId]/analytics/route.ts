/**
 * GET /api/execution-intelligence/[projectId]/analytics
 *
 * Returns all analytics data for the Execution Intelligence dashboard.
 * Heavy aggregation done server-side to keep client lightweight.
 */

import { NextRequest, NextResponse } from 'next/server';
import { differenceInDays, subDays, startOfDay } from 'date-fns';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { cached } from '@/lib/cache';
import {
  computeMilestoneScheduleMetrics,
  computeProjectScheduleKPIs,
  computeVendorScorecards,
  computeSCurve,
  computeBurndown,
  estimateDelayCost,
} from '@/lib/scheduleMetrics';
import { computeCPM, milestonesCpmInputs } from '@/lib/cpm';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const auth = await requireProjectAuth(params.projectId);

    const data = await cached(
      `analytics:${params.projectId}:${auth.role}:${auth.userId}`,
      180_000, // 180s TTL — analytics data changes infrequently
      () => computeAnalytics(params.projectId, auth),
    );

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[analytics]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

async function computeAnalytics(projectId: string, auth: { role: string; userId: string }) {
    const today = new Date();
    const thirtyDaysAgo = subDays(today, 30);

    // --- Parallelize all 5 independent DB-bound operations ---
    // None of these consume another's output; only `projectId` and pure Date math feed them.
    const [milestones, scheduleConfig, escalations, escalationTrend, paymentCycleDays] = await Promise.all([
      prisma.milestone.findMany({
        where: { projectId },
        include: {
          evidence: {
            orderBy: { submittedAt: 'asc' },
            include: { submittedBy: { select: { id: true, name: true } } },
          },
          verifications: { orderBy: { verifiedAt: 'asc' }, take: 1 },
          vendorUser: { select: { id: true, name: true } },
          predecessorDependencies: {
            select: { predecessorId: true, successorId: true, lagDays: true },
          },
        },
        orderBy: [{ sortOrder: 'asc' }, { plannedStart: 'asc' }],
      }),
      prisma.projectScheduleConfig.findUnique({
        where: { projectId },
      }),
      prisma.followUp.findMany({
        where: {
          projectId,
          status: 'ESCALATED',
          createdAt: { gte: thirtyDaysAgo },
        },
        select: { id: true, createdAt: true },
      }),
      buildEscalationTrend(projectId, today),
      buildPaymentCycleDays(projectId),
    ]);

    // Role filter: vendor sees milestones assigned via vendorUserId,
    // falling back to evidence-based ownership for legacy data
    const filtered =
      auth.role === 'VENDOR'
        ? milestones.filter((m) => m.vendorUserId === auth.userId || m.evidence[0]?.submittedById === auth.userId)
        : milestones;

    // --- CPM ---
    const projectStartDate = scheduleConfig?.projectStartDate ?? new Date();
    const cpmInputs = milestonesCpmInputs(
      filtered.map((m) => ({
        id: m.id,
        title: m.title,
        plannedStart: m.plannedStart,
        plannedEnd: m.plannedEnd,
        sortOrder: m.sortOrder,
        predecessorIds: m.predecessorDependencies.map((d) => d.predecessorId),
      })),
      projectStartDate,
    );
    const lagMap = new Map<string, number>();
    for (const m of filtered) {
      for (const dep of m.predecessorDependencies) {
        lagMap.set(`${dep.predecessorId}→${m.id}`, dep.lagDays);
      }
    }
    const cpmResult = computeCPM(cpmInputs, lagMap);
    const criticalSet = new Set(cpmResult.criticalPath);

    // --- Build raw milestone list ---
    const rawMilestones = filtered.map((m) => {
      const firstEvidence = m.evidence[0] ?? null;
      const firstVerification = m.verifications[0] ?? null;
      // Prefer explicit vendorUser FK, fallback to evidence submitter
      const vendorId = m.vendorUser?.id ?? firstEvidence?.submittedById ?? null;
      const vendorName = m.vendorUser?.name ?? firstEvidence?.submittedBy?.name ?? null;
      const actualEnd = m.actualVerification ?? m.actualSubmission ?? null;

      // Approval cycle: evidence submitted → first verification
      const approvalCycleDays =
        firstEvidence && firstVerification
          ? differenceInDays(
              startOfDay(firstVerification.verifiedAt),
              startOfDay(firstEvidence.submittedAt),
            )
          : null;

      return {
        id: m.id,
        title: m.title,
        state: m.state,
        plannedEnd: m.plannedEnd,
        actualEnd,
        value: m.value || 1,
        vendorId,
        vendorName,
        approvalCycleDays,
        isEscalated: false, // will check against FollowUp separately if needed
        plannedStart: m.plannedStart,
        actualStart: m.actualStart,
        isCritical: criticalSet.has(m.id),
        evidenceSubmittedAt: firstEvidence?.submittedAt ?? null,
        pmcReviewedAt: firstVerification?.verifiedAt ?? null,
      };
    });

    // --- Per-milestone metrics ---
    const milestoneMetrics = rawMilestones.map((m) =>
      computeMilestoneScheduleMetrics(m, today),
    );

    // --- Avg approval cycle days ---
    const cycleTimes = rawMilestones
      .map((m) => m.approvalCycleDays)
      .filter((d): d is number => d !== null && d >= 0);
    const avgApprovalCycleDays =
      cycleTimes.length > 0 ? cycleTimes.reduce((s, d) => s + d, 0) / cycleTimes.length : 0;

    // --- KPIs ---
    const kpis = computeProjectScheduleKPIs(
      {
        milestones: rawMilestones,
        avgApprovalCycleDays,
        criticalMilestoneCount: criticalSet.size,
        escalationsLast30Days: escalations.length,
      },
      today,
    );

    // --- Vendor scorecards ---
    const vendorMilestones = rawMilestones
      .filter((m) => m.vendorId !== null)
      .map((m) => ({
        ...m,
        vendorId: m.vendorId!,
        vendorName: m.vendorName ?? 'Unknown',
        approvalCycleDays: m.approvalCycleDays,
        isEscalated: false,
      }));
    const vendorScorecards = computeVendorScorecards(vendorMilestones, today);

    // --- S-Curve ---
    const milestonesWithDates = rawMilestones.filter(
      (m) => m.plannedEnd !== null,
    );
    const allDates = milestonesWithDates.flatMap((m) =>
      [m.plannedStart, m.plannedEnd, m.actualEnd].filter(
        (d): d is Date => d !== null,
      ),
    );
    const sCurveFrom =
      allDates.length > 0
        ? new Date(Math.min(...allDates.map((d) => d.getTime())))
        : subDays(today, 90);
    const sCurveTo =
      allDates.length > 0
        ? new Date(Math.max(...allDates.map((d) => d.getTime())))
        : today;

    const sCurve = computeSCurve(
      milestonesWithDates.map((m) => ({
        id: m.id,
        plannedEnd: m.plannedEnd,
        actualEnd: m.actualEnd,
        value: m.value,
      })),
      sCurveFrom,
      sCurveTo,
    );

    // --- Burn-down ---
    const burndown = computeBurndown(
      milestonesWithDates.map((m) => ({
        id: m.id,
        plannedEnd: m.plannedEnd,
        actualEnd: m.actualEnd,
        value: m.value,
      })),
      sCurveFrom,
      sCurveTo,
    );

    // --- Delay Distribution (histogram buckets) ---
    const delayBuckets = buildDelayHistogram(milestoneMetrics);

    // --- Approval time histogram ---
    const approvalHistogram = buildApprovalHistogram(rawMilestones);

    // (escalationTrend and paymentCycleDays were fetched earlier in Promise.all)

    // --- Delay cost estimation ---
    const totalProjectValue = filtered.reduce((s, m) => s + (m.value || 0), 0);
    const delayCostResult = estimateDelayCost(kpis.totalOverrunDays, {
      dailyOverheadCost: scheduleConfig?.dailyOverheadCost ?? 0,
      penaltyRatePerDay: scheduleConfig?.penaltyRatePerDay ?? 0,
      opportunityCostFactor: scheduleConfig?.opportunityCostFactor ?? 1.0,
      totalProjectValue,
    });

    // --- Critical path heatmap (per milestone criticality) ---
    const criticalityHeatmap = cpmResult.nodes.map((n) => ({
      milestoneId: n.milestoneId,
      title: n.title,
      isCritical: n.isCritical,
      totalFloat: n.totalFloat,
      duration: n.duration,
    }));

    return {
        kpis,
        milestoneMetrics,
        vendorScorecards:
          auth.role === 'VENDOR'
            ? vendorScorecards.map((s) => ({
                ...s,
                vendorName: s.vendorId === auth.userId ? s.vendorName : `Vendor ${s.rank}`,
              }))
            : vendorScorecards,
        sCurve,
        burndown,
        delayHistogram: delayBuckets,
        approvalHistogram,
        escalationTrend,
        paymentCycleDays,
        delayCost: delayCostResult,
        criticalityHeatmap,
        scheduleConfig: scheduleConfig ?? null,
        cpm: {
          criticalPath: cpmResult.criticalPath,
          projectDuration: cpmResult.projectDuration,
          hasCycle: cpmResult.hasCycle,
        },
    };
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

type MetricsRow = {
  timeSavedDays: number;
  overrunDays: number;
  projectedOverrun: number;
};

function buildDelayHistogram(
  metrics: MetricsRow[],
): Array<{ bucket: string; count: number }> {
  const buckets: Record<string, number> = {
    '<-14': 0,
    '-14 to -7': 0,
    '-7 to 0': 0,
    '0 (on-time)': 0,
    '1 to 7': 0,
    '8 to 14': 0,
    '>14': 0,
  };

  for (const m of metrics) {
    // negative = saved, positive = overrun
    const delayDays = m.overrunDays + m.projectedOverrun - m.timeSavedDays;
    if (delayDays < -14) buckets['<-14']++;
    else if (delayDays < -7) buckets['-14 to -7']++;
    else if (delayDays < 0) buckets['-7 to 0']++;
    else if (delayDays === 0) buckets['0 (on-time)']++;
    else if (delayDays <= 7) buckets['1 to 7']++;
    else if (delayDays <= 14) buckets['8 to 14']++;
    else buckets['>14']++;
  }

  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
}

type RawRow = {
  evidenceSubmittedAt: Date | null;
  pmcReviewedAt: Date | null;
};

function buildApprovalHistogram(
  rows: RawRow[],
): Array<{ bucket: string; count: number }> {
  const buckets: Record<string, number> = {
    '0': 0,
    '1-2': 0,
    '3-5': 0,
    '6-10': 0,
    '11-20': 0,
    '>20': 0,
  };

  for (const r of rows) {
    if (!r.evidenceSubmittedAt || !r.pmcReviewedAt) continue;
    const days = differenceInDays(
      startOfDay(r.pmcReviewedAt),
      startOfDay(r.evidenceSubmittedAt),
    );
    if (days <= 0) buckets['0']++;
    else if (days <= 2) buckets['1-2']++;
    else if (days <= 5) buckets['3-5']++;
    else if (days <= 10) buckets['6-10']++;
    else if (days <= 20) buckets['11-20']++;
    else buckets['>20']++;
  }

  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
}

async function buildEscalationTrend(
  projectId: string,
  today: Date,
): Promise<Array<{ week: string; count: number }>> {
  // Single query instead of 12 separate COUNT queries
  const windowStart = subDays(today, 11 * 7 + 6);
  const allEscalations = await prisma.followUp.findMany({
    where: {
      projectId,
      status: 'ESCALATED',
      createdAt: { gte: windowStart, lte: today },
    },
    select: { createdAt: true },
  });

  const weeks: Array<{ week: string; count: number }> = [];
  for (let i = 11; i >= 0; i--) {
    const weekStart = subDays(today, i * 7 + 6);
    const weekEnd = subDays(today, i * 7);
    const count = allEscalations.filter(
      (e) => e.createdAt >= weekStart && e.createdAt <= weekEnd,
    ).length;
    weeks.push({ week: weekEnd.toISOString().slice(0, 10), count });
  }
  return weeks;
}

async function buildPaymentCycleDays(
  projectId: string,
): Promise<{
  avg: number;
  byVendor: Array<{ vendorId: string; vendorName: string; avgDays: number }>;
}> {
  // evidenceSubmittedAt → paymentEligibleAt (FULLY_ELIGIBLE first event)
  const eligibilities = await prisma.paymentEligibility.findMany({
    where: { milestone: { projectId } },
    include: {
      events: {
        where: { toState: 'FULLY_ELIGIBLE' },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
      milestone: {
        include: {
          evidence: {
            orderBy: { submittedAt: 'asc' },
            take: 1,
            include: { submittedBy: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  const rows: Array<{ vendorId: string; vendorName: string; days: number }> = [];
  for (const e of eligibilities) {
    const firstEvidence = e.milestone.evidence[0];
    const eligibleEvent = e.events[0];
    if (!firstEvidence || !eligibleEvent) continue;
    const days = differenceInDays(
      startOfDay(eligibleEvent.createdAt),
      startOfDay(firstEvidence.submittedAt),
    );
    rows.push({
      vendorId: firstEvidence.submittedById,
      vendorName: firstEvidence.submittedBy.name,
      days,
    });
  }

  if (rows.length === 0) return { avg: 0, byVendor: [] };

  const avg = rows.reduce((s, r) => s + r.days, 0) / rows.length;

  // Group by vendor
  const byVendorMap = new Map<string, { name: string; days: number[] }>();
  for (const r of rows) {
    if (!byVendorMap.has(r.vendorId)) {
      byVendorMap.set(r.vendorId, { name: r.vendorName, days: [] });
    }
    byVendorMap.get(r.vendorId)!.days.push(r.days);
  }

  const byVendor = Array.from(byVendorMap.entries()).map(([vendorId, v]) => ({
    vendorId,
    vendorName: v.name,
    avgDays: Math.round((v.days.reduce((s, d) => s + d, 0) / v.days.length) * 10) / 10,
  }));

  return { avg: Math.round(avg * 10) / 10, byVendor };
}
