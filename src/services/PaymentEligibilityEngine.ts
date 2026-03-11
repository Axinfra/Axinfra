/**
 * PaymentEligibilityEngine - CANONICAL SOURCE OF TRUTH
 *
 * GOVERNANCE RULES:
 * 1. This is the ONLY place where payment eligibility is calculated
 * 2. Frontend NEVER computes eligibility - only reads from this
 * 3. All roles read the SAME data
 * 4. Humans trigger EVENTS - the SYSTEM decides STATES
 * 5. State transitions follow a deterministic state machine
 *
 * SINGLE FUNCTION RULE:
 * recalculatePaymentEligibility(milestoneId) is the ONE function that:
 * - Reads verified quantities
 * - Reads BOQ rates
 * - Applies contract rules (retention, penalties, advances)
 * - Computes: eligibleAmount, blockedAmount, state, dueDate
 * - Writes to PaymentEligibility
 *
 * This function is called ONLY when:
 * - Evidence is verified or rejected
 * - A Change Request is approved
 * - A milestone state changes
 * - A block/unblock/mark-paid event occurs
 */

import {
  EligibilityState,
  EligibilityEventType,
  PaymentModel,
  MilestoneState,
  Role,
  AuditActionTypes,
  BlockingReasonCode,
  PaymentIndicator,
  ValidStateTransitions,
} from '@/types';
import { prisma } from '@/lib/db';
import { AuditLogger } from './AuditLogger';
import { getEnvNumber } from '@/lib/utils';
import { SystemEventService, SystemEventType } from './SystemEventService';

const PAYMENT_DUE_SOON_THRESHOLD_DAYS = getEnvNumber('PAYMENT_DUE_SOON_THRESHOLD_DAYS', 7);

/**
 * Result of eligibility calculation
 */
interface EligibilityCalculation {
  boqValueCompleted: number;
  deductions: number;
  eligibleAmount: number;
  advanceAmount: number;
  remainingAmount: number;
  blockedAmount: number;
  state: EligibilityState;
  dueDate: Date | null;
}

/**
 * PaymentEligibilityEngine - The SINGLE source of truth for payment eligibility
 */
export class PaymentEligibilityEngine {
  // ============================================
  // CORE CALCULATION FUNCTION - THE SINGLE SOURCE
  // ============================================

  /**
   * recalculatePaymentEligibility - THE ONE FUNCTION
   *
   * GOVERNANCE RULE: This is the ONLY function that writes to PaymentEligibility.
   * It must be called after ANY event that could affect payment eligibility.
   *
   * @param milestoneId - The milestone to recalculate
   * @param actorId - Who triggered the recalculation
   * @param actorRole - Role of the actor
   * @param eventType - What event triggered this recalculation
   * @param triggerEntityType - Type of entity that triggered (e.g., 'Evidence')
   * @param triggerEntityId - ID of triggering entity
   */
  static async recalculatePaymentEligibility(
    milestoneId: string,
    actorId: string,
    actorRole: Role,
    eventType: EligibilityEventType,
    triggerEntityType?: string,
    triggerEntityId?: string
  ): Promise<{ success: boolean; error?: string; eligibility?: EligibilityCalculation }> {
    try {
      // 1. Fetch all required data in one query
      const milestone = await prisma.milestone.findUnique({
        where: { id: milestoneId },
        include: {
          project: true,
          boqLinks: {
            include: {
              boqItem: true,
            },
          },
          verifications: {
            orderBy: { verifiedAt: 'desc' },
          },
          evidence: {
            where: { status: 'APPROVED' },
          },
          paymentEligibility: true,
        },
      });

      if (!milestone) {
        return { success: false, error: 'Milestone not found' };
      }

      // 2. Get current eligibility record (if exists)
      const currentEligibility = milestone.paymentEligibility;
      const previousState = (currentEligibility?.state as EligibilityState) ?? null;
      const previousAmount = currentEligibility?.eligibleAmount ?? 0;

      // 3. Calculate new values based on payment model and milestone state
      // Cast Prisma string fields to typed enums for internal computation
      const typedMilestone = {
        ...milestone,
        paymentModel: milestone.paymentModel as PaymentModel,
        state: milestone.state as MilestoneState,
      };
      const calculation = await this.computeEligibility(typedMilestone);

      // 4. Determine the new state
      let newState = this.determineState(
        calculation,
        typedMilestone.state,
        milestone.plannedEnd,
        previousState
      );

      // 5. Handle human-triggered state overrides (BLOCKED, MARKED_PAID)
      // These states are NOT recalculated - they persist until explicitly changed
      if (
        currentEligibility &&
        (previousState === EligibilityState.BLOCKED ||
          previousState === EligibilityState.MARKED_PAID)
      ) {
        // Keep the human-set state unless this is an unblock or mark-paid event
        if (
          eventType !== EligibilityEventType.UNBLOCKED_BY_OWNER &&
          eventType !== EligibilityEventType.MARKED_PAID_BY_OWNER &&
          eventType !== EligibilityEventType.MARKED_PAID_BY_PMC
        ) {
          newState = previousState;
        }
      }

      // 6. Validate state transition
      if (previousState && !this.isValidTransition(previousState, newState)) {
        // If invalid transition, keep the current state unless it's a system override
        if (
          eventType !== EligibilityEventType.RECALCULATION_TRIGGERED &&
          eventType !== EligibilityEventType.UNBLOCKED_BY_OWNER
        ) {
          newState = previousState;
        }
      }

      // 7. Upsert the eligibility record
      const eligibilityRecord = await prisma.paymentEligibility.upsert({
        where: { milestoneId },
        create: {
          milestoneId,
          boqValueCompleted: calculation.boqValueCompleted,
          deductions: calculation.deductions,
          eligibleAmount: calculation.eligibleAmount,
          advanceAmount: calculation.advanceAmount,
          remainingAmount: calculation.remainingAmount,
          blockedAmount: calculation.blockedAmount,
          state: newState,
          dueDate: calculation.dueDate,
          lastCalculatedAt: new Date(),
        },
        update: {
          boqValueCompleted: calculation.boqValueCompleted,
          deductions: calculation.deductions,
          eligibleAmount: calculation.eligibleAmount,
          advanceAmount: calculation.advanceAmount,
          remainingAmount: calculation.remainingAmount,
          blockedAmount:
            newState === EligibilityState.BLOCKED ? calculation.eligibleAmount : 0,
          state: newState,
          dueDate: calculation.dueDate,
          lastCalculatedAt: new Date(),
        },
      });

      // 8. Create eligibility event for audit trail
      await prisma.eligibilityEvent.create({
        data: {
          paymentEligibilityId: eligibilityRecord.id,
          eventType,
          fromState: previousState,
          toState: newState,
          actorId,
          actorRole,
          eligibleAmountBefore: previousAmount,
          eligibleAmountAfter: calculation.eligibleAmount,
          triggerEntityType,
          triggerEntityId,
        },
      });

      // 9. Log to audit system
      await AuditLogger.log({
        projectId: milestone.projectId,
        actorId,
        role: actorRole,
        actionType: AuditActionTypes.ELIGIBILITY_RECALCULATED,
        entityType: 'PaymentEligibility',
        entityId: eligibilityRecord.id,
        beforeJson: currentEligibility
          ? {
              state: previousState,
              eligibleAmount: previousAmount,
            }
          : null,
        afterJson: {
          state: newState,
          eligibleAmount: calculation.eligibleAmount,
          boqValueCompleted: calculation.boqValueCompleted,
          deductions: calculation.deductions,
        },
      });

      // Viseron Intelligence: emit system event for analytics pipeline
      SystemEventService.emit(SystemEventType.ELIGIBILITY_RECALCULATED, milestone.projectId, 'PaymentEligibility', eligibilityRecord.id, actorId, {
        milestoneId,
        fromState: previousState,
        toState: newState,
        eligibleAmount: calculation.eligibleAmount,
        eventType,
      });

      return {
        success: true,
        eligibility: { ...calculation, state: newState },
      };
    } catch (error) {
      console.error('PaymentEligibilityEngine.recalculatePaymentEligibility error:', error);
      return { success: false, error: 'Failed to recalculate eligibility' };
    }
  }

  // ============================================
  // COMPUTATION HELPERS (INTERNAL ONLY)
  // ============================================

  /**
   * Compute eligibility values based on milestone data.
   * INTERNAL USE ONLY - never call from frontend.
   *
   * SIMPLIFIED MODEL:
   * - Milestone has a fixed `value` and `advancePercent`
   * - advanceAmount = value * (advancePercent / 100)
   * - remainingAmount = value - advanceAmount
   * - Payment is ONLY eligible when milestone state is VERIFIED
   * - Advance % is just informational (shows what was paid upfront)
   */
  private static async computeEligibility(milestone: {
    id: string;
    paymentModel: PaymentModel;
    state: MilestoneState;
    retentionPercent: number;
    advancePercent: number;
    value: number;
    plannedEnd: Date | null;
    boqLinks: Array<{
      plannedQty: number;
      boqItem: {
        rate: number;
      };
    }>;
    verifications: Array<{
      qtyVerified: number;
      valueEligibleComputed: number;
    }>;
  }): Promise<Omit<EligibilityCalculation, 'state'>> {
    // Use the milestone's stored value (not calculated from BOQ)
    const totalValue = milestone.value;

    // Calculate advance and remaining based on advancePercent
    const advanceAmount = totalValue * (milestone.advancePercent / 100);
    const remainingAmount = totalValue - advanceAmount;

    let boqValueCompleted = 0;
    let deductions = 0;
    let eligibleAmount = 0;

    // Payment is ONLY eligible when milestone is VERIFIED or CLOSED
    if (
      milestone.state === MilestoneState.VERIFIED ||
      milestone.state === MilestoneState.CLOSED
    ) {
      // Full amount eligible on verification
      eligibleAmount = totalValue;
      boqValueCompleted = totalValue;
    } else {
      // Not verified yet - nothing eligible
      eligibleAmount = 0;
      boqValueCompleted = 0;
    }

    return {
      boqValueCompleted,
      deductions,
      eligibleAmount,
      advanceAmount,
      remainingAmount,
      blockedAmount: 0, // Set by state, not computation
      dueDate: milestone.plannedEnd,
    };
  }

  /**
   * Determine the appropriate state based on computed values.
   * GOVERNANCE RULE: State is determined by SYSTEM, not humans.
   *
   * SIMPLIFIED RULES:
   * - Payment is ONLY eligible when state is VERIFIED
   * - NOT_DUE for all other states
   */
  private static determineState(
    calculation: Omit<EligibilityCalculation, 'state'>,
    milestoneState: MilestoneState,
    dueDate: Date | null,
    currentState?: EligibilityState | null
  ): EligibilityState {
    // If already paid, stay paid (terminal state)
    if (currentState === EligibilityState.MARKED_PAID) {
      return EligibilityState.MARKED_PAID;
    }

    // If blocked, stay blocked until explicitly unblocked
    if (currentState === EligibilityState.BLOCKED) {
      return EligibilityState.BLOCKED;
    }

    // VERIFIED or CLOSED = FULLY_ELIGIBLE automatically
    // Payment becomes eligible ONLY upon verification
    if (
      milestoneState === MilestoneState.VERIFIED ||
      milestoneState === MilestoneState.CLOSED
    ) {
      return EligibilityState.FULLY_ELIGIBLE;
    }

    // Not verified = NOT_DUE
    return EligibilityState.NOT_DUE;
  }

  /**
   * Validate state transition.
   * GOVERNANCE RULE: Only valid transitions are allowed.
   */
  private static isValidTransition(
    fromState: EligibilityState,
    toState: EligibilityState
  ): boolean {
    if (fromState === toState) return true;
    const validTargets = ValidStateTransitions[fromState] || [];
    return validTargets.includes(toState);
  }

  // ============================================
  // HUMAN EVENT HANDLERS
  // ============================================

  /**
   * Block a payment eligibility.
   * GOVERNANCE RULE: Blocking requires predefined reason + explanation.
   */
  static async block(
    milestoneId: string,
    reasonCode: BlockingReasonCode,
    explanation: string,
    actorId: string,
    actorRole: Role,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    // Validate role
    if (actorRole !== Role.OWNER && actorRole !== Role.PMC) {
      return { success: false, error: 'Only Owner or PMC can block payments' };
    }

    // Validate explanation
    if (!explanation || explanation.trim().length === 0) {
      return { success: false, error: 'Explanation is required for blocking' };
    }

    const eligibility = await prisma.paymentEligibility.findUnique({
      where: { milestoneId },
    });

    if (!eligibility) {
      return { success: false, error: 'Payment eligibility not found' };
    }

    // Cannot block if already paid
    if (eligibility.state === EligibilityState.MARKED_PAID) {
      return { success: false, error: 'Cannot block a paid item' };
    }

    // Cannot block if already blocked
    if (eligibility.state === EligibilityState.BLOCKED) {
      return { success: false, error: 'Item is already blocked' };
    }

    const previousState = eligibility.state;

    // Update eligibility with block info
    await prisma.paymentEligibility.update({
      where: { milestoneId },
      data: {
        state: EligibilityState.BLOCKED,
        blockedAmount: eligibility.eligibleAmount,
        blockReasonCode: reasonCode,
        blockExplanation: explanation,
        blockedAt: new Date(),
        blockedByActorId: actorId,
      },
    });

    // Create event
    const eventType =
      actorRole === Role.OWNER
        ? EligibilityEventType.BLOCKED_BY_OWNER
        : EligibilityEventType.BLOCKED_BY_PMC;

    await prisma.eligibilityEvent.create({
      data: {
        paymentEligibilityId: eligibility.id,
        eventType,
        fromState: previousState,
        toState: EligibilityState.BLOCKED,
        actorId,
        actorRole,
        eligibleAmountBefore: eligibility.eligibleAmount,
        eligibleAmountAfter: eligibility.eligibleAmount,
        reasonCode,
        explanation,
      },
    });

    // Audit log
    await AuditLogger.log({
      projectId,
      actorId,
      role: actorRole,
      actionType: AuditActionTypes.ELIGIBILITY_BLOCKED,
      entityType: 'PaymentEligibility',
      entityId: eligibility.id,
      beforeJson: { state: previousState },
      afterJson: { state: EligibilityState.BLOCKED, reasonCode },
      reason: explanation,
    });

    // Viseron Intelligence: emit system event for analytics pipeline
    SystemEventService.emit(SystemEventType.PAYMENT_BLOCKED, projectId, 'PaymentEligibility', eligibility.id, actorId, {
      milestoneId,
      reasonCode,
      fromState: previousState,
      blockedAmount: eligibility.eligibleAmount,
    });

    return { success: true };
  }

  /**
   * Unblock a payment eligibility.
   * GOVERNANCE RULE: Only Owner can unblock.
   */
  static async unblock(
    milestoneId: string,
    reason: string,
    actorId: string,
    actorRole: Role,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    // Only Owner can unblock
    if (actorRole !== Role.OWNER) {
      return { success: false, error: 'Only Owner can unblock payments' };
    }

    if (!reason || reason.trim().length === 0) {
      return { success: false, error: 'Reason is required for unblocking' };
    }

    const eligibility = await prisma.paymentEligibility.findUnique({
      where: { milestoneId },
    });

    if (!eligibility) {
      return { success: false, error: 'Payment eligibility not found' };
    }

    if (eligibility.state !== EligibilityState.BLOCKED) {
      return { success: false, error: 'Item is not blocked' };
    }

    // Recalculate to determine new state after unblock
    const result = await this.recalculatePaymentEligibility(
      milestoneId,
      actorId,
      actorRole,
      EligibilityEventType.UNBLOCKED_BY_OWNER
    );

    if (!result.success) {
      return result;
    }

    // Clear block info
    await prisma.paymentEligibility.update({
      where: { milestoneId },
      data: {
        blockedAmount: 0,
        blockReasonCode: null,
        blockExplanation: null,
        blockedAt: null,
        blockedByActorId: null,
      },
    });

    // Audit log
    await AuditLogger.log({
      projectId,
      actorId,
      role: actorRole,
      actionType: AuditActionTypes.ELIGIBILITY_UNBLOCKED,
      entityType: 'PaymentEligibility',
      entityId: eligibility.id,
      beforeJson: { state: EligibilityState.BLOCKED },
      afterJson: { state: result.eligibility?.state },
      reason,
    });

    // Viseron Intelligence: emit system event for analytics pipeline
    SystemEventService.emit(SystemEventType.PAYMENT_UNBLOCKED, projectId, 'PaymentEligibility', eligibility.id, actorId, {
      milestoneId,
      newState: result.eligibility?.state,
    });

    return { success: true };
  }

  /**
   * Mark payment as paid.
   * GOVERNANCE RULE: Only Owner or PMC can mark paid.
   */
  static async markPaid(
    milestoneId: string,
    explanation: string,
    actorId: string,
    actorRole: Role,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (actorRole !== Role.OWNER && actorRole !== Role.PMC) {
      return { success: false, error: 'Only Owner or PMC can mark payments as paid' };
    }

    if (!explanation || explanation.trim().length === 0) {
      return { success: false, error: 'Explanation is required' };
    }

    const eligibility = await prisma.paymentEligibility.findUnique({
      where: { milestoneId },
    });

    if (!eligibility) {
      return { success: false, error: 'Payment eligibility not found' };
    }

    if (eligibility.state === EligibilityState.BLOCKED) {
      return { success: false, error: 'Cannot mark blocked item as paid. Unblock first.' };
    }

    if (eligibility.state === EligibilityState.MARKED_PAID) {
      return { success: false, error: 'Item is already marked as paid' };
    }

    const previousState = eligibility.state;

    // Update eligibility
    await prisma.paymentEligibility.update({
      where: { milestoneId },
      data: {
        state: EligibilityState.MARKED_PAID,
        markedPaidAt: new Date(),
        markedPaidByActorId: actorId,
        paidExplanation: explanation,
      },
    });

    // Create event
    const eventType =
      actorRole === Role.OWNER
        ? EligibilityEventType.MARKED_PAID_BY_OWNER
        : EligibilityEventType.MARKED_PAID_BY_PMC;

    await prisma.eligibilityEvent.create({
      data: {
        paymentEligibilityId: eligibility.id,
        eventType,
        fromState: previousState,
        toState: EligibilityState.MARKED_PAID,
        actorId,
        actorRole,
        eligibleAmountBefore: eligibility.eligibleAmount,
        eligibleAmountAfter: eligibility.eligibleAmount,
        explanation,
      },
    });

    // Audit log
    await AuditLogger.log({
      projectId,
      actorId,
      role: actorRole,
      actionType: AuditActionTypes.ELIGIBILITY_MARKED_PAID,
      entityType: 'PaymentEligibility',
      entityId: eligibility.id,
      beforeJson: { state: previousState },
      afterJson: { state: EligibilityState.MARKED_PAID },
      reason: explanation,
    });

    // Viseron Intelligence: emit system event for analytics pipeline
    SystemEventService.emit(SystemEventType.PAYMENT_MARKED_PAID, projectId, 'PaymentEligibility', eligibility.id, actorId, {
      milestoneId,
      fromState: previousState,
      eligibleAmount: eligibility.eligibleAmount,
    });

    return { success: true };
  }

  // ============================================
  // QUERY METHODS (READ-ONLY)
  // ============================================

  /**
   * Get payment eligibility for a milestone.
   * GOVERNANCE RULE: All roles get the SAME data.
   */
  static async getEligibility(milestoneId: string) {
    return prisma.paymentEligibility.findUnique({
      where: { milestoneId },
      include: {
        milestone: {
          select: {
            id: true,
            title: true,
            paymentModel: true,
            state: true,
            retentionPercent: true,
            projectId: true,
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 10,
          include: {
            actor: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
    });
  }

  /**
   * Get all payment eligibilities for a project.
   * GOVERNANCE RULE: Same data for all roles.
   */
  static async getProjectEligibilities(projectId: string) {
    return prisma.paymentEligibility.findMany({
      where: {
        milestone: {
          projectId,
        },
      },
      include: {
        milestone: {
          select: {
            id: true,
            title: true,
            paymentModel: true,
            state: true,
          },
        },
        events: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  /**
   * Derive payment indicator from eligibility record.
   * GOVERNANCE RULE: This is a PURE FUNCTION - no DB access, deterministic output.
   */
  static derivePaymentIndicator(
    eligibility: {
      state: EligibilityState;
      eligibleAmount: number;
      blockedAmount: number;
      dueDate: Date | null;
    }
  ): PaymentIndicator {
    const now = new Date();
    let daysUntilDue: number | null = null;
    let daysOverdue: number | null = null;

    if (eligibility.dueDate) {
      const diffMs = eligibility.dueDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays >= 0) {
        daysUntilDue = diffDays;
      } else {
        daysOverdue = Math.abs(diffDays);
      }
    }

    switch (eligibility.state) {
      case EligibilityState.MARKED_PAID:
        return {
          indicator: 'PAID',
          displayLabel: 'Paid',
          displayColor: 'purple',
          eligibleAmount: eligibility.eligibleAmount,
          blockedAmount: 0,
          isUrgent: false,
          daysUntilDue: null,
          daysOverdue: null,
        };

      case EligibilityState.BLOCKED:
        return {
          indicator: 'BLOCKED',
          displayLabel: 'Blocked',
          displayColor: 'red',
          eligibleAmount: eligibility.eligibleAmount,
          blockedAmount: eligibility.blockedAmount,
          isUrgent: true,
          daysUntilDue,
          daysOverdue,
        };

      case EligibilityState.FULLY_ELIGIBLE:
      case EligibilityState.PARTIALLY_ELIGIBLE:
        // Check if overdue
        if (daysOverdue !== null && daysOverdue > 0) {
          return {
            indicator: 'OVERDUE',
            displayLabel: `Overdue (${daysOverdue}d)`,
            displayColor: 'red',
            eligibleAmount: eligibility.eligibleAmount,
            blockedAmount: 0,
            isUrgent: true,
            daysUntilDue: null,
            daysOverdue,
          };
        }

        // Check if due
        if (daysUntilDue !== null && daysUntilDue <= PAYMENT_DUE_SOON_THRESHOLD_DAYS) {
          return {
            indicator: 'ELIGIBLE_DUE',
            displayLabel: daysUntilDue === 0 ? 'Due Today' : `Due in ${daysUntilDue}d`,
            displayColor: 'green',
            eligibleAmount: eligibility.eligibleAmount,
            blockedAmount: 0,
            isUrgent: daysUntilDue <= 3,
            daysUntilDue,
            daysOverdue: null,
          };
        }

        // Eligible but not due yet
        return {
          indicator: 'ELIGIBLE_NOT_DUE',
          displayLabel: 'Eligible',
          displayColor: 'yellow',
          eligibleAmount: eligibility.eligibleAmount,
          blockedAmount: 0,
          isUrgent: false,
          daysUntilDue,
          daysOverdue: null,
        };

      case EligibilityState.DUE_PENDING_VERIFICATION:
        return {
          indicator: 'ELIGIBLE_NOT_DUE',
          displayLabel: 'Pending Verification',
          displayColor: 'yellow',
          eligibleAmount: eligibility.eligibleAmount,
          blockedAmount: 0,
          isUrgent: daysUntilDue !== null && daysUntilDue <= 3,
          daysUntilDue,
          daysOverdue,
        };

      case EligibilityState.NOT_DUE:
      case EligibilityState.VERIFIED_NOT_ELIGIBLE:
      default:
        return {
          indicator: 'NOT_DUE',
          displayLabel: 'Not Due',
          displayColor: 'gray',
          eligibleAmount: 0,
          blockedAmount: 0,
          isUrgent: false,
          daysUntilDue,
          daysOverdue: null,
        };
    }
  }

  // ============================================
  // ANALYTICS HELPERS
  // ============================================

  /**
   * Detect vendor exposure (advance paid > verified work).
   */
  static async detectVendorExposure(projectId: string): Promise<{
    vendorId: string;
    vendorName: string;
    advancePaid: number;
    verifiedWork: number;
    exposure: number;
  }[]> {
    // Single query: fetch vendors + advance milestones in parallel (no N+1)
    const [vendorRoles, advanceMilestones] = await Promise.all([
      prisma.projectRole.findMany({
        where: { projectId, role: Role.VENDOR },
        include: { user: true },
      }),
      prisma.milestone.findMany({
        where: { projectId, paymentModel: PaymentModel.ADVANCE },
        include: {
          paymentEligibility: true,
          verifications: { select: { valueEligibleComputed: true } },
        },
      }),
    ]);

    // Aggregate once for all vendors
    let totalAdvancePaid = 0;
    let totalVerifiedWork = 0;
    for (const ms of advanceMilestones) {
      if (ms.paymentEligibility?.state === EligibilityState.MARKED_PAID) {
        totalAdvancePaid += ms.paymentEligibility.eligibleAmount;
      }
      for (const v of ms.verifications) {
        totalVerifiedWork += v.valueEligibleComputed;
      }
    }

    const exposures = [];
    if (totalAdvancePaid > totalVerifiedWork) {
      for (const vendorRole of vendorRoles) {
        exposures.push({
          vendorId: vendorRole.userId,
          vendorName: vendorRole.user.name,
          advancePaid: totalAdvancePaid,
          verifiedWork: totalVerifiedWork,
          exposure: totalAdvancePaid - totalVerifiedWork,
        });
      }
    }

    return exposures;
  }

  /**
   * Detect BOQ overruns.
   */
  static async detectBOQOverruns(projectId: string): Promise<{
    boqItemId: string;
    description: string;
    plannedQty: number;
    verifiedQty: number;
    overrun: number;
  }[]> {
    const boq = await prisma.bOQ.findFirst({
      where: { projectId },
      include: {
        items: {
          include: {
            milestoneLinks: {
              include: {
                milestone: {
                  include: {
                    verifications: true,
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!boq) return [];

    const overruns = [];

    for (const item of boq.items) {
      let verifiedQty = 0;

      for (const link of item.milestoneLinks) {
        for (const v of link.milestone.verifications) {
          verifiedQty += v.qtyVerified;
        }
      }

      if (verifiedQty > item.plannedQty) {
        overruns.push({
          boqItemId: item.id,
          description: item.description,
          plannedQty: item.plannedQty,
          verifiedQty,
          overrun: verifiedQty - item.plannedQty,
        });
      }
    }

    return overruns;
  }
}
