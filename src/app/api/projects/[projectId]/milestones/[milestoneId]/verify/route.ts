import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { validateMilestoneOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { MilestoneStateMachine } from '@/services/MilestoneStateMachine';
import { PaymentEligibilityEngine } from '@/services/PaymentEligibilityEngine';
import { AuditActionTypes, EligibilityEventType, MilestoneState } from '@/types';
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

    // Re-validate state-machine preconditions inside the transaction,
    // then update milestone state + create transition record + verification + audit logs
    // as a SINGLE atomic operation. State-machine.transition is NOT used here because
    // its internal $transaction would split the work into two separate atomic units.
    let fromState: MilestoneState = MilestoneState.SUBMITTED;
    try {
      await prisma.$transaction(async (tx) => {
        const current = await tx.milestone.findUnique({
          where: { id: milestoneId },
        });
        if (!current) {
          throw new Error('Milestone not found');
        }
        fromState = current.state as MilestoneState;

        if (!MilestoneStateMachine.isValidTransition(fromState, MilestoneState.VERIFIED)) {
          throw new Error(`Invalid transition: ${fromState} -> ${MilestoneState.VERIFIED}`);
        }
        if (!MilestoneStateMachine.canPerformTransition(fromState, MilestoneState.VERIFIED, auth.role)) {
          throw new Error(`FORBIDDEN: Role ${auth.role} cannot perform transition: ${fromState} -> ${MilestoneState.VERIFIED}`);
        }

        // Re-check ALL evidence APPROVED inside the transaction (race-safe)
        const totalEvidence = await tx.evidence.count({ where: { milestoneId } });
        const approvedEvidence = await tx.evidence.count({
          where: { milestoneId, status: 'APPROVED' },
        });
        if (totalEvidence === 0) {
          throw new Error('Cannot verify milestone without evidence');
        }
        if (approvedEvidence < totalEvidence) {
          throw new Error(
            `Cannot verify: ${totalEvidence - approvedEvidence} of ${totalEvidence} evidence items are not yet approved`
          );
        }

        await tx.milestone.update({
          where: { id: milestoneId },
          data: {
            state: MilestoneState.VERIFIED,
            actualVerification: new Date(),
          },
        });

        await tx.milestoneStateTransition.create({
          data: {
            milestoneId,
            fromState,
            toState: MilestoneState.VERIFIED,
            actorId: auth.userId,
            role: auth.role,
            reason: notes,
          },
        });

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
            actionType: AuditActionTypes.MILESTONE_STATE_TRANSITION,
            entityType: 'Milestone',
            entityId: milestoneId,
            beforeJson: JSON.stringify({ state: fromState }),
            afterJson: JSON.stringify({ state: MilestoneState.VERIFIED }),
            reason: notes,
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
    } catch (txErr) {
      const msg = txErr instanceof Error ? txErr.message : 'Verification transaction failed';
      if (msg.startsWith('FORBIDDEN')) {
        return NextResponse.json({ success: false, error: msg }, { status: 403 });
      }
      return NextResponse.json({ success: false, error: msg }, { status: 400 });
    }

    // Best-effort recalculate after the atomic transaction. If this fails,
    // the verification still stands and a subsequent event will trigger a retry.
    await PaymentEligibilityEngine.recalculatePaymentEligibility(
      milestoneId,
      auth.userId,
      auth.role,
      EligibilityEventType.MILESTONE_STATE_CHANGED,
      'Milestone',
      milestoneId
    );

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
