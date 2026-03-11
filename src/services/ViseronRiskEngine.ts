/**
 * ViseronRiskEngine - Project health and risk scoring for Viseron Intelligence.
 *
 * Health formula:
 *   0.4 * milestoneCompletionRate
 * + 0.3 * timelineAdherence
 * + 0.3 * vendorReliability
 *
 * Statuses: HEALTHY | WARNING | CRITICAL
 *
 * DESIGN:
 * - READ-ONLY: never mutates data
 * - Pure computation from existing DB data
 * - Cached with short TTL
 */

import { prisma } from '@/lib/db';
import { cached } from '@/lib/cache';
import { MilestoneState } from '@/types';
import { AnalysisService } from './AnalysisService';

// ============================================
// TYPE DEFINITIONS
// ============================================

export const ProjectHealthStatus = {
  HEALTHY: 'HEALTHY',
  WARNING: 'WARNING',
  CRITICAL: 'CRITICAL',
} as const;
export type ProjectHealthStatus = (typeof ProjectHealthStatus)[keyof typeof ProjectHealthStatus];

export interface RiskComponent {
  name: string;
  score: number; // 0-1
  weight: number;
  weighted: number; // score * weight
  details: string;
}

export interface ProjectRiskAssessment {
  projectId: string;
  healthScore: number; // 0-100
  status: ProjectHealthStatus;
  components: RiskComponent[];
  riskFactors: RiskFactor[];
  generatedAt: string;
}

export interface RiskFactor {
  severity: 'LOW' | 'MEDIUM' | 'HIGH';
  category: string;
  description: string;
  milestoneId?: string;
  value?: number;
}

// ============================================
// THRESHOLDS
// ============================================

const HEALTHY_THRESHOLD = 70;
const WARNING_THRESHOLD = 40;

const COMPLETE_STATES = new Set<string>([MilestoneState.VERIFIED, MilestoneState.CLOSED]);

export class ViseronRiskEngine {
  /**
   * Compute project health score and risk assessment.
   */
  static async assessRisk(projectId: string): Promise<ProjectRiskAssessment> {
    const [milestones, vendorAnalysis] = await Promise.all([
      prisma.milestone.findMany({
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
          evidence: {
            select: { status: true },
          },
        },
      }),
      AnalysisService.getVendorAnalysis(projectId),
    ]);

    const today = new Date();
    const riskFactors: RiskFactor[] = [];

    // ── Component 1: Milestone Completion Rate (weight 0.4) ──
    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter((m) =>
      COMPLETE_STATES.has(m.state as MilestoneState),
    ).length;

    const milestoneCompletionRate =
      totalMilestones > 0 ? completedMilestones / totalMilestones : 0;

    let completionDetails: string;
    if (totalMilestones === 0) {
      completionDetails = 'No milestones defined';
    } else {
      completionDetails = `${completedMilestones}/${totalMilestones} milestones completed (${Math.round(milestoneCompletionRate * 100)}%)`;
    }

    // ── Component 2: Timeline Adherence (weight 0.3) ──
    let onTimeCount = 0;
    let evaluatedCount = 0;

    for (const m of milestones) {
      if (!m.plannedEnd) continue;

      const isComplete = COMPLETE_STATES.has(m.state as MilestoneState);
      const endDate = m.actualVerification ?? m.actualSubmission ?? null;

      if (isComplete && endDate) {
        evaluatedCount++;
        if (endDate <= m.plannedEnd) {
          onTimeCount++;
        } else {
          const daysLate = Math.ceil(
            (endDate.getTime() - m.plannedEnd.getTime()) / (1000 * 60 * 60 * 24),
          );
          riskFactors.push({
            severity: daysLate > 14 ? 'HIGH' : daysLate > 7 ? 'MEDIUM' : 'LOW',
            category: 'Timeline',
            description: `"${m.title}" completed ${daysLate}d late`,
            milestoneId: m.id,
            value: daysLate,
          });
        }
      } else if (!isComplete && m.plannedEnd < today) {
        // Overdue incomplete milestone
        evaluatedCount++;
        const daysOverdue = Math.ceil(
          (today.getTime() - m.plannedEnd.getTime()) / (1000 * 60 * 60 * 24),
        );
        riskFactors.push({
          severity: daysOverdue > 14 ? 'HIGH' : daysOverdue > 7 ? 'MEDIUM' : 'LOW',
          category: 'Timeline',
          description: `"${m.title}" is ${daysOverdue}d overdue`,
          milestoneId: m.id,
          value: daysOverdue,
        });
      } else if (!isComplete) {
        // Future incomplete - on track
        evaluatedCount++;
        onTimeCount++;
      }
    }

    const timelineAdherence = evaluatedCount > 0 ? onTimeCount / evaluatedCount : 1;
    const timelineDetails =
      evaluatedCount > 0
        ? `${onTimeCount}/${evaluatedCount} milestones on-time (${Math.round(timelineAdherence * 100)}%)`
        : 'No milestones with planned dates';

    // ── Component 3: Vendor Reliability (weight 0.3) ──
    const vendors = vendorAnalysis.vendors;
    const totalVendors = vendors.length;

    let vendorReliability = 1;
    if (totalVendors > 0) {
      // Weighted by contract value: reliable vendors with bigger contracts count more
      const totalContractValue = vendors.reduce((s, v) => s + v.contractValue, 0);

      if (totalContractValue > 0) {
        let weightedScore = 0;
        for (const v of vendors) {
          // Vendor score: inverse of rejection rate, penalized for high risk
          const vendorScore =
            v.riskLevel === 'HIGH' ? 0.3 : v.riskLevel === 'MEDIUM' ? 0.6 : 0.9;
          const weight = v.contractValue / totalContractValue;
          weightedScore += vendorScore * weight;

          if (v.riskLevel === 'HIGH') {
            riskFactors.push({
              severity: 'HIGH',
              category: 'Vendor',
              description: `${v.vendorName} flagged high-risk (${v.rejectionRate}% rejection rate, ${v.exposurePercent}% exposure)`,
              value: v.exposureValue,
            });
          }
        }
        vendorReliability = weightedScore;
      }
    }

    const vendorDetails =
      totalVendors > 0
        ? `${totalVendors} vendors, ${vendorAnalysis.totals.highRiskCount} high-risk (${Math.round(vendorReliability * 100)}% reliability)`
        : 'No vendors assigned';

    // ── Compute Health Score ──
    const components: RiskComponent[] = [
      {
        name: 'Milestone Completion',
        score: milestoneCompletionRate,
        weight: 0.4,
        weighted: milestoneCompletionRate * 0.4,
        details: completionDetails,
      },
      {
        name: 'Timeline Adherence',
        score: timelineAdherence,
        weight: 0.3,
        weighted: timelineAdherence * 0.3,
        details: timelineDetails,
      },
      {
        name: 'Vendor Reliability',
        score: vendorReliability,
        weight: 0.3,
        weighted: vendorReliability * 0.3,
        details: vendorDetails,
      },
    ];

    const healthScore = Math.round(
      components.reduce((sum, c) => sum + c.weighted, 0) * 100,
    );

    const status: ProjectHealthStatus =
      healthScore >= HEALTHY_THRESHOLD
        ? ProjectHealthStatus.HEALTHY
        : healthScore >= WARNING_THRESHOLD
          ? ProjectHealthStatus.WARNING
          : ProjectHealthStatus.CRITICAL;

    // Sort risk factors by severity (HIGH first)
    const severityOrder = { HIGH: 0, MEDIUM: 1, LOW: 2 };
    riskFactors.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

    return {
      projectId,
      healthScore,
      status,
      components,
      riskFactors,
      generatedAt: new Date().toISOString(),
    };
  }

  /**
   * Cached risk assessment with 60s TTL.
   */
  static async getCachedAssessment(projectId: string): Promise<ProjectRiskAssessment> {
    return cached(
      `viseron-risk:${projectId}`,
      60_000,
      () => this.assessRisk(projectId),
    );
  }
}
