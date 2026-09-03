import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { DirectOrderService } from '@/services/DirectOrderService';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

const createSchema = z.object({
  vendorUserId: z.string().uuid(),
  itemDescription: z.string().trim().min(1).max(500),
  value: z.number().positive(),
  remarks: z.string().trim().max(2000).optional(),
});

// GET /api/projects/[projectId]/direct-orders — list + summary stats.
// PMC sees every order; Vendor sees only their own.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC', 'VENDOR']);

    const vendorFilter = auth.role === 'VENDOR' ? { vendorUserId: auth.userId } : {};

    const [orders, summary] = await Promise.all([
      prisma.directOrder.findMany({
        where: { projectId, ...vendorFilter },
        include: {
          vendorUser: { select: { id: true, name: true, companyName: true } },
          createdBy: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      // A vendor's cards are scoped to their own orders only; PMC sees the full project total.
      DirectOrderService.getSummary(projectId, auth.role === 'VENDOR' ? auth.userId : undefined),
    ]);

    const data = orders.map((o) => ({
      id: o.id,
      doNumber: o.doNumber,
      vendorUserId: o.vendorUserId,
      vendorName: o.vendorUser.companyName || o.vendorUser.name,
      itemDescription: o.itemDescription,
      value: o.value,
      billedValue: o.billedValue,
      status: o.status,
      remarks: o.remarks,
      createdByName: o.createdBy.name,
      createdAt: o.createdAt,
    }));

    return NextResponse.json({ success: true, data: { directOrders: data, summary } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Direct orders list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/direct-orders — PMC creates a new Direct Order for a vendor.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await request.json();
    const { vendorUserId, itemDescription, value, remarks } = createSchema.parse(body);

    const vendorRole = await prisma.projectRole.findFirst({
      where: { projectId, userId: vendorUserId, role: 'VENDOR' },
    });
    if (!vendorRole) {
      return NextResponse.json({ success: false, error: 'Selected user is not a Vendor on this project' }, { status: 400 });
    }

    const doNumber = await DirectOrderService.generateDoNumber(projectId);

    const order = await prisma.directOrder.create({
      data: {
        projectId,
        doNumber,
        vendorUserId,
        itemDescription,
        value,
        remarks: remarks || null,
        createdById: auth.userId,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.DIRECT_ORDER_CREATE,
      entityType: 'DirectOrder',
      entityId: order.id,
      afterJson: { doNumber, vendorUserId, itemDescription, value },
    });

    return NextResponse.json({ success: true, data: { id: order.id, doNumber } });
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
    console.error('Direct order create error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
