import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';

// POST — Owner releases payment for set (APPROVED → PAID)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; setId: string }> }
) {
  try {
    const { projectId, setId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'Only Owner can release payment' }, { status: 403 });
    }

    const set = await prisma.drawingSet.findFirst({ where: { id: setId, projectId } });
    if (!set) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    if (set.status !== 'APPROVED') {
      return NextResponse.json({ success: false, error: 'Set must be APPROVED before releasing payment' }, { status: 400 });
    }

    await prisma.drawingSet.update({
      where: { id: setId },
      data: { status: 'PAID', paidAt: new Date(), paymentReleasedBy: auth.userId },
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.ELIGIBILITY_MARKED_PAID,
      entityType: 'DrawingSet',
      entityId: setId,
      afterJson: { status: 'PAID', cost: set.cost, currency: set.currency },
    });

    await prisma.systemEvent.create({
      data: {
        projectId,
        eventType: 'ARCH_SET_PAID',
        severity: 'INFO',
        message: `Owner released payment for drawing set "${set.name}".`,
        entityType: 'DrawingSet',
        entityId: setId,
        actorId: auth.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
