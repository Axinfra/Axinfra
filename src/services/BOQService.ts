import { BOQStatus, Role, AuditActionTypes, AuditActionType } from '@/types';
import { prisma } from '@/lib/db';
import { AuditLogger } from './AuditLogger';

export interface BOQItemInput {
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
}

export interface BOQHeaderInput {
  name?: string;
  description?: string;
  category?: string;
  scope?: string;
  plannedStart?: Date | null;
  plannedEnd?: Date | null;
  /** A BOQ represents a single scope/measurement line — its item is created together with it. */
  item?: BOQItemInput;
}

export interface BOQOverviewRollup {
  totalValue: number;
  itemCount: number;
  /** Populated only when the BOQ has exactly one item — the common case for a single scope line. */
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  /** Human summary shown instead of quantity/unit/rate when there are 0 or 2+ items. */
  summary: string;
}

function isEditableBOQStatus(status: string): boolean {
  return status === BOQStatus.DRAFT || status === BOQStatus.REVISED;
}

/** Derives the Overview tab's Quantity/Unit/Rate/Total Value from a BOQ's items. */
export function getOverviewRollup(items: Array<{ plannedQty: number; unit: string; rate: number; plannedValue: number }>): BOQOverviewRollup {
  const totalValue = items.reduce((sum, i) => sum + i.plannedValue, 0);
  if (items.length === 1) {
    const [item] = items;
    return { totalValue, itemCount: 1, quantity: item.plannedQty, unit: item.unit, rate: item.rate, summary: `1 item · ${item.unit}` };
  }
  if (items.length === 0) {
    return { totalValue: 0, itemCount: 0, quantity: null, unit: null, rate: null, summary: 'No items yet' };
  }
  const units = new Set(items.map((i) => i.unit));
  const unitLabel = units.size === 1 ? Array.from(units)[0] : 'mixed units';
  return { totalValue, itemCount: items.length, quantity: null, unit: null, rate: null, summary: `${items.length} items · ${unitLabel}` };
}

/**
 * BOQService - Handles Bill of Quantities operations.
 *
 * SPEC REQUIREMENTS:
 * - BOQ is locked after approval
 * - Any change requires: Revision, Reason, Audit log
 */
export class BOQService {
  /**
   * Create a new BOQ for a project.
   */
  static async create(
    projectId: string,
    actorId: string,
    role: Role,
    orderId?: string,
    header?: BOQHeaderInput
  ): Promise<{ success: boolean; boqId?: string; error?: string }> {
    if (role !== Role.PMC) {
      return { success: false, error: 'Only PMC can create BOQ' };
    }

    if (!orderId) {
      return { success: false, error: 'Purchase order is required to create a BOQ' };
    }

    // parentPhaseId: null, scheduleImportId: null — a BOQ can only ever be created against a
    // genuine top-level Purchase Order, never an Execution/WBS phase imported from a schedule
    // file (those are a Schedule-tab concept, not an "Order"; a promoted top-level WBS phase
    // — see mspdiParser's echo-phase detection — would otherwise satisfy parentPhaseId: null
    // too, so scheduleImportId is the field that actually distinguishes the two).
    const order = await prisma.phase.findFirst({
      where: { id: orderId, projectId, parentPhaseId: null, scheduleImportId: null },
      include: { _count: { select: { boqs: true } } },
    });
    if (!order) {
      return { success: false, error: 'Purchase order not found in this project' };
    }

    // A Purchase Order's items ARE its BOQs (1:1) — number them sequentially per-order.
    // "ORD-" prefix matches the "Order No." label shown in the UI (RA-/WO-/CHK-/DPR- follow
    // the same per-doc-type prefix convention elsewhere).
    const boqNumber = `ORD-${String(order._count.boqs + 1).padStart(3, '0')}`;
    const item = header?.item;

    const boq = await prisma.$transaction(async (tx) => {
      const created = await tx.bOQ.create({
        data: {
          projectId,
          orderId,
          status: BOQStatus.DRAFT,
          boqNumber,
          name: header?.name || item?.description,
          description: header?.description,
          category: header?.category,
          scope: header?.scope,
          plannedStart: header?.plannedStart,
          plannedEnd: header?.plannedEnd,
        },
      });

      if (item) {
        await tx.bOQItem.create({
          data: {
            boqId: created.id,
            description: item.description,
            unit: item.unit,
            plannedQty: item.plannedQty,
            rate: item.rate,
            plannedValue: item.plannedQty * item.rate,
          },
        });
      }

      return created;
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_CREATE,
      entityType: 'BOQ',
      entityId: boq.id,
      afterJson: { orderId, status: BOQStatus.DRAFT, boqNumber, name: header?.name, item },
    });

    return { success: true, boqId: boq.id };
  }

  /**
   * Update a BOQ's header fields (name/description/category/scope/planned dates).
   * Only allowed while DRAFT/REVISED, same gate as item edits.
   */
  static async update(
    boqId: string,
    updates: BOQHeaderInput,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.PMC) {
      return { success: false, error: 'Only PMC can edit BOQ details' };
    }

    const boq = await prisma.bOQ.findFirst({ where: { id: boqId, projectId } });
    if (!boq) {
      return { success: false, error: 'BOQ not found' };
    }
    if (!isEditableBOQStatus(boq.status)) {
      return { success: false, error: 'Cannot edit an approved BOQ. Owner must send it to Revised first.' };
    }

    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const fields: Array<keyof BOQHeaderInput> = ['name', 'description', 'category', 'scope', 'plannedStart', 'plannedEnd'];
    for (const field of fields) {
      if (updates[field] === undefined) continue;
      const prevValue = boq[field as keyof typeof boq];
      const nextValue = updates[field];
      const prevTime = prevValue instanceof Date ? prevValue.getTime() : prevValue;
      const nextTime = nextValue instanceof Date ? nextValue.getTime() : nextValue;
      if (prevTime === nextTime) continue;
      before[field] = prevValue;
      after[field] = nextValue;
    }

    if (Object.keys(after).length === 0) {
      return { success: true };
    }

    await prisma.bOQ.update({ where: { id: boqId }, data: after });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_HEADER_UPDATE,
      entityType: 'BOQ',
      entityId: boqId,
      beforeJson: before,
      afterJson: after,
    });

    return { success: true };
  }

  /**
   * Add an item to a BOQ.
   * Only allowed for DRAFT/REVISED BOQs.
   */
  static async addItem(
    boqId: string,
    item: BOQItemInput,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; itemId?: string; error?: string }> {
    const boq = await prisma.bOQ.findFirst({
      where: { id: boqId, projectId },
    });

    if (!boq) {
      return { success: false, error: 'BOQ not found' };
    }

    if (role !== Role.PMC) {
      return { success: false, error: 'Only PMC can add BOQ items' };
    }

    if (!isEditableBOQStatus(boq.status)) {
      return { success: false, error: 'Cannot add items to approved BOQ. Owner must send it to Revised first.' };
    }

    const plannedValue = item.plannedQty * item.rate;

    const boqItem = await prisma.bOQItem.create({
      data: {
        boqId,
        description: item.description,
        unit: item.unit,
        plannedQty: item.plannedQty,
        rate: item.rate,
        plannedValue,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_ITEM_ADD,
      entityType: 'BOQItem',
      entityId: boqItem.id,
      afterJson: { ...item, plannedValue },
    });

    return { success: true, itemId: boqItem.id };
  }

  /**
   * Update a BOQ item.
   * Only allowed for DRAFT/REVISED BOQs.
   */
  static async updateItem(
    itemId: string,
    updates: Partial<BOQItemInput>,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    const item = await prisma.bOQItem.findFirst({
      where: { id: itemId, boq: { projectId } },
      include: { boq: true },
    });

    if (!item) {
      return { success: false, error: 'BOQ item not found' };
    }

    if (role !== Role.PMC) {
      return { success: false, error: 'Only PMC can update BOQ items' };
    }

    if (!isEditableBOQStatus(item.boq.status)) {
      return { success: false, error: 'Cannot modify items in approved BOQ. Owner must send it to Revised first.' };
    }

    const beforeData = {
      description: item.description,
      unit: item.unit,
      plannedQty: item.plannedQty,
      rate: item.rate,
      plannedValue: item.plannedValue,
    };

    const newQty = updates.plannedQty ?? item.plannedQty;
    const newRate = updates.rate ?? item.rate;
    const plannedValue = newQty * newRate;

    await prisma.bOQItem.update({
      where: { id: itemId },
      data: {
        description: updates.description ?? item.description,
        unit: updates.unit ?? item.unit,
        plannedQty: newQty,
        rate: newRate,
        plannedValue,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_ITEM_UPDATE,
      entityType: 'BOQItem',
      entityId: itemId,
      beforeJson: beforeData,
      afterJson: { ...updates, plannedValue },
    });

    return { success: true };
  }

  /**
   * Remove a BOQ item.
   * Only allowed for DRAFT/REVISED BOQs.
   */
  static async removeItem(
    itemId: string,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    const item = await prisma.bOQItem.findFirst({
      where: { id: itemId, boq: { projectId } },
      include: { boq: true },
    });

    if (!item) {
      return { success: false, error: 'BOQ item not found' };
    }

    if (role !== Role.PMC) {
      return { success: false, error: 'Only PMC can remove BOQ items' };
    }

    if (!isEditableBOQStatus(item.boq.status)) {
      return { success: false, error: 'Cannot remove items from approved BOQ. Owner must send it to Revised first.' };
    }

    const beforeData = {
      description: item.description,
      unit: item.unit,
      plannedQty: item.plannedQty,
      rate: item.rate,
      plannedValue: item.plannedValue,
    };

    await prisma.bOQItem.delete({
      where: { id: itemId },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_ITEM_REMOVE,
      entityType: 'BOQItem',
      entityId: itemId,
      beforeJson: beforeData,
    });

    return { success: true };
  }

  /**
   * Approve a BOQ.
   * SPEC: BOQ is locked after approval.
   * Only Owner can approve.
   */
  static async approve(
    boqId: string,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.CLIENT) {
      return { success: false, error: 'Only Owner can approve BOQ' };
    }

    const boq = await prisma.bOQ.findFirst({
      where: { id: boqId, projectId },
      include: { items: true, revisions: { orderBy: { revisionNumber: 'desc' } } },
    });

    if (!boq) {
      return { success: false, error: 'BOQ not found' };
    }

    const fromStatus = boq.status as BOQStatus;
    if (
      fromStatus !== BOQStatus.DRAFT &&
      fromStatus !== BOQStatus.REVISED &&
      fromStatus !== BOQStatus.PENDING_APPROVAL
    ) {
      return { success: false, error: 'BOQ must be submitted for approval before it can be approved' };
    }

    if (boq.items.length === 0) {
      return { success: false, error: 'Cannot approve empty BOQ' };
    }

    await prisma.$transaction(async (tx) => {
      await tx.bOQ.update({
        where: { id: boqId },
        data: { status: BOQStatus.APPROVED },
      });

      if (fromStatus === BOQStatus.REVISED && boq.revisions.length > 0) {
        await tx.bOQRevision.update({
          where: { id: boq.revisions[0].id }, // [0] = latest (ordered desc)
          data: { approvedAt: new Date(), approvedById: actorId },
        });
      }
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_APPROVE,
      entityType: 'BOQ',
      entityId: boqId,
      beforeJson: { status: fromStatus },
      afterJson: { status: BOQStatus.APPROVED },
    });

    return { success: true };
  }

  /**
   * Owner sends BOQ back for revision.
   * Flow: Owner reviews BOQ -> NO -> BOQ = REVISED, re-approval needed.
   */
  static async requestRevision(
    boqId: string,
    reason: string,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; revisionNumber?: number; error?: string }> {
    if (role !== Role.CLIENT) {
      return { success: false, error: 'Only Owner can request BOQ revision' };
    }

    if (!reason || reason.trim().length === 0) {
      return { success: false, error: 'Revision reason is required' };
    }

    const boq = await prisma.bOQ.findFirst({
      where: { id: boqId, projectId },
      include: { items: true, revisions: true },
    });

    if (!boq) {
      return { success: false, error: 'BOQ not found' };
    }

    const fromStatus = boq.status as BOQStatus;
    if (
      fromStatus !== BOQStatus.DRAFT &&
      fromStatus !== BOQStatus.REVISED &&
      fromStatus !== BOQStatus.PENDING_APPROVAL &&
      fromStatus !== BOQStatus.APPROVED
    ) {
      return { success: false, error: 'Cannot request revision in the current status' };
    }

    const revisionNumber = boq.revisions.length + 1;
    const beforeState = {
      status: fromStatus,
      items: boq.items.map((item) => ({
        id: item.id,
        description: item.description,
        unit: item.unit,
        plannedQty: item.plannedQty,
        rate: item.rate,
        plannedValue: item.plannedValue,
      })),
    };

    await prisma.$transaction(async (tx) => {
      await tx.bOQRevision.create({
        data: {
          boqId,
          revisionNumber,
          reason,
          changesJson: JSON.stringify({
            before: beforeState,
            changes: { ownerReview: 'REJECTED_FOR_REVISION' },
          }),
        },
      });

      await tx.bOQ.update({
        where: { id: boqId },
        data: { status: BOQStatus.REVISED },
      });
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_REVISE,
      entityType: 'BOQ',
      entityId: boqId,
      beforeJson: beforeState,
      afterJson: { status: BOQStatus.REVISED, revisionNumber },
      reason,
    });

    return { success: true, revisionNumber };
  }

  /**
   * Create a revision of an approved BOQ.
   * SPEC: Any change requires revision + reason + audit log.
   */
  static async revise(
    boqId: string,
    reason: string,
    changes: {
      addItems?: BOQItemInput[];
      updateItems?: Array<{ id: string; updates: Partial<BOQItemInput> }>;
      removeItemIds?: string[];
    },
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; revisionNumber?: number; error?: string }> {
    if (role !== Role.PMC) {
      return { success: false, error: 'Only PMC can revise BOQ items' };
    }

    if (!reason || reason.trim().length === 0) {
      return { success: false, error: 'Revision reason is required' };
    }

    const boq = await prisma.bOQ.findFirst({
      where: { id: boqId, projectId },
      include: { items: true, revisions: true },
    });

    if (!boq) {
      return { success: false, error: 'BOQ not found' };
    }

    if (boq.status !== BOQStatus.APPROVED && boq.status !== BOQStatus.REVISED) {
      return { success: false, error: 'Can only revise approved BOQ' };
    }

    const revisionNumber = boq.revisions.length + 1;

    // Capture before state
    const beforeState = {
      items: boq.items.map((item) => ({
        id: item.id,
        description: item.description,
        unit: item.unit,
        plannedQty: item.plannedQty,
        rate: item.rate,
        plannedValue: item.plannedValue,
      })),
    };

    // Apply changes in transaction
    await prisma.$transaction(async (tx) => {
      // Remove items
      if (changes.removeItemIds && changes.removeItemIds.length > 0) {
        await tx.bOQItem.deleteMany({
          where: { id: { in: changes.removeItemIds } },
        });
      }

      // Update items
      if (changes.updateItems) {
        for (const update of changes.updateItems) {
          const item = boq.items.find((i) => i.id === update.id);
          if (item) {
            const newQty = update.updates.plannedQty ?? item.plannedQty;
            const newRate = update.updates.rate ?? item.rate;
            await tx.bOQItem.update({
              where: { id: update.id },
              data: {
                ...update.updates,
                plannedValue: newQty * newRate,
              },
            });
          }
        }
      }

      // Add new items
      if (changes.addItems) {
        for (const item of changes.addItems) {
          await tx.bOQItem.create({
            data: {
              boqId,
              description: item.description,
              unit: item.unit,
              plannedQty: item.plannedQty,
              rate: item.rate,
              plannedValue: item.plannedQty * item.rate,
            },
          });
        }
      }

      // Create revision record
      await tx.bOQRevision.create({
        data: {
          boqId,
          revisionNumber,
          reason,
          changesJson: JSON.stringify({
            before: beforeState,
            changes: {
              added: changes.addItems || [],
              updated: changes.updateItems || [],
              removed: changes.removeItemIds || [],
            },
          }),
        },
      });

      // Update BOQ status
      await tx.bOQ.update({
        where: { id: boqId },
        data: { status: BOQStatus.REVISED },
      });
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_REVISE,
      entityType: 'BOQ',
      entityId: boqId,
      beforeJson: beforeState,
      afterJson: { revisionNumber, changes },
      reason,
    });

    return { success: true, revisionNumber };
  }

  /**
   * PMC submits a BOQ for Owner review: DRAFT/REVISED → PENDING_APPROVAL.
   */
  static async sendForApproval(
    boqId: string,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (role !== Role.PMC) {
      return { success: false, error: 'Only PMC can submit a BOQ for approval' };
    }

    const boq = await prisma.bOQ.findFirst({
      where: { id: boqId, projectId },
      include: { items: true },
    });

    if (!boq) return { success: false, error: 'BOQ not found' };

    if (boq.status !== BOQStatus.DRAFT && boq.status !== BOQStatus.REVISED) {
      return { success: false, error: 'BOQ must be in DRAFT or REVISED status to submit for approval' };
    }

    if (boq.items.length === 0) {
      return { success: false, error: 'Add at least one item before submitting for approval' };
    }

    await prisma.bOQ.update({
      where: { id: boqId },
      data: { status: BOQStatus.PENDING_APPROVAL },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_SUBMIT as AuditActionType,
      entityType: 'BOQ',
      entityId: boqId,
      beforeJson: { status: boq.status },
      afterJson: { status: BOQStatus.PENDING_APPROVAL },
    });

    return { success: true };
  }

  /**
   * PMC submits every eligible BOQ under a Purchase Order for Owner review in one action —
   * same DRAFT/REVISED + has-items eligibility as the single-BOQ sendForApproval, applied to
   * the whole order at once so a PO with several BOQs doesn't need submitting one at a time.
   */
  static async sendForApprovalBulk(
    orderId: string,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; count?: number; error?: string }> {
    if (role !== Role.PMC) {
      return { success: false, error: 'Only PMC can submit BOQs for approval' };
    }

    const order = await prisma.phase.findFirst({ where: { id: orderId, projectId } });
    if (!order) {
      return { success: false, error: 'Purchase order not found in this project' };
    }

    const eligible = await prisma.bOQ.findMany({
      where: {
        orderId,
        projectId,
        status: { in: [BOQStatus.DRAFT, BOQStatus.REVISED] },
        items: { some: {} },
      },
      select: { id: true, status: true },
    });

    if (eligible.length === 0) {
      return { success: false, error: 'No BOQs are ready to submit — each needs at least one item and must be Draft or Needs Revision' };
    }

    const ids = eligible.map((b) => b.id);
    await prisma.bOQ.updateMany({
      where: { id: { in: ids } },
      data: { status: BOQStatus.PENDING_APPROVAL },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_SUBMIT as AuditActionType,
      entityType: 'Phase',
      entityId: orderId,
      afterJson: { status: BOQStatus.PENDING_APPROVAL, boqsSubmitted: ids.length },
    });

    return { success: true, count: ids.length };
  }

  /**
   * Owner approves every BOQ under a Purchase Order that's ready for approval, in one action.
   * Reuses the single-BOQ `approve()` (which also stamps the latest revision when coming
   * from REVISED) for each eligible BOQ, so the per-BOQ business rules stay in one place.
   */
  static async approveBulk(
    orderId: string,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; count?: number; error?: string }> {
    if (role !== Role.CLIENT) {
      return { success: false, error: 'Only Owner can approve BOQs' };
    }

    const order = await prisma.phase.findFirst({ where: { id: orderId, projectId } });
    if (!order) {
      return { success: false, error: 'Purchase order not found in this project' };
    }

    const eligible = await prisma.bOQ.findMany({
      where: {
        orderId,
        projectId,
        status: { in: [BOQStatus.DRAFT, BOQStatus.REVISED, BOQStatus.PENDING_APPROVAL] },
        items: { some: {} },
      },
      select: { id: true },
    });

    if (eligible.length === 0) {
      return { success: false, error: 'No BOQs are ready to approve' };
    }

    let count = 0;
    for (const { id } of eligible) {
      const result = await BOQService.approve(id, actorId, role, projectId);
      if (result.success) count++;
    }

    if (count === 0) {
      return { success: false, error: 'Failed to approve BOQs' };
    }

    return { success: true, count };
  }

  /**
   * Owner sends every BOQ under a Purchase Order that's ready for a decision back for
   * revision, in one action, with a single shared reason. Same eligible set as `approveBulk`
   * (the two are the alternate outcomes of the same review batch), reusing the single-BOQ
   * `requestRevision()` so the per-BOQ business rules stay in one place.
   */
  static async requestRevisionBulk(
    orderId: string,
    reason: string,
    actorId: string,
    role: Role,
    projectId: string
  ): Promise<{ success: boolean; count?: number; error?: string }> {
    if (role !== Role.CLIENT) {
      return { success: false, error: 'Only Owner can request BOQ revision' };
    }
    if (!reason || reason.trim().length === 0) {
      return { success: false, error: 'Revision reason is required' };
    }

    const order = await prisma.phase.findFirst({ where: { id: orderId, projectId } });
    if (!order) {
      return { success: false, error: 'Purchase order not found in this project' };
    }

    const eligible = await prisma.bOQ.findMany({
      where: {
        orderId,
        projectId,
        status: { in: [BOQStatus.DRAFT, BOQStatus.REVISED, BOQStatus.PENDING_APPROVAL] },
        items: { some: {} },
      },
      select: { id: true },
    });

    if (eligible.length === 0) {
      return { success: false, error: 'No BOQs are ready to send back for revision' };
    }

    let count = 0;
    for (const { id } of eligible) {
      const result = await BOQService.requestRevision(id, reason, actorId, role, projectId);
      if (result.success) count++;
    }

    if (count === 0) {
      return { success: false, error: 'Failed to send BOQs back for revision' };
    }

    return { success: true, count };
  }

  /**
   * Get BOQ with items.
   */
  static async getWithItems(boqId: string) {
    return prisma.bOQ.findUnique({
      where: { id: boqId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
        },
        order: {
          select: { id: true, name: true, vendorUserId: true },
        },
      },
    });
  }

  /**
   * Get project's approved BOQ.
   */
  static async getApprovedForProject(projectId: string) {
    return prisma.bOQ.findFirst({
      where: {
        projectId,
        status: { in: [BOQStatus.APPROVED, BOQStatus.REVISED] },
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }
}
