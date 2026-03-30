import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { validateMilestoneOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { MilestoneStateMachine } from '@/services/MilestoneStateMachine';
import { AuditActionTypes, MilestoneState } from '@/types';
import { z } from 'zod';

const verifySchema = z.object({
  qtyVerified: z.number().min(0),
  notes: z.string().optional(),
});

// POST /api/projects/[projectId]/milestones/[milestoneId]/verify - Verify milestone
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only Owner and PMC can verify
    RoleGuard.requireRole(auth, ['OWNER', 'PMC']);

    // IDOR guard: verify milestone belongs to this project
    const milestoneCheck = await validateMilestoneOwnership(milestoneId, projectId);
    if (!milestoneCheck) {
      return NextResponse.json(
        { success: false, error: 'Milestone not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { qtyVerified, notes } = verifySchema.parse(body);

    // Check if milestone can be verified (pre-check before transaction)
    const canVerifyResult = await MilestoneStateMachine.canVerify(milestoneId);
    if (!canVerifyResult.canVerify) {
      return NextResponse.json(
        { success: false, error: canVerifyResult.reason },
        { status: 400 }
      );
    }

    // Get milestone with BOQ links to calculate value — already validated ownership
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: {
        boqLinks: {
          include: {
            boqItem: true,
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

    // Calculate eligible value based on verified qty
    let valueEligibleComputed: number;

    if (milestone.boqLinks.length > 0) {
      const totalPlannedValue = milestone.boqLinks.reduce((sum: number, link: { plannedQty: number; boqItem: { rate: number } }) => {
        return sum + link.plannedQty * link.boqItem.rate;
      }, 0);
      const totalPlannedQty = milestone.boqLinks.reduce((sum: number, link: { plannedQty: number }) => sum + link.plannedQty, 0);
      const verifiedRatio = totalPlannedQty > 0 ? qtyVerified / totalPlannedQty : 1;
      valueEligibleComputed = totalPlannedValue * verifiedRatio;
    } else {
      valueEligibleComputed = milestone.value;
    }

    // Transition to VERIFIED state via state machine (which now validates
    // ALL evidence approved, writes audit log atomically, and recalculates eligibility)
    const transitionResult = await MilestoneStateMachine.transition(
      milestoneId,
      MilestoneState.VERIFIED,
      auth.userId,
      auth.role,
      projectId,
      notes
    );

    if (!transitionResult.success) {
      return NextResponse.json(
        { success: false, error: transitionResult.error },
        { status: 400 }
      );
    }

    // Create verification record and audit log atomically
    await prisma.$transaction(async (tx) => {
      await tx.verification.create({
        data: {
          milestoneId,
          verifiedById: auth.userId,
          qtyVerified,
          valueEligibleComputed,
          notes,
        },
      });

      await tx.auditLog.create({
        data: {
          projectId,
          actorId: auth.userId,
          role: auth.role,
          actionType: AuditActionTypes.VERIFICATION_CREATE,
          entityType: 'Verification',
          entityId: milestoneId,
          afterJson: JSON.stringify({
            qtyVerified,
            valueEligibleComputed,
            notes,
          }),
        },
      });
    });

    return NextResponse.json({
      success: true,
      data: {
        qtyVerified,
        valueEligibleComputed,
      },
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
        { success: false, error: error.message },
        { status: 403 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      );
    }
    console.error('Verification error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
