import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { ScheduleImportService } from '@/services/schedule-import/ScheduleImportService';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';

export const dynamic = 'force-dynamic';
export const maxDuration = 60; // large schedules commit hundreds of concurrent-batched rows

// POST /api/projects/[projectId]/schedule/import/[importId]/confirm
// PMC confirms a previewed import, committing it into real Phase/Milestone rows.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; importId: string }> }
) {
  try {
    const { projectId, importId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await request.json().catch(() => ({}));
    const keepWrapperPhase = body?.keepWrapperPhase === true;

    const result = await ScheduleImportService.confirmImport(importId, projectId, { keepWrapperPhase });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.SCHEDULE_IMPORT_CONFIRM,
      entityType: 'ScheduleImport',
      entityId: importId,
      afterJson: result,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : 'Failed to confirm import';
    console.error('[schedule/import/confirm]', error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
