import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { RABillService } from '@/services/RABillService';

// GET /api/projects/[projectId]/orders/[orderId]/ra-bills - List all RA Bills for a Purchase Order
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);

    const order = await prisma.phase.findFirst({ where: { id: orderId, projectId }, select: { vendorUserId: true } });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    }
    if (auth.role === 'VENDOR' && order.vendorUserId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get('limit');
    const rawOffset = searchParams.get('offset');
    const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10), 1), 200) : undefined;
    const offset = rawOffset ? Math.max(parseInt(rawOffset, 10), 0) : 0;

    const result = await RABillService.getForOrder(orderId, projectId, { limit, offset });
    return NextResponse.json({ success: true, data: result });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('RA Bill list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/orders/[orderId]/ra-bills - The assigned vendor drafts a new RA Bill
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['VENDOR']);

    const body = await request.json().catch(() => ({}));
    if (!body.periodStart || !body.periodEnd || !Array.isArray(body.lineItems)) {
      return NextResponse.json({ success: false, error: 'periodStart, periodEnd, and lineItems are required' }, { status: 400 });
    }

    const result = await RABillService.createDraft(orderId, projectId, auth.userId, auth.role, {
      periodStart: new Date(body.periodStart),
      periodEnd: new Date(body.periodEnd),
      remarks: body.remarks,
      lineItems: body.lineItems.map((li: { boqId: string; thisBillQty: number }) => ({
        boqId: li.boqId,
        thisBillQty: Number(li.thisBillQty),
      })),
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { raBillId: result.raBillId } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('RA Bill create error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
