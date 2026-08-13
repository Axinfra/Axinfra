/**
 * GET /api/execution-intelligence/[projectId]/gantt
 *
 * Returns phases + milestones with schedule fields + dependency edges.
 * Vendor role sees only their assigned milestones.
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
        const [milestones, phases, scheduleConfig] = await Promise.all([
          prisma.milestone.findMany({
            where: { projectId: params.projectId },
            include: {
              phase: { select: { id: true, name: true, sortOrder: true } },
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
          prisma.phase.findMany({
            // scheduleImportId is set on every Execution/WBS phase the importer creates and
            // only ever null for a Purchase Order (manually created, never imported) —
            // excluding those keeps Purchase Orders out of the Gantt, a schedule-execution
            // view, not a procurement one.
            where: { projectId: params.projectId, scheduleImportId: { not: null } },
            orderBy: { sortOrder: 'asc' },
            select: { id: true, name: true, sortOrder: true, parentPhaseId: true },
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
            // successorDependencies = deps where this milestone IS the successor (incoming edges)
            predecessorIds: m.successorDependencies.map((d) => d.predecessorId),
          })),
          projectStartDate,
        );

        const lagMap = new Map<string, number>();
        for (const m of filteredMilestones) {
          for (const dep of m.successorDependencies) {
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
            // actualVerification/actualSubmission only get set by the payment-workflow state
            // machine — schedule-imported milestones never enter it (see percentComplete
            // comment below), so both stay permanently null for them and the Gantt's "actual"
            // bar never rendered regardless of real completion. Same bug/fix as the sibling
            // analytics route — fall back to the milestone's own actualEnd column (what
            // schedule import's MSPDI ActualFinish, or any direct completion write, populates).
            actualEnd: m.actualVerification ?? m.actualSubmission ?? m.actualEnd ?? null,
            baselinePlannedStart: m.baselinePlannedStart,
            baselinePlannedEnd: m.baselinePlannedEnd,
            value: m.value,
            vendorId: m.vendorUser?.id ?? evidenceVendor?.id ?? null,
            vendorName: m.vendorUser?.name ?? evidenceVendor?.name ?? null,
            isCritical: criticalSet.has(m.id),
            totalFloat: cpmNode?.totalFloat ?? null,
            earlyStart: cpmNode?.earlyStart ?? null,
            earlyFinish: cpmNode?.earlyFinish ?? null,
            // successorDependencies = incoming edges (what this depends on); predecessorId = the prerequisite
            predecessors: m.successorDependencies,
            // predecessorDependencies = outgoing edges (what depends on this); successorId = the dependant
            successors: m.predecessorDependencies,
            // Phase info
            phaseId: m.phase?.id ?? null,
            phaseName: m.phase?.name ?? null,
            phaseOrder: m.phase?.sortOrder ?? 9999,
            // Schedule-imported tasks never enter the payment workflow state machine (always
            // DRAFT) — % Complete from the source file is their real completion signal.
            percentComplete: m.percentComplete,
          };
        });

        return {
          milestones: ganttMilestones,
          phases,
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
