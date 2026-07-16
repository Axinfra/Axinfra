import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { exportToMspdiXml } from '@/services/schedule-import/mspdiExporter';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/schedule/export-xml — current schedule (including any
// edits made in-app) as MS Project XML (MSPDI), openable directly via File → Open in
// Microsoft Project. There is no native .mpp *writer* available anywhere (MPXJ itself only
// writes MSPDI/PMXML/MPX/etc, never .mpp) — this is the closest faithful round-trip export.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const [phases, milestones, project] = await Promise.all([
      prisma.phase.findMany({
        // scheduleImportId excludes Purchase Orders (manually created, never imported) — this
        // is a schedule export, not a procurement one.
        where: { projectId, scheduleImportId: { not: null } },
        orderBy: { sortOrder: 'asc' },
        select: { id: true, parentPhaseId: true, name: true, outlineLevel: true, sortOrder: true, plannedStart: true, plannedEnd: true },
      }),
      prisma.milestone.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true, phaseId: true, title: true, isMsProjectMilestone: true, sortOrder: true,
          plannedStart: true, plannedEnd: true, baselinePlannedStart: true, baselinePlannedEnd: true,
          actualStart: true, actualEnd: true, durationDays: true, percentComplete: true,
          actualWorkHours: true, remainingWorkHours: true,
          predecessorDependencies: { select: { predecessorId: true, dependencyType: true, lagDays: true } },
          resourceAssignments: { select: { units: true, workHours: true, resource: { select: { id: true, name: true } } } },
        },
      }),
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    ]);

    if (phases.length === 0 && milestones.length === 0) {
      return NextResponse.json({ success: false, error: 'No schedule to export yet' }, { status: 404 });
    }

    const xml = exportToMspdiXml(project?.name ?? 'Project', phases, milestones);
    const safeName = (project?.name ?? 'project').replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'project';

    return new NextResponse(xml, {
      headers: {
        'Content-Type': 'application/xml',
        'Content-Disposition': `attachment; filename="${safeName}-schedule.xml"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[schedule/export-xml]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
