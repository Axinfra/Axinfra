/**
 * GET /api/vendor/portal
 *
 * Returns the vendor's project context, filtered milestones, and analytics.
 * Server-side enforced: vendor only sees milestones assigned via vendorUserId
 * (with fallback to evidence-based ownership for legacy data).
 *
 * Query params:
 *   ?view=overview|gantt|analytics (default: overview)
 */

import { NextRequest, NextResponse } from 'next/server';
import { differenceInDays, subDays, startOfDay } from 'date-fns';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role } from '@/types';
import {
  computeMilestoneScheduleMetrics,
  computeProjectScheduleKPIs,
  computeSCurve,
  computeBurndown,
  estimateDelayCost,
} from '@/lib/scheduleMetrics';
import { computeCPM, milestonesCpmInputs } from '@/lib/cpm';
import { cached } from '@/lib/cache';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const view = request.nextUrl.searchParams.get('view') || 'overview';

    // Find vendor's project role(s) — must be VENDOR
    const vendorRoles = await prisma.projectRole.findMany({
      where: { userId: auth.userId, role: Role.VENDOR },
      include: { project: { select: { id: true, name: true } } },
    });

    if (vendorRoles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'No vendor access. You are not assigned as a vendor to any project.' },
        { status: 403 },
      );
    }

    // Use first vendor project (demo phase — single project)
    const projectRole = vendorRoles[0];
    const projectId = projectRole.projectId;
    const projectName = projectRole.project.name;

    // Validate view up-front so we don't cache a 400.
    if (view !== 'overview' && view !== 'gantt' && view !== 'analytics') {
      return NextResponse.json(
        { success: false, error: `Unknown view: ${view}` },
        { status: 400 },
      );
    }

    // Cache the computed payload per-vendor-per-project-per-view for 60s.
    // Auth and VENDOR role check stay fresh above the cache.
    const cacheKey = `vendor:${auth.userId}:portal:${projectId}:${view}`;
    const payload = await cached(cacheKey, 60_000, async () => {
    const today = new Date();

    // ── Load vendor's milestones directly via vendorUserId (with fallback to evidence) ──
    const allMilestones = await prisma.milestone.findMany({
      where: { projectId },
      include: {
        evidence: {
          orderBy: { submittedAt: 'asc' },
          include: { submittedBy: { select: { id: true, name: true } } },
        },
        verifications: { orderBy: { verifiedAt: 'asc' }, take: 1 },
        vendorUser: { select: { id: true, name: true } },
        predecessorDependencies: {
          select: { predecessorId: true, successorId: true, lagDays: true, dependencyType: true },
        },
        successorDependencies: {
          select: { id: true, predecessorId: true, successorId: true, dependencyType: true, lagDays: true },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { plannedStart: 'asc' }],
    });

    // SERVER-SIDE FILTER: vendor sees milestones assigned via vendorUserId,
    // falling back to evidence-based ownership for legacy data
    const vendorMilestones = allMilestones.filter(
      (m) => m.vendorUserId === auth.userId || m.evidence[0]?.submittedById === auth.userId,
    );

    // ── Build common milestone data ──
    const rawMilestones = vendorMilestones.map((m) => {
      const firstEvidence = m.evidence[0] ?? null;
      const firstVerification = m.verifications[0] ?? null;
      const actualEnd = m.actualVerification ?? m.actualSubmission ?? null;

      const approvalCycleDays =
        firstEvidence && firstVerification
          ? differenceInDays(
              startOfDay(firstVerification.verifiedAt),
              startOfDay(firstEvidence.submittedAt),
            )
          : null;

      // Prefer explicit vendorUser FK, fallback to evidence submitter
      const vendorId = m.vendorUser?.id ?? firstEvidence?.submittedById ?? null;
      const vendorName = m.vendorUser?.name ?? firstEvidence?.submittedBy?.name ?? null;

      return {
        id: m.id,
        title: m.title,
        state: m.state,
        plannedStart: m.plannedStart,
        plannedEnd: m.plannedEnd,
        actualStart: m.actualStart,
        actualEnd,
        baselinePlannedStart: m.baselinePlannedStart,
        baselinePlannedEnd: m.baselinePlannedEnd,
        sortOrder: m.sortOrder,
        value: m.value || 1,
        vendorId,
        vendorName,
        approvalCycleDays,
        isEscalated: false,
        isCritical: false,
        evidenceSubmittedAt: firstEvidence?.submittedAt ?? null,
        pmcReviewedAt: firstVerification?.verifiedAt ?? null,
      };
    });

    // ── View-specific data ──

    if (view === 'overview') {
      const milestoneMetrics = rawMilestones.map((m) =>
        computeMilestoneScheduleMetrics(m, today),
      );

      const cycleTimes = rawMilestones
        .map((m) => m.approvalCycleDays)
        .filter((d): d is number => d !== null && d >= 0);
      const avgApprovalCycleDays =
        cycleTimes.length > 0 ? cycleTimes.reduce((s, d) => s + d, 0) / cycleTimes.length : 0;

      // Escalations affecting this vendor's milestones
      const vendorMilestoneIds = vendorMilestones.map((m) => m.id);
      const thirtyDaysAgo = subDays(today, 30);
      const escalations = await prisma.followUp.count({
        where: {
          projectId,
          status: 'ESCALATED',
          createdAt: { gte: thirtyDaysAgo },
          targetEntityId: { in: vendorMilestoneIds },
        },
      });

      // On-time %
      const completed = milestoneMetrics.filter((m) => m.isComplete);
      const onTimePct =
        completed.length > 0
          ? Math.round(
              (completed.filter((m) => m.timeSavedDays >= 0).length / completed.length) * 100,
            )
          : 0;

      // Avg delay
      const delays = milestoneMetrics
        .filter((m) => m.overrunDays > 0 || m.projectedOverrun > 0)
        .map((m) => m.overrunDays + m.projectedOverrun);
      const avgDelay =
        delays.length > 0
          ? Math.round((delays.reduce((s, d) => s + d, 0) / delays.length) * 10) / 10
          : 0;

      return {
        success: true,
        data: {
          projectId,
          projectName,
          role: Role.VENDOR,
          view: 'overview',
          kpis: {
            totalMilestones: rawMilestones.length,
            completedMilestones: completed.length,
            onTimePct,
            avgDelayDays: avgDelay,
            avgApprovalCycleDays: Math.round(avgApprovalCycleDays * 10) / 10,
            escalationsLast30Days: escalations,
          },
          milestones: rawMilestones.map((m) => ({
            id: m.id,
            title: m.title,
            state: m.state,
            plannedStart: m.plannedStart,
            plannedEnd: m.plannedEnd,
            actualEnd: m.actualEnd,
            value: m.value,
          })),
        },
      };
    }

    if (view === 'gantt') {
      // CPM for vendor's milestones
      const scheduleConfig = await prisma.projectScheduleConfig.findUnique({
        where: { projectId },
      });
      const projectStartDate = scheduleConfig?.projectStartDate ?? new Date();

      const cpmInputs = milestonesCpmInputs(
        vendorMilestones.map((m) => ({
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
      for (const m of vendorMilestones) {
        for (const dep of m.predecessorDependencies) {
          lagMap.set(`${dep.predecessorId}→${m.id}`, dep.lagDays);
        }
      }

      const cpmResult = computeCPM(cpmInputs, lagMap);
      const criticalSet = new Set(cpmResult.criticalPath);
      const cpmByMilestone = new Map(cpmResult.nodes.map((n) => [n.milestoneId, n]));

      const ganttMilestones = vendorMilestones.map((m) => {
        const evidenceVendor = m.evidence[0]?.submittedBy ?? null;
        const cpmNode = cpmByMilestone.get(m.id);
        return {
          id: m.id,
          title: m.title,
          state: m.state,
          sortOrder: m.sortOrder,
          plannedStart: m.plannedStart,
          plannedEnd: m.plannedEnd,
          actualStart: m.actualStart,
          actualEnd: m.actualVerification ?? m.actualSubmission ?? null,
          baselinePlannedStart: m.baselinePlannedStart,
          baselinePlannedEnd: m.baselinePlannedEnd,
          value: m.value,
          vendorId: m.vendorUser?.id ?? evidenceVendor?.id ?? null,
          vendorName: m.vendorUser?.name ?? evidenceVendor?.name ?? null,
          isCritical: criticalSet.has(m.id),
          totalFloat: cpmNode?.totalFloat ?? null,
          earlyStart: cpmNode?.earlyStart ?? null,
          earlyFinish: cpmNode?.earlyFinish ?? null,
          // No predecessor/successor editing for vendors
          predecessors: m.predecessorDependencies,
          successors: m.successorDependencies,
        };
      });

      return {
        success: true,
        data: {
          projectId,
          projectName,
          role: Role.VENDOR,
          view: 'gantt',
          milestones: ganttMilestones,
          cpm: {
            projectDuration: cpmResult.projectDuration,
            criticalPath: cpmResult.criticalPath,
            hasCycle: cpmResult.hasCycle,
          },
          scheduleConfig: scheduleConfig ?? null,
        },
      };
    }

    if (view === 'analytics') {
      // Analytics: S-curve, delay distribution, payment cycle, on-time trend
      // ALL limited to this vendor's milestones only

      const milestoneMetrics = rawMilestones.map((m) =>
        computeMilestoneScheduleMetrics(m, today),
      );

      const cycleTimes = rawMilestones
        .map((m) => m.approvalCycleDays)
        .filter((d): d is number => d !== null && d >= 0);
      const avgApprovalCycleDays =
        cycleTimes.length > 0 ? cycleTimes.reduce((s, d) => s + d, 0) / cycleTimes.length : 0;

      const kpis = computeProjectScheduleKPIs(
        {
          milestones: rawMilestones,
          avgApprovalCycleDays,
          criticalMilestoneCount: 0,
          escalationsLast30Days: 0,
        },
        today,
      );

      // S-Curve
      const milestonesWithDates = rawMilestones.filter((m) => m.plannedEnd !== null);
      const allDates = milestonesWithDates.flatMap((m) =>
        [m.plannedStart, m.plannedEnd, m.actualEnd].filter((d): d is Date => d !== null),
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

      // Delay distribution
      const delayBuckets = buildDelayHistogram(milestoneMetrics);

      // Payment cycle days (vendor's milestones only)
      const vendorMilestoneIds = vendorMilestones.map((m) => m.id);
      const paymentCycleDays = await buildVendorPaymentCycleDays(vendorMilestoneIds);

      // On-time trend (monthly for last 6 months)
      const onTimeTrend = buildOnTimeTrend(rawMilestones, today);

      return {
        success: true,
        data: {
          projectId,
          projectName,
          role: Role.VENDOR,
          view: 'analytics',
          kpis,
          milestoneMetrics,
          sCurve,
          delayHistogram: delayBuckets,
          paymentCycleDays,
          onTimeTrend,
        },
      };
    }

    // Unreachable: view was validated before the cache call, but the compiler
    // needs a total return — return an empty payload to satisfy the closure.
    return { success: false, error: 'Unknown view' };
    });

    return NextResponse.json(payload);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[vendor/portal]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

type MetricsRow = { timeSavedDays: number; overrunDays: number; projectedOverrun: number };

function buildDelayHistogram(
  metrics: MetricsRow[],
): Array<{ bucket: string; count: number }> {
  const buckets: Record<string, number> = {
    '<-14': 0, '-14 to -7': 0, '-7 to 0': 0,
    '0 (on-time)': 0, '1 to 7': 0, '8 to 14': 0, '>14': 0,
  };

  for (const m of metrics) {
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

async function buildVendorPaymentCycleDays(milestoneIds: string[]): Promise<{ avg: number }> {
  if (milestoneIds.length === 0) return { avg: 0 };

  const eligibilities = await prisma.paymentEligibility.findMany({
    where: { milestoneId: { in: milestoneIds } },
    include: {
      events: {
        where: { toState: 'FULLY_ELIGIBLE' },
        orderBy: { createdAt: 'asc' },
        take: 1,
      },
      milestone: {
        include: {
          evidence: { orderBy: { submittedAt: 'asc' }, take: 1 },
        },
      },
    },
  });

  const days: number[] = [];
  for (const e of eligibilities) {
    const firstEvidence = e.milestone.evidence[0];
    const eligibleEvent = e.events[0];
    if (!firstEvidence || !eligibleEvent) continue;
    days.push(
      differenceInDays(
        startOfDay(eligibleEvent.createdAt),
        startOfDay(firstEvidence.submittedAt),
      ),
    );
  }

  return { avg: days.length > 0 ? Math.round((days.reduce((s, d) => s + d, 0) / days.length) * 10) / 10 : 0 };
}

function buildOnTimeTrend(
  milestones: Array<{ actualEnd: Date | null; plannedEnd: Date | null; state: string }>,
  today: Date,
): Array<{ month: string; onTimePct: number }> {
  const months: Array<{ month: string; onTimePct: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const monthEnd = new Date(today.getFullYear(), today.getMonth() - i + 1, 0);
    const monthStart = new Date(monthEnd.getFullYear(), monthEnd.getMonth(), 1);

    const completed = milestones.filter(
      (m) =>
        m.actualEnd &&
        m.actualEnd >= monthStart &&
        m.actualEnd <= monthEnd,
    );

    const onTime = completed.filter(
      (m) => m.plannedEnd && m.actualEnd && m.actualEnd <= m.plannedEnd,
    ).length;

    months.push({
      month: monthStart.toISOString().slice(0, 7),
      onTimePct: completed.length > 0 ? Math.round((onTime / completed.length) * 100) : 0,
    });
  }
  return months;
}
