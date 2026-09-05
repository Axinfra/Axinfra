import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SHAREABLE_ROLES = ['VENDOR', 'SITE_ENGINEER', 'CONSULTANT'] as const;

const shareSchema = z.object({
  sharedWithRoles: z.array(z.enum(SHAREABLE_ROLES)),
});

// PATCH /api/projects/[projectId]/architecture/rows/[rowId]/versions/[versionId]/share
// PMC-only — picks which field-facing roles (Vendor / Site Engineer / Consultant) can see this
// drawing version. CLIENT/PMC always see every drawing regardless, so sharing to them is a
// no-op; not offered here. Re-callable any time (e.g. to add/remove a role later), not just
// once at upload.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; rowId: string; versionId: string }> }
) {
  try {
    const { projectId, rowId, versionId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'PMC') {
      return NextResponse.json({ success: false, error: 'Only PMC can share a drawing' }, { status: 403 });
    }

    const version = await prisma.drawingVersion.findFirst({
      where: { id: versionId, drawingRowId: rowId, drawingRow: { projectId } },
    });
    if (!version) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const { sharedWithRoles } = shareSchema.parse(body);

    const updated = await prisma.drawingVersion.update({
      where: { id: versionId },
      data: {
        sharedWithRoles: sharedWithRoles.length > 0 ? sharedWithRoles.join(',') : null,
        sharedById: sharedWithRoles.length > 0 ? auth.userId : null,
        sharedAt: sharedWithRoles.length > 0 ? new Date() : null,
      },
    });

    await prisma.systemEvent.create({
      data: {
        projectId,
        eventType: 'ARCH_DRAWING_SHARED',
        severity: 'INFO',
        message: sharedWithRoles.length > 0
          ? `Shared drawing (v${version.versionNumber}) with ${sharedWithRoles.join(', ')}.`
          : `Unshared drawing (v${version.versionNumber}).`,
        entityType: 'DrawingVersion',
        entityId: version.id,
        actorId: auth.userId,
      },
    }).catch(() => {/* non-blocking */});

    return NextResponse.json({ success: true, data: { id: updated.id, sharedWithRoles: sharedWithRoles } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    console.error('Drawing share error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
