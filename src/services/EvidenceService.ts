import { EvidenceStatus, Role, MilestoneState, EligibilityEventType, AuditActionTypes } from '@/types';
import { prisma } from '@/lib/db';
import { fileStorage } from '@/lib/file-storage';
import { RoleGuard } from './RoleGuard';
import { PaymentEligibilityEngine } from './PaymentEligibilityEngine';
import { generateStorageKey } from '@/lib/utils';
import { SystemEventService, SystemEventType } from './SystemEventService';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

/** Allowed MIME types for evidence files (images, PDFs, documents) */
const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'video/quicktime',
]);

export interface EvidenceSubmission {
  milestoneId: string;
  qtyOrPercent: number;
  remarks?: string;
  files: Array<{
    buffer: Buffer;
    originalName: string;
    mimeType: string;
    size: number;
  }>;
}

export interface EvidenceReview {
  evidenceId: string;
  action: 'APPROVE' | 'REJECT';
  note?: string;
}

/**
 * EvidenceService - Handles evidence submission and review.
 *
 * SPEC REQUIREMENTS:
 * - Evidence is mandatory for submission
 * - Evidence is frozen after submission
 * - Evidence cannot be edited after frozen
 * - Re-submission only after rejection
 */
export class EvidenceService {
  /**
   * Submit evidence for a milestone.
   * Creates evidence record and saves files.
   */
  static async submit(
    submission: EvidenceSubmission,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; evidenceId?: string; error?: string }> {
    // Validate role
    if (role !== Role.VENDOR) {
      return { success: false, error: 'Only Vendor can submit evidence' };
    }

    // Validate milestone state
    const milestone = await prisma.milestone.findFirst({
      where: { id: submission.milestoneId, projectId },
    });

    if (!milestone) {
      return { success: false, error: 'Milestone not found' };
    }

    if (milestone.vendorUserId && milestone.vendorUserId !== actorId) {
      throw new Error('FORBIDDEN: You can only submit evidence on milestones assigned to you');
    }

    if (milestone.state !== MilestoneState.IN_PROGRESS) {
      return { success: false, error: `Cannot submit evidence for milestone in ${milestone.state} state` };
    }

    // Validate files
    if (submission.files.length === 0) {
      return { success: false, error: 'At least one file is required' };
    }

    for (const file of submission.files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return { success: false, error: `File ${file.originalName} exceeds maximum size of ${MAX_FILE_SIZE_MB}MB` };
      }
      if (!ALLOWED_MIME_TYPES.has(file.mimeType)) {
        return {
          success: false,
          error: `File ${file.originalName} has disallowed type: ${file.mimeType}. Allowed: images, PDFs, Office documents, MP4 videos.`,
        };
      }
    }

    // Save files to storage BEFORE transaction (disk I/O outside TX)
    const savedFiles: Array<{ storageKey: string; filePath: string; originalName: string; mimeType: string; size: number }> = [];
    for (const file of submission.files) {
      const storageKey = generateStorageKey(file.originalName);
      const filePath = await fileStorage.save(storageKey, file.buffer, file.mimeType);
      savedFiles.push({ storageKey, filePath, originalName: file.originalName, mimeType: file.mimeType, size: file.size });
    }

    // Create evidence + transition milestone IN_PROGRESS → SUBMITTED atomically
    const evidence = await prisma.$transaction(async (tx) => {
      // Create evidence record
      const evidence = await tx.evidence.create({
        data: {
          milestoneId: submission.milestoneId,
          submittedById: actorId,
          qtyOrPercent: submission.qtyOrPercent,
          remarks: submission.remarks,
          frozen: true,
          status: EvidenceStatus.SUBMITTED,
        },
      });

      // Create file records
      for (const f of savedFiles) {
        await tx.evidenceFile.create({
          data: {
            evidenceId: evidence.id,
            storageKey: f.storageKey,
            fileName: f.originalName,
            mimeType: f.mimeType,
            size: f.size,
            filePath: f.filePath,
          },
        });
      }

      // Transition milestone IN_PROGRESS → SUBMITTED
      await tx.milestone.update({
        where: { id: submission.milestoneId },
        data: {
          state: MilestoneState.SUBMITTED,
          actualSubmission: new Date(),
        },
      });

      await tx.milestoneStateTransition.create({
        data: {
          milestoneId: submission.milestoneId,
          fromState: MilestoneState.IN_PROGRESS,
          toState: MilestoneState.SUBMITTED,
          actorId,
          role,
          reason: 'Evidence submitted',
        },
      });

      // Audit logs
      await tx.auditLog.create({
        data: {
          projectId,
          actorId,
          role,
          actionType: AuditActionTypes.EVIDENCE_SUBMIT,
          entityType: 'Evidence',
          entityId: evidence.id,
          afterJson: JSON.stringify({
            milestoneId: submission.milestoneId,
            qtyOrPercent: submission.qtyOrPercent,
            remarks: submission.remarks,
            fileCount: savedFiles.length,
            frozen: true,
          }),
        },
      });

      await tx.auditLog.create({
        data: {
          projectId,
          actorId,
          role,
          actionType: AuditActionTypes.MILESTONE_STATE_TRANSITION,
          entityType: 'Milestone',
          entityId: submission.milestoneId,
          beforeJson: JSON.stringify({ state: MilestoneState.IN_PROGRESS }),
          afterJson: JSON.stringify({ state: MilestoneState.SUBMITTED }),
        },
      });

      return evidence;
    });

    // Viseron Intelligence: emit system event for analytics pipeline
    SystemEventService.emit(SystemEventType.EVIDENCE_SUBMITTED, projectId, 'Evidence', evidence.id, actorId, {
      milestoneId: submission.milestoneId,
      qtyOrPercent: submission.qtyOrPercent,
      fileCount: submission.files.length,
    });

    return { success: true, evidenceId: evidence.id };
  }

  /**
   * Review (approve or reject) evidence.
   * SPEC: PMC/Owner can approve or reject. Rejection requires reason.
   */
  static async review(
    review: EvidenceReview,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    // Validate role
    if (role !== Role.OWNER && role !== Role.PMC) {
      return { success: false, error: 'Only Owner or PMC can review evidence' };
    }

    // Get evidence — IDOR guard: verify evidence belongs to this project
    const evidence = await prisma.evidence.findFirst({
      where: {
        id: review.evidenceId,
        milestone: { projectId },
      },
      include: { milestone: true },
    });

    if (!evidence) {
      return { success: false, error: 'Evidence not found' };
    }

    // SPEC: Vendor cannot approve own work
    RoleGuard.validateNotSelfApproval(actorId, evidence.submittedById);

    // Validate current status
    if (evidence.status !== EvidenceStatus.SUBMITTED) {
      return { success: false, error: `Evidence is already ${evidence.status}` };
    }

    // Rejection requires reason
    if (review.action === 'REJECT' && !review.note) {
      return { success: false, error: 'Rejection requires a reason' };
    }

    const newStatus = review.action === 'APPROVE' ? EvidenceStatus.APPROVED : EvidenceStatus.REJECTED;

    // Update evidence + audit log atomically in a single transaction
    await prisma.$transaction(async (tx) => {
      await tx.evidence.update({
        where: { id: review.evidenceId },
        data: {
          status: newStatus,
          reviewedAt: new Date(),
          reviewNote: review.note,
        },
      });

      await tx.auditLog.create({
        data: {
          projectId,
          actorId,
          role,
          actionType: review.action === 'APPROVE' ? AuditActionTypes.EVIDENCE_APPROVE : AuditActionTypes.EVIDENCE_REJECT,
          entityType: 'Evidence',
          entityId: review.evidenceId,
          beforeJson: JSON.stringify({ status: EvidenceStatus.SUBMITTED }),
          afterJson: JSON.stringify({ status: newStatus, reviewNote: review.note }),
          reason: review.note,
        },
      });

      // On rejection, move milestone back to IN_PROGRESS so vendor can resubmit
      if (review.action === 'REJECT' && evidence.milestone.state === MilestoneState.SUBMITTED) {
        await tx.milestone.update({
          where: { id: evidence.milestoneId },
          data: { state: MilestoneState.IN_PROGRESS, actualSubmission: null },
        });

        await tx.milestoneStateTransition.create({
          data: {
            milestoneId: evidence.milestoneId,
            fromState: MilestoneState.SUBMITTED,
            toState: MilestoneState.IN_PROGRESS,
            actorId,
            role,
            reason: `Evidence rejected: ${review.note}`,
          },
        });

        await tx.auditLog.create({
          data: {
            projectId,
            actorId,
            role,
            actionType: AuditActionTypes.MILESTONE_STATE_TRANSITION,
            entityType: 'Milestone',
            entityId: evidence.milestoneId,
            beforeJson: JSON.stringify({ state: MilestoneState.SUBMITTED }),
            afterJson: JSON.stringify({ state: MilestoneState.IN_PROGRESS }),
            reason: `Evidence rejected — vendor must resubmit`,
          },
        });
      }
    });

    // GOVERNANCE: Trigger eligibility recalculation after evidence review
    // This ensures payment eligibility is updated based on approved/rejected evidence
    const eventType = review.action === 'APPROVE'
      ? EligibilityEventType.EVIDENCE_APPROVED
      : EligibilityEventType.EVIDENCE_REJECTED;

    await PaymentEligibilityEngine.recalculatePaymentEligibility(
      evidence.milestoneId,
      actorId,
      role,
      eventType,
      'Evidence',
      review.evidenceId
    );

    // Viseron Intelligence: emit system event for analytics pipeline
    const sysEventType = review.action === 'APPROVE'
      ? SystemEventType.EVIDENCE_APPROVED
      : SystemEventType.EVIDENCE_REJECTED;

    SystemEventService.emit(sysEventType, projectId, 'Evidence', review.evidenceId, actorId, {
      milestoneId: evidence.milestoneId,
      action: review.action,
      note: review.note,
    });

    return { success: true };
  }

  /**
   * Check if evidence can be edited.
   * SPEC: Evidence cannot be edited after frozen.
   */
  static async canEdit(evidenceId: string): Promise<{ canEdit: boolean; reason?: string }> {
    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
    });

    if (!evidence) {
      return { canEdit: false, reason: 'Evidence not found' };
    }

    if (evidence.frozen) {
      return { canEdit: false, reason: 'Evidence is frozen and cannot be edited' };
    }

    return { canEdit: true };
  }

  /**
   * Check if milestone has rejected evidence (allowing resubmission).
   * SPEC: Re-submission only after rejection.
   */
  static async canResubmit(milestoneId: string): Promise<{ canResubmit: boolean; reason?: string }> {
    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      include: {
        evidence: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!milestone) {
      return { canResubmit: false, reason: 'Milestone not found' };
    }

    // If milestone is back in IN_PROGRESS state, check for rejection
    if (milestone.state !== MilestoneState.IN_PROGRESS) {
      return { canResubmit: false, reason: `Milestone is in ${milestone.state} state` };
    }

    // Check if latest evidence was rejected
    const latestEvidence = milestone.evidence[0];
    if (latestEvidence && latestEvidence.status === EvidenceStatus.REJECTED) {
      return { canResubmit: true };
    }

    // No evidence or pending submission means first submission, not resubmission
    if (!latestEvidence || latestEvidence.status === EvidenceStatus.SUBMITTED) {
      return { canResubmit: true };
    }

    return { canResubmit: false, reason: 'Evidence is already approved' };
  }

  /**
   * Get evidence for a milestone.
   */
  static async getForMilestone(milestoneId: string) {
    return prisma.evidence.findMany({
      where: { milestoneId },
      include: {
        files: true,
        submittedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });
  }

  /**
   * Get pending evidence for review (project-wide).
   */
  static async getPendingReviews(projectId: string) {
    return prisma.evidence.findMany({
      where: {
        status: EvidenceStatus.SUBMITTED,
        milestone: {
          projectId,
          state: { notIn: ['VERIFIED', 'CLOSED'] },
        },
      },
      include: {
        files: true,
        submittedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        milestone: {
          select: {
            id: true,
            title: true,
          },
        },
      },
      orderBy: { submittedAt: 'asc' },
    });
  }

  /**
   * Get file content for download.
   * Reads from file storage (disk/S3) instead of database blob.
   */
  static async getFile(fileId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string } | null> {
    const file = await prisma.evidenceFile.findUnique({
      where: { id: fileId },
    });

    if (!file || !file.storageKey) {
      return null;
    }

    // filePath is the resolved path returned by save() (e.g. "./uploads/key").
    // storageKey alone is missing the base dir for LocalDiskStorage, so prefer filePath.
    const readTarget = file.filePath || file.storageKey;
    const buffer = await fileStorage.read(readTarget);
    if (!buffer) {
      return null;
    }

    return {
      buffer,
      fileName: file.fileName,
      mimeType: file.mimeType,
    };
  }
}
