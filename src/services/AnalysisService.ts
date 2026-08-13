import { prisma } from '@/lib/db';
import { MilestoneState, EligibilityState, Role } from '@/types';
import { computeScheduleVariance, type ActivityHealth } from '@/lib/scheduleVariance';
import { classifyLifecycleStatus, startOfDay, type LifecycleStatus } from '@/lib/activityStatus';
import { DirectOrderService } from '@/services/DirectOrderService';

/**
 * AnalysisService - READ-ONLY intelligence layer for Axinfra.
 *
 * CRITICAL SAFETY CONSTRAINTS:
 * - This service NEVER mutates data
 * - All operations are read-only aggregations
 * - No new business logic - only statistics
 * - Single source of truth: existing Axinfra data
 */

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ExecutionAnalysis {
  overview: {
    totalMilestones: number;
    verifiedPercent: number;
    avgDaysInProgress: number;
    avgDaysInSubmitted: number;
    doneCount: number;
    inProgressCount: number;
    submittedCount: number;
    approachingCount: number; // due within 30d, not verified
    draftCount: number;
  };
  /** Grouped by the 6 valid, user-facing lifecycle labels (Draft/Upcoming/In Progress/Delayed/
   * Complete/Closed) — not the raw `Milestone.state` column, which is an unconstrained `String`
   * in the DB (no enum, no CHECK constraint) and only holds DRAFT/IN_PROGRESS/SUBMITTED/VERIFIED/
   * CLOSED by application convention. See `classifyLifecycleStatus` in `lib/activityStatus.ts`. */
  stateBreakdown: Array<{
    state: LifecycleStatus;
    count: number;
    percent: number;
    avgDaysInState: number;
  }>;
  slaBreaches: Array<{
    milestoneId: string;
    title: string;
    state: MilestoneState;
    daysInState: number;
    threshold: number;
  }>;
  byTrade: Array<{
    trade: string;
    total: number;
    verified: number;
    avgDaysToVerify: number;
  }>;
  /** Physical progress from an imported MS Project schedule — a separate signal from
   * `stateBreakdown` above. Schedule-imported tasks never enter the payment workflow state
   * machine (they stay DRAFT forever, since there's no verify step for them), so % Complete
   * from the source file is their real completion signal instead. Only present when the
   * project has at least one schedule-imported milestone (wbsCode set). */
  scheduleProgress: {
    hasImportedTasks: boolean;
    totalImported: number;
    completed: number;
    inProgress: number;
    notStarted: number;
    avgPercentComplete: number;
  };
}

export interface FinancialAnalysis {
  summary: {
    totalProjectValue: number;
    certifiedValue: number;
    paidValue: number;
    blockedValue: number;
    eligibleUnpaid: number;
    exposedValue: number;
    retentionHeld: number;
  };
  byState: Array<{
    state: EligibilityState;
    count: number;
    value: number;
    percent: number;
  }>;
  byPaymentModel: Array<{
    model: string;
    totalValue: number;
    certifiedValue: number;
    paidValue: number;
  }>;
  cashFlowRisk: {
    dueSoon: number;
    blockedTooLong: number;
    highExposure: number;
  };
}

export interface VendorAnalysis {
  vendors: Array<{
    vendorId: string;
    vendorName: string;
    contractValue: number;
    boqValue: number; // Original BOQ planned value
    overrunValue: number; // contractValue - boqValue (positive = overrun)
    overrunPercent: number; // percentage over/under BOQ
    certifiedValue: number;
    paidValue: number;
    exposureValue: number;
    exposurePercent: number;
    milestonesTotal: number;
    milestonesVerified: number;
    avgVerificationDays: number;
    riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
  }>;
  totals: {
    totalVendors: number;
    highRiskCount: number;
    totalExposure: number;
    totalBoqValue: number;
    totalOverrunValue: number;
    totalOverrunPercent: number;
  };
}

export interface DelayRiskAnalysis {
  delayedMilestones: Array<{
    id: string;
    title: string;
    state: MilestoneState;
    dueDate: Date;
    daysOverdue: number;
    value: number;
    severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
  }>;
  riskBuckets: {
    safe: { count: number; value: number; items: string[] };
    attention: { count: number; value: number; items: string[] };
    immediate: { count: number; value: number; items: string[] };
  };
  blockedPayments: Array<{
    milestoneId: string;
    title: string;
    value: number;
    daysBlocked: number;
    reason: string;
  }>;
  boqOverruns: Array<{
    itemDescription: string;
    plannedValue: number;
    actualValue: number;
    overrunPercent: number;
  }>;
  overallRiskScore: number; // 0-100
}

export interface VarianceAnalysis {
  schedule: {
    overdueActivities: Array<{
      id: string;
      title: string;
      state: MilestoneState;
      dueDate: Date;
      daysOverdue: number;
      severity: 'MINOR' | 'MAJOR' | 'CRITICAL';
    }>;
    upcomingAtRisk: Array<{
      id: string;
      title: string;
      dueDate: Date;
      daysRemaining: number;
    }>;
    totalActivities: number;
    overdueCount: number;
    onTimePercent: number;
    /** On Track / At Risk / Delayed / Completed Late / Completed On Time — counts across every
     * activity in the project, from the same `computeScheduleVariance` function the Activities
     * list, bucket tabs, and activity detail page use, so this never disagrees with them. */
    healthBreakdown: Record<ActivityHealth, number>;
  };
  bills: {
    byOrder: Array<{
      orderId: string;
      orderName: string;
      boqPlannedValue: number;
      submittedValue: number;
      approvedValue: number;
      releasedValue: number;
      variance: number; // boqPlannedValue - releasedValue (positive = money not yet billed/released)
      variancePercent: number;
      billCount: number;
    }>;
    totals: {
      totalPlannedValue: number;
      totalSubmittedValue: number;
      totalApprovedValue: number;
      totalReleasedValue: number;
      totalVariance: number;
      totalVariancePercent: number;
    };
  };
  /** Direct Orders (one-off vendor purchases outside the BOQ/Work-Order flow) — value is
   * already folded into `bills.totals.totalPlannedValue`/`totalReleasedValue` above so the
   * headline variance/cost figures used across Analysis and Reports include them automatically;
   * this breakdown is for displaying the Direct Order contribution on its own. */
  directOrders: {
    totalOrdered: number;
    totalDeliveredValue: number;
    paid: number;
    outstanding: number;
    totalVariance: number;
  };
  overdueBills: Array<{
    raBillId: string;
    billNumber: number;
    orderId: string;
    orderName: string;
    stage: string;
    daysInStage: number;
    amount: number;
  }>;
  overallVarianceScore: number; // 0-100, higher = more time/money drift
}

export interface ComplianceAuditAnalysis {
  auditCompleteness: {
    score: number; // 0-100
    totalActions: number;
    loggedActions: number;
    missingReasons: number;
  };
  recentAuditActivity: Array<{
    date: string;
    actionCount: number;
    byRole: Record<string, number>;
  }>;
}

export interface FullAnalysis {
  execution: ExecutionAnalysis;
  financial: FinancialAnalysis;
  vendor: VendorAnalysis;
  delayRisk: DelayRiskAnalysis;
  variance: VarianceAnalysis;
  compliance: ComplianceAuditAnalysis;
  generatedAt: Date;
}

// ============================================
// SLA THRESHOLDS (configurable)
// ============================================

const SLA_THRESHOLDS = {
  IN_PROGRESS_MAX_DAYS: 30,
  SUBMITTED_MAX_DAYS: 7,
  BLOCKED_PAYMENT_MAX_DAYS: 14,
  EXPOSURE_HIGH_THRESHOLD: 0.2, // 20%
  BOQ_OVERRUN_THRESHOLD: 0.1, // 10%
  UPCOMING_AT_RISK_DAYS: 7,
  // RA Bill lifecycle — how long a bill may sit in a given stage before it counts as overdue.
  AWAITING_CERTIFICATION_MAX_DAYS: 7, // PENDING_VENDOR_REVIEW
  AWAITING_APPROVAL_MAX_DAYS: 7, // CERTIFIED
  AWAITING_PAYMENT_MAX_DAYS: 14, // APPROVED
  AWAITING_RESUBMISSION_MAX_DAYS: 7, // REVISION_REQUESTED
};

// ============================================
// ANALYSIS SERVICE
// ============================================

export class AnalysisService {
  /**
   * Generate full project analysis.
   * READ-ONLY - aggregates existing data only.
   */
  static async getFullAnalysis(projectId: string): Promise<FullAnalysis> {
    const [execution, financial, vendor, delayRisk, variance, compliance] = await Promise.all([
      this.getExecutionAnalysis(projectId),
      this.getFinancialAnalysis(projectId),
      this.getVendorAnalysis(projectId),
      this.getDelayRiskAnalysis(projectId),
      this.getVarianceAnalysis(projectId),
      this.getComplianceAuditAnalysis(projectId),
    ]);

    return {
      execution,
      financial,
      vendor,
      delayRisk,
      variance,
      compliance,
      generatedAt: new Date(),
    };
  }

  /**
   * EXECUTION ANALYSIS
   * Answer: "Where is work actually moving, and where is it stuck?"
   */
  static async getExecutionAnalysis(projectId: string): Promise<ExecutionAnalysis> {
    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      include: {
        transitions: { orderBy: { createdAt: 'asc' } },
        boqLinks: { include: { boqItem: true } },
      },
    });

    const now = new Date();
    const thirtyDaysOut = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const totalMilestones = milestones.length;
    const verifiedCount = milestones.filter(m =>
      ([MilestoneState.VERIFIED, MilestoneState.CLOSED] as string[]).includes(m.state)
    ).length;

    // Schedule progress — a separate signal from workflow state, see ExecutionAnalysis doc.
    const imported = milestones.filter(m => m.wbsCode !== null);
    const scheduleProgress = {
      hasImportedTasks: imported.length > 0,
      totalImported: imported.length,
      completed: imported.filter(m =>
        (m.percentComplete ?? 0) >= 100 || ([MilestoneState.VERIFIED, MilestoneState.CLOSED] as string[]).includes(m.state)
      ).length,
      inProgress: imported.filter(m => {
        const pct = m.percentComplete ?? 0;
        return pct > 0 && pct < 100 && !([MilestoneState.VERIFIED, MilestoneState.CLOSED] as string[]).includes(m.state);
      }).length,
      notStarted: imported.filter(m =>
        (m.percentComplete ?? 0) <= 0 && !([MilestoneState.VERIFIED, MilestoneState.CLOSED] as string[]).includes(m.state)
      ).length,
      avgPercentComplete: imported.length > 0
        ? Math.round((imported.reduce((s, m) => s + (m.percentComplete ?? 0), 0) / imported.length) * 10) / 10
        : 0,
    };
    const doneCount = verifiedCount;
    const inProgressCount = milestones.filter(m => m.state === MilestoneState.IN_PROGRESS).length;
    const submittedCount = milestones.filter(m => m.state === MilestoneState.SUBMITTED).length;
    const draftCount = milestones.filter(m => m.state === MilestoneState.DRAFT).length;
    // Approaching: plannedEnd within next 30 days, not yet verified/closed
    const approachingCount = milestones.filter(m =>
      m.plannedEnd &&
      m.plannedEnd > now &&
      m.plannedEnd <= thirtyDaysOut &&
      !([MilestoneState.VERIFIED, MilestoneState.CLOSED] as string[]).includes(m.state)
    ).length;

    // Calculate time spent in each state
    const stateTimings: Record<MilestoneState, number[]> = {
      DRAFT: [],
      IN_PROGRESS: [],
      SUBMITTED: [],
      VERIFIED: [],
      CLOSED: [],
    };

    const slaBreaches: ExecutionAnalysis['slaBreaches'] = [];

    for (const milestone of milestones) {
      let lastTransitionTime = milestone.createdAt;
      let lastState: string | null = null;

      for (const transition of milestone.transitions) {
        if (lastState) {
          const daysInState = (transition.createdAt.getTime() - lastTransitionTime.getTime()) / (1000 * 60 * 60 * 24);
          stateTimings[lastState as MilestoneState].push(daysInState);
        }
        lastState = transition.toState;
        lastTransitionTime = transition.createdAt;
      }

      // Current state duration
      if (lastState && lastState !== MilestoneState.CLOSED) {
        const daysInCurrentState = (now.getTime() - lastTransitionTime.getTime()) / (1000 * 60 * 60 * 24);
        stateTimings[lastState as MilestoneState].push(daysInCurrentState);

        // Check SLA breaches
        const threshold = lastState === MilestoneState.IN_PROGRESS
          ? SLA_THRESHOLDS.IN_PROGRESS_MAX_DAYS
          : lastState === MilestoneState.SUBMITTED
            ? SLA_THRESHOLDS.SUBMITTED_MAX_DAYS
            : 999;

        if (daysInCurrentState > threshold) {
          slaBreaches.push({
            milestoneId: milestone.id,
            title: milestone.title,
            state: lastState as MilestoneState,
            daysInState: Math.round(daysInCurrentState),
            threshold,
          });
        }
      }
    }

    // Calculate averages
    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    const DAY_MS = 1000 * 60 * 60 * 24;

    // Lifecycle breakdown (Draft/Upcoming/In Progress/Delayed/Complete/Closed) — the 6 valid
    // display buckets, computed from real DB fields (state + plannedStart/plannedEnd) via
    // classifyLifecycleStatus, the same single source of truth used by the Activities page.
    // The "avg" metric is bucket-relevant rather than a single generic "days in state" figure:
    // Draft = days sitting unscheduled, Upcoming = days until start, In Progress = days actively
    // running, Delayed = days overdue, Complete/Closed = actual cycle time (start → verified).
    const today = startOfDay(now);
    const lifecycleCounts: Record<LifecycleStatus, number> = {
      DRAFT: 0, UPCOMING: 0, IN_PROGRESS: 0, DELAYED: 0, COMPLETE: 0, CLOSED: 0,
    };
    const lifecycleTimings: Record<LifecycleStatus, number[]> = {
      DRAFT: [], UPCOMING: [], IN_PROGRESS: [], DELAYED: [], COMPLETE: [], CLOSED: [],
    };

    for (const milestone of milestones) {
      const bucket = classifyLifecycleStatus(milestone, today);
      lifecycleCounts[bucket]++;

      const lastTransition = milestone.transitions[milestone.transitions.length - 1];
      const lastTransitionTime = lastTransition ? lastTransition.createdAt : milestone.createdAt;

      let metric: number | null = null;
      if (bucket === 'DRAFT') {
        metric = (now.getTime() - milestone.createdAt.getTime()) / DAY_MS;
      } else if (bucket === 'UPCOMING') {
        metric = milestone.plannedStart ? (milestone.plannedStart.getTime() - now.getTime()) / DAY_MS : null;
      } else if (bucket === 'IN_PROGRESS') {
        metric = (now.getTime() - (milestone.actualStart ?? lastTransitionTime).getTime()) / DAY_MS;
      } else if (bucket === 'DELAYED') {
        metric = milestone.plannedEnd ? (now.getTime() - milestone.plannedEnd.getTime()) / DAY_MS : null;
      } else {
        // COMPLETE (VERIFIED) or CLOSED — real cycle time when we have both dates.
        metric = milestone.actualVerification && milestone.actualStart
          ? (milestone.actualVerification.getTime() - milestone.actualStart.getTime()) / DAY_MS
          : (now.getTime() - lastTransitionTime.getTime()) / DAY_MS;
      }
      if (metric !== null) lifecycleTimings[bucket].push(metric);
    }

    const LIFECYCLE_ORDER: LifecycleStatus[] = ['DRAFT', 'UPCOMING', 'IN_PROGRESS', 'DELAYED', 'COMPLETE', 'CLOSED'];
    const stateBreakdown = LIFECYCLE_ORDER.map((bucket) => ({
      state: bucket,
      count: lifecycleCounts[bucket],
      percent: totalMilestones > 0 ? (lifecycleCounts[bucket] / totalMilestones) * 100 : 0,
      avgDaysInState: Math.round(avg(lifecycleTimings[bucket]) * 10) / 10,
    }));

    // By trade (derived from BOQ descriptions)
    const tradeMap = new Map<string, { total: number; verified: number; daysToVerify: number[] }>();
    for (const milestone of milestones) {
      const trade = milestone.boqLinks[0]?.boqItem.description.split(' ')[0] || 'Other';
      const existing = tradeMap.get(trade) || { total: 0, verified: 0, daysToVerify: [] };
      existing.total++;
      if (([MilestoneState.VERIFIED, MilestoneState.CLOSED] as string[]).includes(milestone.state)) {
        existing.verified++;
        if (milestone.actualVerification && milestone.actualStart) {
          const days = (milestone.actualVerification.getTime() - milestone.actualStart.getTime()) / (1000 * 60 * 60 * 24);
          existing.daysToVerify.push(days);
        }
      }
      tradeMap.set(trade, existing);
    }

    const byTrade = Array.from(tradeMap.entries()).map(([trade, data]) => ({
      trade,
      total: data.total,
      verified: data.verified,
      avgDaysToVerify: Math.round(avg(data.daysToVerify) * 10) / 10,
    }));

    return {
      overview: {
        totalMilestones,
        verifiedPercent: totalMilestones > 0 ? Math.round((verifiedCount / totalMilestones) * 100) : 0,
        avgDaysInProgress: Math.round(avg(stateTimings.IN_PROGRESS) * 10) / 10,
        avgDaysInSubmitted: Math.round(avg(stateTimings.SUBMITTED) * 10) / 10,
        doneCount,
        inProgressCount,
        submittedCount,
        approachingCount,
        draftCount,
      },
      stateBreakdown,
      slaBreaches: slaBreaches.slice(0, 10), // Top 10
      byTrade,
      scheduleProgress,
    };
  }

  /**
   * FINANCIAL ANALYSIS
   * Answer: "What money is safe, blocked, or exposed right now?"
   */
  static async getFinancialAnalysis(projectId: string): Promise<FinancialAnalysis> {
    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      include: {
        paymentEligibility: true,
        boqLinks: { include: { boqItem: true } },
        verifications: { orderBy: { verifiedAt: 'desc' }, take: 1 },
      },
    });

    let totalProjectValue = 0;
    let certifiedValue = 0;
    let paidValue = 0;
    let blockedValue = 0;
    let eligibleUnpaid = 0;
    let retentionHeld = 0;

    const byState: Record<EligibilityState, { count: number; value: number }> = {
      NOT_DUE: { count: 0, value: 0 },
      DUE_PENDING_VERIFICATION: { count: 0, value: 0 },
      VERIFIED_NOT_ELIGIBLE: { count: 0, value: 0 },
      PARTIALLY_ELIGIBLE: { count: 0, value: 0 },
      FULLY_ELIGIBLE: { count: 0, value: 0 },
      BLOCKED: { count: 0, value: 0 },
      MARKED_PAID: { count: 0, value: 0 },
    };

    const byPaymentModel = new Map<string, { totalValue: number; certifiedValue: number; paidValue: number }>();

    for (const milestone of milestones) {
      // Use milestone.value directly (works for both BOQ-linked and Extras)
      // Fall back to BOQ calculation if value is 0
      let milestoneValue = milestone.value || 0;
      if (milestoneValue === 0 && milestone.boqLinks.length > 0) {
        milestoneValue = milestone.boqLinks.reduce(
          (sum: number, link: { plannedQty: number; boqItem: { rate: number } }) => sum + link.plannedQty * link.boqItem.rate,
          0
        );
      }
      totalProjectValue += milestoneValue;

      // Retention calculation
      if (milestone.retentionPercent > 0) {
        retentionHeld += milestoneValue * (milestone.retentionPercent / 100);
      }

      // Payment model breakdown
      const modelData = byPaymentModel.get(milestone.paymentModel) || { totalValue: 0, certifiedValue: 0, paidValue: 0 };
      modelData.totalValue += milestoneValue;

      if (milestone.paymentEligibility) {
        const pe = milestone.paymentEligibility;
        const peState = pe.state as EligibilityState;
        byState[peState].count++;
        byState[peState].value += pe.eligibleAmount;

        if (([MilestoneState.VERIFIED, MilestoneState.CLOSED] as string[]).includes(milestone.state)) {
          certifiedValue += pe.eligibleAmount;
          modelData.certifiedValue += pe.eligibleAmount;
        }

        if (peState === EligibilityState.MARKED_PAID) {
          paidValue += pe.eligibleAmount;
          modelData.paidValue += pe.eligibleAmount;
        } else if (peState === EligibilityState.BLOCKED) {
          blockedValue += pe.blockedAmount;
        } else if (([EligibilityState.PARTIALLY_ELIGIBLE, EligibilityState.FULLY_ELIGIBLE] as string[]).includes(pe.state)) {
          eligibleUnpaid += pe.eligibleAmount;
        }
      }

      byPaymentModel.set(milestone.paymentModel, modelData);
    }

    const exposedValue = certifiedValue - paidValue;

    // Due soon / blocked too long
    const now = new Date();
    let dueSoonValue = 0;
    let blockedTooLongValue = 0;

    for (const milestone of milestones) {
      if (milestone.paymentEligibility) {
        const pe = milestone.paymentEligibility;
        // Eligible states are "due soon" in a sense
        if (([EligibilityState.PARTIALLY_ELIGIBLE, EligibilityState.FULLY_ELIGIBLE] as string[]).includes(pe.state)) {
          dueSoonValue += pe.eligibleAmount;
        }
        if (pe.state === EligibilityState.BLOCKED && pe.blockedAt) {
          const daysBlocked = (now.getTime() - pe.blockedAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysBlocked > SLA_THRESHOLDS.BLOCKED_PAYMENT_MAX_DAYS) {
            blockedTooLongValue += pe.blockedAmount;
          }
        }
      }
    }

    return {
      summary: {
        totalProjectValue: Math.round(totalProjectValue),
        certifiedValue: Math.round(certifiedValue),
        paidValue: Math.round(paidValue),
        blockedValue: Math.round(blockedValue),
        eligibleUnpaid: Math.round(eligibleUnpaid),
        exposedValue: Math.round(exposedValue),
        retentionHeld: Math.round(retentionHeld),
      },
      byState: Object.entries(byState).map(([state, data]) => ({
        state: state as EligibilityState,
        count: data.count,
        value: Math.round(data.value),
        percent: totalProjectValue > 0 ? Math.round((data.value / totalProjectValue) * 100) : 0,
      })),
      byPaymentModel: Array.from(byPaymentModel.entries()).map(([model, data]) => ({
        model,
        totalValue: Math.round(data.totalValue),
        certifiedValue: Math.round(data.certifiedValue),
        paidValue: Math.round(data.paidValue),
      })),
      cashFlowRisk: {
        dueSoon: Math.round(dueSoonValue),
        blockedTooLong: Math.round(blockedTooLongValue),
        highExposure: Math.round(exposedValue),
      },
    };
  }

  /**
   * VENDOR ANALYSIS
   * Answer: "Which vendors are risky, slow, or over-exposed?"
   */
  static async getVendorAnalysis(projectId: string): Promise<VendorAnalysis> {
    // Independent reads — fan out in parallel.
    const [vendorRoles, milestones] = await Promise.all([
      prisma.projectRole.findMany({
        where: { projectId, role: Role.VENDOR },
        include: { user: true },
      }),
      prisma.milestone.findMany({
        where: { projectId },
        include: {
          paymentEligibility: true,
          boqLinks: { include: { boqItem: true } },
          transitions: true,
        },
      }),
    ]);

    // Vendor attribution: milestone.vendorUserId is the primary source of truth
    // for assignment, falling back to state transitions (vendor started work)
    // for milestones without a direct assignment.
    const vendorData = new Map<string, {
      vendorId: string;
      vendorName: string;
      contractValue: number;
      boqValue: number; // Original BOQ planned value (without extras)
      certifiedValue: number;
      paidValue: number;
      verificationDays: number[];
      milestones: Set<string>;
      verifiedMilestones: number;
      hasExtras: boolean; // Vendor has milestones outside BOQ
      extrasCount: number;
    }>();

    // Initialize vendors from roles
    for (const role of vendorRoles) {
      vendorData.set(role.userId, {
        vendorId: role.userId,
        vendorName: role.user.name,
        contractValue: 0,
        boqValue: 0,
        certifiedValue: 0,
        paidValue: 0,
        verificationDays: [],
        milestones: new Set(),
        verifiedMilestones: 0,
        hasExtras: false,
        extrasCount: 0,
      });
    }

    // Aggregate milestone data by vendor
    for (const milestone of milestones) {
      // Use milestone.value directly (works for both BOQ-linked and Extras)
      // Fall back to BOQ calculation if value is 0
      let milestoneValue = milestone.value || 0;
      if (milestoneValue === 0 && milestone.boqLinks.length > 0) {
        milestoneValue = milestone.boqLinks.reduce(
          (sum: number, link: { plannedQty: number; boqItem: { rate: number } }) => sum + link.plannedQty * link.boqItem.rate,
          0
        );
      }

      // Find vendor - primary path is the direct assignment; fall back to
      // checking if a vendor started the work (transitioned to IN_PROGRESS)
      let vendorId: string | null = null;

      if (milestone.vendorUserId && vendorData.has(milestone.vendorUserId)) {
        vendorId = milestone.vendorUserId;
      }

      if (!vendorId) {
        const vendorTransition = milestone.transitions.find(t =>
          t.toState === MilestoneState.IN_PROGRESS && vendorData.has(t.actorId)
        );
        if (vendorTransition) {
          vendorId = vendorTransition.actorId;
        }
      }

      // If still no vendor and there's only one vendor, assign all milestones to them
      if (!vendorId && vendorRoles.length === 1) {
        vendorId = vendorRoles[0].userId;
      }

      if (vendorId) {
        const data = vendorData.get(vendorId)!;
        data.milestones.add(milestone.id);
        data.contractValue += milestoneValue;

        // Calculate BOQ value (original planned value from BOQ links)
        const boqLinkValue = milestone.boqLinks.reduce(
          (sum: number, link: { plannedQty: number; boqItem: { rate: number } }) => sum + link.plannedQty * link.boqItem.rate,
          0
        );
        data.boqValue += boqLinkValue;

        // Track extras (outside BOQ) - flags vendor as high risk
        if ((milestone as any).isExtra) {
          data.hasExtras = true;
          data.extrasCount++;
        }

        if (([MilestoneState.VERIFIED, MilestoneState.CLOSED] as string[]).includes(milestone.state)) {
          data.verifiedMilestones++;
          if (milestone.paymentEligibility) {
            data.certifiedValue += milestone.paymentEligibility.eligibleAmount;
            if (milestone.paymentEligibility.state === EligibilityState.MARKED_PAID) {
              data.paidValue += milestone.paymentEligibility.eligibleAmount;
            }
          }

          // Verification time
          if (milestone.actualSubmission && milestone.actualVerification) {
            const days = (milestone.actualVerification.getTime() - milestone.actualSubmission.getTime()) / (1000 * 60 * 60 * 24);
            data.verificationDays.push(days);
          }
        }
      }
    }

    const avg = (arr: number[]) => arr.length > 0 ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

    const vendors = Array.from(vendorData.values()).map(v => {
      const exposureValue = v.certifiedValue - v.paidValue;
      const exposurePercent = v.contractValue > 0 ? (exposureValue / v.contractValue) * 100 : 0;
      const avgVerificationDays = avg(v.verificationDays);

      // Calculate BOQ overrun (contract value vs original BOQ value)
      const overrunValue = v.contractValue - v.boqValue;
      const overrunPercent = v.boqValue > 0 ? (overrunValue / v.boqValue) * 100 : 0;

      // Risk level determination
      // Vendors with "Extras" (outside BOQ) are automatically HIGH risk
      // Also factor in overrun > 10%
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (v.hasExtras || exposurePercent > 30 || avgVerificationDays > 14 || overrunPercent > 20) {
        riskLevel = 'HIGH';
      } else if (exposurePercent > 15 || avgVerificationDays > 7 || overrunPercent > 10) {
        riskLevel = 'MEDIUM';
      }

      return {
        vendorId: v.vendorId,
        vendorName: v.vendorName,
        contractValue: Math.round(v.contractValue),
        boqValue: Math.round(v.boqValue),
        overrunValue: Math.round(overrunValue),
        overrunPercent: Math.round(overrunPercent * 10) / 10,
        certifiedValue: Math.round(v.certifiedValue),
        paidValue: Math.round(v.paidValue),
        exposureValue: Math.round(exposureValue),
        exposurePercent: Math.round(exposurePercent),
        milestonesTotal: v.milestones.size,
        milestonesVerified: v.verifiedMilestones,
        avgVerificationDays: Math.round(avgVerificationDays * 10) / 10,
        riskLevel,
        hasExtras: v.hasExtras,
        extrasCount: v.extrasCount,
      };
    }).filter(v => v.milestonesTotal > 0);

    const highRiskCount = vendors.filter(v => v.riskLevel === 'HIGH').length;
    const totalExposure = vendors.reduce((sum, v) => sum + v.exposureValue, 0);
    const totalBoqValue = vendors.reduce((sum, v) => sum + v.boqValue, 0);
    const totalOverrunValue = vendors.reduce((sum, v) => sum + v.overrunValue, 0);
    const totalOverrunPercent = totalBoqValue > 0 ? (totalOverrunValue / totalBoqValue) * 100 : 0;

    return {
      vendors,
      totals: {
        totalVendors: vendors.length,
        highRiskCount,
        totalExposure,
        totalBoqValue: Math.round(totalBoqValue),
        totalOverrunValue: Math.round(totalOverrunValue),
        totalOverrunPercent: Math.round(totalOverrunPercent * 10) / 10,
      },
    };
  }

  /**
   * DELAY & RISK ANALYSIS
   * Answer: "Where will this project blow up if I don't act?"
   */
  static async getDelayRiskAnalysis(projectId: string): Promise<DelayRiskAnalysis> {
    const now = new Date();

    // Independent reads — fan out in parallel.
    const [milestones, boqItems] = await Promise.all([
      prisma.milestone.findMany({
        where: { projectId },
        include: {
          paymentEligibility: true,
          boqLinks: { include: { boqItem: true } },
        },
      }),
      prisma.bOQItem.findMany({
        where: { boq: { projectId } },
        include: {
          milestoneLinks: {
            include: { milestone: { include: { verifications: true } } },
          },
        },
      }),
    ]);

    // Delayed milestones
    const delayedMilestones: DelayRiskAnalysis['delayedMilestones'] = [];
    const riskBuckets = {
      safe: { count: 0, value: 0, items: [] as string[] },
      attention: { count: 0, value: 0, items: [] as string[] },
      immediate: { count: 0, value: 0, items: [] as string[] },
    };

    for (const milestone of milestones) {
      // Use milestone.value directly (works for both BOQ-linked and Extras)
      // Fall back to BOQ calculation if value is 0
      let milestoneValue = milestone.value || 0;
      if (milestoneValue === 0 && milestone.boqLinks.length > 0) {
        milestoneValue = milestone.boqLinks.reduce(
          (sum: number, link: { plannedQty: number; boqItem: { rate: number } }) => sum + link.plannedQty * link.boqItem.rate,
          0
        );
      }

      if (milestone.plannedEnd && milestone.state !== MilestoneState.CLOSED) {
        const daysOverdue = (now.getTime() - milestone.plannedEnd.getTime()) / (1000 * 60 * 60 * 24);

        if (daysOverdue > 0) {
          let severity: 'MINOR' | 'MAJOR' | 'CRITICAL' = 'MINOR';
          if (daysOverdue > 30) severity = 'CRITICAL';
          else if (daysOverdue > 14) severity = 'MAJOR';

          delayedMilestones.push({
            id: milestone.id,
            title: milestone.title,
            state: milestone.state as MilestoneState,
            dueDate: milestone.plannedEnd,
            daysOverdue: Math.round(daysOverdue),
            value: Math.round(milestoneValue),
            severity,
          });

          // Risk buckets
          if (severity === 'CRITICAL') {
            riskBuckets.immediate.count++;
            riskBuckets.immediate.value += milestoneValue;
            riskBuckets.immediate.items.push(milestone.title);
          } else if (severity === 'MAJOR') {
            riskBuckets.attention.count++;
            riskBuckets.attention.value += milestoneValue;
            riskBuckets.attention.items.push(milestone.title);
          } else {
            riskBuckets.safe.count++;
            riskBuckets.safe.value += milestoneValue;
            riskBuckets.safe.items.push(milestone.title);
          }
        } else {
          riskBuckets.safe.count++;
          riskBuckets.safe.value += milestoneValue;
        }
      }
    }

    // Blocked payments
    const blockedPayments: DelayRiskAnalysis['blockedPayments'] = [];
    for (const milestone of milestones) {
      if (milestone.paymentEligibility?.state === EligibilityState.BLOCKED) {
        const pe = milestone.paymentEligibility;
        if (pe.blockedAt) {
          const daysBlocked = (now.getTime() - pe.blockedAt.getTime()) / (1000 * 60 * 60 * 24);
          blockedPayments.push({
            milestoneId: milestone.id,
            title: milestone.title,
            value: pe.blockedAmount,
            daysBlocked: Math.round(daysBlocked),
            reason: pe.blockReasonCode || 'Unknown',
          });

          if (daysBlocked > SLA_THRESHOLDS.BLOCKED_PAYMENT_MAX_DAYS) {
            riskBuckets.immediate.count++;
            riskBuckets.immediate.value += pe.blockedAmount;
            riskBuckets.immediate.items.push(`Blocked: ${milestone.title}`);
          }
        }
      }
    }

    // BOQ overruns
    const boqOverruns: DelayRiskAnalysis['boqOverruns'] = [];
    for (const item of boqItems) {
      const verifiedQty = item.milestoneLinks.reduce((sum: number, link: { milestone: { verifications: { qtyVerified: number }[] } }) => {
        const verification = link.milestone.verifications[0];
        return sum + (verification?.qtyVerified || 0);
      }, 0);

      if (verifiedQty > item.plannedQty * (1 + SLA_THRESHOLDS.BOQ_OVERRUN_THRESHOLD)) {
        const overrunPercent = ((verifiedQty - item.plannedQty) / item.plannedQty) * 100;
        boqOverruns.push({
          itemDescription: item.description,
          plannedValue: item.plannedValue,
          actualValue: verifiedQty * item.rate,
          overrunPercent: Math.round(overrunPercent),
        });
      }
    }

    // Overall risk score (0-100)
    const totalMilestones = milestones.length;
    const delayedPercent = totalMilestones > 0 ? (delayedMilestones.length / totalMilestones) * 100 : 0;
    const blockedPercent = totalMilestones > 0 ? (blockedPayments.length / totalMilestones) * 100 : 0;
    const overallRiskScore = Math.min(100, Math.round(delayedPercent + blockedPercent + boqOverruns.length * 5));

    return {
      delayedMilestones: delayedMilestones.sort((a, b) => b.daysOverdue - a.daysOverdue),
      riskBuckets,
      blockedPayments: blockedPayments.sort((a, b) => b.daysBlocked - a.daysBlocked),
      boqOverruns,
      overallRiskScore,
    };
  }

  /**
   * VARIANCE ANALYSIS
   * Answer: "Is the schedule slipping, is the money moving on time, and is anything missing?"
   *
   * Deliberately BOQ / RA Bill based for money — not Milestone.paymentEligibility. Payment now
   * lives only in BOQs, RA Bills, and Consultant (Architecture) fees; this tab tracks bill
   * variance per Purchase Order plus how long each RA Bill has sat in its current lifecycle
   * stage, alongside schedule (activity) delay — the two dimensions of "time and money."
   */
  static async getVarianceAnalysis(projectId: string): Promise<VarianceAnalysis> {
    const now = new Date();

    const [milestones, orders, directOrders] = await Promise.all([
      prisma.milestone.findMany({
        where: { projectId },
        select: {
          id: true, title: true, state: true,
          plannedStart: true, plannedEnd: true, actualStart: true, actualEnd: true, percentComplete: true,
        },
      }),
      prisma.phase.findMany({
        where: { projectId, parentPhaseId: null, scheduleImportId: null }, // Purchase Order phases only
        select: {
          id: true,
          name: true,
          boqs: { select: { items: { select: { plannedValue: true } } } },
          raBills: {
            select: {
              id: true,
              billNumber: true,
              status: true,
              submittedValue: true,
              submittedAt: true,
              approvedValue: true,
              approvedAt: true,
              releasedValue: true,
              certifiedAt: true,
              revisionRequestedAt: true,
            },
          },
        },
      }),
      DirectOrderService.getSummary(projectId),
    ]);

    // ── Schedule variance ───────────────────────────────────────────────
    const overdueActivities: VarianceAnalysis['schedule']['overdueActivities'] = [];
    const upcomingAtRisk: VarianceAnalysis['schedule']['upcomingAtRisk'] = [];
    const upcomingCutoff = new Date(now.getTime() + SLA_THRESHOLDS.UPCOMING_AT_RISK_DAYS * 24 * 60 * 60 * 1000);

    for (const m of milestones) {
      if (!m.plannedEnd || m.state === MilestoneState.CLOSED) continue;

      const daysOverdue = (now.getTime() - m.plannedEnd.getTime()) / (1000 * 60 * 60 * 24);
      if (daysOverdue > 0) {
        let severity: 'MINOR' | 'MAJOR' | 'CRITICAL' = 'MINOR';
        if (daysOverdue > 30) severity = 'CRITICAL';
        else if (daysOverdue > 14) severity = 'MAJOR';
        overdueActivities.push({
          id: m.id,
          title: m.title,
          state: m.state as MilestoneState,
          dueDate: m.plannedEnd,
          daysOverdue: Math.round(daysOverdue),
          severity,
        });
      } else if (m.plannedEnd <= upcomingCutoff && m.state !== MilestoneState.VERIFIED) {
        upcomingAtRisk.push({
          id: m.id,
          title: m.title,
          dueDate: m.plannedEnd,
          daysRemaining: Math.round((m.plannedEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)),
        });
      }
    }

    const totalActivities = milestones.length;
    const overdueCount = overdueActivities.length;

    const healthBreakdown: Record<ActivityHealth, number> = {
      ON_TRACK: 0, AT_RISK: 0, DELAYED: 0, COMPLETED_LATE: 0, COMPLETED_ON_TIME: 0,
    };
    for (const m of milestones) {
      const { health } = computeScheduleVariance(m, now);
      healthBreakdown[health]++;
    }

    // Deliberately NOT "(total - overdueCount) / total": overdueCount only counts activities
    // overdue as of *today*, which is meaningless for a finished/closed project (nothing still
    // open can be "currently overdue" once everything's CLOSED, so that formula reads a
    // trivial, misleading 100% even when plenty of activities finished late historically).
    // healthBreakdown already carries that history per activity (COMPLETED_LATE vs
    // COMPLETED_ON_TIME), so on-time% is "not late by either measure" over the same total.
    const onTimePercent = totalActivities > 0
      ? Math.round(((healthBreakdown.ON_TRACK + healthBreakdown.COMPLETED_ON_TIME) / totalActivities) * 100)
      : 100;

    // ── Bill variance, per Purchase Order ───────────────────────────────
    const byOrder: VarianceAnalysis['bills']['byOrder'] = [];
    const overdueBills: VarianceAnalysis['overdueBills'] = [];

    for (const order of orders) {
      const boqPlannedValue = order.boqs.reduce(
        (sum, boq) => sum + boq.items.reduce((s, i) => s + i.plannedValue, 0),
        0,
      );
      let submittedValue = 0, approvedValue = 0, releasedValue = 0;

      for (const bill of order.raBills) {
        submittedValue += bill.submittedValue ?? 0;
        approvedValue += bill.approvedValue ?? 0;
        releasedValue += bill.releasedValue ?? 0;

        let stage: string | null = null;
        let stageStart: Date | null = null;
        let threshold = 0;
        if (bill.status === 'PENDING_VENDOR_REVIEW') {
          stage = 'Awaiting Certification'; stageStart = bill.submittedAt; threshold = SLA_THRESHOLDS.AWAITING_CERTIFICATION_MAX_DAYS;
        } else if (bill.status === 'CERTIFIED') {
          stage = 'Awaiting Approval'; stageStart = bill.certifiedAt; threshold = SLA_THRESHOLDS.AWAITING_APPROVAL_MAX_DAYS;
        } else if (bill.status === 'APPROVED') {
          stage = 'Awaiting Payment'; stageStart = bill.approvedAt; threshold = SLA_THRESHOLDS.AWAITING_PAYMENT_MAX_DAYS;
        } else if (bill.status === 'REVISION_REQUESTED') {
          stage = 'Awaiting Vendor Resubmission'; stageStart = bill.revisionRequestedAt; threshold = SLA_THRESHOLDS.AWAITING_RESUBMISSION_MAX_DAYS;
        }

        if (stage && stageStart) {
          const daysInStage = (now.getTime() - stageStart.getTime()) / (1000 * 60 * 60 * 24);
          if (daysInStage > threshold) {
            overdueBills.push({
              raBillId: bill.id,
              billNumber: bill.billNumber,
              orderId: order.id,
              orderName: order.name,
              stage,
              daysInStage: Math.round(daysInStage),
              amount: bill.approvedValue ?? bill.submittedValue ?? 0,
            });
          }
        }
      }

      if (boqPlannedValue > 0 || order.raBills.length > 0) {
        const variance = boqPlannedValue - releasedValue;
        byOrder.push({
          orderId: order.id,
          orderName: order.name,
          boqPlannedValue: Math.round(boqPlannedValue),
          submittedValue: Math.round(submittedValue),
          approvedValue: Math.round(approvedValue),
          releasedValue: Math.round(releasedValue),
          variance: Math.round(variance),
          variancePercent: boqPlannedValue > 0 ? Math.round((variance / boqPlannedValue) * 100) : 0,
          billCount: order.raBills.length,
        });
      }
    }

    const boqTotals = byOrder.reduce(
      (acc, o) => ({
        totalPlannedValue: acc.totalPlannedValue + o.boqPlannedValue,
        totalSubmittedValue: acc.totalSubmittedValue + o.submittedValue,
        totalApprovedValue: acc.totalApprovedValue + o.approvedValue,
        totalReleasedValue: acc.totalReleasedValue + o.releasedValue,
      }),
      { totalPlannedValue: 0, totalSubmittedValue: 0, totalApprovedValue: 0, totalReleasedValue: 0 },
    );
    // Direct Orders (one-off vendor purchases outside the BOQ flow) count toward the same
    // project cost total — ordered value is "planned" spend, paid value is "released" spend —
    // so the headline variance/cost figures used by Reports include them without a second tab.
    const totals = {
      totalPlannedValue: boqTotals.totalPlannedValue + directOrders.totalOrdered,
      totalSubmittedValue: boqTotals.totalSubmittedValue,
      totalApprovedValue: boqTotals.totalApprovedValue,
      totalReleasedValue: boqTotals.totalReleasedValue + directOrders.paid,
    };
    const totalVariance = totals.totalPlannedValue - totals.totalReleasedValue;
    const totalVariancePercent = totals.totalPlannedValue > 0
      ? Math.round((totalVariance / totals.totalPlannedValue) * 100)
      : 0;

    // ── Overall variance score (0-100, higher = more time/money drift) ──
    const overduePercent = totalActivities > 0 ? (overdueCount / totalActivities) * 100 : 0;
    const overallVarianceScore = Math.min(
      100,
      Math.round(overduePercent + Math.abs(totalVariancePercent) / 2 + overdueBills.length * 5),
    );

    return {
      schedule: {
        overdueActivities: overdueActivities.sort((a, b) => b.daysOverdue - a.daysOverdue),
        upcomingAtRisk: upcomingAtRisk.sort((a, b) => a.daysRemaining - b.daysRemaining),
        totalActivities,
        overdueCount,
        onTimePercent,
        healthBreakdown,
      },
      bills: {
        byOrder: byOrder.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance)),
        totals: {
          ...totals,
          totalVariance: Math.round(totalVariance),
          totalVariancePercent,
        },
      },
      overdueBills: overdueBills.sort((a, b) => b.daysInStage - a.daysInStage),
      overallVarianceScore,
      directOrders,
    };
  }

  /**
   * COMPLIANCE & AUDIT ANALYSIS
   * Answer: "Are procedures being followed, and by whom?"
   */
  static async getComplianceAuditAnalysis(projectId: string): Promise<ComplianceAuditAnalysis> {
    const auditLogs = await prisma.auditLog.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
    });

    // Audit completeness
    const missingReasons = auditLogs.filter(
      l => ['REJECT', 'BLOCK'].some(action => l.actionType.includes(action)) && !l.reason
    ).length;

    const auditCompleteness = {
      score: auditLogs.length > 0
        ? Math.round(((auditLogs.length - missingReasons) / auditLogs.length) * 100)
        : 100,
      totalActions: auditLogs.length,
      loggedActions: auditLogs.length,
      missingReasons,
    };

    // Recent activity (last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const recentLogs = auditLogs.filter(l => l.createdAt >= sevenDaysAgo);
    const byDate = new Map<string, { count: number; byRole: Record<string, number> }>();

    for (const log of recentLogs) {
      const dateKey = log.createdAt.toISOString().split('T')[0];
      const existing = byDate.get(dateKey) || { count: 0, byRole: {} };
      existing.count++;
      existing.byRole[log.role] = (existing.byRole[log.role] || 0) + 1;
      byDate.set(dateKey, existing);
    }

    const recentAuditActivity = Array.from(byDate.entries())
      .map(([date, data]) => ({
        date,
        actionCount: data.count,
        byRole: data.byRole,
      }))
      .sort((a, b) => b.date.localeCompare(a.date));

    return {
      auditCompleteness,
      recentAuditActivity,
    };
  }
}
