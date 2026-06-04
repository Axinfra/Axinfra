import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createRowSchema = z.object({
  category: z.string().min(1).max(200),
  name: z.string().min(1).max(500),
  floor: z.string().min(1).max(200).default('All'),
  description: z.string().optional(),
  setId: z.string().uuid().optional(),
  dueDate: z.string().optional(),
});

// GET /api/projects/[projectId]/architecture/rows
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // VENDOR sees only APPROVED rows (read-only)
    const vendorFilter = auth.role === 'VENDOR' ? { status: 'APPROVED' } : {};

    const { searchParams } = new URL(request.url);
    const setId = searchParams.get('setId');
    const status = searchParams.get('status');
    const floor = searchParams.get('floor');
    const category = searchParams.get('category');

    const rows = await prisma.drawingRow.findMany({
      where: {
        projectId,
        ...vendorFilter,
        ...(setId ? { setId } : {}),
        ...(status && !vendorFilter.status ? { status } : {}),
        ...(floor ? { floor } : {}),
        ...(category ? { category } : {}),
      },
      include: {
        set: { select: { id: true, name: true, status: true } },
        createdBy: { select: { id: true, name: true } },
        versions: {
          where: { isCurrent: true },
          orderBy: { versionNumber: 'desc' },
          take: 1,
          include: {
            uploadedBy: { select: { id: true, name: true } },
            reviewedBy: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: [{ setId: 'asc' }, { serialNo: 'asc' }],
    });

    return NextResponse.json({ success: true, data: rows });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/architecture/rows
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (!['PMC', 'CONSULTANT'].includes(auth.role)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const { category, name, floor, description, setId, dueDate } = createRowSchema.parse(body);

    // Auto-assign serial number
    const maxRow = await prisma.drawingRow.findFirst({
      where: { projectId },
      orderBy: { serialNo: 'desc' },
      select: { serialNo: true },
    });
    const serialNo = (maxRow?.serialNo ?? 0) + 1;

    const row = await prisma.drawingRow.create({
      data: {
        projectId,
        category,
        name,
        floor,
        description,
        setId: setId ?? null,
        dueDate: dueDate ? new Date(dueDate) : null,
        serialNo,
        createdById: auth.userId,
      },
    });

    // Update set status to IN_PROGRESS if REQUESTED
    if (setId) {
      const set = await prisma.drawingSet.findUnique({ where: { id: setId } });
      if (set?.status === 'REQUESTED') {
        await prisma.drawingSet.update({ where: { id: setId }, data: { status: 'IN_PROGRESS' } });
      }
    }

    return NextResponse.json({ success: true, data: { id: row.id, serialNo: row.serialNo } });
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
