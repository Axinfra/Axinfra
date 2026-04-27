import { prisma } from '@/lib/db';
import { MilestoneState, EligibilityState, EvidenceStatus, Role } from '@/types';

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
    avgEvidenceReviewDays: number;
    evidenceRejectionRate: number;
  };
  stateBreakdown: Array<{
    state: MilestoneState;
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
    evidenceRejections: number;
    rejectionRate: number;
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

export interface ComplianceAuditAnalysis {
  evidenceSLA: {
    totalSubmissions: number;
    withinSLA: number;
    breachedSLA: number;
    avgReviewDays: number;
    slaThresholdDays: number;
  };
  rejectionsByVendor: Array<{
    vendorName: string;
    submissionCount: number;
    rejectionCount: number;
    rejectionRate: number;
  }>;
  lateApprovals: Array<{
    role: Role;
    lateCount: number;
    avgDelayDays: number;
  }>;
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
  compliance: ComplianceAuditAnalysis;
  generatedAt: Date;
}

// ============================================
// SLA THRESHOLDS (configurable)
// ============================================

const SLA_THRESHOLDS = {
  IN_PROGRESS_MAX_DAYS: 30,
  SUBMITTED_MAX_DAYS: 7,
  EVIDENCE_REVIEW_MAX_DAYS: 3,
  BLOCKED_PAYMENT_MAX_DAYS: 14,
  EXPOSURE_HIGH_THRESHOLD: 0.2, // 20%
  BOQ_OVERRUN_THRESHOLD: 0.1, // 10%
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
    const [execution, financial, vendor, delayRisk, compliance] = await Promise.all([
      this.getExecutionAnalysis(projectId),
      this.getFinancialAnalysis(projectId),
      this.getVendorAnalysis(projectId),
      this.getDelayRiskAnalysis(projectId),
      this.getComplianceAuditAnalysis(projectId),
    ]);

    return {
      execution,
      financial,
      vendor,
      delayRisk,
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
        evidence: true,
        boqLinks: { include: { boqItem: true } },
      },
    });

    const now = new Date();
    const totalMilestones = milestones.length;
    const verifiedCount = milestones.filter(m =>
      ([MilestoneState.VERIFIED, MilestoneState.CLOSED] as string[]).includes(m.state)
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

    // Evidence metrics
    const allEvidence = milestones.flatMap(m => m.evidence);
    const reviewedEvidence = allEvidence.filter(e => e.reviewedAt);
    const rejectedEvidence = allEvidence.filter(e => e.status === EvidenceStatus.REJECTED);

    const evidenceReviewTimes = reviewedEvidence.map(e =>
      (e.reviewedAt!.getTime() - e.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
    );

    // State breakdown
    const stateBreakdown = Object.entries(stateTimings).map(([state, times]) => ({
      state: state as MilestoneState,
      count: milestones.filter(m => m.state === state).length,
      percent: totalMilestones > 0 ? (milestones.filter(m => m.state === state).length / totalMilestones) * 100 : 0,
      avgDaysInState: Math.round(avg(times) * 10) / 10,
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
        avgEvidenceReviewDays: Math.round(avg(evidenceReviewTimes) * 10) / 10,
        evidenceRejectionRate: allEvidence.length > 0
          ? Math.round((rejectedEvidence.length / allEvidence.length) * 100)
          : 0,
      },
      stateBreakdown,
      slaBreaches: slaBreaches.slice(0, 10), // Top 10
      byTrade,
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
          evidence: { include: { submittedBy: true } },
          transitions: true,
        },
      }),
    ]);

    // Since milestone doesn't have direct vendor assignment, we derive from evidence submission
    // OR from state transitions (vendor starts work)
    const vendorData = new Map<string, {
      vendorId: string;
      vendorName: string;
      contractValue: number;
      boqValue: number; // Original BOQ planned value (without extras)
      certifiedValue: number;
      paidValue: number;
      verificationDays: number[];
      rejections: number;
      submissions: number;
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
        rejections: 0,
        submissions: 0,
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

      // Find vendor - first check evidence submitter, then check state transitions
      let vendorId: string | null = null;

      // Check evidence submitter
      const vendorEvidence = milestone.evidence.find(e =>
        vendorData.has(e.submittedById)
      );
      if (vendorEvidence) {
        vendorId = vendorEvidence.submittedById;
      }

      // If no evidence, check if vendor started the work (transitioned to IN_PROGRESS)
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

        // Count submissions and rejections from this vendor's evidence
        const vendorSubmissions = milestone.evidence.filter(e => e.submittedById === vendorId);
        data.submissions += vendorSubmissions.length;
        data.rejections += vendorSubmissions.filter(e => e.status === EvidenceStatus.REJECTED).length;

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
      const rejectionRate = v.submissions > 0 ? (v.rejections / v.submissions) * 100 : 0;
      const avgVerificationDays = avg(v.verificationDays);

      // Calculate BOQ overrun (contract value vs original BOQ value)
      const overrunValue = v.contractValue - v.boqValue;
      const overrunPercent = v.boqValue > 0 ? (overrunValue / v.boqValue) * 100 : 0;

      // Risk level determination
      // Vendors with "Extras" (outside BOQ) are automatically HIGH risk
      // Also factor in overrun > 10%
      let riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW';
      if (v.hasExtras || exposurePercent > 30 || rejectionRate > 30 || avgVerificationDays > 14 || overrunPercent > 20) {
        riskLevel = 'HIGH';
      } else if (exposurePercent > 15 || rejectionRate > 15 || avgVerificationDays > 7 || overrunPercent > 10) {
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
        evidenceRejections: v.rejections,
        rejectionRate: Math.round(rejectionRate),
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
   * COMPLIANCE & AUDIT ANALYSIS
   * Answer: "Are procedures being followed, and by whom?"
   */
  static async getComplianceAuditAnalysis(projectId: string): Promise<ComplianceAuditAnalysis> {
    // Independent reads — fan out in parallel.
    const [evidence, auditLogs] = await Promise.all([
      prisma.evidence.findMany({
        where: { milestone: { projectId } },
        include: { submittedBy: true },
      }),
      prisma.auditLog.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    // Evidence SLA
    const reviewedEvidence = evidence.filter(e => e.reviewedAt);
    const reviewTimes = reviewedEvidence.map(e =>
      (e.reviewedAt!.getTime() - e.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    const withinSLA = reviewTimes.filter(t => t <= SLA_THRESHOLDS.EVIDENCE_REVIEW_MAX_DAYS).length;
    const avgReviewDays = reviewTimes.length > 0
      ? reviewTimes.reduce((a, b) => a + b, 0) / reviewTimes.length
      : 0;

    // Rejections by vendor
    const vendorRejections = new Map<string, { name: string; submissions: number; rejections: number }>();
    for (const e of evidence) {
      const existing = vendorRejections.get(e.submittedById) || {
        name: e.submittedBy.name,
        submissions: 0,
        rejections: 0,
      };
      existing.submissions++;
      if (e.status === EvidenceStatus.REJECTED) {
        existing.rejections++;
      }
      vendorRejections.set(e.submittedById, existing);
    }

    const rejectionsByVendor = Array.from(vendorRejections.values())
      .map(v => ({
        vendorName: v.name,
        submissionCount: v.submissions,
        rejectionCount: v.rejections,
        rejectionRate: v.submissions > 0 ? Math.round((v.rejections / v.submissions) * 100) : 0,
      }))
      .filter(v => v.rejectionCount > 0)
      .sort((a, b) => b.rejectionRate - a.rejectionRate);

    // Late approvals by role
    const roleDelays = new Map<string, number[]>();
    for (const e of reviewedEvidence) {
      const reviewDays = (e.reviewedAt!.getTime() - e.submittedAt.getTime()) / (1000 * 60 * 60 * 24);
      if (reviewDays > SLA_THRESHOLDS.EVIDENCE_REVIEW_MAX_DAYS) {
        // Find who reviewed (from audit log)
        const reviewLog = auditLogs.find(
          l => l.entityId === e.id && l.actionType.includes('EVIDENCE')
        );
        if (reviewLog) {
          const existing = roleDelays.get(reviewLog.role) || [];
          existing.push(reviewDays);
          roleDelays.set(reviewLog.role, existing);
        }
      }
    }

    const lateApprovals = Array.from(roleDelays.entries()).map(([role, delays]) => ({
      role: role as Role,
      lateCount: delays.length,
      avgDelayDays: Math.round((delays.reduce((a, b) => a + b, 0) / delays.length) * 10) / 10,
    }));

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
      evidenceSLA: {
        totalSubmissions: evidence.length,
        withinSLA,
        breachedSLA: reviewedEvidence.length - withinSLA,
        avgReviewDays: Math.round(avgReviewDays * 10) / 10,
        slaThresholdDays: SLA_THRESHOLDS.EVIDENCE_REVIEW_MAX_DAYS,
      },
      rejectionsByVendor,
      lateApprovals,
      auditCompleteness,
      recentAuditActivity,
    };
  }
}
