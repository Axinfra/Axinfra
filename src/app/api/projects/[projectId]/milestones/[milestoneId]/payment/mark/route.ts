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
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { validateMilestoneOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { PaymentEligibilityEngine } from '@/services/PaymentEligibilityEngine';
import { BlockingReasonCode, BlockingReasonCodes, EligibilityState } from '@/types';
import { z } from 'zod';

const blockSchema = z.object({
  action: z.literal('block'),
  reasonCode: z.enum(Object.keys(BlockingReasonCodes) as [string, ...string[]]),
  explanation: z.string().min(1, 'Explanation is required for blocking'),
});

const unblockSchema = z.object({
  action: z.literal('unblock'),
  reason: z.string().min(1, 'Reason is required for unblocking'),
});

const markPaidSchema = z.object({
  action: z.literal('markPaid'),
  explanation: z.string().min(1, 'Explanation is required'),
});

const actionSchema = z.discriminatedUnion('action', [
  blockSchema,
  unblockSchema,
  markPaidSchema,
]);

/**
 * POST /api/projects/[projectId]/milestones/[milestoneId]/payment/mark
 *
 * Valid actions:
 * - markPaid: Owner confirms payment → payment MARKED_PAID + milestone CLOSED + notify Vendor + PMC
 * - block:    Owner marks payment not done + reason → notify Vendor + PMC
 * - unblock:  Owner unblocks a previously not-done payment
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

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
        if (!RoleGuard.canBlockPayment(auth)) {
          return NextResponse.json(
            { success: false, error: 'Only Owner or PMC can block payments' },
            { status: 403 }
          );
        }
        result = await PaymentEligibilityEngine.block(
          milestoneId,
          data.reasonCode as BlockingReasonCode,
          data.explanation,
          auth.userId,
          auth.role,
          projectId
        );
        // Notify Vendor + PMC that payment was marked not done
        if (result.success) {
          try {
            const ms = await prisma.milestone.findUnique({
              where: { id: milestoneId },
              select: { title: true, vendorUserId: true },
            });
            const title = ms?.title ?? 'Milestone';
            const reasonText = data.explanation ? `: ${data.explanation}` : '';
            await prisma.systemEvent.create({
              data: {
                eventType: 'PAYMENT_NOT_DONE',
                severity: 'WARNING',
                actorId: auth.userId,
                projectId,
                entityType: 'Milestone',
                entityId: milestoneId,
                message: `Payment for "${title}" was not released${reasonText}.`,
              },
            });
          } catch { /* best-effort */ }
        }
        break;

      case 'unblock':
        if (!RoleGuard.canUnblockPayment(auth)) {
          return NextResponse.json(
            { success: false, error: 'Only Owner can unblock payments' },
            { status: 403 }
          );
        }
        result = await PaymentEligibilityEngine.unblock(
          milestoneId,
          data.reason,
          auth.userId,
          auth.role,
          projectId
        );
        break;

      case 'markPaid':
        if (!RoleGuard.canMarkPaid(auth)) {
          return NextResponse.json(
            { success: false, error: 'Only Owner or PMC can mark payments as paid' },
            { status: 403 }
          );
        }
        // Atomic: mark paid + close milestone in a single transaction
        result = await PaymentEligibilityEngine.markPaidAndClose(
          milestoneId,
          data.explanation,
          auth.userId,
          auth.role,
          projectId
        );
        // Notify Vendor + PMC (best-effort, after the atomic commit)
        if (result.success) {
          try {
            const ms = await prisma.milestone.findUnique({
              where: { id: milestoneId },
              select: { title: true, vendorUserId: true },
            });
            const title = ms?.title ?? 'Milestone';

            if (ms?.vendorUserId) {
              await prisma.systemEvent.create({
                data: {
                  eventType: 'PAYMENT_DONE',
                  severity: 'HIGH',
                  actorId: auth.userId,
                  projectId,
                  entityType: 'Milestone',
                  entityId: milestoneId,
                  message: `Payment for "${title}" has been released. Milestone is now closed.`,
                },
              });
            }

            await prisma.systemEvent.create({
              data: {
                eventType: 'PAYMENT_DONE',
                severity: 'INFO',
                actorId: auth.userId,
                projectId,
                entityType: 'Milestone',
                entityId: milestoneId,
                message: `Owner has released payment for "${title}". Milestone closed.`,
              },
            });
          } catch { /* best-effort */ }
        }
        break;
    }

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

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
