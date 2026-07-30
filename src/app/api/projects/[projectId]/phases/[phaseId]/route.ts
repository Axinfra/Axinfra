import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';

const dateEq = (a: Date | null, b: Date | null) => (a?.getTime() ?? null) === (b?.getTime() ?? null);

// GET /api/projects/[projectId]/phases/[phaseId] - Purchase Order detail (vendor + BOQ/Work Order summary)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> }
) {
  try {
    const { projectId, phaseId } = await params;
    await requireProjectAuth(projectId);

    const phase = await prisma.phase.findFirst({
      where: { id: phaseId, projectId },
      include: {
        vendorUser: {
          select: { id: true, name: true, email: true, companyName: true, contactPerson: true, mobile: true, gstNumber: true, address: true },
        },
        boqs: { select: { id: true, status: true, _count: { select: { items: true } } } },
        workOrder: { select: { id: true, number: true, status: true, currentRevisionNumber: true } },
      },
    });

    if (!phase) {
      return NextResponse.json({ success: false, error: 'Phase not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: phase.id,
        name: phase.name,
        description: phase.description,
        plannedStart: phase.plannedStart,
        plannedEnd: phase.plannedEnd,
        estimatedCost: phase.estimatedCost,
        vendorUserId: phase.vendorUserId,
        vendor: phase.vendorUser,
        boqs: phase.boqs.map((b) => ({ id: b.id, status: b.status, itemsCount: b._count.items })),
        workOrder: phase.workOrder,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Phase get error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

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

    let estimatedCost: number | null | undefined = undefined;
    if (body.estimatedCost !== undefined) {
      if (body.estimatedCost === null || body.estimatedCost === '') {
        estimatedCost = null;
      } else {
        estimatedCost = Number(body.estimatedCost);
        if (isNaN(estimatedCost) || estimatedCost < 0) {
          return NextResponse.json({ success: false, error: 'Estimated cost must be a non-negative number' }, { status: 400 });
        }
      }
    }

    if (body.vendorUserId) {
      const vendorRole = await prisma.projectRole.findUnique({
        where: { projectId_userId: { projectId, userId: body.vendorUserId as string } },
      });
      if (!vendorRole || vendorRole.role !== 'VENDOR') {
        return NextResponse.json({ success: false, error: 'Assigned vendor must be a VENDOR on this project' }, { status: 400 });
      }
    }

    const updated = await prisma.phase.update({
      where: { id: phaseId },
      data: {
        ...(body.name !== undefined && { name: (body.name as string).trim() }),
        ...(body.description !== undefined && { description: (body.description as string)?.trim() || null }),
        ...(body.sortOrder !== undefined && { sortOrder: body.sortOrder as number }),
        ...(plannedStart !== undefined && { plannedStart }),
        ...(plannedEnd   !== undefined && { plannedEnd }),
        ...(estimatedCost !== undefined && { estimatedCost }),
        ...(body.vendorUserId !== undefined && { vendorUserId: (body.vendorUserId as string) || null }),
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
    if (body.description !== undefined && updated.description !== phase.description) {
      before.description = phase.description;
      after.description = updated.description;
    }
    if (body.vendorUserId !== undefined && updated.vendorUserId !== phase.vendorUserId) {
      before.vendorUserId = phase.vendorUserId;
      after.vendorUserId = updated.vendorUserId;
    }
    if (estimatedCost !== undefined && updated.estimatedCost !== phase.estimatedCost) {
      before.estimatedCost = phase.estimatedCost;
      after.estimatedCost = updated.estimatedCost;
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
      include: { boqs: { select: { id: true } } },
    });

    if (!phase) {
      return NextResponse.json(
        { success: false, error: 'Phase not found' },
        { status: 404 }
      );
    }

    const [msCount, workOrder, raBillCount] = await Promise.all([
      prisma.milestone.count({ where: { phaseId } }),
      prisma.workOrder.findUnique({ where: { orderId: phaseId }, select: { id: true } }),
      prisma.rABill.count({ where: { orderId: phaseId } }),
    ]);

    if (msCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete phase — it has ${msCount} milestone(s). Remove or reassign them first.`,
        },
        { status: 400 }
      );
    }

    // WorkOrder.orderId and RABill.orderId are both onDelete: Cascade — without this guard,
    // deleting a Purchase Order would silently destroy the Work Order (including vendor
    // acceptance history) and every RA Bill under it, including PAID bills with real payment
    // references. Neither is recoverable, so block deletion outright rather than warning.
    if (workOrder) {
      return NextResponse.json(
        {
          success: false,
          error: 'Cannot delete this purchase order — it has a Work Order. A Work Order cannot be removed once issued.',
        },
        { status: 400 }
      );
    }
    if (raBillCount > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cannot delete this purchase order — it has ${raBillCount} RA Bill(s). RA Bills cannot be removed once created.`,
        },
        { status: 400 }
      );
    }

    // BOQ.orderId is onDelete: SetNull, so we must delete every BOQ under this order explicitly.
    if (phase.boqs.length > 0) {
      await prisma.bOQ.deleteMany({ where: { id: { in: phase.boqs.map((b) => b.id) } } });
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
