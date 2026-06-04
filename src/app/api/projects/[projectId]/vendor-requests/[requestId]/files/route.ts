import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { fileStorage } from '@/lib/file-storage';
import { randomUUID } from 'crypto';

export const dynamic = 'force-dynamic';

function isInvolved(role: string, userId: string, sendTo: string, submittedById: string): boolean {
  if (submittedById === userId) return true;
  if (role === 'OWNER') return true;
  if (role === 'PMC')        return ['PMC', 'BOTH', 'ALL'].includes(sendTo);
  if (role === 'CONSULTANT') return ['CONSULTANT', 'BOTH', 'ALL'].includes(sendTo);
  if (role === 'VENDOR')     return ['VENDOR', 'BOTH', 'ALL'].includes(sendTo);
  return false;
}

// POST — Upload a file attachment to a vendor request.
//         Any project member who is either the sender or a recipient may attach files.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; requestId: string }> }
) {
  try {
    const { projectId, requestId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role === 'VIEWER') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const vr = await prisma.vendorRequest.findFirst({ where: { id: requestId, projectId } });
    if (!vr) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    if (!isInvolved(auth.role, auth.userId, vr.sendTo, vr.submittedById)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });

    const allowedTypes = [
      'application/pdf',
      'image/jpeg', 'image/png', 'image/webp', 'image/gif',
      // Office documents
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      // CAD files (browsers report varying MIME types for DWG/DXF)
      'application/acad', 'image/vnd.dwg', 'application/x-autocad',
      'application/dxf', 'image/vnd.dxf', 'application/x-dxf',
      'application/octet-stream', // fallback for CAD files with no recognized MIME
    ];
    const fileExt = (file.name.split('.').pop() ?? '').toLowerCase();
    const allowedExts = ['pdf','jpg','jpeg','png','webp','gif','doc','docx','xls','xlsx','dwg','dxf'];
    if (!allowedTypes.includes(file.type) && !allowedExts.includes(fileExt)) {
      return NextResponse.json({ success: false, error: 'File type not allowed' }, { status: 400 });
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ success: false, error: 'File too large (max 20 MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = fileExt || 'bin';
    // Normalise MIME: browsers report '' for DWG/DXF and other unknown types.
    // An empty Content-Type header is invalid and will throw in Next.js's WHATWG Headers.
    const mimeType = file.type || 'application/octet-stream';
    const key = `vendor-requests/${projectId}/${requestId}/${randomUUID()}.${ext}`;
    const storagePath = await fileStorage.save(key, buffer, mimeType);

    const attachment = await prisma.vendorRequestFile.create({
      data: {
        requestId,
        storageKey: storagePath,
        fileName: file.name,
        mimeType,
        fileSize: file.size,
        uploadedById: auth.userId,
      },
    });

    return NextResponse.json({ success: true, data: { id: attachment.id, fileName: attachment.fileName } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[vendor-request file upload]', error);
    const msg = error instanceof Error ? error.message : 'Unknown error';
    return NextResponse.json({ success: false, error: `Upload failed: ${msg}` }, { status: 500 });
  }
}
