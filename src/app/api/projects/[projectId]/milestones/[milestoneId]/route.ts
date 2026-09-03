import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { MilestoneStateMachine } from '@/services/MilestoneStateMachine';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, MilestoneState } from '@/types';
import { invalidatePrefix } from '@/lib/cache';

// GET /api/projects/[projectId]/milestones/[milestoneId] - Get milestone details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, projectId },
      include: {
        boqLinks: {
          include: {
            boqItem: true,
          },
        },
        verifications: {
          include: {
            verifiedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { verifiedAt: 'desc' },
        },
        evidence: {
          include: {
            files: { select: { id: true, fileName: true, mimeType: true } },
            submittedBy: { select: { id: true, name: true } },
          },
          orderBy: { submittedAt: 'desc' },
        },
        comments: {
          include: {
            author: { select: { id: true, name: true } },
          },
          orderBy: { createdAt: 'asc' },
        },
        transitions: {
          include: {
            actor: {
              select: {
                id: true,
                name: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        paymentEligibility: {
          include: {
            events: {
              orderBy: { createdAt: 'desc' },
              take: 10,
            },
          },
        },
        vendorUser: {
          select: { id: true, name: true, email: true },
        },
        // Predecessors: deps where this milestone is the successor
        successorDependencies: {
          include: {
            predecessor: {
              select: { id: true, title: true, state: true },
            },
          },
        },
      },
    });

    if (!milestone) {
      return NextResponse.json(
        { success: false, error: 'Milestone not found' },
        { status: 404 }
      );
    }

    // Get valid transitions for current role
    const validNextStates = MilestoneStateMachine.getValidNextStatesForRole(milestone.state as MilestoneState, auth.role);

    // Calculate planned value from BOQ links
    const plannedValue = milestone.boqLinks.reduce((sum: number, link: { plannedQty: number; boqItem: { rate: number } }) => {
      return sum + link.plannedQty * link.boqItem.rate;
    }, 0);

    const predecessors = milestone.successorDependencies.map((dep) => ({
      id: dep.predecessor.id,
      title: dep.predecessor.title,
      state: dep.predecessor.state,
      dependencyType: dep.dependencyType,
      lagDays: dep.lagDays,
    }));

    const { evidence, ...milestoneRest } = milestone;

    return NextResponse.json({
      success: true,
      data: {
        ...milestoneRest,
        submissions: evidence,
        plannedValue,
        validNextStates,
        predecessors,
        permissions: RoleGuard.getPermissions(auth.role),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Milestone get error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

const EDITABLE_DATE_FIELDS = [
  'plannedStart', 'plannedEnd', 'baselinePlannedStart', 'baselinePlannedEnd', 'actualStart', 'actualEnd',
] as const;
const EDITABLE_NUMBER_FIELDS = ['durationDays', 'percentComplete', 'actualWorkHours', 'remainingWorkHours'] as const;

// PATCH /api/projects/[projectId]/milestones/[milestoneId] - Edit milestone fields
// (title, dates, duration/progress/work) — same workflow as the Gantt L2 date editor,
// extended to the full field set so the Schedule WBS view can edit imported tasks too.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

    const existing = await prisma.milestone.findFirst({ where: { id: milestoneId, projectId } });
    if (!existing) {
      return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 });
    }

    const body = await request.json();
    const data: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};

    if (typeof body.title === 'string' && body.title.trim()) {
      data.title = body.title.trim();
      before.title = existing.title;
    }
    for (const field of EDITABLE_DATE_FIELDS) {
      if (field in body) {
        const value = body[field];
        const parsed = value ? new Date(value) : null;
        if (value && Number.isNaN(parsed?.getTime())) {
          return NextResponse.json({ success: false, error: `Invalid date for ${field}` }, { status: 400 });
        }
        data[field] = parsed;
        before[field] = existing[field as keyof typeof existing];
      }
    }
    for (const field of EDITABLE_NUMBER_FIELDS) {
      if (field in body) {
        const value = body[field];
        const parsed = value === null || value === '' ? null : Number(value);
        if (parsed !== null && !Number.isFinite(parsed)) {
          return NextResponse.json({ success: false, error: `Invalid number for ${field}` }, { status: 400 });
        }
        data[field] = parsed;
        before[field] = existing[field as keyof typeof existing];
      }
    }

    if ('phaseId' in body) {
      const phaseId = body.phaseId || null;
      if (phaseId) {
        const phase = await prisma.phase.findFirst({ where: { id: phaseId, projectId } });
        if (!phase) {
          return NextResponse.json({ success: false, error: 'Linked phase not found in this project' }, { status: 400 });
        }
      }
      data.phaseId = phaseId;
      before.phaseId = existing.phaseId;
    }

    if ('vendorUserId' in body) {
      const vendorUserId = body.vendorUserId || null;
      if (vendorUserId) {
        const vendorRole = await prisma.projectRole.findFirst({
          where: { projectId, userId: vendorUserId, role: 'VENDOR' },
        });
        if (!vendorRole) {
          return NextResponse.json({ success: false, error: 'Assigned vendor must be a VENDOR on this project' }, { status: 400 });
        }
      }
      data.vendorUserId = vendorUserId;
      before.vendorUserId = existing.vendorUserId;
    }

    if ('priority' in body) {
      const priority = body.priority;
      if (!['LOW', 'NORMAL', 'HIGH', 'URGENT'].includes(priority)) {
        return NextResponse.json({ success: false, error: 'Invalid priority' }, { status: 400 });
      }
      data.priority = priority;
      before.priority = existing.priority;
    }

    if ('remarks' in body) {
      const remarks = typeof body.remarks === 'string' ? body.remarks.trim() || null : null;
      data.remarks = remarks;
      before.remarks = existing.remarks;
    }

    // Replace the milestone's linked BOQ item — only a client-approved BOQ's items are
    // eligible (mirrors the same rule enforced on create, in POST /milestones).
    let boqLinkUpdate: { boqItemId: string; plannedQty: number } | null | undefined;
    if ('boqItemId' in body) {
      const boqItemId = body.boqItemId || null;
      if (boqItemId) {
        const plannedQty = Number(body.boqQty);
        if (!Number.isFinite(plannedQty) || plannedQty <= 0) {
          return NextResponse.json({ success: false, error: 'A positive quantity is required to link a BOQ item' }, { status: 400 });
        }
        const item = await prisma.bOQItem.findFirst({
          where: { id: boqItemId },
          select: { id: true, boq: { select: { projectId: true, status: true } } },
        });
        if (!item || item.boq.projectId !== projectId || item.boq.status !== 'APPROVED') {
          return NextResponse.json(
            { success: false, error: 'BOQ items can only be linked once their BOQ is approved by the client' },
            { status: 400 }
          );
        }
        boqLinkUpdate = { boqItemId, plannedQty };
      } else {
        boqLinkUpdate = null;
      }
    }

    if (Object.keys(data).length === 0 && boqLinkUpdate === undefined) {
      return NextResponse.json({ success: false, error: 'No editable fields provided' }, { status: 400 });
    }

    const updated = await prisma.$transaction(async (tx) => {
      const result = Object.keys(data).length > 0
        ? await tx.milestone.update({ where: { id: milestoneId }, data })
        : existing;

      if (boqLinkUpdate !== undefined) {
        await tx.milestoneBOQLink.deleteMany({ where: { milestoneId } });
        if (boqLinkUpdate) {
          await tx.milestoneBOQLink.create({
            data: { milestoneId, boqItemId: boqLinkUpdate.boqItemId, plannedQty: boqLinkUpdate.plannedQty },
          });
        }
      }

      return result;
    });

    await Promise.all([
      invalidatePrefix(`milestone:${projectId}:list:`),
      invalidatePrefix(`project:${projectId}:detail:`),
      invalidatePrefix(`gantt:${projectId}`),
      invalidatePrefix(`analytics:${projectId}`),
    ]);

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.MILESTONE_UPDATE,
      entityType: 'Milestone',
      entityId: milestoneId,
      beforeJson: before,
      afterJson: data,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Milestone update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/milestones/[milestoneId] - Delete milestone (OWNER only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only OWNER can delete milestones
    RoleGuard.requireRole(auth, ['CLIENT']);

    // Get milestone details before deletion for audit log — validate ownership
    const milestone = await prisma.milestone.findFirst({
      where: { id: milestoneId, projectId },
      include: {
        paymentEligibility: true,
      },
    });

    if (!milestone) {
      return NextResponse.json(
        { success: false, error: 'Milestone not found' },
        { status: 404 }
      );
    }

    // Preserve financial history: cannot delete a paid milestone
    if (milestone.paymentEligibility?.state === 'MARKED_PAID') {
      return NextResponse.json(
        { success: false, error: 'Cannot delete a paid milestone. Archive the project instead.' },
        { status: 409 }
      );
    }

    // Preserve audit integrity: cannot delete verified/closed milestones
    if (milestone.state === MilestoneState.VERIFIED || milestone.state === MilestoneState.CLOSED) {
      return NextResponse.json(
        { success: false, error: 'Cannot delete a verified or closed milestone.' },
        { status: 409 }
      );
    }

    // Delete milestone (cascade will handle related records)
    await prisma.milestone.delete({
      where: { id: milestoneId },
    });

    await Promise.all([
      invalidatePrefix(`milestone:${projectId}:list:`),
      invalidatePrefix(`project:${projectId}:detail:`),
    ]);

    // Log the deletion
    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.MILESTONE_DELETE,
      entityType: 'Milestone',
      entityId: milestoneId,
      beforeJson: {
        title: milestone.title,
        state: milestone.state,
        paymentModel: milestone.paymentModel,
        eligibleAmount: milestone.paymentEligibility?.eligibleAmount,
        eligibilityState: milestone.paymentEligibility?.state,
      },
    });

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { success: false, error: 'Only Owner can delete milestones' },
        { status: 403 }
      );
    }
    console.error('Milestone delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
