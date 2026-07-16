import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { BOQService } from '@/services/BOQService';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';

// GET /api/projects/[projectId]/boq - List BOQs for project
// `limit`/`offset` are opt-in — omitting them returns every BOQ (needed by callers like the
// Create/Edit Milestone BOQ-item picker, which must see the full approved set, not one page).
// `orderId` optionally scopes the list to a single Purchase Order.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || undefined;
    const rawLimit = searchParams.get('limit');
    const rawOffset = searchParams.get('offset');
    const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10), 1), 200) : undefined;
    const offset = rawOffset ? Math.max(parseInt(rawOffset, 10), 0) : 0;

    // PMC still drafting some of these — Owner shouldn't see drafts, Vendor/Consultant only
    // ever see the final approved version. See RoleGuard.visibleBOQStatuses for the exact rule.
    const visibleStatuses = RoleGuard.visibleBOQStatuses(auth);
    const where = {
      projectId,
      ...(orderId && { orderId }),
      ...(visibleStatuses && { status: { in: visibleStatuses } }),
    };

    const [boqs, total] = await Promise.all([
      prisma.bOQ.findMany({
        where,
        include: {
          items: { orderBy: { createdAt: 'asc' } },
          revisions: { orderBy: { revisionNumber: 'desc' } },
          order: { select: { id: true, name: true, sortOrder: true, vendorUserId: true } },
        },
        orderBy: [{ order: { sortOrder: 'asc' } }, { createdAt: 'desc' }],
        ...(limit !== undefined ? { take: limit, skip: offset } : {}),
      }),
      prisma.bOQ.count({ where }),
    ]);

    return NextResponse.json(
      { success: true, data: { boqs, total } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('BOQ list error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/boq - Create new BOQ
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only PMC can create BOQ; Owner can only approve
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await request.json().catch(() => ({}));
    const orderId: string | undefined = body?.orderId ?? undefined;

    const result = await BOQService.create(projectId, auth.userId, auth.role, orderId);

    if (!result.success) {
      // If the BOQ already exists the server-side cache is stale — bust it so the
      // client's follow-up GET returns the real BOQ instead of empty data.
      if (result.error === 'This order already has a BOQ') {
        void invalidateProjectAndMemberCaches(projectId);
      }
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    await invalidateProjectAndMemberCaches(projectId);

    if (result.boqId) {
      await prisma.systemEvent.create({
        data: {
          projectId,
          eventType: 'BOQ_SUBMITTED',
          severity: 'INFO',
          message: 'PMC has submitted a BOQ for Owner approval.',
          entityType: 'BOQ',
          entityId: result.boqId,
          actorId: auth.userId,
        },
      });
    }

    return NextResponse.json({
      success: true,
      data: { boqId: result.boqId },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }
    console.error('BOQ create error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
