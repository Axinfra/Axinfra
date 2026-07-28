import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { RABillService } from '@/services/RABillService';
import { fileStorage } from '@/lib/file-storage';
import { sanitizeFileExt } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];
const ALLOWED_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx'];
const MAX_SIZE = 20 * 1024 * 1024;

// POST .../ra-bills/[raBillId]/measurement-sheets - Site Engineer attaches a supporting
// measurement sheet while the bill is with them for review. Can be called repeatedly — a bill
// can carry several sheets. PMC/Consultant/Client/the assigned Vendor can view them afterwards
// (see the GET route on the [raBillId] detail endpoint, which now includes measurementSheets).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string; raBillId: string }> }
) {
  try {
    const { projectId, orderId, raBillId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['SITE_ENGINEER']);

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.includes('multipart/form-data')) {
      return NextResponse.json({ success: false, error: 'A file is required' }, { status: 400 });
    }

    const formData = await request.formData();
    const remarks = formData.get('remarks') ? String(formData.get('remarks')) : undefined;
    const uploaded = formData.get('file') as File | null;
    if (!uploaded) {
      return NextResponse.json({ success: false, error: 'A file is required' }, { status: 400 });
    }

    const fileExt = (uploaded.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_TYPES.includes(uploaded.type) && !ALLOWED_EXTS.includes(fileExt)) {
      return NextResponse.json({ success: false, error: 'File type not allowed' }, { status: 400 });
    }
    if (uploaded.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'File too large (max 20 MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await uploaded.arrayBuffer());
    const ext = sanitizeFileExt(uploaded.name);
    const mimeType = uploaded.type || 'application/octet-stream';
    const key = `ra-bills/${projectId}/${orderId}/${raBillId}-measurement-${randomUUID()}.${ext}`;
    const storageKey = await fileStorage.save(key, buffer, mimeType);

    const result = await RABillService.addMeasurementSheet(raBillId, projectId, auth.userId, auth.role, {
      file: { storageKey, fileName: uploaded.name, mimeType, fileSize: uploaded.size },
      remarks,
    });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('RA Bill measurement sheet upload error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
