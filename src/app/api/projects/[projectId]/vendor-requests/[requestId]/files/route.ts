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

    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (!allowedTypes.includes(file.type)) {
      return NextResponse.json({ success: false, error: 'Only PDF and image files are allowed' }, { status: 400 });
    }

    const maxSize = 20 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ success: false, error: 'File too large (max 20 MB)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split('.').pop() ?? 'bin';
    const key = `vendor-requests/${projectId}/${requestId}/${randomUUID()}.${ext}`;
    const storagePath = await fileStorage.save(key, buffer, file.type);

    const attachment = await prisma.vendorRequestFile.create({
      data: {
        requestId,
        storageKey: storagePath,
        fileName: file.name,
        mimeType: file.type,
        fileSize: file.size,
        uploadedById: auth.userId,
      },
    });

    return NextResponse.json({ success: true, data: { id: attachment.id, fileName: attachment.fileName } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
