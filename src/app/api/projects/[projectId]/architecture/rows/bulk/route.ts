import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { z } from 'zod';

const bulkSchema = z.object({
  rowIds: z.array(z.string().uuid()).min(1).max(500),
  setId: z.string().uuid().nullable(),
});

// PATCH /api/projects/[projectId]/architecture/rows/bulk
// Body: { rowIds: string[], setId: string | null }
// Bulk-assigns (or unassigns) up to 500 drawing rows to a set in one transaction.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'CONSULTANT') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { rowIds, setId } = bulkSchema.parse(body);

    // Verify all rows belong to this project and the architect owns them.
    const existing = await prisma.drawingRow.findMany({
      where: {
        id: { in: rowIds },
        projectId,
        createdById: auth.userId,
      },
      select: { id: true },
    });

    const validIds = existing.map((r) => r.id);
    if (validIds.length === 0) {
      return NextResponse.json({ success: false, error: 'No valid rows found' }, { status: 400 });
    }

    // Validate the target set belongs to this project (if assigning)
    if (setId) {
      const set = await prisma.drawingSet.findFirst({ where: { id: setId, projectId } });
      if (!set) {
        return NextResponse.json({ success: false, error: 'Set not found' }, { status: 404 });
      }
    }

    await prisma.drawingRow.updateMany({
      where: { id: { in: validIds } },
      data: { setId: setId ?? null },
    });

    return NextResponse.json({
      success: true,
      data: { updated: validIds.length, skipped: rowIds.length - validIds.length },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    console.error('Bulk assign error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
