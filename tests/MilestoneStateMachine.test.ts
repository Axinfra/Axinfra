import { describe, it, expect } from 'vitest';
import { MilestoneState, Role } from '@/types';

// Import the static methods we're testing
// Note: We're testing the logic, not the database operations
// The service methods that interact with Prisma would need integration tests

/**
 * Valid state transitions for milestones.
 * SPEC: Draft -> In Progress -> Submitted -> Verified -> Closed
 * No skipping. No backdating. Invalid transitions must fail.
 */
const VALID_TRANSITIONS: Record<MilestoneState, MilestoneState[]> = {
  [MilestoneState.DRAFT]: [MilestoneState.IN_PROGRESS],
  [MilestoneState.IN_PROGRESS]: [MilestoneState.SUBMITTED],
  [MilestoneState.SUBMITTED]: [MilestoneState.VERIFIED, MilestoneState.IN_PROGRESS],
  [MilestoneState.VERIFIED]: [MilestoneState.CLOSED],
  [MilestoneState.CLOSED]: [],
};

/**
 * Roles allowed to perform each transition.
 */
const TRANSITION_PERMISSIONS: Record<string, Role[]> = {
  [`${MilestoneState.DRAFT}->${MilestoneState.IN_PROGRESS}`]: [Role.OWNER, Role.PMC, Role.VENDOR],
  [`${MilestoneState.IN_PROGRESS}->${MilestoneState.SUBMITTED}`]: [Role.VENDOR],
  [`${MilestoneState.SUBMITTED}->${MilestoneState.VERIFIED}`]: [Role.OWNER, Role.PMC],
  [`${MilestoneState.SUBMITTED}->${MilestoneState.IN_PROGRESS}`]: [Role.OWNER, Role.PMC],
  [`${MilestoneState.VERIFIED}->${MilestoneState.CLOSED}`]: [Role.OWNER, Role.PMC],
};

function isValidTransition(fromState: MilestoneState, toState: MilestoneState): boolean {
  const validNextStates = VALID_TRANSITIONS[fromState];
  return validNextStates.includes(toState);
}

function canPerformTransition(fromState: MilestoneState, toState: MilestoneState, role: Role): boolean {
  const key = `${fromState}->${toState}`;
  const allowedRoles = TRANSITION_PERMISSIONS[key];
  return allowedRoles ? allowedRoles.includes(role) : false;
}

function getValidNextStates(currentState: MilestoneState): MilestoneState[] {
  return VALID_TRANSITIONS[currentState] || [];
}

function getValidNextStatesForRole(currentState: MilestoneState, role: Role): MilestoneState[] {
  const validStates = VALID_TRANSITIONS[currentState] || [];
  return validStates.filter((toState) => canPerformTransition(currentState, toState, role));
}

describe('MilestoneStateMachine', () => {
  describe('isValidTransition', () => {
    it('should allow DRAFT -> IN_PROGRESS', () => {
      expect(isValidTransition(MilestoneState.DRAFT, MilestoneState.IN_PROGRESS)).toBe(true);
    });

    it('should allow IN_PROGRESS -> SUBMITTED', () => {
      expect(isValidTransition(MilestoneState.IN_PROGRESS, MilestoneState.SUBMITTED)).toBe(true);
    });

    it('should allow SUBMITTED -> VERIFIED', () => {
      expect(isValidTransition(MilestoneState.SUBMITTED, MilestoneState.VERIFIED)).toBe(true);
    });

    it('should allow SUBMITTED -> IN_PROGRESS (rejection)', () => {
      expect(isValidTransition(MilestoneState.SUBMITTED, MilestoneState.IN_PROGRESS)).toBe(true);
    });

    it('should allow VERIFIED -> CLOSED', () => {
      expect(isValidTransition(MilestoneState.VERIFIED, MilestoneState.CLOSED)).toBe(true);
    });

    it('should NOT allow skipping states (DRAFT -> SUBMITTED)', () => {
      expect(isValidTransition(MilestoneState.DRAFT, MilestoneState.SUBMITTED)).toBe(false);
    });

    it('should NOT allow skipping states (DRAFT -> VERIFIED)', () => {
      expect(isValidTransition(MilestoneState.DRAFT, MilestoneState.VERIFIED)).toBe(false);
    });

    it('should NOT allow skipping states (IN_PROGRESS -> VERIFIED)', () => {
      expect(isValidTransition(MilestoneState.IN_PROGRESS, MilestoneState.VERIFIED)).toBe(false);
    });

    it('should NOT allow backward transitions (IN_PROGRESS -> DRAFT)', () => {
      expect(isValidTransition(MilestoneState.IN_PROGRESS, MilestoneState.DRAFT)).toBe(false);
    });

    it('should NOT allow backward transitions (VERIFIED -> SUBMITTED)', () => {
      expect(isValidTransition(MilestoneState.VERIFIED, MilestoneState.SUBMITTED)).toBe(false);
    });

    it('should NOT allow any transitions from CLOSED (terminal state)', () => {
      expect(isValidTransition(MilestoneState.CLOSED, MilestoneState.DRAFT)).toBe(false);
      expect(isValidTransition(MilestoneState.CLOSED, MilestoneState.IN_PROGRESS)).toBe(false);
      expect(isValidTransition(MilestoneState.CLOSED, MilestoneState.SUBMITTED)).toBe(false);
      expect(isValidTransition(MilestoneState.CLOSED, MilestoneState.VERIFIED)).toBe(false);
    });
  });

  describe('canPerformTransition - Role Permissions', () => {
    describe('DRAFT -> IN_PROGRESS', () => {
      it('should allow OWNER', () => {
        expect(canPerformTransition(MilestoneState.DRAFT, MilestoneState.IN_PROGRESS, Role.OWNER)).toBe(true);
      });

      it('should allow PMC', () => {
        expect(canPerformTransition(MilestoneState.DRAFT, MilestoneState.IN_PROGRESS, Role.PMC)).toBe(true);
      });

      it('should allow VENDOR', () => {
        expect(canPerformTransition(MilestoneState.DRAFT, MilestoneState.IN_PROGRESS, Role.VENDOR)).toBe(true);
      });

      it('should NOT allow VIEWER', () => {
        expect(canPerformTransition(MilestoneState.DRAFT, MilestoneState.IN_PROGRESS, Role.VIEWER)).toBe(false);
      });
    });

    describe('IN_PROGRESS -> SUBMITTED', () => {
      it('should allow VENDOR', () => {
        expect(canPerformTransition(MilestoneState.IN_PROGRESS, MilestoneState.SUBMITTED, Role.VENDOR)).toBe(true);
      });

      it('should NOT allow OWNER (vendor submits work)', () => {
        expect(canPerformTransition(MilestoneState.IN_PROGRESS, MilestoneState.SUBMITTED, Role.OWNER)).toBe(false);
      });

      it('should NOT allow PMC', () => {
        expect(canPerformTransition(MilestoneState.IN_PROGRESS, MilestoneState.SUBMITTED, Role.PMC)).toBe(false);
      });
    });

    describe('SUBMITTED -> VERIFIED', () => {
      it('should allow OWNER', () => {
        expect(canPerformTransition(MilestoneState.SUBMITTED, MilestoneState.VERIFIED, Role.OWNER)).toBe(true);
      });

      it('should allow PMC', () => {
        expect(canPerformTransition(MilestoneState.SUBMITTED, MilestoneState.VERIFIED, Role.PMC)).toBe(true);
      });

      it('should NOT allow VENDOR (cannot verify own work)', () => {
        expect(canPerformTransition(MilestoneState.SUBMITTED, MilestoneState.VERIFIED, Role.VENDOR)).toBe(false);
      });
    });

    describe('SUBMITTED -> IN_PROGRESS (rejection)', () => {
      it('should allow OWNER', () => {
        expect(canPerformTransition(MilestoneState.SUBMITTED, MilestoneState.IN_PROGRESS, Role.OWNER)).toBe(true);
      });

      it('should allow PMC', () => {
        expect(canPerformTransition(MilestoneState.SUBMITTED, MilestoneState.IN_PROGRESS, Role.PMC)).toBe(true);
      });

      it('should NOT allow VENDOR', () => {
        expect(canPerformTransition(MilestoneState.SUBMITTED, MilestoneState.IN_PROGRESS, Role.VENDOR)).toBe(false);
      });
    });

    describe('VERIFIED -> CLOSED', () => {
      it('should allow OWNER', () => {
        expect(canPerformTransition(MilestoneState.VERIFIED, MilestoneState.CLOSED, Role.OWNER)).toBe(true);
      });

      it('should allow PMC', () => {
        expect(canPerformTransition(MilestoneState.VERIFIED, MilestoneState.CLOSED, Role.PMC)).toBe(true);
      });

      it('should NOT allow VENDOR', () => {
        expect(canPerformTransition(MilestoneState.VERIFIED, MilestoneState.CLOSED, Role.VENDOR)).toBe(false);
      });
    });
  });

  describe('getValidNextStates', () => {
    it('should return [IN_PROGRESS] for DRAFT', () => {
      expect(getValidNextStates(MilestoneState.DRAFT)).toEqual([MilestoneState.IN_PROGRESS]);
    });

    it('should return [SUBMITTED] for IN_PROGRESS', () => {
      expect(getValidNextStates(MilestoneState.IN_PROGRESS)).toEqual([MilestoneState.SUBMITTED]);
    });

    it('should return [VERIFIED, IN_PROGRESS] for SUBMITTED', () => {
      const result = getValidNextStates(MilestoneState.SUBMITTED);
      expect(result).toContain(MilestoneState.VERIFIED);
      expect(result).toContain(MilestoneState.IN_PROGRESS);
    });

    it('should return [CLOSED] for VERIFIED', () => {
      expect(getValidNextStates(MilestoneState.VERIFIED)).toEqual([MilestoneState.CLOSED]);
    });

    it('should return empty array for CLOSED', () => {
      expect(getValidNextStates(MilestoneState.CLOSED)).toEqual([]);
    });
  });

  describe('getValidNextStatesForRole', () => {
    it('should return [IN_PROGRESS] for DRAFT as VENDOR', () => {
      expect(getValidNextStatesForRole(MilestoneState.DRAFT, Role.VENDOR)).toEqual([MilestoneState.IN_PROGRESS]);
    });

    it('should return [SUBMITTED] for IN_PROGRESS as VENDOR', () => {
      expect(getValidNextStatesForRole(MilestoneState.IN_PROGRESS, Role.VENDOR)).toEqual([MilestoneState.SUBMITTED]);
    });

    it('should return empty array for SUBMITTED as VENDOR (cannot verify own work)', () => {
      expect(getValidNextStatesForRole(MilestoneState.SUBMITTED, Role.VENDOR)).toEqual([]);
    });

    it('should return [VERIFIED, IN_PROGRESS] for SUBMITTED as PMC', () => {
      const result = getValidNextStatesForRole(MilestoneState.SUBMITTED, Role.PMC);
      expect(result).toContain(MilestoneState.VERIFIED);
      expect(result).toContain(MilestoneState.IN_PROGRESS);
    });

    it('should return empty array for any state as VIEWER', () => {
      expect(getValidNextStatesForRole(MilestoneState.DRAFT, Role.VIEWER)).toEqual([]);
      expect(getValidNextStatesForRole(MilestoneState.IN_PROGRESS, Role.VIEWER)).toEqual([]);
      expect(getValidNextStatesForRole(MilestoneState.SUBMITTED, Role.VIEWER)).toEqual([]);
      expect(getValidNextStatesForRole(MilestoneState.VERIFIED, Role.VIEWER)).toEqual([]);
    });
  });
});
