/**
 * Project Payment Eligibility API - CANONICAL SOURCE OF TRUTH
 *
 * GOVERNANCE RULES:
 * 1. Returns ALL eligibilities for a project - same data for ALL roles
 * 2. Includes derived indicators for dashboard display
 * 3. No role-specific calculations
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { PaymentEligibilityEngine } from '@/services/PaymentEligibilityEngine';
import { EligibilityState } from '@/types';
import { cached } from '@/lib/cache';

/**
 * GET /api/projects/[projectId]/payment-eligibility
 *
 * Returns all payment eligibilities for a project.
 * GOVERNANCE: Same response for all roles.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (!RoleGuard.canViewPayments(auth)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden' },
        { status: 403 }
      );
    }

    // Cache the role-agnostic eligibilities + summary (same for all roles per route governance).
    // Role-specific `permissions` are built fresh below, outside the cache.
    const cacheKey = `project:${projectId}:eligibility:${auth.role}`;
    const { eligibilitiesWithIndicators, summary } = await cached(cacheKey, 30_000, async () => {
      const eligibilities = await PaymentEligibilityEngine.getProjectEligibilities(projectId);

      const eligibilitiesWithIndicators = eligibilities.map((e) => ({
        id: e.id,
        milestoneId: e.milestoneId,
        milestone: e.milestone,
        state: e.state,
        boqValueCompleted: e.boqValueCompleted,
        deductions: e.deductions,
        eligibleAmount: e.eligibleAmount,
        blockedAmount: e.blockedAmount,
        dueDate: e.dueDate,
        lastCalculatedAt: e.lastCalculatedAt,
        // Derived indicator - same for all roles
        indicator: PaymentEligibilityEngine.derivePaymentIndicator({
          state: e.state as EligibilityState,
          eligibleAmount: e.eligibleAmount,
          blockedAmount: e.blockedAmount,
          dueDate: e.dueDate,
        }),
      }));

      const summary = {
        totalEligible: eligibilitiesWithIndicators.reduce(
          (sum, e) => sum + e.eligibleAmount,
          0
        ),
        totalBlocked: eligibilitiesWithIndicators.reduce(
          (sum, e) => sum + e.blockedAmount,
          0
        ),
        totalPaid: eligibilitiesWithIndicators
          .filter((e) => e.state === 'MARKED_PAID')
          .reduce((sum, e) => sum + e.eligibleAmount, 0),
        countByState: {
          NOT_DUE: eligibilitiesWithIndicators.filter((e) => e.state === 'NOT_DUE').length,
          DUE_PENDING_VERIFICATION: eligibilitiesWithIndicators.filter(
            (e) => e.state === 'DUE_PENDING_VERIFICATION'
          ).length,
          VERIFIED_NOT_ELIGIBLE: eligibilitiesWithIndicators.filter(
            (e) => e.state === 'VERIFIED_NOT_ELIGIBLE'
          ).length,
          PARTIALLY_ELIGIBLE: eligibilitiesWithIndicators.filter(
            (e) => e.state === 'PARTIALLY_ELIGIBLE'
          ).length,
          FULLY_ELIGIBLE: eligibilitiesWithIndicators.filter(
            (e) => e.state === 'FULLY_ELIGIBLE'
          ).length,
          BLOCKED: eligibilitiesWithIndicators.filter((e) => e.state === 'BLOCKED').length,
          MARKED_PAID: eligibilitiesWithIndicators.filter((e) => e.state === 'MARKED_PAID')
            .length,
        },
        // Urgent items (due soon or overdue)
        urgentCount: eligibilitiesWithIndicators.filter((e) => e.indicator.isUrgent).length,
      };

      return { eligibilitiesWithIndicators, summary };
    });

    return NextResponse.json({
      success: true,
      data: {
        eligibilities: eligibilitiesWithIndicators,
        summary,
        // Permissions for bulk actions (if any)
        permissions: {
          canBlock: RoleGuard.canBlockPayment(auth),
          canMarkPaid: RoleGuard.canMarkPaid(auth),
          canUnblock: RoleGuard.canUnblockPayment(auth),
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
    console.error('Project eligibilities get error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
