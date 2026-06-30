import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { BOQService } from '@/services/BOQService';
import { cached } from '@/lib/cache';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';

// GET /api/projects/[projectId]/boq - List BOQs for project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    // BOQ data is rarely changed once approved — 120s TTL.
    const boqs = await cached(`boq:${projectId}:list`, 120_000, () =>
      prisma.bOQ.findMany({
        where: { projectId },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
          },
          revisions: {
            orderBy: { revisionNumber: 'desc' },
          },
          phase: {
            select: { id: true, name: true, sortOrder: true },
          },
        },
        orderBy: [{ phase: { sortOrder: 'asc' } }, { createdAt: 'desc' }],
      }),
    );

    return NextResponse.json(
      { success: true, data: boqs },
      { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } },
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
    const phaseId: string | undefined = body?.phaseId ?? undefined;

    const result = await BOQService.create(projectId, auth.userId, auth.role, phaseId);

    if (!result.success) {
      // If the BOQ already exists the server-side cache is stale — bust it so the
      // client's follow-up GET returns the real BOQ instead of empty data.
      if (result.error === 'This phase already has a BOQ') {
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
