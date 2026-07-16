import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { WorkOrderService } from '@/services/WorkOrderService';
import { fileStorage } from '@/lib/file-storage';
import { sanitizeFileExt } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
];
const ALLOWED_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx'];
const MAX_SIZE = 20 * 1024 * 1024;

// POST /api/projects/[projectId]/work-orders/[workOrderId]/revisions - Add a new revision (R1, R2...)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; workOrderId: string }> }
) {
  try {
    const { projectId, workOrderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });

    const fileExt = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.includes(fileExt)) {
      return NextResponse.json({ success: false, error: 'File type not allowed' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'File too large (max 20 MB)' }, { status: 400 });
    }

    const reason = formData.get('reason') ? String(formData.get('reason')).trim() : '';
    if (!reason) {
      return NextResponse.json({ success: false, error: 'A reason is required for a new revision' }, { status: 400 });
    }

    const issueDateRaw = formData.get('issueDate');
    const issueDate = issueDateRaw ? new Date(String(issueDateRaw)) : new Date();
    if (isNaN(issueDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid issue date' }, { status: 400 });
    }
    const plannedStartRaw = formData.get('plannedStart');
    const plannedEndRaw = formData.get('plannedEnd');
    const plannedStart = plannedStartRaw ? new Date(String(plannedStartRaw)) : null;
    const plannedEnd = plannedEndRaw ? new Date(String(plannedEndRaw)) : null;
    const remarks = formData.get('remarks') ? String(formData.get('remarks')) : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = sanitizeFileExt(file.name);
    const mimeType = file.type || 'application/octet-stream';
    const key = `work-orders/${projectId}/${workOrderId}/${randomUUID()}.${ext}`;
    const storageKey = await fileStorage.save(key, buffer, mimeType);

    const result = await WorkOrderService.createRevision(
      workOrderId,
      projectId,
      auth.userId,
      auth.role,
      { storageKey, fileName: file.name, mimeType, fileSize: file.size },
      { issueDate, plannedStart, plannedEnd, remarks },
      reason
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { revisionNumber: result.revisionNumber } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Work order revision create error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
