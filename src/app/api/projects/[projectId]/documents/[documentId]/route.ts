import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditActionTypes } from '@/types';

export const dynamic = 'force-dynamic';

// DELETE /api/projects/[projectId]/documents/[documentId] - soft delete, PMC/Consultant only
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
  try {
    const { projectId, documentId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC', 'CONSULTANT']);

    const document = await prisma.projectDocument.findFirst({ where: { id: documentId, projectId, deletedAt: null } });
    if (!document) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }

    await prisma.$transaction(async (tx) => {
      await tx.projectDocument.update({ where: { id: documentId }, data: { deletedAt: new Date() } });
      await tx.auditLog.create({
        data: {
          projectId, actorId: auth.userId, role: auth.role,
          actionType: AuditActionTypes.DOCUMENT_DELETE,
          entityType: 'ProjectDocument', entityId: documentId,
          beforeJson: JSON.stringify({ title: document.title, category: document.category }),
        },
      });
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('Document delete error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
