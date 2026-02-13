import { MilestoneState, Role, EligibilityEventType, AuditActionTypes } from '@/types';
import { prisma } from '@/lib/db';
import { AuditLogger } from './AuditLogger';
import { PaymentEligibilityEngine } from './PaymentEligibilityEngine';

/**
 * Valid state transitions for milestones.
 * SPEC: Draft -> In Progress -> Submitted -> Verified -> Closed
 * No skipping. No backdating. Invalid transitions must fail.
 */
const VALID_TRANSITIONS: Record<MilestoneState, MilestoneState[]> = {
  [MilestoneState.DRAFT]: [MilestoneState.IN_PROGRESS],
  [MilestoneState.IN_PROGRESS]: [MilestoneState.SUBMITTED],
  [MilestoneState.SUBMITTED]: [MilestoneState.VERIFIED, MilestoneState.IN_PROGRESS], // IN_PROGRESS only on rejection
  [MilestoneState.VERIFIED]: [MilestoneState.CLOSED],
  [MilestoneState.CLOSED]: [], // Terminal state
};

/**
 * Roles allowed to perform each transition.
 */
const TRANSITION_PERMISSIONS: Record<string, Role[]> = {
  // From DRAFT
  [`${MilestoneState.DRAFT}->${MilestoneState.IN_PROGRESS}`]: [Role.OWNER, Role.PMC, Role.VENDOR],

  // From IN_PROGRESS
  [`${MilestoneState.IN_PROGRESS}->${MilestoneState.SUBMITTED}`]: [Role.VENDOR],

  // From SUBMITTED
  [`${MilestoneState.SUBMITTED}->${MilestoneState.VERIFIED}`]: [Role.OWNER, Role.PMC],
  [`${MilestoneState.SUBMITTED}->${MilestoneState.IN_PROGRESS}`]: [Role.OWNER, Role.PMC], // Rejection

  // From VERIFIED
  [`${MilestoneState.VERIFIED}->${MilestoneState.CLOSED}`]: [Role.OWNER, Role.PMC],
};

export interface TransitionResult {
  success: boolean;
  milestone?: {
    id: string;
    state: MilestoneState;
    previousState: MilestoneState;
  };
  error?: string;
}

/**
 * MilestoneStateMachine - Enforces the strict milestone state machine.
 *
 * SPEC: Every milestone follows exact sequence: Draft -> In Progress -> Submitted -> Verified -> Closed
 * Invalid transitions are blocked. States cannot be skipped. Backdating is not allowed.
 * All transitions are logged.
 */
export class MilestoneStateMachine {
  /**
   * Check if a transition is valid.
   */
  static isValidTransition(fromState: MilestoneState, toState: MilestoneState): boolean {
    const validNextStates = VALID_TRANSITIONS[fromState];
    return validNextStates.includes(toState);
  }

  /**
   * Check if a role can perform a transition.
   */
  static canPerformTransition(fromState: MilestoneState, toState: MilestoneState, role: Role): boolean {
    const key = `${fromState}->${toState}`;
    const allowedRoles = TRANSITION_PERMISSIONS[key];
    return allowedRoles ? allowedRoles.includes(role) : false;
  }

  /**
   * Get valid next states for a given state.
   */
  static getValidNextStates(currentState: MilestoneState): MilestoneState[] {
    return VALID_TRANSITIONS[currentState] || [];
  }

  /**
   * Get valid next states that a specific role can transition to.
   */
  static getValidNextStatesForRole(currentState: MilestoneState, role: Role): MilestoneState[] {
    const validStates = VALID_TRANSITIONS[currentState] || [];
    return validStates.filter((toState) => this.canPerformTransition(currentState, toState, role));
  }

  /**
   * Perform a state transition with full validation and audit logging.
   */
  static async transition(
    milestoneId: string,
    toState: MilestoneState,
    actorId: string,
    role: Role,
    projectId: string,
    reason?: string
  ): Promise<TransitionResult> {
    // Get current milestone state
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
    });

    if (!milestone) {
      return { success: false, error: 'Milestone not found' };
    }

    const fromState = milestone.state as MilestoneState;

    // Validate transition
    if (!this.isValidTransition(fromState, toState)) {
      return {
        success: false,
        error: `Invalid transition: ${fromState} -> ${toState}. Valid next states: ${VALID_TRANSITIONS[fromState].join(', ') || 'none'}`,
      };
    }

    // Check role permission
    if (!this.canPerformTransition(fromState, toState, role)) {
      return {
        success: false,
        error: `Role ${role} cannot perform transition: ${fromState} -> ${toState}`,
      };
    }

    // Special validation for SUBMITTED state (requires evidence)
    if (toState === MilestoneState.SUBMITTED) {
      const hasEvidence = await prisma.evidence.count({
        where: { milestoneId, status: 'SUBMITTED' },
      });
      if (hasEvidence === 0) {
        return {
          success: false,
          error: 'Cannot submit milestone without evidence',
        };
      }
    }

    // Special validation for rejection (SUBMITTED -> IN_PROGRESS)
    if (fromState === MilestoneState.SUBMITTED && toState === MilestoneState.IN_PROGRESS) {
      if (!reason) {
        return {
          success: false,
          error: 'Rejection requires a reason',
        };
      }
    }

    // Perform transaction
    const result = await prisma.$transaction(async (tx) => {
      // Update milestone state
      const updatedMilestone = await tx.milestone.update({
        where: { id: milestoneId },
        data: {
          state: toState,
          ...(toState === MilestoneState.IN_PROGRESS && fromState === MilestoneState.DRAFT
            ? { actualStart: new Date() }
            : {}),
          ...(toState === MilestoneState.SUBMITTED ? { actualSubmission: new Date() } : {}),
          ...(toState === MilestoneState.VERIFIED ? { actualVerification: new Date() } : {}),
        },
      });

      // Create transition record (immutable history)
      await tx.milestoneStateTransition.create({
        data: {
          milestoneId,
          fromState,
          toState,
          actorId,
          role,
          reason,
        },
      });

      return updatedMilestone;
    });

    // Log to audit trail
    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.MILESTONE_STATE_TRANSITION,
      entityType: 'Milestone',
      entityId: milestoneId,
      beforeJson: { state: fromState },
      afterJson: { state: toState },
      reason,
    });

    // GOVERNANCE: Trigger payment eligibility recalculation on state change
    // This ensures eligibility is updated when milestones are verified, closed, etc.
    await PaymentEligibilityEngine.recalculatePaymentEligibility(
      milestoneId,
      actorId,
      role,
      EligibilityEventType.MILESTONE_STATE_CHANGED,
      'Milestone',
      milestoneId
    );

    return {
      success: true,
      milestone: {
        id: result.id,
        state: result.state as MilestoneState,
        previousState: fromState,
      },
    };
  }

  /**
   * Get transition history for a milestone.
   */
  static async getTransitionHistory(milestoneId: string) {
    return prisma.milestoneStateTransition.findMany({
      where: { milestoneId },
      include: {
        actor: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  /**
   * Validate that a milestone can be submitted (has required evidence).
   */
  static async canSubmit(milestoneId: string): Promise<{ canSubmit: boolean; reason?: string }> {
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: {
        evidence: {
          where: { status: 'SUBMITTED' },
        },
      },
    });

    if (!milestone) {
      return { canSubmit: false, reason: 'Milestone not found' };
    }

    if (milestone.state !== MilestoneState.IN_PROGRESS) {
      return { canSubmit: false, reason: `Milestone is in ${milestone.state} state, not IN_PROGRESS` };
    }

    if (milestone.evidence.length === 0) {
      return { canSubmit: false, reason: 'Evidence is mandatory for submission' };
    }

    return { canSubmit: true };
  }

  /**
   * Validate that a milestone can be verified.
   */
  static async canVerify(milestoneId: string): Promise<{ canVerify: boolean; reason?: string }> {
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: {
        evidence: {
          where: { status: 'APPROVED' },
        },
      },
    });

    if (!milestone) {
      return { canVerify: false, reason: 'Milestone not found' };
    }

    if (milestone.state !== MilestoneState.SUBMITTED) {
      return { canVerify: false, reason: `Milestone is in ${milestone.state} state, not SUBMITTED` };
    }

    if (milestone.evidence.length === 0) {
      return { canVerify: false, reason: 'No approved evidence found' };
    }

    return { canVerify: true };
  }
}
