/**
 * GET /api/execution-intelligence/[projectId]/gantt
 *
 * Returns milestones with schedule fields + dependency edges for Gantt rendering.
 * Filters by project + role (vendor sees only their own milestones).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { cached } from '@/lib/cache';
import { computeCPM, milestonesCpmInputs } from '@/lib/cpm';

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const auth = await requireProjectAuth(params.projectId);

    const responseData = await cached(
      `gantt:${params.projectId}:${auth.userId}`,
      60_000,
      async () => {
        const [milestones, scheduleConfig] = await Promise.all([
          prisma.milestone.findMany({
            where: { projectId: params.projectId },
            include: {
              predecessorDependencies: {
                select: { id: true, predecessorId: true, successorId: true, dependencyType: true, lagDays: true },
              },
              successorDependencies: {
                select: { id: true, predecessorId: true, successorId: true, dependencyType: true, lagDays: true },
              },
              vendorUser: { select: { id: true, name: true } },
              evidence: {
                orderBy: { submittedAt: 'asc' },
                take: 1,
                include: { submittedBy: { select: { id: true, name: true } } },
              },
            },
            orderBy: [{ sortOrder: 'asc' }, { plannedStart: 'asc' }, { createdAt: 'asc' }],
          }),
          prisma.projectScheduleConfig.findUnique({ where: { projectId: params.projectId } }),
        ]);

        let filteredMilestones = milestones;
        if (auth.role === 'VENDOR') {
          filteredMilestones = milestones.filter(
            (m) => m.vendorUserId === auth.userId || m.evidence[0]?.submittedById === auth.userId,
          );
        }

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

        const lagMap = new Map<string, number>();
        for (const m of filteredMilestones) {
          for (const dep of m.predecessorDependencies) {
            lagMap.set(`${dep.predecessorId}→${m.id}`, dep.lagDays);
          }
        }

        const cpmResult = computeCPM(cpmInputs, lagMap);
        const criticalSet = new Set(cpmResult.criticalPath);
        const cpmByMilestone = new Map(cpmResult.nodes.map((n) => [n.milestoneId, n]));

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

        return {
          milestones: ganttMilestones,
          cpm: {
            projectDuration: cpmResult.projectDuration,
            criticalPath: cpmResult.criticalPath,
            hasCycle: cpmResult.hasCycle,
            cycleDescription: cpmResult.cycleDescription ?? null,
          },
          scheduleConfig: scheduleConfig ?? null,
          projectId: params.projectId,
        };
      },
    );

    return NextResponse.json({ success: true, data: responseData });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[gantt]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
