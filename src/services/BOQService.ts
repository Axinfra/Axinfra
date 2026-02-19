import { BOQStatus, Role, AuditActionTypes } from '@/types';
import { prisma } from '@/lib/db';
import { AuditLogger } from './AuditLogger';

export interface BOQItemInput {
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
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
    role: Role
  ): Promise<{ success: boolean; boqId?: string; error?: string }> {
    // Check for existing draft BOQ
    const existingDraft = await prisma.bOQ.findFirst({
      where: { projectId, status: BOQStatus.DRAFT },
    });

    if (existingDraft) {
      return { success: false, error: 'A draft BOQ already exists' };
    }

    const boq = await prisma.bOQ.create({
      data: { projectId },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_CREATE,
      entityType: 'BOQ',
      entityId: boq.id,
      afterJson: { status: BOQStatus.DRAFT },
    });

    return { success: true, boqId: boq.id };
  }

  /**
   * Add an item to a BOQ.
   * Only allowed for DRAFT BOQs.
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

    if (boq.status !== BOQStatus.DRAFT) {
      return { success: false, error: 'Cannot add items to approved BOQ. Use revision.' };
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
   * Only allowed for DRAFT BOQs.
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

    if (item.boq.status !== BOQStatus.DRAFT) {
      return { success: false, error: 'Cannot modify items in approved BOQ. Use revision.' };
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
   * Only allowed for DRAFT BOQs.
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

    if (item.boq.status !== BOQStatus.DRAFT) {
      return { success: false, error: 'Cannot remove items from approved BOQ. Use revision.' };
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
    if (role !== Role.OWNER) {
      return { success: false, error: 'Only Owner can approve BOQ' };
    }

    const boq = await prisma.bOQ.findFirst({
      where: { id: boqId, projectId },
      include: { items: true },
    });

    if (!boq) {
      return { success: false, error: 'BOQ not found' };
    }

    if (boq.status !== BOQStatus.DRAFT) {
      return { success: false, error: 'BOQ is not in DRAFT status' };
    }

    if (boq.items.length === 0) {
      return { success: false, error: 'Cannot approve empty BOQ' };
    }

    await prisma.bOQ.update({
      where: { id: boqId },
      data: { status: BOQStatus.APPROVED },
    });

    await AuditLogger.log({
      projectId,
      actorId,
      role,
      actionType: AuditActionTypes.BOQ_APPROVE,
      entityType: 'BOQ',
      entityId: boqId,
      beforeJson: { status: BOQStatus.DRAFT },
      afterJson: { status: BOQStatus.APPROVED },
    });

    return { success: true };
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
