import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  rejectionReason: z.string().optional(),
});

// POST — PMC approves or rejects a drawing version
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; rowId: string; versionId: string }> }
) {
  try {
    const { projectId, rowId, versionId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (!['PMC', 'CLIENT'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'Only PMC can review drawings' }, { status: 403 });
    }

    const version = await prisma.drawingVersion.findFirst({
      where: { id: versionId, drawingRowId: rowId },
      include: { drawingRow: { select: { projectId: true, setId: true, name: true } } },
    });

    if (!version || version.drawingRow.projectId !== projectId) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    if (version.reviewStatus !== 'PENDING') {
      return NextResponse.json({ success: false, error: 'Version already reviewed' }, { status: 400 });
    }

    const body = await request.json();
    const { action, rejectionReason } = reviewSchema.parse(body);

    if (action === 'REJECT' && !rejectionReason?.trim()) {
      return NextResponse.json({ success: false, error: 'Rejection reason is required' }, { status: 400 });
    }

    const reviewStatus = action === 'APPROVE' ? 'APPROVED' : 'REJECTED';

    await prisma.$transaction(async (tx) => {
      // Update version
      await tx.drawingVersion.update({
        where: { id: versionId },
        data: {
          reviewStatus,
          rejectionReason: action === 'REJECT' ? rejectionReason : null,
          reviewedById: auth.userId,
          reviewedAt: new Date(),
        },
      });

      // Update row status
      await tx.drawingRow.update({
        where: { id: rowId },
        data: { status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED' },
      });

      // If this review approves the final pending row in the set, auto-approve the set.
      if (action === 'APPROVE' && version.drawingRow.setId) {
        const setRows = await tx.drawingRow.findMany({
          where: { setId: version.drawingRow.setId },
          select: { id: true, status: true },
        });
        const allApproved = setRows.every((r) => r.status === 'APPROVED' || r.id === rowId);
        if (allApproved) {
          await tx.drawingSet.update({
            where: { id: version.drawingRow.setId! },
            data: {
              status: 'APPROVED',
              approvedAt: new Date(),
              deliveredAt: new Date(),
            },
          });
        }
      }
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: action === 'APPROVE' ? AuditActionTypes.EVIDENCE_APPROVE : AuditActionTypes.EVIDENCE_REJECT,
      entityType: 'DrawingVersion',
      entityId: versionId,
      afterJson: { reviewStatus, rejectionReason: rejectionReason ?? null },
    });

    await prisma.systemEvent.create({
      data: {
        projectId,
        eventType: action === 'APPROVE' ? 'ARCH_DRAWING_APPROVED' : 'ARCH_DRAWING_REJECTED',
        severity: action === 'APPROVE' ? 'INFO' : 'WARNING',
        message: action === 'APPROVE'
          ? `Drawing "${version.drawingRow.name}" was approved.`
          : `Drawing "${version.drawingRow.name}" was rejected: ${rejectionReason ?? 'No reason provided'}`,
        entityType: 'DrawingVersion',
        entityId: versionId,
        actorId: auth.userId,
      },
    });

    if (action === 'APPROVE' && version.drawingRow.setId) {
      const set = await prisma.drawingSet.findUnique({
        where: { id: version.drawingRow.setId },
        select: { status: true, name: true },
      });
      if (set?.status === 'APPROVED') {
        await prisma.systemEvent.create({
          data: {
            projectId,
            eventType: 'ARCH_SET_APPROVED',
            severity: 'INFO',
            message: `Drawing set "${set.name}" is now fully approved and ready for owner payment.`,
            entityType: 'DrawingSet',
            entityId: version.drawingRow.setId,
            actorId: auth.userId,
          },
        });
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
