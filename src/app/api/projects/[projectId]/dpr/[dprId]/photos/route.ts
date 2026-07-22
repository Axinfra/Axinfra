import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { fileStorage } from '@/lib/file-storage';
import { generateStorageKey } from '@/lib/utils';
import { AuditActionTypes } from '@/types';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

// GET /api/projects/[projectId]/dpr/[dprId]/photos - list, everyone with DPR access can view
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; dprId: string }> },
) {
  try {
    const { projectId, dprId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']);

    const photos = await prisma.dPRPhoto.findMany({
      where: { dprId, dpr: { projectId } },
      orderBy: { sortOrder: 'asc' },
    });

    return NextResponse.json({
      success: true,
      data: photos.map((p) => ({ id: p.id, fileName: p.fileName, remarks: p.remarks, sortOrder: p.sortOrder, createdAt: p.createdAt })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('DPR photo list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/dpr/[dprId]/photos - Site Engineer attaches a site photo
// with an optional caption/remark. DRAFT only, same as the other DPR edits.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; dprId: string }> },
) {
  try {
    const { projectId, dprId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['SITE_ENGINEER']);

    const dpr = await prisma.dailyProgressReport.findFirst({ where: { id: dprId, projectId } });
    if (!dpr) {
      return NextResponse.json({ success: false, error: 'DPR not found' }, { status: 404 });
    }
    if (dpr.status === 'SIGNED') {
      return NextResponse.json({ success: false, error: 'Cannot edit a signed DPR' }, { status: 409 });
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const remarks = (formData.get('remarks') as string | null)?.trim() || null;

    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ success: false, error: 'A photo file is required' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ success: false, error: `File exceeds maximum size of ${MAX_FILE_SIZE_MB}MB` }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: `File type ${file.type} is not allowed — photos only (JPEG/PNG/WebP/HEIC)` }, { status: 400 });
    }

    const storageKey = generateStorageKey(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = await fileStorage.save(storageKey, buffer, file.type);

    const photo = await prisma.$transaction(async (tx) => {
      const count = await tx.dPRPhoto.count({ where: { dprId } });
      const created = await tx.dPRPhoto.create({
        data: { dprId, storageKey, filePath, fileName: file.name, mimeType: file.type, size: file.size, remarks, sortOrder: count },
      });
      await tx.auditLog.create({
        data: {
          projectId, actorId: auth.userId, role: auth.role,
          actionType: AuditActionTypes.DPR_PHOTO_UPLOAD,
          entityType: 'DPRPhoto', entityId: created.id,
          afterJson: JSON.stringify({ dprId, fileName: file.name }),
        },
      });
      return created;
    });

    return NextResponse.json({ success: true, data: { id: photo.id, fileName: photo.fileName, remarks: photo.remarks, sortOrder: photo.sortOrder, createdAt: photo.createdAt } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('DPR photo upload error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
