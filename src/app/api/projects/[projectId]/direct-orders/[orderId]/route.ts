import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { VENDOR_SETTABLE_STATUSES } from '@/services/DirectOrderService';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

const DIRECT_ORDER_STATUSES = ['ORDERED', 'IN_PROGRESS', 'IN_DELIVERY', 'DELIVERED', 'QTY_VARIANCE', 'PAID'] as const;

const patchSchema = z.object({
  status: z.enum(DIRECT_ORDER_STATUSES).optional(),
  itemDescription: z.string().trim().min(1).max(500).optional(),
  value: z.number().positive().optional(),
  remarks: z.string().trim().max(2000).optional(),
});

// PATCH /api/projects/[projectId]/direct-orders/[orderId] — PMC updates status/value/remarks;
// the assigned Vendor can also update status on their own order, but only to their own
// fulfillment-progress statuses (never PAID, never someone else's item/value/remarks).
export async function PATCH(
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

    const body = await request.json();
    const updates = patchSchema.parse(body);

    if (auth.role === 'VENDOR') {
      if (order.vendorUserId !== auth.userId) {
        return NextResponse.json({ success: false, error: 'Not your order' }, { status: 403 });
      }
      if (order.status === 'PAID') {
        return NextResponse.json({ success: false, error: 'Cannot change status of a paid order' }, { status: 400 });
      }
      const keys = Object.keys(updates);
      if (keys.length !== 1 || keys[0] !== 'status') {
        return NextResponse.json({ success: false, error: 'Vendor can only update status' }, { status: 403 });
      }
      if (!updates.status || !VENDOR_SETTABLE_STATUSES.includes(updates.status)) {
        return NextResponse.json({ success: false, error: 'Vendor cannot set that status' }, { status: 403 });
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ success: false, error: 'No changes provided' }, { status: 400 });
    }

    const before = { status: order.status, itemDescription: order.itemDescription, value: order.value, remarks: order.remarks };

    const updated = await prisma.directOrder.update({
      where: { id: orderId },
      data: updates,
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.DIRECT_ORDER_UPDATE,
      entityType: 'DirectOrder',
      entityId: orderId,
      beforeJson: before,
      afterJson: updates,
    });

    return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status } });
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
    console.error('Direct order update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/direct-orders/[orderId] — PMC only, ORDERED status only
// (once anything's happened to it — in progress, delivered, paid — it stays as a record).
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const order = await prisma.directOrder.findFirst({ where: { id: orderId, projectId } });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Direct order not found' }, { status: 404 });
    }
    if (order.status !== 'ORDERED') {
      return NextResponse.json({ success: false, error: 'Can only delete an order that has not progressed yet' }, { status: 400 });
    }

    await prisma.directOrder.delete({ where: { id: orderId } });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.DIRECT_ORDER_DELETE,
      entityType: 'DirectOrder',
      entityId: orderId,
      beforeJson: { doNumber: order.doNumber, vendorUserId: order.vendorUserId, value: order.value },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Direct order delete error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
