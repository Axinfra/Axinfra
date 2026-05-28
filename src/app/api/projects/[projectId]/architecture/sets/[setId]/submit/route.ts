import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

// POST — Architect submits the set list to PMC (DRAFT → SUBMITTED_TO_PMC)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; setId: string }> }
) {
  try {
    const { projectId, setId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'ARTIFACTS') {
      return NextResponse.json({ success: false, error: 'Only Architects can submit sets' }, { status: 403 });
    }

    const set = await prisma.drawingSet.findFirst({ where: { id: setId, projectId } });
    if (!set) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    if (set.createdById !== auth.userId) {
      return NextResponse.json({ success: false, error: 'Can only submit your own sets' }, { status: 403 });
    }

    if (set.status !== 'DRAFT') {
      return NextResponse.json({ success: false, error: 'Only DRAFT sets can be submitted' }, { status: 400 });
    }

    const rowCount = await prisma.drawingRow.count({ where: { setId } });
    if (rowCount === 0) {
      return NextResponse.json({ success: false, error: 'Add at least one drawing row before submitting' }, { status: 400 });
    }

    await prisma.drawingSet.update({
      where: { id: setId },
      data: { status: 'SUBMITTED_TO_PMC' },
    });

    await prisma.systemEvent.create({
      data: {
        projectId,
        eventType: 'ARCH_SET_SUBMITTED',
        severity: 'INFO',
        message: `Architect has submitted drawing set "${set.name}" for PMC review.`,
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
