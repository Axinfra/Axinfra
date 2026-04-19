import { FollowUpType, FollowUpStatus, EligibilityState, EvidenceStatus, MilestoneState, Role, AuditActionTypes } from '@/types';
import { prisma } from '@/lib/db';
import { AuditLogger } from './AuditLogger';
import { getEnvNumber } from '@/lib/utils';
import { PaymentEligibilityEngine } from './PaymentEligibilityEngine';

const PENDING_REVIEW_THRESHOLD_DAYS = getEnvNumber('PENDING_REVIEW_THRESHOLD_DAYS', 3);
const PENDING_VERIFICATION_THRESHOLD_DAYS = getEnvNumber('PENDING_VERIFICATION_THRESHOLD_DAYS', 5);
const PAYMENT_DUE_SOON_THRESHOLD_DAYS = getEnvNumber('PAYMENT_DUE_SOON_THRESHOLD_DAYS', 7);
const PAYMENT_BLOCKED_THRESHOLD_DAYS = getEnvNumber('PAYMENT_BLOCKED_THRESHOLD_DAYS', 14);

/**
 * FollowUpScheduler - Creates and manages automatic follow-ups.
 *
 * SPEC: Auto follow-ups & escalation:
 * - Pending evidence review (older than X days)
 * - Pending verification (older than X days)
 * - Payment due soon
 * - Payment blocked too long
 * - High vendor exposure
 */
export class FollowUpScheduler {
  /**
   * Run all follow-up checks for a project.
   * Intended to be called by a cron job.
   */
  static async runProjectChecks(projectId: string): Promise<{
    created: number;
    types: Record<FollowUpType, number>;
  }> {
    const results: Record<FollowUpType, number> = {
      [FollowUpType.PENDING_EVIDENCE_REVIEW]: 0,
      [FollowUpType.PENDING_VERIFICATION]: 0,
      [FollowUpType.PAYMENT_DUE_SOON]: 0,
      [FollowUpType.PAYMENT_BLOCKED_TOO_LONG]: 0,
      [FollowUpType.HIGH_VENDOR_EXPOSURE]: 0,
      [FollowUpType.BOQ_OVERRUN]: 0,
    };

    // All six checks are independent (each writes a disjoint set of FollowUp rows keyed by type)
    const [
      pendingEvidenceReview,
      pendingVerification,
      paymentDueSoon,
      paymentBlockedTooLong,
      highVendorExposure,
      boqOverrun,
    ] = await Promise.all([
      this.checkPendingEvidenceReview(projectId),
      this.checkPendingVerification(projectId),
      this.checkPaymentDueSoon(projectId),
      this.checkBlockedTooLong(projectId),
      this.checkVendorExposure(projectId),
      this.checkBOQOverruns(projectId),
    ]);

    results[FollowUpType.PENDING_EVIDENCE_REVIEW] = pendingEvidenceReview;
    results[FollowUpType.PENDING_VERIFICATION] = pendingVerification;
    results[FollowUpType.PAYMENT_DUE_SOON] = paymentDueSoon;
    results[FollowUpType.PAYMENT_BLOCKED_TOO_LONG] = paymentBlockedTooLong;
    results[FollowUpType.HIGH_VENDOR_EXPOSURE] = highVendorExposure;
    results[FollowUpType.BOQ_OVERRUN] = boqOverrun;

    const created = Object.values(results).reduce((a, b) => a + b, 0);

    return { created, types: results };
  }

  /**
   * Check for pending evidence reviews.
   */
  private static async checkPendingEvidenceReview(projectId: string): Promise<number> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - PENDING_REVIEW_THRESHOLD_DAYS);

    const pendingEvidence = await prisma.evidence.findMany({
      where: {
        status: EvidenceStatus.SUBMITTED,
        submittedAt: { lte: threshold },
        milestone: { projectId },
      },
      include: {
        milestone: true,
      },
    });

    if (pendingEvidence.length === 0) return 0;

    const existing = await prisma.followUp.findMany({
      where: {
        projectId,
        type: FollowUpType.PENDING_EVIDENCE_REVIEW,
        status: FollowUpStatus.OPEN,
        targetEntityId: { in: pendingEvidence.map(e => e.id) },
      },
      select: { targetEntityId: true },
    });
    const existingSet = new Set(existing.map(f => f.targetEntityId));

    const toCreate = pendingEvidence
      .filter(evidence => !existingSet.has(evidence.id))
      .map(evidence => {
        const daysPending = Math.ceil(
          (Date.now() - evidence.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        return {
          projectId,
          type: FollowUpType.PENDING_EVIDENCE_REVIEW,
          targetEntity: 'Evidence',
          targetEntityId: evidence.id,
          description: `Evidence for milestone "${evidence.milestone.title}" pending review for ${daysPending} days`,
          status: FollowUpStatus.OPEN,
        };
      });

    if (toCreate.length === 0) return 0;

    await prisma.followUp.createMany({
      data: toCreate,
      skipDuplicates: true,
    });

    return toCreate.length;
  }

  /**
   * Check for pending verifications.
   */
  private static async checkPendingVerification(projectId: string): Promise<number> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - PENDING_VERIFICATION_THRESHOLD_DAYS);

    // Find milestones with approved evidence but not yet verified
    const pendingMilestones = await prisma.milestone.findMany({
      where: {
        projectId,
        state: MilestoneState.SUBMITTED,
        evidence: {
          some: {
            status: EvidenceStatus.APPROVED,
            reviewedAt: { lte: threshold },
          },
        },
      },
    });

    if (pendingMilestones.length === 0) return 0;

    const existing = await prisma.followUp.findMany({
      where: {
        projectId,
        type: FollowUpType.PENDING_VERIFICATION,
        status: FollowUpStatus.OPEN,
        targetEntityId: { in: pendingMilestones.map(m => m.id) },
      },
      select: { targetEntityId: true },
    });
    const existingSet = new Set(existing.map(f => f.targetEntityId));

    const toCreate = pendingMilestones
      .filter(milestone => !existingSet.has(milestone.id))
      .map(milestone => ({
        projectId,
        type: FollowUpType.PENDING_VERIFICATION,
        targetEntity: 'Milestone',
        targetEntityId: milestone.id,
        description: `Milestone "${milestone.title}" has approved evidence but pending verification`,
        status: FollowUpStatus.OPEN,
      }));

    if (toCreate.length === 0) return 0;

    await prisma.followUp.createMany({
      data: toCreate,
      skipDuplicates: true,
    });

    return toCreate.length;
  }

  /**
   * Check for payments due soon.
   */
  private static async checkPaymentDueSoon(projectId: string): Promise<number> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() + PAYMENT_DUE_SOON_THRESHOLD_DAYS);

    const dueSoon = await prisma.paymentEligibility.findMany({
      where: {
        milestone: { projectId },
        state: { in: [EligibilityState.PARTIALLY_ELIGIBLE, EligibilityState.FULLY_ELIGIBLE] },
        dueDate: { lte: threshold, gte: new Date() },
      },
      include: {
        milestone: true,
      },
    });

    if (dueSoon.length === 0) return 0;

    const existing = await prisma.followUp.findMany({
      where: {
        projectId,
        type: FollowUpType.PAYMENT_DUE_SOON,
        status: FollowUpStatus.OPEN,
        targetEntityId: { in: dueSoon.map(i => i.id) },
      },
      select: { targetEntityId: true },
    });
    const existingSet = new Set(existing.map(f => f.targetEntityId));

    const toCreate = dueSoon
      .filter(item => !existingSet.has(item.id))
      .map(item => {
        const daysUntilDue = item.dueDate
          ? Math.ceil((item.dueDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
          : 0;
        return {
          projectId,
          type: FollowUpType.PAYMENT_DUE_SOON,
          targetEntity: 'PaymentEligibility',
          targetEntityId: item.id,
          description: `Payment for "${item.milestone.title}" due in ${daysUntilDue} days ($${item.eligibleAmount.toFixed(2)})`,
          status: FollowUpStatus.OPEN,
        };
      });

    if (toCreate.length === 0) return 0;

    await prisma.followUp.createMany({
      data: toCreate,
      skipDuplicates: true,
    });

    return toCreate.length;
  }

  /**
   * Check for payments blocked too long.
   */
  private static async checkBlockedTooLong(projectId: string): Promise<number> {
    const threshold = new Date();
    threshold.setDate(threshold.getDate() - PAYMENT_BLOCKED_THRESHOLD_DAYS);

    const blocked = await prisma.paymentEligibility.findMany({
      where: {
        milestone: { projectId },
        state: EligibilityState.BLOCKED,
        blockedAt: { lte: threshold },
      },
      include: {
        milestone: true,
      },
    });

    // Preserve the original `if (item.blockedAt)` null guard by filtering up-front
    const withBlockedAt = blocked.filter(item => item.blockedAt !== null);

    if (withBlockedAt.length === 0) return 0;

    const existing = await prisma.followUp.findMany({
      where: {
        projectId,
        type: FollowUpType.PAYMENT_BLOCKED_TOO_LONG,
        status: FollowUpStatus.OPEN,
        targetEntityId: { in: withBlockedAt.map(i => i.id) },
      },
      select: { targetEntityId: true },
    });
    const existingSet = new Set(existing.map(f => f.targetEntityId));

    const toCreate = withBlockedAt
      .filter(item => !existingSet.has(item.id))
      .map(item => {
        const blockedAt = item.blockedAt!;
        const daysBlocked = Math.ceil(
          (Date.now() - blockedAt.getTime()) / (1000 * 60 * 60 * 24)
        );
        return {
          projectId,
          type: FollowUpType.PAYMENT_BLOCKED_TOO_LONG,
          targetEntity: 'PaymentEligibility',
          targetEntityId: item.id,
          description: `Payment for "${item.milestone.title}" blocked for ${daysBlocked} days. Reason: ${item.blockReasonCode || 'Unknown'}`,
          status: FollowUpStatus.OPEN,
        };
      });

    if (toCreate.length === 0) return 0;

    await prisma.followUp.createMany({
      data: toCreate,
      skipDuplicates: true,
    });

    return toCreate.length;
  }

  /**
   * Check for high vendor exposure.
   */
  private static async checkVendorExposure(projectId: string): Promise<number> {
    const exposures = await PaymentEligibilityEngine.detectVendorExposure(projectId);

    if (exposures.length === 0) return 0;

    const existing = await prisma.followUp.findMany({
      where: {
        projectId,
        type: FollowUpType.HIGH_VENDOR_EXPOSURE,
        status: FollowUpStatus.OPEN,
        targetEntityId: { in: exposures.map(e => e.vendorId) },
      },
      select: { targetEntityId: true },
    });
    const existingSet = new Set(existing.map(f => f.targetEntityId));

    const toCreate = exposures
      .filter(exposure => !existingSet.has(exposure.vendorId))
      .map(exposure => ({
        projectId,
        type: FollowUpType.HIGH_VENDOR_EXPOSURE,
        targetEntity: 'User',
        targetEntityId: exposure.vendorId,
        description: `Vendor "${exposure.vendorName}" has exposure of $${exposure.exposure.toFixed(2)} (Advance: $${exposure.advancePaid.toFixed(2)}, Verified: $${exposure.verifiedWork.toFixed(2)})`,
        status: FollowUpStatus.OPEN,
      }));

    if (toCreate.length === 0) return 0;

    await prisma.followUp.createMany({
      data: toCreate,
      skipDuplicates: true,
    });

    return toCreate.length;
  }

  /**
   * Check for BOQ overruns.
   */
  private static async checkBOQOverruns(projectId: string): Promise<number> {
    const overruns = await PaymentEligibilityEngine.detectBOQOverruns(projectId);

    if (overruns.length === 0) return 0;

    const existing = await prisma.followUp.findMany({
      where: {
        projectId,
        type: FollowUpType.BOQ_OVERRUN,
        status: FollowUpStatus.OPEN,
        targetEntityId: { in: overruns.map(o => o.boqItemId) },
      },
      select: { targetEntityId: true },
    });
    const existingSet = new Set(existing.map(f => f.targetEntityId));

    const toCreate = overruns
      .filter(overrun => !existingSet.has(overrun.boqItemId))
      .map(overrun => ({
        projectId,
        type: FollowUpType.BOQ_OVERRUN,
        targetEntity: 'BOQItem',
        targetEntityId: overrun.boqItemId,
        description: `BOQ item "${overrun.description}" overrun: ${overrun.verifiedQty} verified vs ${overrun.plannedQty} planned`,
        status: FollowUpStatus.OPEN,
      }));

    if (toCreate.length === 0) return 0;

    await prisma.followUp.createMany({
      data: toCreate,
      skipDuplicates: true,
    });

    return toCreate.length;
  }

  /**
   * Resolve a follow-up.
   */
  static async resolve(
    followUpId: string,
    resolutionNote: string,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.OWNER && role !== Role.PMC) {
      return { success: false, error: 'Only Owner or PMC can resolve follow-ups' };
    }

    const followUp = await prisma.followUp.findUnique({
      where: { id: followUpId },
    });

    if (!followUp) {
      return { success: false, error: 'Follow-up not found' };
    }

    if (followUp.status !== FollowUpStatus.OPEN) {
      return { success: false, error: 'Follow-up is not open' };
    }

    await prisma.followUp.update({
      where: { id: followUpId },
      data: {
        status: FollowUpStatus.RESOLVED,
        resolvedAt: new Date(),
        resolvedById: actorId,
        resolutionNote,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.FOLLOWUP_RESOLVE,
      entityType: 'FollowUp',
      entityId: followUpId,
      beforeJson: { status: FollowUpStatus.OPEN },
      afterJson: { status: FollowUpStatus.RESOLVED, resolutionNote },
    });

    return { success: true };
  }

  /**
   * Get open follow-ups for a project.
   */
  static async getOpenFollowUps(projectId: string) {
    return prisma.followUp.findMany({
      where: {
        projectId,
        status: FollowUpStatus.OPEN,
      },
      orderBy: [
        { type: 'asc' },
        { createdAt: 'desc' },
      ],
    });
  }

  /**
   * Get follow-ups by type.
   */
  static async getByType(projectId: string, type: FollowUpType) {
    return prisma.followUp.findMany({
      where: {
        projectId,
        type,
      },
      orderBy: { createdAt: 'desc' },
    });
  }
}
