/**
 * Payment Eligibility Actions API - HUMAN EVENT HANDLERS
 *
 * GOVERNANCE RULES:
 * 1. Humans trigger EVENTS, not states
 * 2. The system (PaymentEligibilityEngine) decides state transitions
 * 3. All actions require explanation for audit trail
 * 4. Only valid actions based on current state are allowed
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { validateMilestoneOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { PaymentEligibilityEngine } from '@/services/PaymentEligibilityEngine';
import { BlockingReasonCode, BlockingReasonCodes, EligibilityState } from '@/types';
import { z } from 'zod';

// Schema for blocking action
const blockSchema = z.object({
  action: z.literal('block'),
  reasonCode: z.enum(Object.keys(BlockingReasonCodes) as [string, ...string[]]),
  explanation: z.string().min(1, 'Explanation is required for blocking'),
});

// Schema for unblocking action
const unblockSchema = z.object({
  action: z.literal('unblock'),
  reason: z.string().min(1, 'Reason is required for unblocking'),
});

// Schema for marking paid
const markPaidSchema = z.object({
  action: z.literal('markPaid'),
  explanation: z.string().min(1, 'Explanation is required'),
});

// Discriminated union of all actions
const actionSchema = z.discriminatedUnion('action', [
  blockSchema,
  unblockSchema,
  markPaidSchema,
]);

/**
 * POST /api/projects/[projectId]/milestones/[milestoneId]/payment/mark
 *
 * Trigger a human event on payment eligibility.
 * GOVERNANCE: Humans trigger events, system decides states.
 *
 * Valid actions:
 * - block: Block payment (Owner/PMC) - requires reasonCode + explanation
 * - unblock: Unblock payment (Owner only) - requires reason
 * - markPaid: Mark as paid (Owner/PMC) - requires explanation
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    // IDOR guard: verify milestone belongs to this project
    const milestoneCheck = await validateMilestoneOwnership(milestoneId, projectId);
    if (!milestoneCheck) {
      return NextResponse.json(
        { success: false, error: 'Milestone not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const data = actionSchema.parse(body);

    let result: { success: boolean; error?: string };

    switch (data.action) {
      case 'block':
        // Check permission
        if (!RoleGuard.canBlockPayment(auth)) {
          return NextResponse.json(
            { success: false, error: 'Only Owner or PMC can block payments' },
            { status: 403 }
          );
        }

        // Trigger block event - system will handle state transition
        result = await PaymentEligibilityEngine.block(
          milestoneId,
          data.reasonCode as BlockingReasonCode,
          data.explanation,
          auth.userId,
          auth.role,
          projectId
        );
        break;

      case 'unblock':
        // Check permission
        if (!RoleGuard.canUnblockPayment(auth)) {
          return NextResponse.json(
            { success: false, error: 'Only Owner can unblock payments' },
            { status: 403 }
          );
        }

        // Trigger unblock event - system will recalculate state
        result = await PaymentEligibilityEngine.unblock(
          milestoneId,
          data.reason,
          auth.userId,
          auth.role,
          projectId
        );
        break;

      case 'markPaid':
        // Check permission
        if (!RoleGuard.canMarkPaid(auth)) {
          return NextResponse.json(
            { success: false, error: 'Only Owner or PMC can mark payments as paid' },
            { status: 403 }
          );
        }

        // Trigger mark paid event - terminal state
        result = await PaymentEligibilityEngine.markPaid(
          milestoneId,
          data.explanation,
          auth.userId,
          auth.role,
          projectId
        );
        break;
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Return updated eligibility
    const eligibility = await PaymentEligibilityEngine.getEligibility(milestoneId);

    return NextResponse.json({
      success: true,
      data: eligibility
        ? {
          state: eligibility.state,
          eligibleAmount: eligibility.eligibleAmount,
          blockedAmount: eligibility.blockedAmount,
          indicator: PaymentEligibilityEngine.derivePaymentIndicator({
            state: eligibility.state as EligibilityState,
            eligibleAmount: eligibility.eligibleAmount,
            blockedAmount: eligibility.blockedAmount,
            dueDate: eligibility.dueDate,
          }),
        }
        : null,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Payment mark error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
