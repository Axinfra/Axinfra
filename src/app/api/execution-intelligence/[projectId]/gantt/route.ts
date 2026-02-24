/**
 * GET /api/execution-intelligence/[projectId]/gantt
 *
 * Returns milestones with schedule fields + dependency edges for Gantt rendering.
 * Filters by project + role (vendor sees only their own milestones).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { computeCPM, milestonesCpmInputs } from '@/lib/cpm';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const auth = await requireProjectAuth(params.projectId);

    // Fetch milestones with dependency edges
    const milestones = await prisma.milestone.findMany({
      where: { projectId: params.projectId },
      include: {
        predecessorDependencies: {
          select: {
            id: true,
            predecessorId: true,
            successorId: true,
            dependencyType: true,
            lagDays: true,
          },
        },
        successorDependencies: {
          select: {
            id: true,
            predecessorId: true,
            successorId: true,
            dependencyType: true,
            lagDays: true,
          },
        },
        // Vendor info: prefer explicit FK, fallback to first evidence submitter
        vendorUser: { select: { id: true, name: true } },
        evidence: {
          orderBy: { submittedAt: 'asc' },
          take: 1,
          include: { submittedBy: { select: { id: true, name: true } } },
        },
      },
      orderBy: [{ sortOrder: 'asc' }, { plannedStart: 'asc' }, { createdAt: 'asc' }],
    });

    // Role-based filtering: vendor sees milestones assigned via vendorUserId,
    // falling back to evidence-based ownership for legacy data
    let filteredMilestones = milestones;
    if (auth.role === 'VENDOR') {
      filteredMilestones = milestones.filter(
        (m) => m.vendorUserId === auth.userId || m.evidence[0]?.submittedById === auth.userId,
      );
    }

    // Fetch schedule config for project start date
    const scheduleConfig = await prisma.projectScheduleConfig.findUnique({
      where: { projectId: params.projectId },
    });

    // Build CPM inputs
    const projectStartDate = scheduleConfig?.projectStartDate ?? new Date();
    const cpmInputs = milestonesCpmInputs(
      filteredMilestones.map((m) => ({
        id: m.id,
        title: m.title,
        plannedStart: m.plannedStart,
        plannedEnd: m.plannedEnd,
        sortOrder: m.sortOrder,
        predecessorIds: m.predecessorDependencies.map((d) => d.predecessorId),
      })),
      projectStartDate,
    );

    // Build lag map for CPM
    const lagMap = new Map<string, number>();
    for (const m of filteredMilestones) {
      for (const dep of m.predecessorDependencies) {
        lagMap.set(`${dep.predecessorId}→${m.id}`, dep.lagDays);
      }
    }

    const cpmResult = computeCPM(cpmInputs, lagMap);
    const criticalSet = new Set(cpmResult.criticalPath);

    // Map CPM nodes for lookup
    const cpmByMilestone = new Map(cpmResult.nodes.map((n) => [n.milestoneId, n]));

    // Build response
    const ganttMilestones = filteredMilestones.map((m) => {
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
        predecessors: m.predecessorDependencies,
        successors: m.successorDependencies,
      };
    });

    return NextResponse.json({
      success: true,
      data: {
        milestones: ganttMilestones,
        cpm: {
          projectDuration: cpmResult.projectDuration,
          criticalPath: cpmResult.criticalPath,
          hasCycle: cpmResult.hasCycle,
          cycleDescription: cpmResult.cycleDescription ?? null,
        },
        scheduleConfig: scheduleConfig ?? null,
        projectId: params.projectId,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[gantt]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
