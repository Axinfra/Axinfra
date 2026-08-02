import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

const billSchema = z.object({
  billedValue: z.number().positive(),
});

// Bill can only be raised once delivery has actually started — nothing to bill for before that.
const BILLABLE_STATUSES = ['IN_DELIVERY', 'DELIVERED', 'QTY_VARIANCE'];

// POST /api/projects/[projectId]/direct-orders/[orderId]/bill — PMC or the order's own Vendor
// records the actual billed amount (which may differ from the original ordered `value` on a
// quantity variance). Re-callable to correct a bill up until the order is marked PAID; the
// status auto-adjusts to DELIVERED (billed == ordered) or QTY_VARIANCE (billed != ordered).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC', 'VENDOR']);

    const order = await prisma.directOrder.findFirst({ where: { id: orderId, projectId } });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Direct order not found' }, { status: 404 });
    }
    if (auth.role === 'VENDOR' && order.vendorUserId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'Not your order' }, { status: 403 });
    }
    if (order.status === 'PAID') {
      return NextResponse.json({ success: false, error: 'Cannot change the bill after payment' }, { status: 400 });
    }
    if (!BILLABLE_STATUSES.includes(order.status)) {
      return NextResponse.json({ success: false, error: 'Mark the order In Delivery or later before generating a bill' }, { status: 400 });
    }

    const { billedValue } = billSchema.parse(await request.json());
    const nextStatus = billedValue === order.value ? 'DELIVERED' : 'QTY_VARIANCE';

    const before = { billedValue: order.billedValue, status: order.status };

    const updated = await prisma.directOrder.update({
      where: { id: orderId },
      data: {
        billedValue,
        billGeneratedAt: new Date(),
        billGeneratedById: auth.userId,
        status: nextStatus,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.DIRECT_ORDER_UPDATE,
      entityType: 'DirectOrder',
      entityId: orderId,
      beforeJson: before,
      afterJson: { billedValue, status: nextStatus },
    });

    return NextResponse.json({ success: true, data: { id: updated.id, billedValue: updated.billedValue, status: updated.status } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    console.error('Direct order bill error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
