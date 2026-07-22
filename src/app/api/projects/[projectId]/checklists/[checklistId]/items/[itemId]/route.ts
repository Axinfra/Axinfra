import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const patchItemSchema = z.object({
  result: z.enum(['OK', 'NOT_OK', 'NA']),
  remarks: z.string().trim().max(1000).optional().nullable(),
});

// PATCH /api/projects/[projectId]/checklists/[checklistId]/items/[itemId] - Site Engineer
// marks one check point OK/Not OK/N.A. with an optional remark. Bumps the checklist from
// DRAFT to IN_PROGRESS on the first fill.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; checklistId: string; itemId: string }> },
) {
  try {
    const { projectId, checklistId, itemId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['SITE_ENGINEER']);

    const checklist = await prisma.checklist.findFirst({ where: { id: checklistId, projectId } });
    if (!checklist) {
      return NextResponse.json({ success: false, error: 'Checklist not found' }, { status: 404 });
    }
    if (checklist.status === 'SIGNED') {
      return NextResponse.json({ success: false, error: 'Cannot edit a signed checklist' }, { status: 409 });
    }
    const item = await prisma.checklistItem.findFirst({ where: { id: itemId, checklistId } });
    if (!item) {
      return NextResponse.json({ success: false, error: 'Check point not found' }, { status: 404 });
    }

    const input = patchItemSchema.parse(await request.json());

    const updated = await prisma.$transaction(async (tx) => {
      const updatedItem = await tx.checklistItem.update({
        where: { id: itemId },
        data: { result: input.result, remarks: input.remarks },
      });
      if (checklist.status === 'DRAFT') {
        await tx.checklist.update({ where: { id: checklistId }, data: { status: 'IN_PROGRESS' } });
      }
      return updatedItem;
    });

    await AuditLogger.log({
      projectId, actorId: auth.userId, role: auth.role,
      actionType: AuditActionTypes.CHECKLIST_ITEM_FILL,
      entityType: 'ChecklistItem', entityId: itemId,
      afterJson: { result: input.result, remarks: input.remarks },
    });

    return NextResponse.json({ success: true, data: updated });
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
    console.error('Checklist item update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
