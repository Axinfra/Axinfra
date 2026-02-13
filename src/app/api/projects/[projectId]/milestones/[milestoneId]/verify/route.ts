import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { MilestoneStateMachine } from '@/services/MilestoneStateMachine';
import { AuditLogger } from '@/services/AuditLogger';
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

    const body = await request.json();
    const { qtyVerified, notes } = verifySchema.parse(body);

    // Check if milestone can be verified
    const canVerify = await MilestoneStateMachine.canVerify(milestoneId);
    if (!canVerify.canVerify) {
      return NextResponse.json(
        { success: false, error: canVerify.reason },
        { status: 400 }
      );
    }

    // Get milestone with BOQ links to calculate value
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
    // For milestones with BOQ links, calculate from BOQ
    // For Extras (no BOQ links), use the milestone's stored value
    let valueEligibleComputed: number;

    if (milestone.boqLinks.length > 0) {
      // Calculate from BOQ links
      const totalPlannedValue = milestone.boqLinks.reduce((sum: number, link: { plannedQty: number; boqItem: { rate: number } }) => {
        return sum + link.plannedQty * link.boqItem.rate;
      }, 0);
      const totalPlannedQty = milestone.boqLinks.reduce((sum: number, link: { plannedQty: number }) => sum + link.plannedQty, 0);
      const verifiedRatio = totalPlannedQty > 0 ? qtyVerified / totalPlannedQty : 1;
      valueEligibleComputed = totalPlannedValue * verifiedRatio;
    } else {
      // Extras or milestones without BOQ links - use stored value
      valueEligibleComputed = milestone.value;
    }

    // Create verification record and transition state
    await prisma.$transaction(async (tx) => {
      // Create verification
      await tx.verification.create({
        data: {
          milestoneId,
          verifiedById: auth.userId,
          qtyVerified,
          valueEligibleComputed,
          notes,
        },
      });
    });

    // Transition to VERIFIED state
    // MilestoneStateMachine.transition now automatically triggers
    // PaymentEligibilityEngine.recalculatePaymentEligibility internally
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

    // Log verification
    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.VERIFICATION_CREATE,
      entityType: 'Verification',
      entityId: milestoneId,
      afterJson: {
        qtyVerified,
        valueEligibleComputed,
        notes,
      },
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
