import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { z } from 'zod';

const requestSchema = z.object({
  note: z.string().optional(),
  dueDate: z.string().min(1, 'Due date is required'),
});

// POST — PMC requests a set (SUBMITTED_TO_PMC → REQUESTED)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; setId: string }> }
) {
  try {
    const { projectId, setId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'PMC') {
      return NextResponse.json({ success: false, error: 'Only PMC can request sets' }, { status: 403 });
    }

    const set = await prisma.drawingSet.findFirst({ where: { id: setId, projectId } });
    if (!set) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    if (!['SUBMITTED_TO_PMC', 'REQUESTED'].includes(set.status)) {
      return NextResponse.json({ success: false, error: 'Set must be in SUBMITTED_TO_PMC status to request' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    const { note, dueDate } = requestSchema.parse(body);
    const requestedDueDate = new Date(dueDate);
    if (Number.isNaN(requestedDueDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid due date' }, { status: 400 });
    }

    await prisma.$transaction([
      prisma.setRequest.create({
        data: { setId, projectId, requestedById: auth.userId, dueDate: requestedDueDate, note, status: 'ACCEPTED' },
      }),
      prisma.drawingSet.update({
        where: { id: setId },
        data: { status: 'REQUESTED', requestedById: auth.userId, requestedAt: new Date(), dueDate: requestedDueDate },
      }),
      prisma.drawingRow.updateMany({
        where: { setId },
        data: { dueDate: requestedDueDate },
      }),
    ]);

    await prisma.systemEvent.create({
      data: {
        projectId,
        eventType: 'ARCH_SET_REQUESTED',
        severity: 'WARNING',
        message: `PMC requested updates for "${set.name}" due by ${requestedDueDate.toISOString().slice(0, 10)}.`,
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
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
