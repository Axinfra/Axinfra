/**
 * CashModuleService - Builder-private financial tracking.
 *
 * SECURITY: All methods are restricted to BUILDER role only.
 * PMC_MANAGER, ENGINEER, PMC, VENDOR must NEVER access this data.
 * Role enforcement is done at the API layer via RoleGuard.canAccessCashModule().
 * This service assumes callers have already passed the role check.
 */

import { prisma } from '@/lib/db';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, CashAdjustmentType, CashSummary, Role } from '@/types';

// ─── Input Types ────────────────────────────────────────────────────────────

export interface CreateCashAdjustmentInput {
  projectId: string;
  description: string;
  amount: number;
  type: CashAdjustmentType;
  reason?: string;
  actorId: string;
  actorRole: Role;
}

export interface ListCashAdjustmentsInput {
  projectId: string;
  type?: CashAdjustmentType;
  limit?: number;
  offset?: number;
}

export interface CreatePrivateCostInput {
  projectId: string;
  description: string;
  amount: number;
  category: string;
  vendor?: string;
  notes?: string;
  incurredAt?: Date;
  actorId: string;
  actorRole: Role;
}

export interface ListPrivateCostsInput {
  projectId: string;
  category?: string;
  limit?: number;
  offset?: number;
}

// ─── Service ────────────────────────────────────────────────────────────────

export class CashModuleService {
  /**
   * Create a new cash adjustment (credit or debit).
   * Used by BUILDER to track incoming/outgoing cash privately.
   */
  static async createCashAdjustment(input: CreateCashAdjustmentInput) {
    const { projectId, description, amount, type, reason, actorId, actorRole } = input;

    const adjustment = await prisma.$transaction(async (tx) => {
      const created = await tx.cashAdjustment.create({
        data: {
          projectId,
          description,
          amount,
          type,
          reason: reason || null,
          createdById: actorId,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return created;
    });

    // Audit log outside transaction for reliability
    await AuditLogger.log({
      projectId,
      actorId,
      role: actorRole,
      actionType: AuditActionTypes.CASH_ADJUSTMENT_CREATE,
      entityType: 'CashAdjustment',
      entityId: adjustment.id,
      afterJson: {
        description,
        amount,
        type,
        reason,
      },
    });

    return adjustment;
  }

  /**
   * List cash adjustments for a project with optional filtering.
   */
  static async listCashAdjustments(input: ListCashAdjustmentsInput) {
    const { projectId, type, limit = 100, offset = 0 } = input;

    const where: Record<string, unknown> = { projectId };
    if (type) where.type = type;

    const [adjustments, total] = await Promise.all([
      prisma.cashAdjustment.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.cashAdjustment.count({ where }),
    ]);

    return { adjustments, total };
  }

  /**
   * Create a private cost entry.
   * Used by BUILDER to track internal costs not visible to PMC/Vendor.
   */
  static async createPrivateCostEntry(input: CreatePrivateCostInput) {
    const { projectId, description, amount, category, vendor, notes, incurredAt, actorId, actorRole } = input;

    const costEntry = await prisma.$transaction(async (tx) => {
      const created = await tx.privateCostEntry.create({
        data: {
          projectId,
          description,
          amount,
          category,
          vendor: vendor || null,
          notes: notes || null,
          incurredAt: incurredAt || null,
          createdById: actorId,
        },
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
      });

      return created;
    });

    // Audit log outside transaction for reliability
    await AuditLogger.log({
      projectId,
      actorId,
      role: actorRole,
      actionType: AuditActionTypes.PRIVATE_COST_CREATE,
      entityType: 'PrivateCostEntry',
      entityId: costEntry.id,
      afterJson: {
        description,
        amount,
        category,
        vendor,
        notes,
        incurredAt,
      },
    });

    return costEntry;
  }

  /**
   * List private cost entries for a project with optional filtering.
   */
  static async listPrivateCosts(input: ListPrivateCostsInput) {
    const { projectId, category, limit = 100, offset = 0 } = input;

    const where: Record<string, unknown> = { projectId };
    if (category) where.category = category;

    const [costs, total] = await Promise.all([
      prisma.privateCostEntry.findMany({
        where,
        include: {
          createdBy: {
            select: { id: true, name: true, email: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.privateCostEntry.count({ where }),
    ]);

    return { costs, total };
  }

  /**
   * Get an aggregate cash summary for the project.
   * Returns totals for credits, debits, net position, and cost breakdown by category.
   */
  static async getCashSummary(projectId: string): Promise<CashSummary> {
    // Use DB-level aggregation to avoid floating-point accumulation errors
    const [creditAgg, debitAgg, adjustmentCount, costs, costEntryCount] = await Promise.all([
      prisma.cashAdjustment.aggregate({
        where: { projectId, type: 'CREDIT' },
        _sum: { amount: true },
      }),
      prisma.cashAdjustment.aggregate({
        where: { projectId, type: 'DEBIT' },
        _sum: { amount: true },
      }),
      prisma.cashAdjustment.count({ where: { projectId } }),
      // For cost-by-category breakdown, we still need individual rows (groupBy not available for all adapters)
      prisma.privateCostEntry.findMany({
        where: { projectId },
        select: { amount: true, category: true },
      }),
      prisma.privateCostEntry.count({ where: { projectId } }),
    ]);

    const totalCredits = Math.round((creditAgg._sum.amount ?? 0) * 100) / 100;
    const totalDebits = Math.round((debitAgg._sum.amount ?? 0) * 100) / 100;

    // Calculate cost totals by category with rounding
    const costsByCategory: Record<string, number> = {};
    let totalPrivateCosts = 0;
    for (const cost of costs) {
      totalPrivateCosts += cost.amount;
      costsByCategory[cost.category] = (costsByCategory[cost.category] || 0) + cost.amount;
    }
    // Round all financial values to 2 decimal places
    totalPrivateCosts = Math.round(totalPrivateCosts * 100) / 100;
    for (const key of Object.keys(costsByCategory)) {
      costsByCategory[key] = Math.round(costsByCategory[key] * 100) / 100;
    }

    return {
      totalCredits,
      totalDebits,
      netCashPosition: Math.round((totalCredits - totalDebits) * 100) / 100,
      totalPrivateCosts,
      costsByCategory,
      adjustmentCount,
      costEntryCount,
    };
  }
}
