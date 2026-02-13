/**
 * Payment Eligibility API - CANONICAL SOURCE OF TRUTH
 *
 * GOVERNANCE RULES:
 * 1. This endpoint serves the SAME data to ALL roles
 * 2. No role-specific calculations - all reads come from PaymentEligibility table
 * 3. Permissions only affect ACTIONS, not DATA visibility
 * 4. Frontend reads indicator from derivePaymentIndicator() - never computes locally
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { PaymentEligibilityEngine } from '@/services/PaymentEligibilityEngine';
import { EligibilityState } from '@/types';

/**
 * GET /api/projects/[projectId]/milestones/[milestoneId]/payment
 *
 * Returns the CANONICAL payment eligibility for a milestone.
 * GOVERNANCE: Same response for all roles. Permissions only affect actions.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    // All roles can view eligibility (governance requirement: same data for all)
    if (!RoleGuard.canViewPayments(auth)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Get the canonical eligibility record
    const eligibility = await PaymentEligibilityEngine.getEligibility(milestoneId);

    if (!eligibility) {
      // No eligibility record yet - this is valid for new milestones
      return NextResponse.json({
        success: true,
        data: {
          exists: false,
          milestoneId,
          // Return default indicator for UI
          indicator: {
            indicator: 'NOT_DUE',
            displayLabel: 'Not Due',
            displayColor: 'gray',
            eligibleAmount: 0,
            blockedAmount: 0,
            isUrgent: false,
            daysUntilDue: null,
            daysOverdue: null,
          },
          // Permissions (same logic, different actions)
          permissions: {
            canBlock: RoleGuard.canBlockPayment(auth),
            canMarkPaid: RoleGuard.canMarkPaid(auth),
            canUnblock: RoleGuard.canUnblockPayment(auth),
          },
        },
      });
    }

    // Derive the indicator (pure function, deterministic)
    const indicator = PaymentEligibilityEngine.derivePaymentIndicator({
      state: eligibility.state as EligibilityState,
      eligibleAmount: eligibility.eligibleAmount,
      blockedAmount: eligibility.blockedAmount,
      dueDate: eligibility.dueDate,
    });

    // Return CANONICAL data - same for all roles
    return NextResponse.json({
      success: true,
      data: {
        exists: true,
        // Canonical eligibility record
        id: eligibility.id,
        milestoneId: eligibility.milestoneId,
        state: eligibility.state,
        boqValueCompleted: eligibility.boqValueCompleted,
        deductions: eligibility.deductions,
        eligibleAmount: eligibility.eligibleAmount,
        blockedAmount: eligibility.blockedAmount,
        dueDate: eligibility.dueDate,
        lastCalculatedAt: eligibility.lastCalculatedAt,

        // Block info (if blocked)
        blockReasonCode: eligibility.blockReasonCode,
        blockExplanation: eligibility.blockExplanation,
        blockedAt: eligibility.blockedAt,

        // Paid info (if paid)
        markedPaidAt: eligibility.markedPaidAt,
        paidExplanation: eligibility.paidExplanation,

        // Milestone info
        milestone: eligibility.milestone,

        // Derived indicator (UI display helper)
        indicator,

        // Recent events (audit trail)
        events: eligibility.events,

        // Permissions (actions available to this role)
        permissions: {
          canBlock:
            RoleGuard.canBlockPayment(auth) &&
            eligibility.state !== EligibilityState.BLOCKED &&
            eligibility.state !== EligibilityState.MARKED_PAID,
          canMarkPaid:
            RoleGuard.canMarkPaid(auth) &&
            eligibility.state !== EligibilityState.BLOCKED &&
            eligibility.state !== EligibilityState.MARKED_PAID,
          canUnblock:
            RoleGuard.canUnblockPayment(auth) &&
            eligibility.state === EligibilityState.BLOCKED,
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Payment eligibility get error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
