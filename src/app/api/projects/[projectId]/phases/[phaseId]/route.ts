import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';

// PATCH /api/projects/[projectId]/phases/[phaseId] - Rename or reorder a phase
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> }
) {
  try {
    const { projectId, phaseId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['OWNER', 'PMC']);

    const phase = await prisma.phase.findFirst({
      where: { id: phaseId, projectId },
    });

    if (!phase) {
      return NextResponse.json(
        { success: false, error: 'Phase not found' },
        { status: 404 }
      );
    }

    const body = await request.json().catch(() => ({}));

    if (body.name !== undefined && (body.name as string).trim() === '') {
      return NextResponse.json(
        { success: false, error: 'Phase name must not be empty' },
        { status: 400 }
      );
    }

    const updated = await prisma.phase.update({
      where: { id: phaseId },
      data: {
        ...(body.name !== undefined && { name: (body.name as string).trim() }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder as number }),
      },
    });

    await invalidateProjectAndMemberCaches(projectId);

    return NextResponse.json({ success: true, data: updated });
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
    console.error('Phase update error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/phases/[phaseId] - Delete a phase (OWNER only)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> }
) {
  try {
    const { projectId, phaseId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['OWNER']);

    const phase = await prisma.phase.findFirst({
      where: { id: phaseId, projectId },
      include: { boq: { select: { id: true } } },
    });

    if (!phase) {
      return NextResponse.json(
        { success: false, error: 'Phase not found' },
        { status: 404 }
      );
    }

    const msCount = await prisma.milestone.count({ where: { phaseId } });

    if (msCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete phase — it has ${msCount} milestone(s). Remove or reassign them first.`,
        },
        { status: 400 }
      );
    }

    // BOQ.phaseId is onDelete: SetNull, so we must delete it explicitly
    if (phase.boq) {
      await prisma.bOQ.delete({ where: { id: phase.boq.id } });
    }

    await prisma.phase.delete({ where: { id: phaseId } });

    await invalidateProjectAndMemberCaches(projectId);

    return NextResponse.json({ success: true, data: { deleted: true } });
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
    console.error('Phase delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
