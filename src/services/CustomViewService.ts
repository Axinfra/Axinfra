import { prisma } from '@/lib/db';
import { MilestoneState, EligibilityState } from '@/types';

/**
 * CustomViewService - Handles READ-ONLY custom view operations.
 *
 * CRITICAL: This service NEVER modifies milestone data.
 * It only provides filtering, grouping, and sorting projections.
 */

export interface CustomViewConfig {
  filters: {
    trade?: string;
    vendor?: string;
    eligibilityState?: EligibilityState[];
    milestoneState?: MilestoneState[];
    isDelayed?: boolean;
    completionMin?: number;
    completionMax?: number;
    dueDateFrom?: string;
    dueDateTo?: string;
  };
  groupBy?: 'trade' | 'vendor' | 'zone' | 'eligibilityState' | 'milestoneState' | 'completionBucket';
  sortBy?: 'dueDate' | 'completion' | 'value' | 'createdAt';
  sortOrder?: 'asc' | 'desc';
}

export interface CustomViewData {
  id: string;
  name: string;
  config: CustomViewConfig;
  isDefault: boolean;
  createdAt: Date;
}

export interface MilestoneProjection {
  id: string;
  title: string;
  description: string | null;
  state: MilestoneState;
  paymentModel: string;
  plannedEnd: Date | null;
  plannedValue: number;
  completionPercent: number;
  isDelayed: boolean;
  vendor: string | null;
  trade: string | null;
  eligibilityState: EligibilityState | null;
  paymentValue: number;
}

export interface GroupedMilestones {
  groupKey: string;
  groupLabel: string;
  milestones: MilestoneProjection[];
  totalValue: number;
  count: number;
}

export class CustomViewService {
  /**
   * Get all custom views for a user in a project.
   * READ-ONLY operation.
   */
  static async getViewsForUser(projectId: string, userId: string): Promise<CustomViewData[]> {
    const views = await prisma.customView.findMany({
      where: {
        projectId,
        userId,
      },
      orderBy: [
        { isDefault: 'desc' },
        { name: 'asc' },
      ],
    });

    return views.map(v => ({
      id: v.id,
      name: v.name,
      config: JSON.parse(v.config) as CustomViewConfig,
      isDefault: v.isDefault,
      createdAt: v.createdAt,
    }));
  }

  /**
   * Get a single custom view by ID.
   * READ-ONLY operation.
   */
  static async getView(viewId: string): Promise<CustomViewData | null> {
    const view = await prisma.customView.findUnique({
      where: { id: viewId },
    });

    if (!view) return null;

    return {
      id: view.id,
      name: view.name,
      config: JSON.parse(view.config) as CustomViewConfig,
      isDefault: view.isDefault,
      createdAt: view.createdAt,
    };
  }

  /**
   * Create a new custom view configuration.
   * This only saves view settings, NOT milestone data.
   */
  static async createView(
    projectId: string,
    userId: string,
    name: string,
    config: CustomViewConfig
  ): Promise<CustomViewData> {
    const view = await prisma.customView.create({
      data: {
        projectId,
        userId,
        name,
        config: JSON.stringify(config),
        isDefault: false,
      },
    });

    return {
      id: view.id,
      name: view.name,
      config: JSON.parse(view.config) as CustomViewConfig,
      isDefault: view.isDefault,
      createdAt: view.createdAt,
    };
  }

  /**
   * Update a custom view configuration.
   * This only updates view settings, NOT milestone data.
   */
  static async updateView(
    viewId: string,
    userId: string,
    updates: { name?: string; config?: CustomViewConfig }
  ): Promise<CustomViewData | null> {
    // Verify ownership
    const existing = await prisma.customView.findUnique({
      where: { id: viewId },
    });

    if (!existing || existing.userId !== userId) {
      return null;
    }

    const view = await prisma.customView.update({
      where: { id: viewId },
      data: {
        ...(updates.name && { name: updates.name }),
        ...(updates.config && { config: JSON.stringify(updates.config) }),
      },
    });

    return {
      id: view.id,
      name: view.name,
      config: JSON.parse(view.config) as CustomViewConfig,
      isDefault: view.isDefault,
      createdAt: view.createdAt,
    };
  }

  /**
   * Delete a custom view.
   */
  static async deleteView(viewId: string, userId: string): Promise<boolean> {
    const existing = await prisma.customView.findUnique({
      where: { id: viewId },
    });

    if (!existing || existing.userId !== userId) {
      return false;
    }

    await prisma.customView.delete({
      where: { id: viewId },
    });

    return true;
  }

  /**
   * Apply filters, grouping, and sorting to milestones.
   *
   * CRITICAL: This is a READ-ONLY operation.
   * It fetches milestone data and transforms it for display only.
   * NO WRITES, NO STATE CHANGES.
   */
  static async applyView(
    projectId: string,
    config: CustomViewConfig
  ): Promise<GroupedMilestones[]> {
    // Fetch all milestones with related data (READ-ONLY)
    const milestones = await prisma.milestone.findMany({
      where: {
        projectId,
        // Apply state filter if specified
        ...(config.filters.milestoneState?.length && {
          state: { in: config.filters.milestoneState },
        }),
        // Apply due date filters
        ...(config.filters.dueDateFrom && {
          plannedEnd: { gte: new Date(config.filters.dueDateFrom) },
        }),
        ...(config.filters.dueDateTo && {
          plannedEnd: { lte: new Date(config.filters.dueDateTo) },
        }),
      },
      include: {
        paymentEligibility: true,
        boqLinks: {
          include: {
            boqItem: true,
          },
        },
        evidence: {
          where: { status: 'APPROVED' },
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
      },
    });

    // Transform to projections
    const now = new Date();
    let projections: MilestoneProjection[] = milestones.map(m => {
      // Calculate planned value from BOQ links
      const plannedValue = m.boqLinks.reduce(
        (sum, link) => sum + link.plannedQty * link.boqItem.rate,
        0
      );

      // Get latest approved evidence completion
      const completionPercent = m.evidence[0]?.qtyOrPercent ?? 0;

      // Check if delayed (past due date and not closed)
      const isDelayed = m.plannedEnd
        ? m.plannedEnd < now && m.state !== MilestoneState.CLOSED
        : false;

      // Extract trade from BOQ description (first linked item)
      const trade = m.boqLinks[0]?.boqItem.description.split(' ')[0] || null;

      return {
        id: m.id,
        title: m.title,
        description: m.description,
        state: m.state as MilestoneState,
        paymentModel: m.paymentModel,
        plannedEnd: m.plannedEnd,
        plannedValue,
        completionPercent,
        isDelayed,
        vendor: null, // Would need to track vendor assignment
        trade,
        eligibilityState: (m.paymentEligibility?.state as EligibilityState) ?? null,
        paymentValue: m.paymentEligibility?.eligibleAmount ?? 0,
      };
    });

    // Apply additional filters
    if (config.filters.isDelayed !== undefined) {
      projections = projections.filter(p => p.isDelayed === config.filters.isDelayed);
    }

    if (config.filters.completionMin !== undefined) {
      projections = projections.filter(p => p.completionPercent >= config.filters.completionMin!);
    }

    if (config.filters.completionMax !== undefined) {
      projections = projections.filter(p => p.completionPercent <= config.filters.completionMax!);
    }

    if (config.filters.eligibilityState?.length) {
      projections = projections.filter(
        p => p.eligibilityState && config.filters.eligibilityState!.includes(p.eligibilityState)
      );
    }

    if (config.filters.trade) {
      projections = projections.filter(
        p => p.trade?.toLowerCase().includes(config.filters.trade!.toLowerCase())
      );
    }

    // Apply sorting
    const sortOrder = config.sortOrder === 'desc' ? -1 : 1;
    switch (config.sortBy) {
      case 'dueDate':
        projections.sort((a, b) => {
          if (!a.plannedEnd) return 1;
          if (!b.plannedEnd) return -1;
          return sortOrder * (a.plannedEnd.getTime() - b.plannedEnd.getTime());
        });
        break;
      case 'completion':
        projections.sort((a, b) => sortOrder * (a.completionPercent - b.completionPercent));
        break;
      case 'value':
        projections.sort((a, b) => sortOrder * (a.plannedValue - b.plannedValue));
        break;
      case 'createdAt':
      default:
        // Keep original order (by createdAt from DB)
        break;
    }

    // Apply grouping
    const groups = this.groupMilestones(projections, config.groupBy);

    return groups;
  }

  /**
   * Group milestones by the specified field.
   * READ-ONLY transformation.
   */
  private static groupMilestones(
    milestones: MilestoneProjection[],
    groupBy?: string
  ): GroupedMilestones[] {
    if (!groupBy) {
      // No grouping - return single group
      return [
        {
          groupKey: 'all',
          groupLabel: 'All Milestones',
          milestones,
          totalValue: milestones.reduce((sum, m) => sum + m.plannedValue, 0),
          count: milestones.length,
        },
      ];
    }

    const groupMap = new Map<string, MilestoneProjection[]>();

    for (const milestone of milestones) {
      let key: string;
      let label: string;

      switch (groupBy) {
        case 'milestoneState':
          key = milestone.state;
          label = milestone.state.replace('_', ' ');
          break;
        case 'eligibilityState':
          key = milestone.eligibilityState || 'NOT_DUE';
          label = (milestone.eligibilityState || 'Not Due').replace('_', ' ');
          break;
        case 'trade':
          key = milestone.trade || 'Unknown';
          label = milestone.trade || 'Unknown Trade';
          break;
        case 'vendor':
          key = milestone.vendor || 'Unassigned';
          label = milestone.vendor || 'Unassigned Vendor';
          break;
        case 'completionBucket':
          if (milestone.completionPercent < 30) {
            key = '0-30';
            label = '0-30% Complete';
          } else if (milestone.completionPercent < 70) {
            key = '30-70';
            label = '30-70% Complete';
          } else {
            key = '70-100';
            label = '70-100% Complete';
          }
          break;
        default:
          key = 'all';
          label = 'All';
      }

      const existing = groupMap.get(key) || [];
      existing.push(milestone);
      groupMap.set(key, existing);
    }

    // Convert map to array
    const groups: GroupedMilestones[] = [];
    groupMap.forEach((ms, key) => {
      groups.push({
        groupKey: key,
        groupLabel: this.getGroupLabel(groupBy, key),
        milestones: ms,
        totalValue: ms.reduce((sum, m) => sum + m.plannedValue, 0),
        count: ms.length,
      });
    });

    // Sort groups
    return groups.sort((a, b) => a.groupLabel.localeCompare(b.groupLabel));
  }

  /**
   * Get human-readable label for group.
   */
  private static getGroupLabel(groupBy: string, key: string): string {
    const labels: Record<string, Record<string, string>> = {
      milestoneState: {
        DRAFT: 'Draft',
        IN_PROGRESS: 'In Progress',
        SUBMITTED: 'Submitted',
        VERIFIED: 'Verified',
        CLOSED: 'Closed',
      },
      eligibilityState: {
        NOT_DUE: 'Not Due',
        DUE_PENDING_VERIFICATION: 'Pending Verification',
        VERIFIED_NOT_ELIGIBLE: 'Not Eligible',
        PARTIALLY_ELIGIBLE: 'Partially Eligible',
        FULLY_ELIGIBLE: 'Fully Eligible',
        BLOCKED: 'Blocked',
        MARKED_PAID: 'Paid',
      },
      completionBucket: {
        '0-30': '0-30% Complete',
        '30-70': '30-70% Complete',
        '70-100': '70-100% Complete',
      },
    };

    return labels[groupBy]?.[key] || key;
  }

  /**
   * Get predefined view templates.
   * These are common views users might want to create.
   */
  static getPredefinedTemplates(): Array<{ name: string; config: CustomViewConfig }> {
    return [
      {
        name: 'Delayed Milestones',
        config: {
          filters: { isDelayed: true },
          groupBy: 'milestoneState',
          sortBy: 'dueDate',
          sortOrder: 'asc',
        },
      },
      {
        name: 'Payment Ready',
        config: {
          filters: { eligibilityState: [EligibilityState.PARTIALLY_ELIGIBLE, EligibilityState.FULLY_ELIGIBLE] },
          groupBy: 'eligibilityState',
          sortBy: 'value',
          sortOrder: 'desc',
        },
      },
      {
        name: 'Blocked Payments',
        config: {
          filters: { eligibilityState: [EligibilityState.BLOCKED] },
          sortBy: 'value',
          sortOrder: 'desc',
        },
      },
      {
        name: 'Near Completion (70%+)',
        config: {
          filters: { completionMin: 70 },
          groupBy: 'milestoneState',
          sortBy: 'completion',
          sortOrder: 'desc',
        },
      },
      {
        name: 'Not Started (<30%)',
        config: {
          filters: { completionMax: 30, milestoneState: [MilestoneState.IN_PROGRESS] },
          sortBy: 'dueDate',
          sortOrder: 'asc',
        },
      },
      {
        name: 'By State',
        config: {
          filters: {},
          groupBy: 'milestoneState',
          sortBy: 'dueDate',
        },
      },
      {
        name: 'By Completion',
        config: {
          filters: {},
          groupBy: 'completionBucket',
          sortBy: 'completion',
          sortOrder: 'desc',
        },
      },
    ];
  }
}
