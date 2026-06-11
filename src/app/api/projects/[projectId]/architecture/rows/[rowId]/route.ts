import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(500).optional(),
  category: z.string().min(1).max(200).optional(),
  floor: z.enum(['BASEMENT', 'GROUND_FLOOR', 'FIRST_FLOOR', 'SECOND_FLOOR', 'TERRACE', 'ALL_FLOORS']).optional(),
  description: z.string().optional(),
  setId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
});

// PATCH /api/projects/[projectId]/architecture/rows/[rowId]
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; rowId: string }> }
) {
  try {
    const { projectId, rowId } = await params;
    const auth = await requireProjectAuth(projectId);

    const row = await prisma.drawingRow.findFirst({ where: { id: rowId, projectId } });
    if (!row) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const { name, category, floor, description, setId, dueDate } = patchSchema.parse(body);

    // Set assignment changes are restricted to Architects only.
    if ('setId' in body && auth.role !== 'CONSULTANT') {
      return NextResponse.json({ success: false, error: 'Only Architects can assign or change sets' }, { status: 403 });
    }

    // Permission matrix
    if (auth.role === 'PMC') {
      // PMC can edit name of any row and set due date
      const allowedKeys = ['name', 'dueDate'];
      const attempted = Object.keys(body).filter((k) => !allowedKeys.includes(k));
      if (attempted.length > 0) {
        return NextResponse.json({ success: false, error: 'PMC can only edit name and due date' }, { status: 403 });
      }
    } else if (auth.role === 'CONSULTANT') {
      // Architect can edit name, floor, description, category, setId (own rows only)
      if (row.createdById !== auth.userId) {
        return NextResponse.json({ success: false, error: 'Can only edit your own rows' }, { status: 403 });
      }
      if ('dueDate' in body) {
        return NextResponse.json({ success: false, error: 'Architects cannot set due dates' }, { status: 403 });
      }
    } else if (auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const updated = await prisma.drawingRow.update({
      where: { id: rowId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(category !== undefined ? { category } : {}),
        ...(floor !== undefined ? { floor } : {}),
        ...(description !== undefined ? { description } : {}),
        ...(setId !== undefined ? { setId } : {}),
        ...(dueDate !== undefined ? { dueDate: dueDate ? new Date(dueDate) : null } : {}),
      },
    });

    // If assigned to a set, push set to IN_PROGRESS if it was REQUESTED
    if (setId && typeof setId === 'string') {
      const set = await prisma.drawingSet.findUnique({ where: { id: setId } });
      if (set?.status === 'REQUESTED') {
        await prisma.drawingSet.update({ where: { id: setId }, data: { status: 'IN_PROGRESS' } });
      }
    }

    return NextResponse.json({ success: true, data: { id: updated.id } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
