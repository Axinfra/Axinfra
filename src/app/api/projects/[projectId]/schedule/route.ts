import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/schedule — the confirmed schedule (phases, milestones
// with WBS/progress/resource data, dependencies). Read access matches the Schedule nav
// item (CLIENT/PMC/VENDOR/CONSULTANT) — any authenticated project member.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const [phases, milestones, latestConfirmedImport] = await Promise.all([
      prisma.phase.findMany({
        // scheduleImportId is set on every Execution/WBS phase the importer creates (top-level
        // or nested) and only ever null for a Purchase Order (manually created, never
        // imported) — excluding those keeps Purchase Orders out of the WBS Tree/Gantt, which
        // is a schedule-execution view, not a procurement one.
        where: { projectId, scheduleImportId: { not: null } },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, name: true, description: true, sortOrder: true, plannedStart: true, plannedEnd: true,
          parentPhaseId: true, outlineLevel: true, vendorUserId: true, scheduleImportId: true,
          vendorUser: { select: { name: true } },
        },
      }),
      prisma.milestone.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, title: true, state: true, sortOrder: true, phaseId: true,
          plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true,
          baselinePlannedStart: true, baselinePlannedEnd: true,
          wbsCode: true, outlineLevel: true, isMsProjectMilestone: true,
          durationDays: true, percentComplete: true, actualWorkHours: true, remainingWorkHours: true,
          value: true, vendorUserId: true,
          vendorUser: { select: { name: true } },
          predecessorDependencies: {
            select: { predecessorId: true, dependencyType: true, lagDays: true },
          },
          resourceAssignments: {
            select: { units: true, workHours: true, resource: { select: { id: true, name: true, type: true } } },
          },
        },
      }),
      prisma.scheduleImport.findFirst({
        where: { projectId, status: 'CONFIRMED' },
        orderBy: { confirmedAt: 'desc' },
        select: { id: true, fileName: true, confirmedAt: true, sourceFormat: true },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: { phases, milestones, latestConfirmedImport },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[schedule GET]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
