import { Role, AuditActionTypes, WorkOrderStatus, BOQWorkOrderStatus, WorkOrderRevisionAcceptanceStatus } from '@/types';
import { prisma } from '@/lib/db';
import { AuditLogger } from './AuditLogger';

export interface WorkOrderFileInput {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface WorkOrderRevisionMeta {
  issueDate: Date;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  remarks?: string | null;
}

/** Snapshot of the revision fields that matter for the compare/diff UI. */
function snapshot(fields: WorkOrderRevisionMeta & { revisionNumber: number; fileName: string }) {
  return {
    revisionNumber: fields.revisionNumber,
    issueDate: fields.issueDate,
    plannedStart: fields.plannedStart ?? null,
    plannedEnd: fields.plannedEnd ?? null,
    remarks: fields.remarks ?? null,
    fileName: fields.fileName,
  };
}

/**
 * WorkOrderService - Handles Work Order issuance/revisions for a Purchase Order.
 *
 * A Work Order is issued once per Purchase Order (Phase) and shared by every BOQ under it.
 * Revisions are append-only (R0, R1, R2...) — never updated after creation, except the
 * vendor-acceptance stamp on the current revision.
 */
export class WorkOrderService {
  /**
   * Issue the first Work Order (revision R0) for a Purchase Order.
   * Requires a vendor to already be assigned to the order.
   */
  static async issue(
    orderId: string,
    projectId: string,
    actorId: string,
    role: Role,
    file: WorkOrderFileInput,
    meta: WorkOrderRevisionMeta
  ): Promise<{ success: boolean; workOrderId?: string; error?: string }> {
    if (role !== Role.PMC && role !== Role.CLIENT) {
      return { success: false, error: 'Only PMC or Owner can issue a Work Order' };
    }

    const order = await prisma.phase.findFirst({
      where: { id: orderId, projectId, parentPhaseId: null, scheduleImportId: null },
      include: { workOrder: { select: { id: true } } },
    });
    if (!order) {
      return { success: false, error: 'Purchase order not found in this project' };
    }
    if (!order.vendorUserId) {
      return { success: false, error: 'Assign a vendor to this purchase order before issuing a Work Order' };
    }
    if (order.workOrder) {
      return { success: false, error: 'This purchase order already has a Work Order — add a revision instead' };
    }

    // A Work Order names the vendor's registered business — can't be issued until that
    // vendor's GST/business profile is complete.
    const vendor = await prisma.user.findUnique({ where: { id: order.vendorUserId }, select: { gstNumber: true, name: true } });
    if (!vendor?.gstNumber?.trim()) {
      return { success: false, error: `${vendor?.name ?? 'The assigned vendor'} hasn't completed their business profile (GST number missing) — ask them to complete it before a Work Order can be issued.` };
    }

    const number = `WO-${orderId.slice(0, 8).toUpperCase()}`;

    const workOrder = await prisma.$transaction(async (tx) => {
      const wo = await tx.workOrder.create({
        data: {
          projectId,
          orderId,
          number,
          currentRevisionNumber: 0,
          status: WorkOrderStatus.PENDING_VENDOR_ACCEPTANCE,
        },
      });

      await tx.workOrderRevision.create({
        data: {
          workOrderId: wo.id,
          revisionNumber: 0,
          issueDate: meta.issueDate,
          plannedStart: meta.plannedStart,
          plannedEnd: meta.plannedEnd,
          storageKey: file.storageKey,
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          remarks: meta.remarks,
          reason: null,
          changesJson: JSON.stringify({ before: null, after: snapshot({ ...meta, revisionNumber: 0, fileName: file.fileName }) }),
          vendorAcceptanceStatus: WorkOrderRevisionAcceptanceStatus.PENDING,
          createdById: actorId,
        },
      });

      await tx.bOQ.updateMany({
        where: { orderId },
        data: { workOrderStatus: BOQWorkOrderStatus.PENDING },
      });

      return wo;
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.WORK_ORDER_ISSUE,
      entityType: 'WorkOrder',
      entityId: workOrder.id,
      afterJson: { number, orderId, revisionNumber: 0 },
    });

    return { success: true, workOrderId: workOrder.id };
  }

  /**
   * Add a new revision (R1, R2...) to an existing Work Order.
   */
  static async createRevision(
    workOrderId: string,
    projectId: string,
    actorId: string,
    role: Role,
    file: WorkOrderFileInput,
    meta: WorkOrderRevisionMeta,
    reason: string
  ): Promise<{ success: boolean; revisionNumber?: number; error?: string }> {
    if (role !== Role.PMC && role !== Role.CLIENT) {
      return { success: false, error: 'Only PMC or Owner can add a Work Order revision' };
    }
    if (!reason || reason.trim().length === 0) {
      return { success: false, error: 'A reason is required for a new revision' };
    }

    const workOrder = await prisma.workOrder.findFirst({
      where: { id: workOrderId, projectId },
      include: { revisions: { orderBy: { revisionNumber: 'desc' }, take: 1 } },
    });
    if (!workOrder) {
      return { success: false, error: 'Work Order not found' };
    }

    const priorRevision = workOrder.revisions[0] ?? null;

    const revisionNumber = await prisma.$transaction(async (tx) => {
      // Lock the WorkOrder row so two concurrent "add revision" requests can't both compute
      // the same next revisionNumber — without this, WorkOrderRevision has no unique
      // constraint failure to fall back on other than the one this lock exists to add.
      // Re-read currentRevisionNumber fresh after acquiring the lock (the pre-transaction
      // `workOrder` value may already be stale by the time the lock is granted).
      const [locked] = await tx.$queryRaw<Array<{ currentRevisionNumber: number }>>`
        SELECT "currentRevisionNumber" FROM "WorkOrder" WHERE id = ${workOrderId} FOR UPDATE
      `;
      const revisionNumber = locked.currentRevisionNumber + 1;

      await tx.workOrderRevision.create({
        data: {
          workOrderId,
          revisionNumber,
          issueDate: meta.issueDate,
          plannedStart: meta.plannedStart,
          plannedEnd: meta.plannedEnd,
          storageKey: file.storageKey,
          fileName: file.fileName,
          mimeType: file.mimeType,
          fileSize: file.fileSize,
          remarks: meta.remarks,
          reason,
          changesJson: JSON.stringify({
            before: priorRevision ? snapshot(priorRevision) : null,
            after: snapshot({ ...meta, revisionNumber, fileName: file.fileName }),
          }),
          vendorAcceptanceStatus: WorkOrderRevisionAcceptanceStatus.PENDING,
          createdById: actorId,
        },
      });

      await tx.workOrder.update({
        where: { id: workOrderId },
        data: { currentRevisionNumber: revisionNumber, status: WorkOrderStatus.PENDING_VENDOR_ACCEPTANCE },
      });

      await tx.bOQ.updateMany({
        where: { orderId: workOrder.orderId },
        data: { workOrderStatus: BOQWorkOrderStatus.PENDING },
      });

      return revisionNumber;
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.WORK_ORDER_REVISION_CREATE,
      entityType: 'WorkOrder',
      entityId: workOrderId,
      afterJson: { revisionNumber },
      reason,
    });

    return { success: true, revisionNumber };
  }

  /**
   * Vendor accepts the current revision of a Work Order. Only the assigned vendor may accept,
   * and only the current (latest) revision can be accepted — never a stale one.
   */
  static async accept(
    revisionId: string,
    projectId: string,
    actorId: string,
    role: Role
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.VENDOR) {
      return { success: false, error: 'Only the assigned vendor can accept a Work Order revision' };
    }

    const revision = await prisma.workOrderRevision.findFirst({
      where: { id: revisionId, workOrder: { projectId } },
      include: { workOrder: { include: { order: { select: { id: true, vendorUserId: true } } } } },
    });
    if (!revision) {
      return { success: false, error: 'Work Order revision not found' };
    }
    if (revision.workOrder.order.vendorUserId !== actorId) {
      return { success: false, error: 'You are not the vendor assigned to this purchase order' };
    }
    if (revision.revisionNumber !== revision.workOrder.currentRevisionNumber) {
      return { success: false, error: 'A newer revision has since been issued — only the current revision can be accepted' };
    }
    if (revision.vendorAcceptanceStatus === WorkOrderRevisionAcceptanceStatus.ACCEPTED) {
      return { success: true };
    }

    const orderId = revision.workOrder.order.id;

    await prisma.$transaction(async (tx) => {
      await tx.workOrderRevision.update({
        where: { id: revisionId },
        data: {
          vendorAcceptanceStatus: WorkOrderRevisionAcceptanceStatus.ACCEPTED,
          acceptedAt: new Date(),
          acceptedById: actorId,
        },
      });

      await tx.workOrder.update({
        where: { id: revision.workOrderId },
        data: { status: WorkOrderStatus.ACCEPTED },
      });

      await tx.bOQ.updateMany({
        where: { orderId },
        data: { workOrderStatus: BOQWorkOrderStatus.ACCEPTED },
      });
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.WORK_ORDER_ACCEPT,
      entityType: 'WorkOrder',
      entityId: revision.workOrderId,
      afterJson: { revisionNumber: revision.revisionNumber },
    });

    return { success: true };
  }

  /**
   * Vendor sends the current revision back with remarks instead of accepting it. Mirrors
   * `accept()`'s guard structure exactly, but flips the Work Order back to CHANGES_REQUESTED so
   * PMC knows to issue a new revision (via the existing `createRevision`) addressing the remarks.
   */
  static async requestChanges(
    revisionId: string,
    projectId: string,
    actorId: string,
    role: Role,
    remarks: string
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.VENDOR) {
      return { success: false, error: 'Only the assigned vendor can send remarks on a Work Order revision' };
    }
    if (!remarks || remarks.trim().length === 0) {
      return { success: false, error: 'Remarks are required' };
    }

    const revision = await prisma.workOrderRevision.findFirst({
      where: { id: revisionId, workOrder: { projectId } },
      include: { workOrder: { include: { order: { select: { id: true, vendorUserId: true } } } } },
    });
    if (!revision) {
      return { success: false, error: 'Work Order revision not found' };
    }
    if (revision.workOrder.order.vendorUserId !== actorId) {
      return { success: false, error: 'You are not the vendor assigned to this purchase order' };
    }
    if (revision.revisionNumber !== revision.workOrder.currentRevisionNumber) {
      return { success: false, error: 'A newer revision has since been issued — only the current revision can be responded to' };
    }
    if (revision.vendorAcceptanceStatus !== WorkOrderRevisionAcceptanceStatus.PENDING) {
      return { success: false, error: 'This revision has already been responded to' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.workOrderRevision.update({
        where: { id: revisionId },
        data: {
          vendorAcceptanceStatus: WorkOrderRevisionAcceptanceStatus.REJECTED,
          vendorRemarks: remarks,
          rejectedAt: new Date(),
          rejectedById: actorId,
        },
      });

      await tx.workOrder.update({
        where: { id: revision.workOrderId },
        data: { status: WorkOrderStatus.CHANGES_REQUESTED },
      });
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.WORK_ORDER_REJECT,
      entityType: 'WorkOrder',
      entityId: revision.workOrderId,
      afterJson: { revisionNumber: revision.revisionNumber },
      reason: remarks,
    });

    return { success: true };
  }

  /**
   * Persist the "Generate Work Order PDF" form's narrative/terms/signatory fields onto the
   * current revision, so regenerating later prefills the same values. Pure metadata — not a
   * domain state change, so unlike issue/createRevision this doesn't audit-log or touch
   * vendorAcceptanceStatus/BOQ.workOrderStatus.
   */
  static async saveDraftPdfDetails(
    workOrderId: string,
    projectId: string,
    pdfDetailsJson: string
  ): Promise<{ success: boolean; error?: string }> {
    const workOrder = await prisma.workOrder.findFirst({ where: { id: workOrderId, projectId } });
    if (!workOrder) {
      return { success: false, error: 'Work Order not found' };
    }

    await prisma.workOrderRevision.update({
      where: { workOrderId_revisionNumber: { workOrderId, revisionNumber: workOrder.currentRevisionNumber } },
      data: { pdfDetailsJson },
    });

    return { success: true };
  }

  /** Fetch a Work Order + all its revisions (newest first) for a Purchase Order. */
  static async getForOrder(orderId: string, projectId: string) {
    return prisma.workOrder.findFirst({
      where: { orderId, projectId },
      include: {
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          include: {
            createdBy: { select: { name: true } },
            acceptedBy: { select: { name: true } },
            rejectedBy: { select: { name: true } },
          },
        },
      },
    });
  }

  /** Fetch two specific revisions of a Work Order, for the compare/diff UI. */
  static async getRevisionsForCompare(workOrderId: string, projectId: string, a: number, b: number) {
    const revisions = await prisma.workOrderRevision.findMany({
      where: { workOrderId, revisionNumber: { in: [a, b] }, workOrder: { projectId } },
      include: { createdBy: { select: { name: true } } },
    });
    return {
      a: revisions.find((r) => r.revisionNumber === a) ?? null,
      b: revisions.find((r) => r.revisionNumber === b) ?? null,
    };
  }
}
