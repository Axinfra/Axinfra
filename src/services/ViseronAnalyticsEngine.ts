/**
 * ViseronAnalyticsEngine - Aggregated analytics for Viseron Intelligence.
 *
 * Composes data from AnalysisService and scheduleMetrics into a unified
 * analytics payload for the Viseron Intelligence dashboard.
 *
 * DESIGN:
 * - READ-ONLY: never mutates data
 * - Delegates to existing services (no duplicate logic)
 * - Cached per-project with short TTL
 */

import { AnalysisService } from './AnalysisService';
import { prisma } from '@/lib/db';
import { cached } from '@/lib/cache';
import {
  computeProjectScheduleKPIs,
  computeMilestoneScheduleMetrics,
  type RawMilestone,
} from '@/lib/scheduleMetrics';
import { MilestoneState, EligibilityState } from '@/types';

// ============================================
// TYPE DEFINITIONS
// ============================================

export interface ViseronMetrics {
  // From AnalysisService
  execution: {
    totalMilestones: number;
    verifiedPercent: number;
    avgDaysInProgress: number;
    avgDaysInSubmitted: number;
    evidenceRejectionRate: number;
  };
  financial: {
    totalProjectValue: number;
    certifiedValue: number;
    paidValue: number;
    blockedValue: number;
    eligibleUnpaid: number;
    exposedValue: number;
  };
  // From scheduleMetrics
  schedule: {
    netScheduleDays: number;
    onTimePct: number;
    totalSavedDays: number;
    totalOverrunDays: number;
    completedMilestones: number;
  };
  // Computed
  milestoneVelocity: number; // milestones verified per week (last 30d)
  paymentCycleAvgDays: number;
  slaBreachCount: number;
  generatedAt: string;
}

const COMPLETE_STATES = new Set<string>([MilestoneState.VERIFIED, MilestoneState.CLOSED]);

export class ViseronAnalyticsEngine {
  /**
   * Compute all Viseron metrics for a project.
   * Delegates to AnalysisService and scheduleMetrics.
   */
  static async computeMetrics(projectId: string): Promise<ViseronMetrics> {
    // Fetch AnalysisService data (execution + financial + vendor)
    const [executionAnalysis, financialAnalysis] = await Promise.all([
      AnalysisService.getExecutionAnalysis(projectId),
      AnalysisService.getFinancialAnalysis(projectId),
    ]);

    // Fetch milestones for schedule KPIs
    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      select: {
        id: true,
        title: true,
        state: true,
        plannedEnd: true,
        actualVerification: true,
        actualSubmission: true,
        value: true,
        vendorUserId: true,
      },
    });

    const today = new Date();

    // Build raw milestones for scheduleMetrics
    const rawMilestones: RawMilestone[] = milestones.map((m) => ({
      id: m.id,
      title: m.title,
      state: m.state,
      plannedEnd: m.plannedEnd,
      actualEnd: m.actualVerification ?? m.actualSubmission ?? null,
      value: m.value || 1,
      vendorId: m.vendorUserId,
    }));

    // Per-milestone metrics
    const milestoneMetrics = rawMilestones.map((m) =>
      computeMilestoneScheduleMetrics(m, today),
    );

    // Project KPIs
    const kpis = computeProjectScheduleKPIs(
      {
        milestones: rawMilestones,
        avgApprovalCycleDays: executionAnalysis.overview.avgEvidenceReviewDays,
        criticalMilestoneCount: 0,
        escalationsLast30Days: 0,
      },
      today,
    );

    // Milestone velocity: verified milestones in last 30 days / ~4.3 weeks
    const thirtyDaysAgo = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const recentVerified = milestones.filter(
      (m) =>
        COMPLETE_STATES.has(m.state as MilestoneState) &&
        m.actualVerification &&
        m.actualVerification >= thirtyDaysAgo,
    ).length;
    const milestoneVelocity = Math.round((recentVerified / 4.3) * 10) / 10;

    // Payment cycle: avg days from evidence submission to FULLY_ELIGIBLE
    const eligibilities = await prisma.paymentEligibility.findMany({
      where: { milestone: { projectId } },
      include: {
        events: {
          where: { toState: EligibilityState.FULLY_ELIGIBLE },
          orderBy: { createdAt: 'asc' },
          take: 1,
        },
        milestone: {
          include: {
            evidence: {
              orderBy: { submittedAt: 'asc' },
              take: 1,
            },
          },
        },
      },
    });

    let paymentCycleTotalDays = 0;
    let paymentCycleCount = 0;
    for (const e of eligibilities) {
      const firstEvidence = e.milestone.evidence[0];
      const eligibleEvent = e.events[0];
      if (firstEvidence && eligibleEvent) {
        const days = Math.max(
          0,
          Math.round(
            (eligibleEvent.createdAt.getTime() - firstEvidence.submittedAt.getTime()) /
              (1000 * 60 * 60 * 24),
          ),
        );
        paymentCycleTotalDays += days;
        paymentCycleCount++;
      }
    }
    const paymentCycleAvgDays =
      paymentCycleCount > 0
        ? Math.round((paymentCycleTotalDays / paymentCycleCount) * 10) / 10
        : 0;

    // SLA breach count
    const slaBreachCount = executionAnalysis.slaBreaches.length;

    return {
      execution: {
        totalMilestones: executionAnalysis.overview.totalMilestones,
        verifiedPercent: executionAnalysis.overview.verifiedPercent,
        avgDaysInProgress: executionAnalysis.overview.avgDaysInProgress,
        avgDaysInSubmitted: executionAnalysis.overview.avgDaysInSubmitted,
        evidenceRejectionRate: executionAnalysis.overview.evidenceRejectionRate,
      },
      financial: {
        totalProjectValue: financialAnalysis.summary.totalProjectValue,
        certifiedValue: financialAnalysis.summary.certifiedValue,
        paidValue: financialAnalysis.summary.paidValue,
        blockedValue: financialAnalysis.summary.blockedValue,
        eligibleUnpaid: financialAnalysis.summary.eligibleUnpaid,
        exposedValue: financialAnalysis.summary.exposedValue,
      },
      schedule: {
        netScheduleDays: kpis.netScheduleDays,
        onTimePct: kpis.onTimePct,
        totalSavedDays: kpis.totalSavedDays,
        totalOverrunDays: kpis.totalOverrunDays,
        completedMilestones: kpis.completedMilestones,
      },
      milestoneVelocity,
      paymentCycleAvgDays,
      slaBreachCount,
      generatedAt: today.toISOString(),
    };
  }

  /**
   * Compute and cache metrics for a project.
   * Uses 60s TTL to avoid re-running expensive aggregations.
   */
  static async refreshAndPersist(projectId: string): Promise<ViseronMetrics> {
    return cached(
      `viseron-analytics:${projectId}`,
      60_000,
      () => this.computeMetrics(projectId),
    );
  }
}
