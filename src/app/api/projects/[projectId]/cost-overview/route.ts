import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AnalysisService } from '@/services/AnalysisService';
import { DirectOrderService } from '@/services/DirectOrderService';
import { computeProjectScheduleKPIs, estimateDelayCost, type RawMilestone } from '@/lib/scheduleMetrics';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/cost-overview
// One consolidated "what has this project actually cost, all-in" view — CLIENT/PMC only
// (matches Analysis's own role gate; this is the same audience). Previously this picture only
// existed by visiting four separate pages (Analysis for BOQ+Direct Orders, Payments for RA
// Bills and architecture fees, Roles for consultant engagement fees, Execution Intelligence
// for the Delay Cost Estimate) and adding it up by hand — nothing summed them together.
//
// Reuses the exact same services/functions each of those pages already uses (AnalysisService,
// DirectOrderService, scheduleMetrics' estimateDelayCost) rather than re-deriving any of these
// figures, so this page can never disagree with the pages it's summarizing.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

    const [project, variance, directOrders, consultantRoles, drawingSets, scheduleConfig, milestones] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { metadata: true } }),
      AnalysisService.getVarianceAnalysis(projectId),
      DirectOrderService.getSummary(projectId),
      prisma.projectRole.findMany({
        where: { projectId, role: 'CONSULTANT' },
        include: { user: { select: { id: true, name: true } } },
      }),
      prisma.drawingSet.findMany({
        where: { projectId },
        select: { id: true, name: true, cost: true, status: true, rows: { select: { status: true, paidAt: true } } },
      }),
      prisma.projectScheduleConfig.findUnique({ where: { projectId } }),
      prisma.milestone.findMany({
        where: { projectId },
        select: { id: true, title: true, state: true, plannedEnd: true, actualVerification: true, actualSubmission: true, actualEnd: true, value: true, percentComplete: true },
      }),
    ]);

    const metadata = project?.metadata ? JSON.parse(project.metadata) : {};
    const currency = metadata.currency || 'INR';

    // ── Consultant engagement fees (Roles page — never summed anywhere before) ──
    const consultantFees = consultantRoles.map((r) => ({
      userId: r.user.id, name: r.user.name, fee: r.fee ?? 0,
    }));
    const consultantFeesTotal = consultantFees.reduce((s, c) => s + c.fee, 0);

    // ── Architecture / drawing-set fees — same per-drawing-proration formula the Payments
    // page's "Consultant Fees" tab already uses, so this card and that tab never disagree. ──
    let architectureFeesTotal = 0;
    let architecturePaid = 0;
    for (const set of drawingSets) {
      architectureFeesTotal += set.cost;
      if (set.rows.length === 0) continue;
      const perDrawing = set.cost / set.rows.length;
      const paidCount = set.rows.filter((r) => r.paidAt != null).length;
      architecturePaid += perDrawing * paidCount;
    }

    // ── Delay Cost Estimate — same computation the Execution Intelligence Analytics tab uses,
    // with the same BOQ+Direct-Order total as totalProjectValue (see afcee09/95c26d1). ──
    const rawMilestones: RawMilestone[] = milestones.map((m) => ({
      id: m.id, title: m.title, state: m.state, plannedEnd: m.plannedEnd,
      actualEnd: m.actualVerification ?? m.actualSubmission ?? m.actualEnd ?? null,
      value: m.value || 1, vendorId: null, percentComplete: m.percentComplete,
    }));
    const kpis = computeProjectScheduleKPIs({ milestones: rawMilestones, avgApprovalCycleDays: 0, criticalMilestoneCount: 0, escalationsLast30Days: 0 });
    const delayCost = estimateDelayCost(kpis.totalOverrunDays, {
      dailyOverheadCost: scheduleConfig?.dailyOverheadCost ?? 0,
      penaltyRatePerDay: scheduleConfig?.penaltyRatePerDay ?? 0,
      opportunityCostFactor: scheduleConfig?.opportunityCostFactor ?? 1.0,
      totalProjectValue: variance.bills.totals.totalPlannedValue,
    });

    // ── Grand total — committed spend only (BOQ+Direct Orders planned, consultant fees,
    // architecture fees). Delay Cost Estimate is deliberately NOT folded in here: it's a risk/
    // exposure projection, not a committed cost, so blending it into "total project cost" would
    // overstate what's actually contracted. Shown as its own line instead. ──
    const totalCommitted = variance.bills.totals.totalPlannedValue + consultantFeesTotal + architectureFeesTotal;
    const totalPaidToDate = variance.bills.totals.totalReleasedValue + architecturePaid;

    return NextResponse.json({
      success: true,
      data: {
        currency,
        totals: {
          committed: totalCommitted,
          paidToDate: totalPaidToDate,
          outstanding: totalCommitted - totalPaidToDate,
        },
        boqAndDirectOrders: {
          planned: variance.bills.totals.totalPlannedValue,
          submitted: variance.bills.totals.totalSubmittedValue,
          approved: variance.bills.totals.totalApprovedValue,
          released: variance.bills.totals.totalReleasedValue,
          variance: variance.bills.totals.totalVariance,
          variancePercent: variance.bills.totals.totalVariancePercent,
        },
        directOrders: {
          ordered: directOrders.totalOrdered,
          delivered: directOrders.totalDeliveredValue,
          paid: directOrders.paid,
          outstanding: directOrders.outstanding,
          variance: directOrders.totalVariance,
        },
        consultantFees: {
          total: consultantFeesTotal,
          byPerson: consultantFees,
        },
        architectureFees: {
          total: architectureFeesTotal,
          paid: architecturePaid,
          due: architectureFeesTotal - architecturePaid,
          setCount: drawingSets.length,
        },
        delayCost: {
          overheadCost: delayCost.overheadCost,
          penaltyCost: delayCost.penaltyCost,
          opportunityCost: delayCost.opportunityCost,
          totalEstimatedCost: delayCost.totalEstimatedCost,
          totalOverrunDays: delayCost.totalOverrunDays,
          isConfigured: delayCost.isConfigured,
        },
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Cost overview error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
