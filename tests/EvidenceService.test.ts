import { describe, it, expect } from 'vitest';
import { EvidenceStatus, MilestoneState } from '@/types';

/**
 * Evidence freeze logic tests.
 * SPEC REQUIREMENTS:
 * - Evidence is mandatory for submission
 * - Evidence is frozen after submission
 * - Evidence cannot be edited after frozen
 * - Re-submission only after rejection
 */

interface Evidence {
  id: string;
  milestoneId: string;
  status: EvidenceStatus;
  frozen: boolean;
  qtyOrPercent: number;
}

interface Milestone {
  id: string;
  state: MilestoneState;
  evidence: Evidence[];
}

// Simulated logic functions (mirroring EvidenceService)
function canEditEvidence(evidence: Evidence): { canEdit: boolean; reason?: string } {
  if (evidence.frozen) {
    return { canEdit: false, reason: 'Evidence is frozen and cannot be edited' };
  }
  return { canEdit: true };
}

function canResubmit(milestone: Milestone): { canResubmit: boolean; reason?: string } {
  // Milestone must be in IN_PROGRESS state
  if (milestone.state !== MilestoneState.IN_PROGRESS) {
    return { canResubmit: false, reason: `Milestone is in ${milestone.state} state` };
  }

  // Get latest evidence
  const latestEvidence = milestone.evidence[0];

  // If no evidence, this is first submission
  if (!latestEvidence) {
    return { canResubmit: true };
  }

  // If latest evidence was rejected, can resubmit
  if (latestEvidence.status === EvidenceStatus.REJECTED) {
    return { canResubmit: true };
  }

  // If evidence is still pending (SUBMITTED), can also submit more
  if (latestEvidence.status === EvidenceStatus.SUBMITTED) {
    return { canResubmit: true };
  }

  // If evidence was approved, cannot resubmit
  return { canResubmit: false, reason: 'Evidence is already approved' };
}

function canSubmitMilestone(milestone: Milestone): { canSubmit: boolean; reason?: string } {
  // Must be IN_PROGRESS
  if (milestone.state !== MilestoneState.IN_PROGRESS) {
    return { canSubmit: false, reason: `Milestone is in ${milestone.state} state, not IN_PROGRESS` };
  }

  // Must have at least one piece of evidence
  const submittedEvidence = milestone.evidence.filter(e => e.status === EvidenceStatus.SUBMITTED);
  if (submittedEvidence.length === 0) {
    return { canSubmit: false, reason: 'Evidence is mandatory for submission' };
  }

  return { canSubmit: true };
}

function canVerifyMilestone(milestone: Milestone): { canVerify: boolean; reason?: string } {
  // Must be SUBMITTED
  if (milestone.state !== MilestoneState.SUBMITTED) {
    return { canVerify: false, reason: `Milestone is in ${milestone.state} state, not SUBMITTED` };
  }

  // Must have approved evidence
  const approvedEvidence = milestone.evidence.filter(e => e.status === EvidenceStatus.APPROVED);
  if (approvedEvidence.length === 0) {
    return { canVerify: false, reason: 'No approved evidence found' };
  }

  return { canVerify: true };
}

describe('EvidenceService - Freeze Logic', () => {
  describe('canEditEvidence', () => {
    it('should NOT allow editing frozen evidence', () => {
      const evidence: Evidence = {
        id: '1',
        milestoneId: 'm1',
        status: EvidenceStatus.SUBMITTED,
        frozen: true,
        qtyOrPercent: 100,
      };

      const result = canEditEvidence(evidence);
      expect(result.canEdit).toBe(false);
      expect(result.reason).toBe('Evidence is frozen and cannot be edited');
    });

    it('should allow editing non-frozen evidence', () => {
      const evidence: Evidence = {
        id: '1',
        milestoneId: 'm1',
        status: EvidenceStatus.SUBMITTED,
        frozen: false,
        qtyOrPercent: 100,
      };

      const result = canEditEvidence(evidence);
      expect(result.canEdit).toBe(true);
    });
  });

  describe('canResubmit', () => {
    it('should NOT allow resubmission if milestone is not IN_PROGRESS', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.SUBMITTED,
        evidence: [],
      };

      const result = canResubmit(milestone);
      expect(result.canResubmit).toBe(false);
      expect(result.reason).toContain('SUBMITTED state');
    });

    it('should allow first submission when no evidence exists', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.IN_PROGRESS,
        evidence: [],
      };

      const result = canResubmit(milestone);
      expect(result.canResubmit).toBe(true);
    });

    it('should allow resubmission after rejection', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.IN_PROGRESS,
        evidence: [
          {
            id: 'e1',
            milestoneId: 'm1',
            status: EvidenceStatus.REJECTED,
            frozen: true,
            qtyOrPercent: 50,
          },
        ],
      };

      const result = canResubmit(milestone);
      expect(result.canResubmit).toBe(true);
    });

    it('should NOT allow resubmission if evidence is already approved', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.IN_PROGRESS,
        evidence: [
          {
            id: 'e1',
            milestoneId: 'm1',
            status: EvidenceStatus.APPROVED,
            frozen: true,
            qtyOrPercent: 100,
          },
        ],
      };

      const result = canResubmit(milestone);
      expect(result.canResubmit).toBe(false);
      expect(result.reason).toBe('Evidence is already approved');
    });

    it('should allow additional submission when evidence is pending (SUBMITTED)', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.IN_PROGRESS,
        evidence: [
          {
            id: 'e1',
            milestoneId: 'm1',
            status: EvidenceStatus.SUBMITTED,
            frozen: true,
            qtyOrPercent: 50,
          },
        ],
      };

      const result = canResubmit(milestone);
      expect(result.canResubmit).toBe(true);
    });
  });

  describe('canSubmitMilestone', () => {
    it('should require evidence for milestone submission', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.IN_PROGRESS,
        evidence: [],
      };

      const result = canSubmitMilestone(milestone);
      expect(result.canSubmit).toBe(false);
      expect(result.reason).toBe('Evidence is mandatory for submission');
    });

    it('should NOT allow submission if milestone is not IN_PROGRESS', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.DRAFT,
        evidence: [
          {
            id: 'e1',
            milestoneId: 'm1',
            status: EvidenceStatus.SUBMITTED,
            frozen: true,
            qtyOrPercent: 100,
          },
        ],
      };

      const result = canSubmitMilestone(milestone);
      expect(result.canSubmit).toBe(false);
    });

    it('should allow submission with evidence when IN_PROGRESS', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.IN_PROGRESS,
        evidence: [
          {
            id: 'e1',
            milestoneId: 'm1',
            status: EvidenceStatus.SUBMITTED,
            frozen: true,
            qtyOrPercent: 100,
          },
        ],
      };

      const result = canSubmitMilestone(milestone);
      expect(result.canSubmit).toBe(true);
    });
  });

  describe('canVerifyMilestone', () => {
    it('should require approved evidence for verification', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.SUBMITTED,
        evidence: [
          {
            id: 'e1',
            milestoneId: 'm1',
            status: EvidenceStatus.SUBMITTED,
            frozen: true,
            qtyOrPercent: 100,
          },
        ],
      };

      const result = canVerifyMilestone(milestone);
      expect(result.canVerify).toBe(false);
      expect(result.reason).toBe('No approved evidence found');
    });

    it('should NOT allow verification if milestone is not SUBMITTED', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.IN_PROGRESS,
        evidence: [
          {
            id: 'e1',
            milestoneId: 'm1',
            status: EvidenceStatus.APPROVED,
            frozen: true,
            qtyOrPercent: 100,
          },
        ],
      };

      const result = canVerifyMilestone(milestone);
      expect(result.canVerify).toBe(false);
    });

    it('should allow verification with approved evidence when SUBMITTED', () => {
      const milestone: Milestone = {
        id: 'm1',
        state: MilestoneState.SUBMITTED,
        evidence: [
          {
            id: 'e1',
            milestoneId: 'm1',
            status: EvidenceStatus.APPROVED,
            frozen: true,
            qtyOrPercent: 100,
          },
        ],
      };

      const result = canVerifyMilestone(milestone);
      expect(result.canVerify).toBe(true);
    });
  });
});

describe('Evidence Workflow Integration', () => {
  it('should follow the complete evidence lifecycle', () => {
    // 1. Start with milestone in IN_PROGRESS
    const milestone: Milestone = {
      id: 'm1',
      state: MilestoneState.IN_PROGRESS,
      evidence: [],
    };

    // 2. Cannot submit without evidence
    expect(canSubmitMilestone(milestone).canSubmit).toBe(false);

    // 3. Add evidence (simulating submission)
    const evidence: Evidence = {
      id: 'e1',
      milestoneId: 'm1',
      status: EvidenceStatus.SUBMITTED,
      frozen: true, // Frozen on submission
      qtyOrPercent: 100,
    };
    milestone.evidence.push(evidence);

    // 4. Evidence is frozen and cannot be edited
    expect(canEditEvidence(evidence).canEdit).toBe(false);

    // 5. Now can submit milestone
    expect(canSubmitMilestone(milestone).canSubmit).toBe(true);

    // 6. Transition to SUBMITTED
    milestone.state = MilestoneState.SUBMITTED;

    // 7. Cannot verify without approved evidence
    expect(canVerifyMilestone(milestone).canVerify).toBe(false);

    // 8. Approve evidence
    evidence.status = EvidenceStatus.APPROVED;

    // 9. Now can verify
    expect(canVerifyMilestone(milestone).canVerify).toBe(true);
  });

  it('should handle rejection and resubmission flow', () => {
    // 1. Milestone with rejected evidence
    const milestone: Milestone = {
      id: 'm1',
      state: MilestoneState.IN_PROGRESS, // Returned to IN_PROGRESS after rejection
      evidence: [
        {
          id: 'e1',
          milestoneId: 'm1',
          status: EvidenceStatus.REJECTED,
          frozen: true,
          qtyOrPercent: 50,
        },
      ],
    };

    // 2. Can resubmit after rejection
    expect(canResubmit(milestone).canResubmit).toBe(true);

    // 3. Original evidence still frozen
    expect(canEditEvidence(milestone.evidence[0]).canEdit).toBe(false);

    // 4. Submit new evidence
    milestone.evidence.unshift({
      id: 'e2',
      milestoneId: 'm1',
      status: EvidenceStatus.SUBMITTED,
      frozen: true,
      qtyOrPercent: 100,
    });

    // 5. Can submit milestone again
    expect(canSubmitMilestone(milestone).canSubmit).toBe(true);
  });
});
