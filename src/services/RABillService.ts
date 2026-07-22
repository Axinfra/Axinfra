import { Role, AuditActionTypes, RABillStatus } from '@/types';
import { prisma } from '@/lib/db';
import { AuditLogger } from './AuditLogger';

export interface RABillFileInput {
  storageKey: string;
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface RABillLineItemInput {
  boqId: string;
  thisBillQty: number;
}

export interface RABillCreateInput {
  periodStart: Date;
  periodEnd: Date;
  remarks?: string | null;
  lineItems: RABillLineItemInput[];
}

const lineItemInclude = { boq: { select: { id: true, boqNumber: true, name: true } } } as const;

/**
 * RABillService - Handles RA (Running Account) Bills for a Purchase Order.
 *
 * Many RA Bills exist per Purchase Order (RA-1, RA-2, RA-3...), sequentially numbered and
 * cumulative. Mirrors how running account billing actually works on a real project: the
 * CONTRACTOR (vendor) prepares the bill (this-period qty against each APPROVED BOQ under the
 * order, claiming what they executed) and submits it. The SITE ENGINEER reviews it first —
 * they can edit the claimed quantities directly if the numbers are wrong (the vendor has no
 * say in this edit) — then forwards it to PMC/Consultant, who measure on site and certify the
 * quantities (certifiedAt is the "work confirmed executed" date — if the claim doesn't match,
 * they send it back for revision instead). In parallel with certification, the vendor gets a
 * read-only copy of the Site Engineer's figures and must accept it, making it binding. CLIENT
 * approves the certified bill for payment, then PMC/CLIENT releases payment. Line items
 * snapshot BOQ fields at draft time so a bill's historical figures never change if the BOQ is
 * edited later.
 */
export class RABillService {
  /**
   * The assigned vendor drafts a new RA Bill against a Purchase Order's APPROVED BOQs,
   * claiming this period's executed quantity per item. Only the vendor actually assigned to
   * this order may draft against it — this is an ownership check, not a blanket role grant,
   * since a vendor is only ever "the contractor" for their own orders.
   */
  static async createDraft(
    orderId: string,
    projectId: string,
    actorId: string,
    role: Role,
    input: RABillCreateInput
  ): Promise<{ success: boolean; raBillId?: string; error?: string }> {
    if (role !== Role.VENDOR) {
      return { success: false, error: 'Only the assigned vendor can draft an RA Bill' };
    }
    if (!input.lineItems || input.lineItems.length === 0) {
      return { success: false, error: 'At least one BOQ line item is required' };
    }
    if (input.periodStart > input.periodEnd) {
      return { success: false, error: 'Period start must be before period end' };
    }

    const order = await prisma.phase.findFirst({
      where: { id: orderId, projectId, parentPhaseId: null, scheduleImportId: null },
    });
    if (!order) {
      return { success: false, error: 'Purchase order not found in this project' };
    }
    if (!order.vendorUserId) {
      return { success: false, error: 'You are not assigned as the vendor for this purchase order' };
    }
    if (order.vendorUserId !== actorId) {
      return { success: false, error: 'You are not the vendor assigned to this purchase order' };
    }

    const boqIds = input.lineItems.map((l) => l.boqId);
    const boqs = await prisma.bOQ.findMany({
      where: { id: { in: boqIds }, orderId, projectId, status: 'APPROVED' },
      include: { items: true },
    });
    if (boqs.length !== boqIds.length) {
      return { success: false, error: 'Every line item must reference a client-approved BOQ under this purchase order' };
    }
    const boqById = new Map(boqs.map((b) => [b.id, b]));

    // Cumulative qty already billed for each BOQ, as of the latest bill that's at least
    // CERTIFIED (a DRAFT/PENDING_VENDOR_REVIEW/REVISION_REQUESTED bill isn't confirmed yet).
    const priorLines = await prisma.rABillLineItem.findMany({
      where: {
        boqId: { in: boqIds },
        raBill: { orderId, status: { in: [RABillStatus.CERTIFIED, RABillStatus.APPROVED, RABillStatus.PAID] } },
      },
      include: { raBill: { select: { billNumber: true } } },
      orderBy: { raBill: { billNumber: 'desc' } },
    });
    const previousCumulativeByBoq = new Map<string, number>();
    for (const line of priorLines) {
      if (!previousCumulativeByBoq.has(line.boqId)) {
        previousCumulativeByBoq.set(line.boqId, line.previousCumulativeQty + line.thisBillQty);
      }
    }

    const raBill = await prisma.$transaction(async (tx) => {
      // Lock the Purchase Order row so two concurrent "create bill" requests for the same
      // order can't both compute the same next billNumber — mirrors the FOR UPDATE pattern
      // used during schedule import for the same reason. RABill's @@unique([orderId,
      // billNumber]) would catch the collision anyway, but as an ugly unhandled 500 rather
      // than this being serialized cleanly.
      await tx.$queryRaw`SELECT id FROM "Phase" WHERE id = ${orderId} FOR UPDATE`;
      const lastBill = await tx.rABill.findFirst({ where: { orderId }, orderBy: { billNumber: 'desc' } });
      const billNumber = (lastBill?.billNumber ?? 0) + 1;

      const bill = await tx.rABill.create({
        data: {
          projectId,
          orderId,
          billNumber,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          status: RABillStatus.DRAFT,
          remarks: input.remarks,
          createdById: actorId,
        },
      });

      await tx.rABillLineItem.createMany({
        data: input.lineItems.map((li) => {
          const boq = boqById.get(li.boqId)!;
          const item = boq.items[0];
          const rate = item?.rate ?? 0;
          const previousCumulativeQty = previousCumulativeByBoq.get(li.boqId) ?? 0;
          return {
            raBillId: bill.id,
            boqId: li.boqId,
            description: item?.description ?? boq.name ?? 'Untitled',
            unit: item?.unit ?? '',
            contractedQty: item?.plannedQty ?? 0,
            rate,
            previousCumulativeQty,
            thisBillQty: li.thisBillQty,
            thisBillAmount: li.thisBillQty * rate,
            cumulativeAmount: (previousCumulativeQty + li.thisBillQty) * rate,
          };
        }),
      });

      return bill;
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.RA_BILL_CREATE,
      entityType: 'RABill',
      entityId: raBill.id,
      afterJson: { orderId, billNumber: raBill.billNumber, lineItemCount: input.lineItems.length },
    });

    return { success: true, raBillId: raBill.id };
  }

  /**
   * The assigned vendor edits their own bill while it's still DRAFT/REVISION_REQUESTED —
   * period, remarks, or per-line quantities. Editing after submission is not allowed — once
   * it's with PMC for certification, only a revision request can reopen it.
   */
  static async updateDraft(
    raBillId: string,
    projectId: string,
    actorId: string,
    role: Role,
    input: { periodStart?: Date; periodEnd?: Date; remarks?: string | null; lineItems?: Array<{ lineItemId: string; thisBillQty: number }> }
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.VENDOR) {
      return { success: false, error: 'Only the assigned vendor can edit an RA Bill' };
    }

    const raBill = await prisma.rABill.findFirst({
      where: { id: raBillId, projectId },
      include: { lineItems: true, order: { select: { vendorUserId: true } } },
    });
    if (!raBill) {
      return { success: false, error: 'RA Bill not found' };
    }
    if (raBill.order.vendorUserId !== actorId) {
      return { success: false, error: 'You are not the vendor assigned to this purchase order' };
    }
    if (raBill.status !== RABillStatus.DRAFT && raBill.status !== RABillStatus.REVISION_REQUESTED) {
      return { success: false, error: 'Only a Draft or a bill sent back for revision can be edited' };
    }

    await prisma.$transaction(async (tx) => {
      if (input.lineItems) {
        const byId = new Map(raBill.lineItems.map((l) => [l.id, l]));
        for (const update of input.lineItems) {
          const line = byId.get(update.lineItemId);
          if (!line) continue;
          await tx.rABillLineItem.update({
            where: { id: update.lineItemId },
            data: {
              thisBillQty: update.thisBillQty,
              thisBillAmount: update.thisBillQty * line.rate,
              cumulativeAmount: (line.previousCumulativeQty + update.thisBillQty) * line.rate,
            },
          });
        }
      }

      await tx.rABill.update({
        where: { id: raBillId },
        data: {
          ...(input.periodStart !== undefined && { periodStart: input.periodStart }),
          ...(input.periodEnd !== undefined && { periodEnd: input.periodEnd }),
          ...(input.remarks !== undefined && { remarks: input.remarks }),
          status: RABillStatus.DRAFT,
        },
      });
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.RA_BILL_UPDATE,
      entityType: 'RABill',
      entityId: raBillId,
    });

    return { success: true };
  }

  /** The assigned vendor submits a DRAFT bill — it goes to the Site Engineer for review/edit
   * first, not straight to PMC. See forwardToPMC() for the next step. */
  static async submit(raBillId: string, projectId: string, actorId: string, role: Role): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.VENDOR) {
      return { success: false, error: 'Only the assigned vendor can submit an RA Bill' };
    }

    const raBill = await prisma.rABill.findFirst({
      where: { id: raBillId, projectId },
      include: { lineItems: true, order: { select: { vendorUserId: true } } },
    });
    if (!raBill) {
      return { success: false, error: 'RA Bill not found' };
    }
    if (raBill.order.vendorUserId !== actorId) {
      return { success: false, error: 'You are not the vendor assigned to this purchase order' };
    }
    if (raBill.status !== RABillStatus.DRAFT) {
      return { success: false, error: 'Only a Draft bill can be submitted' };
    }

    // GST is a mandatory field on a tax invoice — an RA Bill can't be submitted for a vendor
    // whose business profile is incomplete.
    const vendor = await prisma.user.findUnique({ where: { id: actorId }, select: { gstNumber: true } });
    if (!vendor?.gstNumber?.trim()) {
      return { success: false, error: 'Complete your business profile (GST number required) before submitting an RA Bill. Go to My Profile to add it.' };
    }

    const submittedValue = raBill.lineItems.reduce((sum, l) => sum + l.thisBillAmount, 0);

    await prisma.rABill.update({
      where: { id: raBillId },
      data: { status: RABillStatus.PENDING_SITE_ENGINEER_REVIEW, submittedValue, submittedAt: new Date(), submittedById: actorId },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.RA_BILL_SUBMIT,
      entityType: 'RABill',
      entityId: raBillId,
      afterJson: { submittedValue },
    });

    return { success: true };
  }

  /**
   * Site Engineer edits the claimed quantities on a bill that's with them for review — the
   * vendor has no say in this edit. Can be called repeatedly while it's still in their queue;
   * doesn't change status or forward anything (see forwardToPMC for that).
   */
  static async updateSiteEngineerReview(
    raBillId: string,
    projectId: string,
    actorId: string,
    role: Role,
    input: { lineItems?: Array<{ lineItemId: string; thisBillQty: number }> }
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.SITE_ENGINEER) {
      return { success: false, error: 'Only the Site Engineer can review this RA Bill' };
    }

    const raBill = await prisma.rABill.findFirst({ where: { id: raBillId, projectId }, include: { lineItems: true } });
    if (!raBill) {
      return { success: false, error: 'RA Bill not found' };
    }
    if (raBill.status !== RABillStatus.PENDING_SITE_ENGINEER_REVIEW) {
      return { success: false, error: 'Only a bill pending Site Engineer review can be edited here' };
    }

    if (input.lineItems && input.lineItems.length > 0) {
      const byId = new Map(raBill.lineItems.map((l) => [l.id, l]));
      await prisma.$transaction(
        input.lineItems.map((update) => {
          const line = byId.get(update.lineItemId);
          if (!line) throw new Error('Line item not found on this bill');
          return prisma.rABillLineItem.update({
            where: { id: update.lineItemId },
            data: {
              thisBillQty: update.thisBillQty,
              thisBillAmount: update.thisBillQty * line.rate,
              cumulativeAmount: (line.previousCumulativeQty + update.thisBillQty) * line.rate,
            },
          });
        })
      );
    }

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.RA_BILL_SITE_ENGINEER_UPDATE,
      entityType: 'RABill',
      entityId: raBillId,
    });

    return { success: true };
  }

  /**
   * Site Engineer forwards their (possibly edited) bill onward. This lands the bill in PMC's
   * queue and, in parallel — not gated on it — makes it visible to the vendor as a read-only
   * "approved copy" for them to accept. `siteEngineerReviewedValue` snapshots the total at this
   * moment, same pattern as `submittedValue`/`approvedValue` elsewhere on this model.
   */
  static async forwardToPMC(
    raBillId: string,
    projectId: string,
    actorId: string,
    role: Role,
    input: { remarks?: string | null } = {}
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.SITE_ENGINEER) {
      return { success: false, error: 'Only the Site Engineer can forward this RA Bill' };
    }

    const raBill = await prisma.rABill.findFirst({ where: { id: raBillId, projectId }, include: { lineItems: true } });
    if (!raBill) {
      return { success: false, error: 'RA Bill not found' };
    }
    if (raBill.status !== RABillStatus.PENDING_SITE_ENGINEER_REVIEW) {
      return { success: false, error: 'Only a bill pending Site Engineer review can be forwarded' };
    }

    const siteEngineerReviewedValue = raBill.lineItems.reduce((sum, l) => sum + l.thisBillAmount, 0);

    await prisma.rABill.update({
      where: { id: raBillId },
      data: {
        status: RABillStatus.PENDING_VENDOR_REVIEW,
        siteEngineerReviewedAt: new Date(),
        siteEngineerReviewedById: actorId,
        siteEngineerReviewedValue,
        siteEngineerRemarks: input.remarks,
        // A resubmission after revision gets re-reviewed — clear any stale acceptance from a
        // prior round so the vendor is acknowledging *this* version, not an earlier one.
        vendorAcceptedAt: null,
        vendorAcceptedById: null,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.RA_BILL_SITE_ENGINEER_FORWARD,
      entityType: 'RABill',
      entityId: raBillId,
      afterJson: { siteEngineerReviewedValue },
    });

    return { success: true };
  }

  /**
   * Vendor's binding acknowledgement of the Site Engineer's figures — a read-only accept, not a
   * dispute path. Available as soon as the Site Engineer has forwarded the bill and doesn't
   * block PMC's certification, which can happen before or after this call.
   */
  static async vendorAccept(raBillId: string, projectId: string, actorId: string, role: Role): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.VENDOR) {
      return { success: false, error: 'Only the assigned vendor can accept an RA Bill' };
    }

    const raBill = await prisma.rABill.findFirst({
      where: { id: raBillId, projectId },
      include: { order: { select: { vendorUserId: true } } },
    });
    if (!raBill) {
      return { success: false, error: 'RA Bill not found' };
    }
    if (raBill.order.vendorUserId !== actorId) {
      return { success: false, error: 'You are not the vendor assigned to this purchase order' };
    }
    if (!raBill.siteEngineerReviewedAt) {
      return { success: false, error: 'Nothing to accept yet — the Site Engineer hasn\'t reviewed this bill' };
    }
    if (raBill.vendorAcceptedAt) {
      return { success: false, error: 'Already accepted' };
    }

    await prisma.rABill.update({
      where: { id: raBillId },
      data: { vendorAcceptedAt: new Date(), vendorAcceptedById: actorId },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.RA_BILL_VENDOR_ACCEPT,
      entityType: 'RABill',
      entityId: raBillId,
    });

    return { success: true };
  }

  /** PMC/Consultant sends a submitted bill back to the vendor for correction. */
  static async requestRevision(
    raBillId: string,
    projectId: string,
    actorId: string,
    role: Role,
    reason: string
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.PMC && role !== Role.CONSULTANT) {
      return { success: false, error: 'Only PMC or Consultant can request a revision' };
    }
    if (!reason || reason.trim().length === 0) {
      return { success: false, error: 'A reason is required to request a revision' };
    }

    const raBill = await prisma.rABill.findFirst({ where: { id: raBillId, projectId } });
    if (!raBill) {
      return { success: false, error: 'RA Bill not found' };
    }
    if (raBill.status !== RABillStatus.PENDING_VENDOR_REVIEW) {
      return { success: false, error: 'Only a bill pending review can be sent back for revision' };
    }

    await prisma.rABill.update({
      where: { id: raBillId },
      data: {
        status: RABillStatus.REVISION_REQUESTED,
        revisionRequestedAt: new Date(),
        revisionRequestedById: actorId,
        revisionReason: reason,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.RA_BILL_REVISION_REQUEST,
      entityType: 'RABill',
      entityId: raBillId,
      reason,
    });

    return { success: true };
  }

  /**
   * PMC/Consultant certifies the submitted quantities as measured/executed. `certifiedAt` is
   * the "Finished when" date surfaced across the app.
   */
  static async certify(
    raBillId: string,
    projectId: string,
    actorId: string,
    role: Role,
    input: { remarks?: string | null; file?: RABillFileInput }
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.PMC && role !== Role.CONSULTANT) {
      return { success: false, error: 'Only PMC or Consultant can certify an RA Bill' };
    }

    const raBill = await prisma.rABill.findFirst({ where: { id: raBillId, projectId } });
    if (!raBill) {
      return { success: false, error: 'RA Bill not found' };
    }
    if (raBill.status !== RABillStatus.PENDING_VENDOR_REVIEW) {
      return { success: false, error: 'Only a bill pending review can be certified' };
    }

    await prisma.rABill.update({
      where: { id: raBillId },
      data: {
        status: RABillStatus.CERTIFIED,
        certifiedAt: new Date(),
        certifiedById: actorId,
        certifiedRemarks: input.remarks,
        ...(input.file && {
          storageKey: input.file.storageKey,
          fileName: input.file.fileName,
          mimeType: input.file.mimeType,
          fileSize: input.file.fileSize,
        }),
      },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.RA_BILL_CERTIFY,
      entityType: 'RABill',
      entityId: raBillId,
    });

    return { success: true };
  }

  /** Owner approves a certified bill for payment, applying a flat deduction figure. */
  static async approve(
    raBillId: string,
    projectId: string,
    actorId: string,
    role: Role,
    input: { deductions?: number }
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.CLIENT && role !== Role.SITE_ENGINEER) {
      return { success: false, error: 'Only Owner or Site Engineer can approve an RA Bill' };
    }

    const raBill = await prisma.rABill.findFirst({ where: { id: raBillId, projectId }, include: { lineItems: true } });
    if (!raBill) {
      return { success: false, error: 'RA Bill not found' };
    }
    if (raBill.status !== RABillStatus.CERTIFIED) {
      return { success: false, error: 'Only a certified bill can be approved' };
    }

    const deductions = input.deductions ?? raBill.deductions;
    const gross = raBill.lineItems.reduce((sum, l) => sum + l.thisBillAmount, 0);
    const approvedValue = gross - deductions;

    await prisma.rABill.update({
      where: { id: raBillId },
      data: { status: RABillStatus.APPROVED, approvedAt: new Date(), approvedById: actorId, approvedValue, deductions },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.RA_BILL_APPROVE,
      entityType: 'RABill',
      entityId: raBillId,
      afterJson: { approvedValue, deductions },
    });

    return { success: true };
  }

  /** Owner or PMC records a payment release against an approved bill (partial payments allowed). */
  static async releasePayment(
    raBillId: string,
    projectId: string,
    actorId: string,
    role: Role,
    input: { releasedValue?: number; paymentReference?: string }
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.CLIENT && role !== Role.PMC) {
      return { success: false, error: 'Only Owner or PMC can release payment for an RA Bill' };
    }

    const raBill = await prisma.rABill.findFirst({ where: { id: raBillId, projectId } });
    if (!raBill) {
      return { success: false, error: 'RA Bill not found' };
    }
    if (raBill.status !== RABillStatus.APPROVED) {
      return { success: false, error: 'Only an approved bill can have payment released' };
    }

    const releasedValue = input.releasedValue ?? raBill.approvedValue ?? 0;

    await prisma.rABill.update({
      where: { id: raBillId },
      data: {
        status: RABillStatus.PAID,
        releasedAt: new Date(),
        releasedById: actorId,
        releasedValue,
        paymentReference: input.paymentReference,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.RA_BILL_PAYMENT_RELEASE,
      entityType: 'RABill',
      entityId: raBillId,
      afterJson: { releasedValue, paymentReference: input.paymentReference },
    });

    return { success: true };
  }

  /** RA Bills for a Purchase Order, newest first. `limit`/`offset` are opt-in — omitting
   * them returns every bill for the order. `totals` always reflects the whole order, not
   * just the current page, so footer sums stay accurate under pagination. */
  static async getForOrder(orderId: string, projectId: string, options: { limit?: number; offset?: number } = {}) {
    const where = { orderId, projectId };
    const [raBills, total, totals] = await Promise.all([
      prisma.rABill.findMany({
        where,
        orderBy: { billNumber: 'desc' },
        include: {
          lineItems: { include: lineItemInclude },
          createdBy: { select: { name: true } },
          submittedBy: { select: { name: true } },
          siteEngineerReviewedBy: { select: { name: true } },
          vendorAcceptedBy: { select: { name: true } },
          certifiedBy: { select: { name: true } },
          approvedBy: { select: { name: true } },
          releasedBy: { select: { name: true } },
        },
        ...(options.limit !== undefined ? { take: options.limit, skip: options.offset ?? 0 } : {}),
      }),
      prisma.rABill.count({ where }),
      prisma.rABill.aggregate({
        where,
        _sum: { submittedValue: true, approvedValue: true, releasedValue: true },
      }),
    ]);
    return {
      raBills,
      total,
      totals: {
        submitted: totals._sum.submittedValue ?? 0,
        approved: totals._sum.approvedValue ?? 0,
        released: totals._sum.releasedValue ?? 0,
      },
    };
  }

  /** Paginated project-wide RA Bill list, with aggregated totals for the filtered set. */
  static async getForProject(
    projectId: string,
    options: { orderId?: string; status?: string; limit?: number; offset?: number } = {}
  ) {
    const where = {
      projectId,
      ...(options.orderId && { orderId: options.orderId }),
      ...(options.status && { status: options.status }),
    };

    const [raBills, total, all] = await Promise.all([
      prisma.rABill.findMany({
        where,
        orderBy: [{ order: { sortOrder: 'asc' } }, { billNumber: 'desc' }],
        include: { order: { select: { id: true, name: true, vendorUserId: true } }, lineItems: { select: { thisBillAmount: true } } },
        ...(options.limit !== undefined ? { take: options.limit, skip: options.offset ?? 0 } : {}),
      }),
      prisma.rABill.count({ where }),
      prisma.rABill.findMany({ where, select: { status: true, submittedValue: true, approvedValue: true, releasedValue: true } }),
    ]);

    const summary = {
      totalSubmittedValue: all.reduce((sum, b) => sum + (b.submittedValue ?? 0), 0),
      totalApprovedValue: all.reduce((sum, b) => sum + (b.approvedValue ?? 0), 0),
      totalReleasedValue: all.reduce((sum, b) => sum + (b.releasedValue ?? 0), 0),
      pendingSiteEngineerReviewCount: all.filter((b) => b.status === RABillStatus.PENDING_SITE_ENGINEER_REVIEW).length,
      pendingCertificationCount: all.filter((b) => b.status === RABillStatus.PENDING_VENDOR_REVIEW).length,
      pendingApprovalCount: all.filter((b) => b.status === RABillStatus.CERTIFIED).length,
    };

    return { raBills, total, summary };
  }

  /** Full detail for the RA Bill detail page. */
  static async getById(raBillId: string, projectId: string) {
    return prisma.rABill.findFirst({
      where: { id: raBillId, projectId },
      include: {
        order: { select: { id: true, name: true, vendorUserId: true } },
        lineItems: { include: lineItemInclude },
        createdBy: { select: { name: true } },
        submittedBy: { select: { name: true } },
        siteEngineerReviewedBy: { select: { name: true } },
        vendorAcceptedBy: { select: { name: true } },
        revisionRequestedBy: { select: { name: true } },
        certifiedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
        releasedBy: { select: { name: true } },
      },
    });
  }
}
