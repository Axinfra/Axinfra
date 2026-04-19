import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { EvidenceService } from '@/services/EvidenceService';
import { PaymentEligibilityEngine } from '@/services/PaymentEligibilityEngine';
import { FollowUpScheduler } from '@/services/FollowUpScheduler';
import { Role, EligibilityState, EvidenceStatus, MilestoneState } from '@/types';
import { cached } from '@/lib/cache';

// GET /api/projects/[projectId]/dashboard - Get role-specific dashboard data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    let dashboardData: unknown;

    const TTL = 120_000; // 120s cache
    switch (auth.role) {
      case Role.OWNER:
        dashboardData = await cached(`dash:owner:${projectId}`, TTL, () => getOwnerDashboard(projectId));
        break;
      case Role.PMC:
        dashboardData = await cached(`dash:pmc:${projectId}`, TTL, () => getPMCDashboard(projectId));
        break;
      case Role.VENDOR:
        dashboardData = await cached(`dash:vendor:${projectId}:${auth.userId}`, TTL, () => getVendorDashboard(projectId, auth.userId));
        break;
      case Role.VIEWER:
        dashboardData = await cached(`dash:viewer:${projectId}`, TTL, () => getViewerDashboard(projectId));
        break;
    }

    return NextResponse.json({ success: true, data: dashboardData });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Dashboard error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

async function getOwnerDashboard(projectId: string) {
  // Get payment eligibility data — push the filter to the DB.
  // An eligibility contributes to the owner summary if EITHER the milestone is
  // VERIFIED/CLOSED (feeds totalVerifiedValue) OR the eligibility is in one of
  // the tracked payment states (feeds totalPaidValue / totalBlockedValue / totalUnpaidValue).
  // The two gates are independent, so we OR them to preserve existing semantics.
  const eligibilities = await prisma.paymentEligibility.findMany({
    where: {
      milestone: { projectId },
      OR: [
        { milestone: { state: { in: [MilestoneState.VERIFIED, MilestoneState.CLOSED] } } },
        {
          state: {
            in: [
              EligibilityState.MARKED_PAID,
              EligibilityState.BLOCKED,
              EligibilityState.PARTIALLY_ELIGIBLE,
              EligibilityState.FULLY_ELIGIBLE,
            ],
          },
        },
      ],
    },
    select: {
      eligibleAmount: true,
      blockedAmount: true,
      state: true,
      blockReasonCode: true,
      milestone: {
        select: {
          title: true,
          state: true,
          paymentModel: true,
          verifications: {
            select: { valueEligibleComputed: true },
          },
        },
      },
    },
  });

  // Calculate totals
  let totalVerifiedValue = 0;
  let totalPaidValue = 0;
  let totalBlockedValue = 0;
  let totalUnpaidValue = 0;
  let advanceExposure = 0;

  for (const elig of eligibilities) {
    if (elig.milestone.state === MilestoneState.VERIFIED || elig.milestone.state === MilestoneState.CLOSED) {
      totalVerifiedValue += elig.eligibleAmount;
    }
    if (elig.state === EligibilityState.MARKED_PAID) {
      totalPaidValue += elig.eligibleAmount;
    }
    if (elig.state === EligibilityState.BLOCKED) {
      totalBlockedValue += elig.blockedAmount;
    }
    // "Unpaid" = eligible-but-not-yet-paid. Excludes BLOCKED and MARKED_PAID.
    if (
      elig.state === EligibilityState.PARTIALLY_ELIGIBLE ||
      elig.state === EligibilityState.FULLY_ELIGIBLE
    ) {
      totalUnpaidValue += elig.eligibleAmount;
    }
    if (elig.milestone.paymentModel === 'ADVANCE' && elig.state === EligibilityState.MARKED_PAID) {
      const verifiedValue = elig.milestone.verifications.reduce(
        (sum: number, v: { valueEligibleComputed: number }) => sum + v.valueEligibleComputed, 0
      );
      if (elig.eligibleAmount > verifiedValue) {
        advanceExposure += elig.eligibleAmount - verifiedValue;
      }
    }
  }

  // Get BOQ overruns and vendor exposures in parallel (independent reads)
  const [overruns, vendorExposures] = await Promise.all([
    PaymentEligibilityEngine.detectBOQOverruns(projectId),
    PaymentEligibilityEngine.detectVendorExposure(projectId),
  ]);

  // Get blocked summary
  const blockedItems = eligibilities.filter((e) => e.state === EligibilityState.BLOCKED);

  // Get follow-ups
  const followUps = await FollowUpScheduler.getOpenFollowUps(projectId);

  return {
    summary: {
      totalVerifiedValue,
      totalPaidValue,
      totalUnpaidValue,
      totalBlockedValue,
      advanceExposure,
      boqOverrunCount: overruns.length,
    },
    vendorExposures,
    blockedPayments: blockedItems.map((item) => ({
      milestoneTitle: item.milestone.title,
      amount: item.blockedAmount,
      reason: item.blockReasonCode || 'Unknown',
    })),
    boqOverruns: overruns.slice(0, 5),
    openFollowUps: followUps.length,
    followUps: followUps.slice(0, 10),
  };
}

async function getPMCDashboard(projectId: string) {
  // Get pending evidence reviews
  const pendingEvidence = await EvidenceService.getPendingReviews(projectId);

  // Get due payments (eligible states)
  const duePayments = await prisma.paymentEligibility.findMany({
    where: {
      milestone: { projectId },
      state: { in: [EligibilityState.PARTIALLY_ELIGIBLE, EligibilityState.FULLY_ELIGIBLE] },
    },
    include: {
      milestone: {
        select: {
          id: true,
          title: true,
          plannedEnd: true,
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });

  // Get blocked items
  const blockedItems = await prisma.paymentEligibility.findMany({
    where: {
      milestone: { projectId },
      state: EligibilityState.BLOCKED,
    },
    include: {
      milestone: { select: { title: true } },
    },
  });

  // Get upcoming deadlines
  const upcomingDeadlines = await prisma.milestone.findMany({
    where: {
      projectId,
      plannedEnd: {
        gte: new Date(),
        lte: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // Next 14 days
      },
      state: { in: [MilestoneState.DRAFT, MilestoneState.IN_PROGRESS, MilestoneState.SUBMITTED] },
    },
    orderBy: { plannedEnd: 'asc' },
  });

  // Get follow-ups
  const followUps = await FollowUpScheduler.getOpenFollowUps(projectId);

  return {
    pendingReviews: pendingEvidence.map((e) => ({
      evidenceId: e.id,
      milestoneTitle: e.milestone.title,
      submittedAt: e.submittedAt,
      vendorName: e.submittedBy.name,
      daysPending: Math.ceil((Date.now() - e.submittedAt.getTime()) / (1000 * 60 * 60 * 24)),
    })),
    duePayments: duePayments.map((p) => ({
      milestoneId: p.milestone.id,
      milestoneTitle: p.milestone.title,
      amount: p.eligibleAmount,
      dueDate: p.dueDate,
      state: p.state,
    })),
    blockedItems: blockedItems.map((b) => ({
      milestoneTitle: b.milestone.title,
      amount: b.blockedAmount,
      reason: b.blockReasonCode || 'Unknown',
      explanation: b.blockExplanation,
    })),
    upcomingDeadlines: upcomingDeadlines.map((m) => ({
      milestoneId: m.id,
      title: m.title,
      deadline: m.plannedEnd,
      state: m.state,
      daysRemaining: m.plannedEnd
        ? Math.ceil((m.plannedEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null,
    })),
    openFollowUps: followUps.length,
    followUps: followUps.slice(0, 10),
  };
}

async function getVendorDashboard(projectId: string, vendorId: string) {
  // Get milestones — scoped to vendor's assigned milestones or those with their evidence
  const milestones = await prisma.milestone.findMany({
    where: {
      projectId,
      OR: [
        { vendorUserId: vendorId },
        { evidence: { some: { submittedById: vendorId } } },
      ],
    },
    include: {
      evidence: {
        where: { submittedById: vendorId },
        orderBy: { submittedAt: 'desc' },
      },
      paymentEligibility: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  // Get rejections
  const rejectedEvidence = await prisma.evidence.findMany({
    where: {
      submittedById: vendorId,
      status: EvidenceStatus.REJECTED,
      milestone: { projectId },
    },
    include: {
      milestone: { select: { title: true } },
    },
    orderBy: { reviewedAt: 'desc' },
    take: 10,
  });

  // Get pending approvals
  const pendingEvidence = await prisma.evidence.findMany({
    where: {
      submittedById: vendorId,
      status: EvidenceStatus.SUBMITTED,
      milestone: { projectId },
    },
    include: {
      milestone: { select: { id: true, title: true } },
    },
    orderBy: { submittedAt: 'desc' },
  });

  // Get payment status — ONLY for milestones assigned to or submitted by this vendor
  const vendorMilestoneIds = milestones
    .filter((m) => m.vendorUserId === vendorId || m.evidence.some((e) => e.submittedById === vendorId))
    .map((m) => m.id);

  const eligibilities = await prisma.paymentEligibility.findMany({
    where: {
      milestoneId: { in: vendorMilestoneIds },
    },
    include: {
      milestone: { select: { title: true, state: true } },
    },
  });

  return {
    milestonesSummary: {
      total: milestones.length,
      draft: milestones.filter((m) => m.state === MilestoneState.DRAFT).length,
      inProgress: milestones.filter((m) => m.state === MilestoneState.IN_PROGRESS).length,
      submitted: milestones.filter((m) => m.state === MilestoneState.SUBMITTED).length,
      verified: milestones.filter((m) => m.state === MilestoneState.VERIFIED).length,
      closed: milestones.filter((m) => m.state === MilestoneState.CLOSED).length,
    },
    rejections: rejectedEvidence.map((e) => ({
      milestoneTitle: e.milestone.title,
      rejectedAt: e.reviewedAt,
      reason: e.reviewNote,
    })),
    pendingApprovals: pendingEvidence.map((e) => ({
      milestoneId: e.milestone.id,
      milestoneTitle: e.milestone.title,
      submittedAt: e.submittedAt,
      daysPending: Math.ceil((Date.now() - e.submittedAt.getTime()) / (1000 * 60 * 60 * 24)),
    })),
    paymentStatus: eligibilities.map((p) => ({
      milestoneTitle: p.milestone.title,
      milestoneState: p.milestone.state,
      state: p.state,
      amount: p.eligibleAmount,
    })),
  };
}

async function getViewerDashboard(projectId: string) {
  // Viewers get a simplified read-only view
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      milestones: {
        select: {
          id: true,
          title: true,
          state: true,
          plannedEnd: true,
        },
      },
    },
  });

  const milestoneCounts = {
    total: project?.milestones.length || 0,
    draft: project?.milestones.filter((m) => m.state === MilestoneState.DRAFT).length || 0,
    inProgress: project?.milestones.filter((m) => m.state === MilestoneState.IN_PROGRESS).length || 0,
    submitted: project?.milestones.filter((m) => m.state === MilestoneState.SUBMITTED).length || 0,
    verified: project?.milestones.filter((m) => m.state === MilestoneState.VERIFIED).length || 0,
    closed: project?.milestones.filter((m) => m.state === MilestoneState.CLOSED).length || 0,
  };

  return {
    projectName: project?.name,
    milestoneCounts,
    milestones: project?.milestones || [],
  };
}
