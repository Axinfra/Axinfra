import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/work-orders - Project-wide Work Order list, for digest views
// like Today. Vendor only ever sees Work Orders on Purchase Orders assigned to them — the
// per-order route (orders/[orderId]/work-order) enforces the same rule.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const workOrders = await prisma.workOrder.findMany({
      where: {
        projectId,
        ...(auth.role === 'VENDOR' ? { order: { vendorUserId: auth.userId } } : {}),
      },
      select: {
        id: true,
        number: true,
        status: true,
        currentRevisionNumber: true,
        order: { select: { id: true, name: true, vendorUserId: true } },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return NextResponse.json(
      { success: true, data: workOrders },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Work order project list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
