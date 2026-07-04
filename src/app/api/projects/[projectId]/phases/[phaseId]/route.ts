import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';

const dateEq = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

// PATCH /api/projects/[projectId]/phases/[phaseId] - Rename or reorder a phase
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> }
) {
  try {
    const { projectId, phaseId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

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

    const plannedStart = body.plannedStart !== undefined
      ? (body.plannedStart ? new Date(body.plannedStart as string) : null)
      : undefined;
    const plannedEnd = body.plannedEnd !== undefined
      ? (body.plannedEnd ? new Date(body.plannedEnd as string) : null)
      : undefined;

    if (plannedStart instanceof Date && isNaN(plannedStart.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid plannedStart date' }, { status: 400 });
    }
    if (plannedEnd instanceof Date && isNaN(plannedEnd.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid plannedEnd date' }, { status: 400 });
    }

    const resolvedStart = plannedStart !== undefined ? plannedStart : phase.plannedStart;
    const resolvedEnd   = plannedEnd   !== undefined ? plannedEnd   : phase.plannedEnd;
    if (resolvedStart && resolvedEnd && resolvedStart >= resolvedEnd) {
      return NextResponse.json({ success: false, error: 'Start date must be before end date' }, { status: 400 });
    }

    const updated = await prisma.phase.update({
      where: { id: phaseId },
      data: {
        ...(body.name !== undefined && { name: (body.name as string).trim() }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder as number }),
        ...(plannedStart !== undefined && { plannedStart }),
        ...(plannedEnd   !== undefined && { plannedEnd }),
      },
    });

    await invalidateProjectAndMemberCaches(projectId);

    // Only record fields that actually changed — keeps the audit trail meaningful
    // instead of logging a no-op every time a reorder PATCH lands on an unmoved phase.
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (body.name !== undefined && updated.name !== phase.name) {
      before.name = phase.name;
      after.name = updated.name;
    }
    if (body.sortOrder !== undefined && updated.sortOrder !== phase.sortOrder) {
      before.sortOrder = phase.sortOrder;
      after.sortOrder = updated.sortOrder;
    }
    if (plannedStart !== undefined && !dateEq(updated.plannedStart, phase.plannedStart)) {
      before.plannedStart = phase.plannedStart;
      after.plannedStart = updated.plannedStart;
    }
    if (plannedEnd !== undefined && !dateEq(updated.plannedEnd, phase.plannedEnd)) {
      before.plannedEnd = phase.plannedEnd;
      after.plannedEnd = updated.plannedEnd;
    }
    if (Object.keys(after).length > 0) {
      await AuditLogger.log({
        projectId,
        actorId: auth.userId,
        role: auth.role,
        actionType: AuditActionTypes.PHASE_UPDATE,
        entityType: 'Phase',
        entityId: phaseId,
        beforeJson: before,
        afterJson: after,
      });
    }

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

// DELETE /api/projects/[projectId]/phases/[phaseId] - Delete a phase (CLIENT or PMC)
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> }
) {
  try {
    const { projectId, phaseId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

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

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.PHASE_DELETE,
      entityType: 'Phase',
      entityId: phaseId,
      beforeJson: { name: phase.name, sortOrder: phase.sortOrder },
    });

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
