import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { BOQService, getOverviewRollup } from '@/services/BOQService';

// GET /api/projects/[projectId]/orders/[orderId]/boqs - List all BOQs under a Purchase Order
// `limit`/`offset` are opt-in — omitting them returns every BOQ (needed by callers like the
// RA Bill creation form, which must see the full APPROVED set, not one page).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);

    const order = await prisma.phase.findFirst({ where: { id: orderId, projectId } });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get('limit');
    const rawOffset = searchParams.get('offset');
    const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10), 1), 200) : undefined;
    const offset = rawOffset ? Math.max(parseInt(rawOffset, 10), 0) : 0;

    // PMC still drafting some of these — Owner shouldn't see drafts, Vendor/Consultant only
    // ever see the final approved version. See RoleGuard.visibleBOQStatuses for the exact rule.
    const visibleStatuses = RoleGuard.visibleBOQStatuses(auth);
    const where = { orderId, projectId, ...(visibleStatuses && { status: { in: visibleStatuses } }) };

    // submittableCount/approvableCount/totalValue reflect every BOQ under the order, not
    // just the current page — "Send All for Approval"/"Approve All" act order-wide, and the
    // footer "Total" must stay accurate regardless of which page is displayed.
    const [boqs, total, submittableCount, approvableCount, valueAgg] = await Promise.all([
      prisma.bOQ.findMany({
        where,
        include: { items: { orderBy: { createdAt: 'asc' } } },
        orderBy: { createdAt: 'asc' },
        ...(limit !== undefined ? { take: limit, skip: offset } : {}),
      }),
      prisma.bOQ.count({ where }),
      prisma.bOQ.count({ where: { ...where, status: { in: ['DRAFT', 'REVISED'] }, items: { some: {} } } }),
      prisma.bOQ.count({ where: { ...where, status: 'PENDING_APPROVAL', items: { some: {} } } }),
      prisma.bOQItem.aggregate({ where: { boq: where }, _sum: { plannedValue: true } }),
    ]);

    const data = boqs.map((b) => ({
      id: b.id,
      boqNumber: b.boqNumber,
      name: b.name,
      description: b.description,
      category: b.category,
      scope: b.scope,
      status: b.status,
      workOrderStatus: b.workOrderStatus,
      plannedStart: b.plannedStart,
      plannedEnd: b.plannedEnd,
      createdAt: b.createdAt,
      items: b.items.map((i) => ({
        id: i.id, description: i.description, unit: i.unit, plannedQty: i.plannedQty, rate: i.rate, plannedValue: i.plannedValue,
      })),
      rollup: getOverviewRollup(b.items),
    }));

    return NextResponse.json({
      success: true,
      data: {
        boqs: data,
        total,
        totalValue: valueAgg._sum.plannedValue ?? 0,
        counts: { submittable: submittableCount, approvable: approvableCount },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Order BOQ list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/orders/[orderId]/boqs - Add another BOQ to this Purchase Order
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await request.json().catch(() => ({}));

    const hasItem = body.item && body.item.description && body.item.unit;
    if (body.item && !hasItem) {
      return NextResponse.json({ success: false, error: 'Description and unit are required' }, { status: 400 });
    }

    const result = await BOQService.create(projectId, auth.userId, auth.role, orderId, {
      name: body.name,
      description: body.description,
      category: body.category,
      scope: body.scope,
      plannedStart: body.plannedStart ? new Date(body.plannedStart) : undefined,
      plannedEnd: body.plannedEnd ? new Date(body.plannedEnd) : undefined,
      item: hasItem
        ? {
            description: body.item.description,
            unit: body.item.unit,
            plannedQty: Number(body.item.plannedQty),
            rate: Number(body.item.rate),
          }
        : undefined,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { boqId: result.boqId } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Order BOQ create error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
