import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { z } from 'zod';

const patchSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  cost: z.number().min(0).optional(),
  currency: z.string().optional(),
});

// GET /api/projects/[projectId]/architecture/sets/[setId]
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; setId: string }> }
) {
  try {
    const { projectId, setId } = await params;
    const auth = await requireProjectAuth(projectId);

    // VENDOR can only see APPROVED or PAID sets
    const vendorFilter = auth.role === 'VENDOR' ? { status: { in: ['APPROVED', 'PAID'] } } : {};

    const set = await prisma.drawingSet.findFirst({
      where: { id: setId, projectId, ...vendorFilter },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        requestedBy: { select: { id: true, name: true } },
        paymentReleaser: { select: { id: true, name: true } },
        rows: {
          include: {
            versions: {
              orderBy: { versionNumber: 'desc' },
              include: {
                uploadedBy: { select: { id: true, name: true } },
                reviewedBy: { select: { id: true, name: true } },
              },
            },
          },
          orderBy: { serialNo: 'asc' },
        },
        requests: {
          include: { requestedBy: { select: { id: true, name: true } } },
          orderBy: { requestedAt: 'desc' },
        },
      },
    });

    if (!set) {
      return NextResponse.json({ success: false, error: 'Drawing set not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: set });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/architecture/sets/[setId] — Consultant edits own set
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; setId: string }> }
) {
  try {
    const { projectId, setId } = await params;
    const auth = await requireProjectAuth(projectId);

    const set = await prisma.drawingSet.findFirst({ where: { id: setId, projectId } });
    if (!set) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // Consultant can edit their own sets in DRAFT only; Owner can edit anytime
    if (auth.role === 'CONSULTANT') {
      if (set.createdById !== auth.userId) {
        return NextResponse.json({ success: false, error: 'Can only edit your own sets' }, { status: 403 });
      }
    } else if (auth.role !== 'CLIENT') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const updates = patchSchema.parse(body);

    const updated = await prisma.drawingSet.update({
      where: { id: setId },
      data: updates,
    });

    return NextResponse.json({ success: true, data: { id: updated.id, name: updated.name } });
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

// DELETE /api/projects/[projectId]/architecture/sets/[setId] — DRAFT only, own set
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; setId: string }> }
) {
  try {
    const { projectId, setId } = await params;
    const auth = await requireProjectAuth(projectId);

    const set = await prisma.drawingSet.findFirst({ where: { id: setId, projectId } });
    if (!set) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    if (set.status !== 'DRAFT') {
      return NextResponse.json({ success: false, error: 'Can only delete DRAFT sets' }, { status: 400 });
    }

    if (auth.role !== 'CONSULTANT') {
      return NextResponse.json({ success: false, error: 'Only the Consultant can delete sets' }, { status: 403 });
    }

    if (set.createdById !== auth.userId) {
      return NextResponse.json({ success: false, error: 'Can only delete your own sets' }, { status: 403 });
    }

    // Unlink rows (set setId to null) rather than deleting them
    await prisma.drawingRow.updateMany({ where: { setId }, data: { setId: null } });
    await prisma.drawingSet.delete({ where: { id: setId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
