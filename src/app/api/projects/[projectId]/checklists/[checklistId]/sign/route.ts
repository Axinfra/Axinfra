import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const signSchema = z.object({
  certificationRemarks: z.string().trim().max(2000).optional().nullable(),
});

// POST /api/projects/[projectId]/checklists/[checklistId]/sign - Site Engineer digitally
// signs, freezing the checklist. Requires every check point to have a result.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; checklistId: string }> },
) {
  try {
    const { projectId, checklistId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['SITE_ENGINEER']);

    const checklist = await prisma.checklist.findFirst({
      where: { id: checklistId, projectId },
      include: { items: true },
    });
    if (!checklist) {
      return NextResponse.json({ success: false, error: 'Checklist not found' }, { status: 404 });
    }
    if (checklist.status === 'SIGNED') {
      return NextResponse.json({ success: false, error: 'Checklist is already signed' }, { status: 409 });
    }
    if (checklist.items.length === 0 || checklist.items.some((i) => i.result === null)) {
      return NextResponse.json({ success: false, error: 'Every check point must be marked before signing' }, { status: 400 });
    }

    const input = signSchema.parse(await request.json().catch(() => ({})));

    const signed = await prisma.$transaction(async (tx) => {
      const updated = await tx.checklist.update({
        where: { id: checklistId },
        data: {
          status: 'SIGNED',
          signedAt: new Date(),
          signedByActorId: auth.userId,
          ...(input.certificationRemarks !== undefined ? { certificationRemarks: input.certificationRemarks } : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          projectId, actorId: auth.userId, role: auth.role,
          actionType: AuditActionTypes.CHECKLIST_SIGNED,
          entityType: 'Checklist', entityId: checklistId,
          afterJson: JSON.stringify({ signedAt: updated.signedAt, signedByActorId: auth.userId }),
        },
      });
      return updated;
    });

    return NextResponse.json({ success: true, data: signed });
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
    console.error('Checklist sign error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
