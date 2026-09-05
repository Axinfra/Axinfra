import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const SHAREABLE_ROLES = ['VENDOR', 'SITE_ENGINEER'] as const;

const visibilitySchema = z.object({
  sharedWithRoles: z.array(z.enum(SHAREABLE_ROLES)),
});

// PATCH /api/projects/[projectId]/documents/[documentId]/visibility
// PMC-only — controls which field-facing roles (Vendor / Site Engineer) can see this document
// at all, distinct from POST .../share (which sends a *copy* out via email/message without
// touching in-app visibility). CLIENT/PMC/CONSULTANT always see every document regardless.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
  try {
    const { projectId, documentId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'PMC') {
      return NextResponse.json({ success: false, error: 'Only PMC can share a document' }, { status: 403 });
    }

    const document = await prisma.projectDocument.findFirst({ where: { id: documentId, projectId, deletedAt: null } });
    if (!document) return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });

    const body = await request.json();
    const { sharedWithRoles } = visibilitySchema.parse(body);

    const updated = await prisma.projectDocument.update({
      where: { id: documentId },
      data: {
        sharedWithRoles: sharedWithRoles.length > 0 ? sharedWithRoles.join(',') : null,
        sharedById: sharedWithRoles.length > 0 ? auth.userId : null,
        sharedAt: sharedWithRoles.length > 0 ? new Date() : null,
      },
    });

    return NextResponse.json({ success: true, data: { id: updated.id, sharedWithRoles } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    console.error('Document visibility error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
