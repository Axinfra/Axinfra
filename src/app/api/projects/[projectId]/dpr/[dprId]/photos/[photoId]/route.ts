import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { fileStorage, getFileRedirectUrl } from '@/lib/file-storage';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const patchSchema = z.object({ remarks: z.string().trim().max(500).optional().nullable() });

// GET /api/projects/[projectId]/dpr/[dprId]/photos/[photoId] - serve the image, matches
// documents/[documentId]/files/[fileId]'s pattern exactly.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; dprId: string; photoId: string }> },
) {
  try {
    const { projectId, dprId, photoId } = await params;
    await requireProjectAuth(projectId);

    const photo = await prisma.dPRPhoto.findFirst({ where: { id: photoId, dprId, dpr: { projectId } } });
    if (!photo) {
      return NextResponse.json({ success: false, error: 'Photo not found' }, { status: 404 });
    }

    const redirectUrl = await getFileRedirectUrl(photo.filePath);
    if (redirectUrl) return NextResponse.redirect(redirectUrl);

    const buffer = await fileStorage.read(photo.filePath);
    if (!buffer) {
      return NextResponse.json({ success: false, error: 'Photo not found' }, { status: 404 });
    }

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': photo.mimeType,
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('DPR photo download error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/dpr/[dprId]/photos/[photoId] - edit the caption/remark
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; dprId: string; photoId: string }> },
) {
  try {
    const { projectId, dprId, photoId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['SITE_ENGINEER']);

    const photo = await prisma.dPRPhoto.findFirst({ where: { id: photoId, dprId, dpr: { projectId } }, include: { dpr: true } });
    if (!photo) {
      return NextResponse.json({ success: false, error: 'Photo not found' }, { status: 404 });
    }
    if (photo.dpr.status === 'SIGNED') {
      return NextResponse.json({ success: false, error: 'Cannot edit a signed DPR' }, { status: 409 });
    }

    const input = patchSchema.parse(await request.json());
    const updated = await prisma.dPRPhoto.update({ where: { id: photoId }, data: { remarks: input.remarks } });

    return NextResponse.json({ success: true, data: { id: updated.id, fileName: updated.fileName, remarks: updated.remarks } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    console.error('DPR photo update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/dpr/[dprId]/photos/[photoId]
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; dprId: string; photoId: string }> },
) {
  try {
    const { projectId, dprId, photoId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['SITE_ENGINEER']);

    const photo = await prisma.dPRPhoto.findFirst({ where: { id: photoId, dprId, dpr: { projectId } }, include: { dpr: true } });
    if (!photo) {
      return NextResponse.json({ success: false, error: 'Photo not found' }, { status: 404 });
    }
    if (photo.dpr.status === 'SIGNED') {
      return NextResponse.json({ success: false, error: 'Cannot edit a signed DPR' }, { status: 409 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.dPRPhoto.delete({ where: { id: photoId } });
      await tx.auditLog.create({
        data: {
          projectId, actorId: auth.userId, role: auth.role,
          actionType: AuditActionTypes.DPR_PHOTO_DELETE,
          entityType: 'DPRPhoto', entityId: photoId,
          beforeJson: JSON.stringify({ fileName: photo.fileName }),
        },
      });
    });

    await fileStorage.delete(photo.filePath).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('DPR photo delete error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
