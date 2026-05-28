import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';

// POST — Owner releases payment for a single drawing row (APPROVED → paidAt set)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; rowId: string }> }
) {
  try {
    const { projectId, rowId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'OWNER') {
      return NextResponse.json({ success: false, error: 'Only Owner can release payment' }, { status: 403 });
    }

    const row = await prisma.drawingRow.findFirst({
      where: { id: rowId, projectId },
      include: { set: true },
    });
    if (!row) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    if (row.status !== 'APPROVED') {
      return NextResponse.json({ success: false, error: 'Drawing must be APPROVED before releasing payment' }, { status: 400 });
    }
    if (row.paidAt) {
      return NextResponse.json({ success: false, error: 'Payment already released for this drawing' }, { status: 400 });
    }

    await prisma.drawingRow.update({
      where: { id: rowId },
      data: { paidAt: new Date(), paidById: auth.userId },
    });

    // Auto-mark the set as PAID if all approved rows are now paid
    if (row.setId) {
      const siblings = await prisma.drawingRow.findMany({
        where: { setId: row.setId },
        select: { status: true, paidAt: true, id: true },
      });
      const approved = siblings.filter((r) => r.status === 'APPROVED');
      // Mark paidAt on the just-updated row
      const allPaid = approved.length > 0 && approved.every((r) => r.id === rowId || r.paidAt != null);
      if (allPaid && row.set?.status === 'APPROVED') {
        await prisma.drawingSet.update({
          where: { id: row.setId },
          data: { status: 'PAID', paidAt: new Date(), paymentReleasedBy: auth.userId },
        });
      }
    }

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.ELIGIBILITY_MARKED_PAID,
      entityType: 'DrawingRow',
      entityId: rowId,
      afterJson: { paidAt: new Date().toISOString(), setId: row.setId, name: row.name },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
