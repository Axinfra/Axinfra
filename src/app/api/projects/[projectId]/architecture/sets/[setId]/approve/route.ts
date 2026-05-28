import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';

// POST — PMC approves all drawings in the set (DELIVERED → APPROVED)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; setId: string }> }
) {
  try {
    const { projectId, setId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'PMC') {
      return NextResponse.json({ success: false, error: 'Only PMC can approve sets' }, { status: 403 });
    }

    const set = await prisma.drawingSet.findFirst({
      where: { id: setId, projectId },
      include: { rows: true },
    });

    if (!set) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    if (set.status !== 'DELIVERED') {
      return NextResponse.json({ success: false, error: 'Set must be DELIVERED before approving' }, { status: 400 });
    }

    const unapproved = set.rows.filter((r) => r.status !== 'APPROVED');
    if (unapproved.length > 0) {
      return NextResponse.json({
        success: false,
        error: `${unapproved.length} drawing(s) are not yet approved. Approve all drawings first.`,
      }, { status: 400 });
    }

    await prisma.drawingSet.update({
      where: { id: setId },
      data: { status: 'APPROVED', approvedAt: new Date() },
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.PROJECT_UPDATE,
      entityType: 'DrawingSet',
      entityId: setId,
      afterJson: { status: 'APPROVED' },
    });

    await prisma.systemEvent.create({
      data: {
        projectId,
        eventType: 'ARCH_SET_APPROVED',
        severity: 'INFO',
        message: `PMC approved drawing set "${set.name}". Owner can now release payment.`,
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
