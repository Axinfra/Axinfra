import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import * as XLSX from 'xlsx';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/schedule/template — a reference workbook showing exactly
// how a correctly-structured MS Project schedule extracts into Axinfra: Phase → Subphase →
// Task/Milestone, WBS numbering, and every field we read. Not something to re-upload — it's
// a guide for how to set up outline levels/summary tasks in MS Project so extraction comes
// out clean and consistent.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const wb = XLSX.utils.book_new();

    const guideRows = [
      ['How Axinfra reads your Microsoft Project schedule'],
      [''],
      ['WHAT EACH ROW TYPE BECOMES'],
      ['- Phase / Subphase: any task marked "Summary" in MS Project — it groups other tasks'],
      ['  under it. Indent tasks (Tab key) to nest a Subphase inside a Phase, to any depth.'],
      ['- Task: an ordinary task with real duration, filed under whichever Phase/Subphase it'],
      ['  sits beneath in your outline.'],
      ['- Milestone (diamond icon): a task with "Mark task as milestone" checked in MS'],
      ['  Project — usually automatic for any 0-duration task.'],
      [''],
      ['TWO ROWS AXINFRA SKIPS AUTOMATICALLY'],
      ['1. Row 0, the Project Summary Task. MS Project always generates a hidden first row'],
      ['   for the whole project — it is not something you created, and it is not a phase.'],
      ['   Axinfra leaves it out and shows the same summary (total dates, duration, task'],
      ['   count) at the top of the WBS Tree instead, labeled "Project Summary".'],
      ['2. A single wrapper phase, if your file has one. Some schedules nest everything under'],
      ['   one extra top-level phase before the real phases start (e.g. one task named after'],
      ['   the whole project, containing "Pre-Construction", "Construction", etc. inside it).'],
      ['   Axinfra detects that pattern — a lone top-level task spanning the entire schedule'],
      ['   — skips it too, and promotes its children to be the real top-level phases. A file'],
      ['   that already has several top-level phases side by side is unaffected.'],
      [''],
      ['FIELDS READ AUTOMATICALLY — NO EXTRA SETUP'],
      ['Planned/Baseline/Actual dates, % Complete, Work/Remaining Work, and Resource'],
      ['assignments are all read directly from their normal MS Project fields.'],
      ['Dependencies (Finish-to-Start, Start-to-Start, Finish-to-Finish, Start-to-Finish,'],
      ['with lag) come from MS Project\'s Predecessors column.'],
      [''],
      ['FILE FORMATS'],
      ['Both native .mpp files and File -> Save As -> XML exports are accepted — upload'],
      ['either one from the Schedule tab.'],
      [''],
      ['The "Sample Structure" sheet below shows what a well-structured schedule looks like'],
      ['once extracted — use it as a reference, not something to re-upload.'],
    ];
    const guideWs = XLSX.utils.aoa_to_sheet(guideRows);
    guideWs['!cols'] = [{ wch: 90 }];
    XLSX.utils.book_append_sheet(wb, guideWs, 'How To');

    const headers = [
      'WBS', 'Outline Level', 'Name', 'Type', 'Planned Start', 'Planned Finish', 'Duration (days)',
      'Baseline Start', 'Baseline Finish', 'Actual Start', 'Actual Finish',
      '% Complete', 'Actual Work (h)', 'Remaining Work (h)', 'Resources', 'Predecessors',
    ];
    const sampleRows = [
      ['1', '1', 'Pre-Construction', 'Phase', '2024-01-01', '2024-02-15', '', '', '', '', '', '', '', '', '', ''],
      ['1.1', '2', "Consultant's Appointment", 'Subphase', '2024-01-01', '2024-01-20', '', '', '', '', '', '', '', '', '', ''],
      ['1.1.1', '3', 'PMC on board / LOI issued', 'Milestone', '2024-01-10', '2024-01-10', '0', '2024-01-08', '2024-01-08', '2024-01-10', '2024-01-10', '100', '0', '0', '', ''],
      ['1.2', '2', 'Design Finalization', 'Task', '2024-01-20', '2024-02-15', '26', '2024-01-20', '2024-02-10', '2024-01-22', '', '40', '80', '120', 'Architect, Interior Designer', '1.1.1'],
      ['2', '1', 'Civil & Structural Works', 'Phase', '2024-02-15', '2024-06-01', '', '', '', '', '', '', '', '', '', ''],
      ['2.1', '2', 'Excavation', 'Task', '2024-02-15', '2024-03-01', '15', '2024-02-15', '2024-03-01', '', '', '0', '0', '120', 'Excavator, Workers', '1.2'],
    ];
    const sampleWs = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
    sampleWs['!cols'] = headers.map((h) => ({ wch: h === 'Name' ? 32 : h === 'Resources' ? 26 : 15 }));
    XLSX.utils.book_append_sheet(wb, sampleWs, 'Sample Structure');

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as unknown as BodyInit;

    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="schedule-structure-reference.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[schedule/template]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
