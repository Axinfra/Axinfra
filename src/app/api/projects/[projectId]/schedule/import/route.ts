import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { ScheduleImportService } from '@/services/schedule-import/ScheduleImportService';

export const dynamic = 'force-dynamic';
export const maxDuration = 30; // .mpp conversion spawns a native binary; give it headroom beyond the default

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const ALLOWED_EXTENSIONS = ['.xml', '.mpp'];

// POST /api/projects/[projectId]/schedule/import — PMC uploads a schedule file.
// Parses it and returns a preview (counts) — does not write Phase/Milestone rows
// until the separate /confirm step.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const formData = await request.formData();
    const file = formData.get('file');
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ success: false, error: `File exceeds maximum size of ${MAX_FILE_SIZE_MB}MB` }, { status: 400 });
    }
    const lowerName = file.name.toLowerCase();
    if (!ALLOWED_EXTENSIONS.some((ext) => lowerName.endsWith(ext))) {
      return NextResponse.json({ success: false, error: 'Only .xml (MS Project XML export) or .mpp files are accepted' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const scheduleImport = await ScheduleImportService.parseUpload(projectId, auth.userId, {
      buffer,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
    });

    return NextResponse.json({ success: true, data: scheduleImport });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : 'Failed to import schedule file';
    console.error('[schedule/import]', error);
    return NextResponse.json({ success: false, error: message }, { status: 400 });
  }
}
