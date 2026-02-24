import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { MilestoneStateMachine } from '@/services/MilestoneStateMachine';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, MilestoneState } from '@/types';

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
        evidence: {
          include: {
            files: true,
            submittedBy: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
          orderBy: { submittedAt: 'desc' },
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

    return NextResponse.json({
      success: true,
      data: {
        ...milestone,
        plannedValue,
        validNextStates,
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

// DELETE /api/projects/[projectId]/milestones/[milestoneId] - Delete milestone (OWNER only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only OWNER can delete milestones
    RoleGuard.requireRole(auth, ['OWNER']);

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

    // Delete milestone (cascade will handle related records)
    await prisma.milestone.delete({
      where: { id: milestoneId },
    });

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
