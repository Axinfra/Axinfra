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

// POST .../ra-bills/[raBillId]/certify - PMC/Consultant certifies measured quantities
// (optionally attaching a signed measurement sheet). "Finished when" = this moment.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string; raBillId: string }> }
) {
  try {
    const { projectId, orderId, raBillId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC', 'CONSULTANT']);

    const contentType = request.headers.get('content-type') ?? '';
    let remarks: string | undefined;
    let file: { storageKey: string; fileName: string; mimeType: string; fileSize: number } | undefined;

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      remarks = formData.get('remarks') ? String(formData.get('remarks')) : undefined;
      const uploaded = formData.get('file') as File | null;
      if (uploaded) {
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
        const key = `ra-bills/${projectId}/${orderId}/${raBillId}-certify-${randomUUID()}.${ext}`;
        const storageKey = await fileStorage.save(key, buffer, mimeType);
        file = { storageKey, fileName: uploaded.name, mimeType, fileSize: uploaded.size };
      }
    } else {
      const body = await request.json().catch(() => ({}));
      remarks = body.remarks;
    }

    const result = await RABillService.certify(raBillId, projectId, auth.userId, auth.role, { remarks, file });
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
    console.error('RA Bill certify error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
