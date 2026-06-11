import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';

// GET /api/projects/[projectId]/phases - List all phases for project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const phases = await prisma.phase.findMany({
      where: { projectId },
      include: {
        boq: { select: { id: true, status: true } },
        _count: { select: { milestones: true } },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const data = phases.map((p) => ({
      id: p.id,
      name: p.name,
      sortOrder: p.sortOrder,
      createdAt: p.createdAt,
      boq: p.boq ?? null,
      milestonesCount: p._count.milestones,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Phase list error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/phases - Create a new phase
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

    const body = await request.json();
    const name: string = (body.name ?? '').trim();

    if (!name) {
      return NextResponse.json(
        { success: false, error: 'name is required' },
        { status: 400 }
      );
    }

    let { sortOrder } = body;
    if (sortOrder === undefined || sortOrder === null) {
      const last = await prisma.phase.findFirst({
        where: { projectId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      sortOrder = (last?.sortOrder ?? 0) + 1;
    }

    const phase = await prisma.phase.create({
      data: { projectId, name, sortOrder },
    });

    await invalidateProjectAndMemberCaches(projectId);

    return NextResponse.json({ success: true, data: phase }, { status: 201 });
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
    console.error('Phase create error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
