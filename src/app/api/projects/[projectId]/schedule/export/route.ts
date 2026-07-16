import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/schedule/export — current schedule as an Excel workbook.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const [phases, milestones, project] = await Promise.all([
      // scheduleImportId excludes Purchase Orders (manually created, never imported) — this
      // is a schedule export, not a procurement one.
      prisma.phase.findMany({ where: { projectId, scheduleImportId: { not: null } }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true } }),
      prisma.milestone.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        include: {
          phase: { select: { name: true } },
          resourceAssignments: { include: { resource: { select: { name: true } } } },
        },
      }),
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    ]);

    const wb = XLSX.utils.book_new();

    const headers = [
      'WBS', 'Phase', 'Task', 'Milestone?', 'Planned Start', 'Planned Finish', 'Duration (days)',
      'Baseline Start', 'Baseline Finish', 'Actual Start', 'Actual Finish',
      '% Complete', 'Actual Work (h)', 'Remaining Work (h)', 'Resources',
    ];
    const rows = milestones.map((m) => [
      m.wbsCode ?? '',
      m.phase?.name ?? '',
      m.title,
      m.isMsProjectMilestone ? 'Yes' : 'No',
      m.plannedStart?.toISOString().slice(0, 10) ?? '',
      m.plannedEnd?.toISOString().slice(0, 10) ?? '',
      m.durationDays ?? '',
      m.baselinePlannedStart?.toISOString().slice(0, 10) ?? '',
      m.baselinePlannedEnd?.toISOString().slice(0, 10) ?? '',
      m.actualStart?.toISOString().slice(0, 10) ?? '',
      m.actualEnd?.toISOString().slice(0, 10) ?? '',
      m.percentComplete ?? '',
      m.actualWorkHours ?? '',
      m.remainingWorkHours ?? '',
      m.resourceAssignments.map((a) => a.resource.name).join(', '),
    ]);

    const ws = XLSX.utils.aoa_to_sheet([headers, ...rows]);
    ws['!cols'] = headers.map((h) => ({ wch: h === 'Task' ? 40 : h === 'Resources' ? 30 : 16 }));
    XLSX.utils.book_append_sheet(wb, ws, 'Schedule');

    const phaseRows = [['Phase'], ...phases.map((p) => [p.name])];
    const phaseWs = XLSX.utils.aoa_to_sheet(phaseRows);
    phaseWs['!cols'] = [{ wch: 35 }];
    XLSX.utils.book_append_sheet(wb, phaseWs, 'Phases');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as BodyInit;
    const safeName = (project?.name ?? 'project').replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'project';

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${safeName}-schedule.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[schedule/export]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
