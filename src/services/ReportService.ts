import { differenceInDays, subDays } from 'date-fns';
import { prisma } from '@/lib/db';
import { AnalysisService } from '@/services/AnalysisService';
import { classifyLifecycleStatus, startOfDay } from '@/lib/activityStatus';
import type { ReportPeriod } from '@/lib/reportPeriod';
import {
  computeMilestoneScheduleMetrics, computeProjectScheduleKPIs, computeVendorScorecards, computeSCurve, computeBurndown, estimateDelayCost,
  type RawMilestone, type VendorMilestone,
} from '@/lib/scheduleMetrics';
import { computeCPM, milestonesCpmInputs } from '@/lib/cpm';

const DAY_MS = 86_400_000;
function computeDuration(startDate: string | null, endDate: string | null, asOf: Date) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const totalDurationDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const elapsedDays = Math.round((asOf.getTime() - start.getTime()) / DAY_MS);
  return { totalDurationDays, elapsedDays, balanceDays: totalDurationDays - elapsedDays };
}

interface WbsPhase {
  id: string;
  name: string;
  parentPhaseId: string | null;
  sortOrder: number;
  plannedStart: Date | null;
  plannedEnd: Date | null;
}
interface WbsActivity {
  phaseId: string | null;
  title: string;
  lifecycleStatus: string;
  percentComplete: number;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  vendorName: string | null;
}
export interface WbsTreeRow {
  depth: number;
  kind: 'PHASE' | 'MILESTONE';
  code: string;
  title: string;
  lifecycleStatus: string;
  percentComplete: number;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  vendorName: string | null;
}

/** Real WBS: Phase (Purchase Order / Execution phase, arbitrarily nestable via parentPhaseId)
 * with its Milestones flattened underneath as indented child rows — a phase-level row's status/%
 * is a simple rollup (average % / worst-case status) across every milestone under it, direct or
 * nested, so a glance at the top-level row tells you roughly where that phase stands. */
function buildWbsTree(phases: WbsPhase[], activities: WbsActivity[]): WbsTreeRow[] {
  const milestonesByPhase = new Map<string, WbsActivity[]>();
  const unassigned: WbsActivity[] = [];
  for (const a of activities) {
    if (a.phaseId) {
      const list = milestonesByPhase.get(a.phaseId) ?? [];
      list.push(a);
      milestonesByPhase.set(a.phaseId, list);
    } else {
      unassigned.push(a);
    }
  }

  const childrenByParent = new Map<string, WbsPhase[]>();
  const roots: WbsPhase[] = [];
  for (const p of phases) {
    if (p.parentPhaseId) {
      const list = childrenByParent.get(p.parentPhaseId) ?? [];
      list.push(p);
      childrenByParent.set(p.parentPhaseId, list);
    } else {
      roots.push(p);
    }
  }
  const bySortOrder = (a: WbsPhase, b: WbsPhase) => a.sortOrder - b.sortOrder;
  roots.sort(bySortOrder);
  for (const list of childrenByParent.values()) list.sort(bySortOrder);

  const rows: WbsTreeRow[] = [];

  const statusForMilestones = (ms: WbsActivity[]): string => {
    if (ms.length === 0) return 'DRAFT';
    if (ms.every((m) => m.lifecycleStatus === 'COMPLETE' || m.lifecycleStatus === 'CLOSED')) return 'COMPLETE';
    if (ms.some((m) => m.lifecycleStatus === 'DELAYED')) return 'DELAYED';
    if (ms.some((m) => m.lifecycleStatus === 'IN_PROGRESS')) return 'IN_PROGRESS';
    return 'UPCOMING';
  };
  const avgPercent = (ms: WbsActivity[]): number =>
    ms.length === 0 ? 0 : Math.round(ms.reduce((s, m) => s + m.percentComplete, 0) / ms.length);
  // Earliest planned start / latest planned end across a set of milestones — used to give a
  // phase row a date range even when the Phase record itself never got explicit dates, as long
  // as at least one milestone under it does (otherwise the Gantt/WBS annexure would show a lot
  // of blank date columns for phases that were never manually dated).
  const minDate = (ms: WbsActivity[]): Date | null => {
    const dates = ms.map((m) => m.plannedStart).filter((d): d is Date => d !== null);
    return dates.length === 0 ? null : new Date(Math.min(...dates.map((d) => d.getTime())));
  };
  const maxDate = (ms: WbsActivity[]): Date | null => {
    const dates = ms.map((m) => m.plannedEnd).filter((d): d is Date => d !== null);
    return dates.length === 0 ? null : new Date(Math.max(...dates.map((d) => d.getTime())));
  };
  const collectDescendantMilestones = (phaseId: string): WbsActivity[] => {
    let result = [...(milestonesByPhase.get(phaseId) ?? [])];
    for (const child of childrenByParent.get(phaseId) ?? []) {
      result = result.concat(collectDescendantMilestones(child.id));
    }
    return result;
  };

  // `code` gives every row a conventional WBS-style number (1, 1.1, 1.2, 2, 2.1...) even for
  // projects with no MS-Project import — a phase's direct milestones are numbered first, then
  // its subphases continue the same sibling sequence.
  const visit = (phase: WbsPhase, depth: number, code: string) => {
    const descendantMilestones = collectDescendantMilestones(phase.id);
    rows.push({
      depth,
      kind: 'PHASE',
      code,
      title: phase.name,
      lifecycleStatus: statusForMilestones(descendantMilestones),
      percentComplete: avgPercent(descendantMilestones),
      plannedStart: phase.plannedStart ?? minDate(descendantMilestones),
      plannedEnd: phase.plannedEnd ?? maxDate(descendantMilestones),
      vendorName: null,
    });
    const directMilestones = milestonesByPhase.get(phase.id) ?? [];
    directMilestones.forEach((m, mi) => {
      rows.push({
        depth: depth + 1,
        kind: 'MILESTONE',
        code: `${code}.${mi + 1}`,
        title: m.title,
        lifecycleStatus: m.lifecycleStatus,
        percentComplete: m.percentComplete,
        plannedStart: m.plannedStart,
        plannedEnd: m.plannedEnd,
        vendorName: m.vendorName,
      });
    });
    const children = childrenByParent.get(phase.id) ?? [];
    children.forEach((child, ci) => {
      visit(child, depth + 1, `${code}.${directMilestones.length + ci + 1}`);
    });
  };

  roots.forEach((root, i) => visit(root, 0, `${i + 1}`));

  if (unassigned.length > 0) {
    rows.push({
      depth: 0,
      kind: 'PHASE',
      code: 'U',
      title: 'Unassigned Activities',
      lifecycleStatus: statusForMilestones(unassigned),
      percentComplete: avgPercent(unassigned),
      plannedStart: null,
      plannedEnd: null,
      vendorName: null,
    });
    unassigned.forEach((m, mi) => {
      rows.push({
        depth: 1,
        kind: 'MILESTONE',
        code: `U.${mi + 1}`,
        title: m.title,
        lifecycleStatus: m.lifecycleStatus,
        percentComplete: m.percentComplete,
        plannedStart: m.plannedStart,
        plannedEnd: m.plannedEnd,
        vendorName: m.vendorName,
      });
    });
  }

  return rows;
}

/** Buckets each milestone's net delay (negative = finished early/ahead, positive = late/overdue)
 * into the same histogram shape the Execution Intelligence dashboard's Delay Analysis tab uses. */
function buildDelayHistogram(metrics: Array<{ timeSavedDays: number; overrunDays: number; projectedOverrun: number }>): Array<{ bucket: string; count: number }> {
  const buckets: Record<string, number> = {
    '<-14': 0, '-14 to -7': 0, '-7 to 0': 0, '0 (on-time)': 0, '1 to 7': 0, '8 to 14': 0, '>14': 0,
  };
  for (const m of metrics) {
    const delayDays = m.overrunDays + m.projectedOverrun - m.timeSavedDays;
    if (delayDays < -14) buckets['<-14']++;
    else if (delayDays < -7) buckets['-14 to -7']++;
    else if (delayDays < 0) buckets['-7 to 0']++;
    else if (delayDays === 0) buckets['0 (on-time)']++;
    else if (delayDays <= 7) buckets['1 to 7']++;
    else if (delayDays <= 14) buckets['8 to 14']++;
    else buckets['>14']++;
  }
  return Object.entries(buckets).map(([bucket, count]) => ({ bucket, count }));
}

/**
 * ReportService — builds the weekly/monthly project rollup. READ-ONLY, same discipline as
 * AnalysisService: no mutation, no new business logic, just aggregation over existing data.
 *
 * Two kinds of numbers are mixed deliberately:
 *  - "As of period end" cumulative snapshots (BOQ/financial totals, activity state breakdown)
 *    — reused straight from AnalysisService so this report never disagrees with the Analysis
 *    dashboard's own numbers.
 *  - "This period" activity (RA Bill transitions, progress updates, checklists/DPRs/documents
 *    created or signed) — fresh date-bounded queries, since AnalysisService has no period
 *    concept at all.
 */
export class ReportService {
  static async buildProjectReportData(projectId: string, period: ReportPeriod) {
    const { start, end } = period;
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);

    const [
      project,
      roles,
      execution,
      variance,
      evidenceEntries,
      stateTransitions,
      raBillsInPeriod,
      checklistsInPeriod,
      dprsInPeriod,
      documentsInPeriod,
      allMilestones,
      allRABills,
      allChecklists,
      drawingVersionsInPeriod,
      allPhases,
      allBoqItems,
      scheduleConfig,
      escalationsLast30Days,
      escalationsWindow,
      paymentEligibilities,
    ] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.projectRole.findMany({
        where: { projectId, role: { in: ['CLIENT', 'PMC', 'CONSULTANT'] } },
        include: { user: { select: { name: true } } },
      }),
      AnalysisService.getExecutionAnalysis(projectId),
      AnalysisService.getVarianceAnalysis(projectId),
      // Includes both PMC progress-update rows AND Vendor supporting-photo rows — the
      // former (authorRole !== 'VENDOR') feeds the progress-updates table below, and both
      // feed the evidence photo gallery, since either kind of entry can carry photos.
      prisma.evidence.findMany({
        where: { milestone: { projectId }, submittedAt: { gte: start, lte: end } },
        include: { milestone: { select: { title: true } }, submittedBy: { select: { name: true } }, files: true },
        orderBy: { submittedAt: 'asc' },
      }),
      prisma.milestoneStateTransition.findMany({
        where: { milestone: { projectId }, createdAt: { gte: start, lte: end } },
        include: { milestone: { select: { title: true } }, actor: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.rABill.findMany({
        where: {
          projectId,
          OR: [
            { submittedAt: { gte: start, lte: end } },
            { certifiedAt: { gte: start, lte: end } },
            { approvedAt: { gte: start, lte: end } },
            { releasedAt: { gte: start, lte: end } },
          ],
        },
        include: { order: { select: { name: true } } },
        orderBy: { updatedAt: 'asc' },
      }),
      prisma.checklist.findMany({
        where: { projectId, OR: [{ createdAt: { gte: start, lte: end } }, { signedAt: { gte: start, lte: end } }] },
        include: { items: true, createdBy: { select: { name: true } }, signedBy: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.dailyProgressReport.findMany({
        where: { projectId, reportDate: { gte: startStr, lte: endStr } },
        include: { manpowerRows: true, highlights: true, photos: true, procurementRows: true, createdBy: { select: { name: true } } },
        orderBy: { reportDate: 'asc' },
      }),
      prisma.projectDocument.findMany({
        where: { projectId, deletedAt: null, createdAt: { gte: start, lte: end } },
        include: { uploadedBy: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.milestone.findMany({
        where: { projectId },
        select: {
          id: true, title: true, state: true, percentComplete: true, plannedStart: true, plannedEnd: true,
          wbsCode: true, outlineLevel: true, phaseId: true, sortOrder: true, value: true,
          actualVerification: true, actualSubmission: true,
          vendorUser: { select: { id: true, name: true } },
          evidence: { orderBy: { submittedAt: 'asc' }, take: 1, select: { submittedAt: true, submittedById: true } },
          verifications: { orderBy: { verifiedAt: 'asc' }, take: 1, select: { verifiedAt: true } },
          successorDependencies: { select: { predecessorId: true, lagDays: true } },
        },
        orderBy: { sortOrder: 'asc' },
      }),
      prisma.rABill.findMany({
        where: { projectId },
        include: {
          order: { select: { name: true } },
          measurementSheets: {
            orderBy: { uploadedAt: 'asc' },
            include: { uploadedBy: { select: { name: true } } },
          },
        },
        orderBy: [{ order: { name: 'asc' } }, { billNumber: 'asc' }],
      }),
      prisma.checklist.findMany({
        where: { projectId },
        include: { items: true },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.drawingVersion.findMany({
        where: {
          drawingRow: { projectId },
          OR: [{ uploadedAt: { gte: start, lte: end } }, { reviewedAt: { gte: start, lte: end } }],
        },
        include: { drawingRow: { select: { serialNo: true, name: true, category: true } }, uploadedBy: { select: { name: true } } },
        orderBy: { uploadedAt: 'asc' },
      }),
      prisma.phase.findMany({
        where: { projectId },
        select: { id: true, name: true, parentPhaseId: true, sortOrder: true, plannedStart: true, plannedEnd: true },
        orderBy: { sortOrder: 'asc' },
      }),
      // Every BOQ line item across every Purchase Order — same "read straight off BOQItem,
      // don't filter by parent BOQ.status" convention buildWorkOrderPdfData.ts already uses.
      prisma.bOQItem.findMany({
        where: { boq: { projectId } },
        select: {
          description: true, unit: true, plannedQty: true, rate: true, plannedValue: true,
          boq: { select: { order: { select: { name: true, sortOrder: true } } } },
        },
        orderBy: [{ boq: { order: { sortOrder: 'asc' } } }, { createdAt: 'asc' }],
      }),
      prisma.projectScheduleConfig.findUnique({ where: { projectId } }),
      prisma.followUp.count({
        where: { projectId, status: 'ESCALATED', createdAt: { gte: subDays(end, 30), lte: end } },
      }),
      prisma.followUp.findMany({
        where: { projectId, status: 'ESCALATED', createdAt: { gte: subDays(end, 11 * 7 + 6), lte: end } },
        select: { createdAt: true },
      }),
      prisma.paymentEligibility.findMany({
        where: { milestone: { projectId } },
        include: {
          events: { where: { toState: 'FULLY_ELIGIBLE' }, orderBy: { createdAt: 'asc' }, take: 1 },
          milestone: { include: { evidence: { orderBy: { submittedAt: 'asc' }, take: 1, select: { submittedAt: true, submittedById: true, submittedBy: { select: { name: true } } } } } },
        },
      }),
    ]);

    if (!project) throw new Error('Project not found');

    const namesByRole = (role: string) =>
      roles.filter((r) => r.role === role).map((r) => r.user.name).join(', ') || '—';

    // ── Activities ──────────────────────────────────────────────────────
    const activitiesCompletedThisPeriod = stateTransitions.filter((t) => t.toState === 'VERIFIED' || t.toState === 'CLOSED');
    const progressUpdates = evidenceEntries.filter((e) => e.authorRole !== 'VENDOR');

    // Evidence photos — any evidence entry (PMC progress update or Vendor supporting
    // submission) that has image attachments, scoped to this period. Non-image files
    // (PDFs/docs) on the same entry are left out — the report shows photos, not paperwork.
    const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif']);
    const evidencePhotoGroups = evidenceEntries
      .map((e) => ({
        activityTitle: e.milestone.title,
        submittedByName: e.submittedBy.name,
        submittedAt: e.submittedAt,
        remarks: e.remarks,
        authorRole: e.authorRole,
        photoFiles: e.files.filter((f) => IMAGE_MIME_TYPES.has(f.mimeType)),
      }))
      .filter((g) => g.photoFiles.length > 0);

    // DPR photos, folded into the same "Progress Photographs" gallery as evidence photos —
    // the report shows both sources under one section since they're both site photos, just
    // captured through different flows (DPR daily entry vs Milestone progress update).
    const dprPhotoGroups = dprsInPeriod
      .filter((d) => d.photos.length > 0)
      .map((d) => ({
        activityTitle: `DPR ${d.docRefNo} — ${d.reportDate}`,
        submittedByName: d.createdBy.name,
        submittedAt: new Date(d.reportDate),
        remarks: null as string | null,
        authorRole: 'SITE_ENGINEER' as string | null,
        // dprId/photoId let the web preview build the DPR photo-serving URL (a different
        // route than /api/files/{id}, which only serves EvidenceFile records) — id is
        // included for shape-parity with evidence photoFiles but isn't used to fetch these.
        photoFiles: d.photos.map((p) => ({ id: p.id, dprId: d.id, mimeType: p.mimeType, filePath: p.filePath, fileName: p.remarks || p.fileName })),
      }));

    // Materials — aggregated from DPR Procurement rows across the period. Cumulative/balance
    // fields are running totals as of each DPR's date, so the LAST day's row per material
    // (not a sum across days) is the correct "current" cumulative/balance — same reasoning as
    // RA Bill line items only reading the latest bill's cumulative qty, not summing every bill.
    const materialsMap = new Map<string, { unit: string; receivedThisPeriod: number; cumulativeReceived: number; consumedTillDate: number; balanceAtSite: number; lastDate: string }>();
    for (const d of dprsInPeriod) {
      for (const row of d.procurementRows) {
        const existing = materialsMap.get(row.materialName);
        const receivedThisPeriod = (existing?.receivedThisPeriod ?? 0) + row.receivedThisWeek;
        if (!existing || d.reportDate >= existing.lastDate) {
          materialsMap.set(row.materialName, {
            unit: row.unit,
            receivedThisPeriod,
            cumulativeReceived: row.cumulativeReceivedTillDate,
            consumedTillDate: row.consumedTillDate,
            balanceAtSite: row.balanceAtSite,
            lastDate: d.reportDate,
          });
        } else {
          materialsMap.set(row.materialName, { ...existing, receivedThisPeriod });
        }
      }
    }
    const materials = Array.from(materialsMap.entries()).map(([materialName, m]) => ({ materialName, ...m }));

    // Non-conformances — checklist check-points marked Not O.K. this period, the closest real
    // equivalent this system has to a formal NCR log.
    const nonConformances: Array<{ docRefNo: string; checklistTitle: string; description: string; remarks: string | null }> = [];
    for (const c of checklistsInPeriod) {
      for (const item of c.items) {
        if (item.result === 'NOT_OK') {
          nonConformances.push({ docRefNo: c.docRefNo, checklistTitle: c.title, description: item.description, remarks: item.remarks });
        }
      }
    }

    // Activities due this period — plannedEnd falling inside [start, end], regardless of
    // when they were last touched, classified by the same lifecycle buckets as everywhere
    // else in the app (see allActivitiesOut below, computed first so this can reuse it).

    // ── RA Bills / Payments ─────────────────────────────────────────────
    const billEvents: Array<{ billNumber: number; orderName: string; stage: string; amount: number; date: Date }> = [];
    for (const b of raBillsInPeriod) {
      if (b.submittedAt && b.submittedAt >= start && b.submittedAt <= end) {
        billEvents.push({ billNumber: b.billNumber, orderName: b.order.name, stage: 'Submitted', amount: b.submittedValue ?? 0, date: b.submittedAt });
      }
      if (b.certifiedAt && b.certifiedAt >= start && b.certifiedAt <= end) {
        billEvents.push({ billNumber: b.billNumber, orderName: b.order.name, stage: 'Certified', amount: b.submittedValue ?? 0, date: b.certifiedAt });
      }
      if (b.approvedAt && b.approvedAt >= start && b.approvedAt <= end) {
        billEvents.push({ billNumber: b.billNumber, orderName: b.order.name, stage: 'Approved', amount: b.approvedValue ?? 0, date: b.approvedAt });
      }
      if (b.releasedAt && b.releasedAt >= start && b.releasedAt <= end) {
        billEvents.push({ billNumber: b.billNumber, orderName: b.order.name, stage: 'Released', amount: b.releasedValue ?? 0, date: b.releasedAt });
      }
    }
    billEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

    // ── Checklists ──────────────────────────────────────────────────────
    const checklistsCreated = checklistsInPeriod.filter((c) => c.createdAt >= start && c.createdAt <= end);
    const checklistsSigned = checklistsInPeriod.filter((c) => c.signedAt && c.signedAt >= start && c.signedAt <= end);
    let okCount = 0, notOkCount = 0, naCount = 0;
    for (const c of checklistsSigned) {
      for (const item of c.items) {
        if (item.result === 'OK') okCount++;
        else if (item.result === 'NOT_OK') notOkCount++;
        else if (item.result === 'NA') naCount++;
      }
    }

    // ── DPR ─────────────────────────────────────────────────────────────
    const calendarDaysInPeriod = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
    let manpowerActualTotal = 0, manpowerPlannedTotal = 0, highlightsTotal = 0, photosTotal = 0;
    const criticalIssueReports: Array<{ reportDate: string; docRefNo: string; criticalIssues: string }> = [];
    const manpowerByDay: Array<{ reportDate: string; actual: number; planned: number }> = [];
    for (const d of dprsInPeriod) {
      const dayActual = d.manpowerRows.reduce((s, m) => s + m.actualCount, 0);
      const dayPlanned = d.manpowerRows.reduce((s, m) => s + m.plannedCount, 0);
      manpowerActualTotal += dayActual; manpowerPlannedTotal += dayPlanned;
      highlightsTotal += d.highlights.length;
      photosTotal += d.photos.length;
      manpowerByDay.push({ reportDate: d.reportDate, actual: dayActual, planned: dayPlanned });
      if (d.criticalIssues && d.criticalIssues.trim()) {
        criticalIssueReports.push({ reportDate: d.reportDate, docRefNo: d.docRefNo, criticalIssues: d.criticalIssues });
      }
    }

    // ── Project overview ────────────────────────────────────────────────
    const metadata = project.metadata ? JSON.parse(project.metadata) : {};
    const duration = computeDuration(metadata.startDate ?? null, metadata.endDate ?? null, end);

    // ── Full activity/RA Bill/checklist rosters (whole-project, not period-bound) ────────
    const today = startOfDay(new Date());
    const allActivitiesOut = allMilestones.map((m) => ({
      title: m.title,
      lifecycleStatus: classifyLifecycleStatus({ state: m.state, plannedStart: m.plannedStart, plannedEnd: m.plannedEnd }, today),
      percentComplete: m.percentComplete ?? 0,
      plannedStart: m.plannedStart,
      plannedEnd: m.plannedEnd,
      wbsCode: m.wbsCode,
      outlineLevel: m.outlineLevel,
      phaseId: m.phaseId,
      vendorName: m.vendorUser?.name ?? null,
    }));

    // WBS / Schedule tree — real Phase (Purchase Order / Execution phase) hierarchy with its
    // Milestones nested underneath, rather than relying on wbsCode/outlineLevel (only populated
    // for MS-Project-imported schedules — most projects have neither, which would otherwise
    // render as a flat, un-grouped list). Falls back to an "Unassigned Activities" bucket for any
    // milestone with no phaseId, so nothing silently disappears from the annexure.
    const wbsTree = buildWbsTree(allPhases, allActivitiesOut);

    // BOQ line items — every item across every order, for the "Annexure IV — Bill of
    // Quantities" annexure. Grouping by order happens at format time (buildProjectReportPdfData).
    const boqItemsOut = allBoqItems.map((item) => ({
      orderName: item.boq.order?.name ?? 'Unassigned',
      description: item.description,
      unit: item.unit,
      plannedQty: item.plannedQty,
      rate: item.rate,
      plannedValue: item.plannedValue,
    }));

    // ── Execution Intelligence: S-curve, burndown, vendor scorecards, delay/criticality/cost ──
    // Reuses the exact same pure computation functions (scheduleMetrics.ts, cpm.ts) that power
    // the Execution Intelligence dashboard, so the report's numbers never disagree with that
    // page's — "today" here is the report period's end date, not the actual current date, so a
    // report generated for a past period reflects that period's state, not today's.
    const rawMilestones: RawMilestone[] = allMilestones.map((m) => ({
      id: m.id,
      title: m.title,
      state: m.state,
      plannedEnd: m.plannedEnd,
      actualEnd: m.actualVerification ?? m.actualSubmission ?? null,
      value: m.value || 1,
      vendorId: m.vendorUser?.id ?? null,
      percentComplete: m.percentComplete,
    }));

    const approvalCycleByMilestone = new Map<string, number | null>();
    for (const m of allMilestones) {
      const firstEvidence = m.evidence[0];
      const firstVerification = m.verifications[0];
      approvalCycleByMilestone.set(
        m.id,
        firstEvidence && firstVerification
          ? differenceInDays(startOfDay(firstVerification.verifiedAt), startOfDay(firstEvidence.submittedAt))
          : null,
      );
    }

    const projectStartDate = scheduleConfig?.projectStartDate ?? (metadata.startDate ? new Date(metadata.startDate) : start);
    const cpmInputs = milestonesCpmInputs(
      allMilestones.map((m) => ({
        id: m.id, title: m.title, plannedStart: m.plannedStart, plannedEnd: m.plannedEnd, sortOrder: m.sortOrder,
        predecessorIds: m.successorDependencies.map((d) => d.predecessorId),
      })),
      projectStartDate,
    );
    const lagMap = new Map<string, number>();
    for (const m of allMilestones) {
      for (const dep of m.successorDependencies) lagMap.set(`${dep.predecessorId}→${m.id}`, dep.lagDays);
    }
    const cpmResult = computeCPM(cpmInputs, lagMap);
    const criticalSet = new Set(cpmResult.criticalPath);

    const cycleTimes = Array.from(approvalCycleByMilestone.values()).filter((d): d is number => d !== null && d >= 0);
    const avgApprovalCycleDays = cycleTimes.length > 0 ? cycleTimes.reduce((s, d) => s + d, 0) / cycleTimes.length : 0;

    const kpis = computeProjectScheduleKPIs(
      { milestones: rawMilestones, avgApprovalCycleDays, criticalMilestoneCount: criticalSet.size, escalationsLast30Days },
      end,
    );

    const vendorMilestones: VendorMilestone[] = allMilestones
      .filter((m): m is typeof m & { vendorUser: NonNullable<typeof m.vendorUser> } => m.vendorUser !== null)
      .map((m) => ({
        id: m.id, title: m.title, state: m.state, plannedEnd: m.plannedEnd,
        actualEnd: m.actualVerification ?? m.actualSubmission ?? null, value: m.value || 1,
        percentComplete: m.percentComplete,
        vendorId: m.vendorUser.id, vendorName: m.vendorUser.name,
        approvalCycleDays: approvalCycleByMilestone.get(m.id) ?? null,
        isEscalated: false,
      }));
    const vendorScorecards = computeVendorScorecards(vendorMilestones, end);

    const milestonesWithDates = rawMilestones.filter((m) => m.plannedEnd !== null);
    const allTrendDates = milestonesWithDates.flatMap((m) => [m.plannedEnd, m.actualEnd].filter((d): d is Date => d !== null));
    const trendFrom = allTrendDates.length > 0 ? new Date(Math.min(...allTrendDates.map((d) => d.getTime()))) : subDays(end, 90);
    const trendTo = allTrendDates.length > 0 ? new Date(Math.max(...allTrendDates.map((d) => d.getTime()))) : end;
    const trendMilestones = milestonesWithDates.map((m) => ({ id: m.id, plannedEnd: m.plannedEnd, actualEnd: m.actualEnd, value: m.value }));
    const sCurveRaw = computeSCurve(trendMilestones, trendFrom, trendTo);
    const burndownRaw = computeBurndown(trendMilestones, trendFrom, trendTo);

    const delayHistogram = buildDelayHistogram(rawMilestones.map((m) => computeMilestoneScheduleMetrics(m, end)));

    const escalationTrend: Array<{ weekEndDate: Date; count: number }> = [];
    for (let i = 11; i >= 0; i--) {
      const weekStart = subDays(end, i * 7 + 6);
      const weekEnd = subDays(end, i * 7);
      const count = escalationsWindow.filter((e) => e.createdAt >= weekStart && e.createdAt <= weekEnd).length;
      escalationTrend.push({ weekEndDate: weekEnd, count });
    }

    const paymentCycleRows: Array<{ vendorName: string; days: number }> = [];
    for (const e of paymentEligibilities) {
      const firstEvidence = e.milestone.evidence[0];
      const eligibleEvent = e.events[0];
      if (!firstEvidence || !eligibleEvent) continue;
      paymentCycleRows.push({
        vendorName: firstEvidence.submittedBy.name,
        days: differenceInDays(startOfDay(eligibleEvent.createdAt), startOfDay(firstEvidence.submittedAt)),
      });
    }
    const paymentCycleAvgDays = paymentCycleRows.length > 0 ? paymentCycleRows.reduce((s, r) => s + r.days, 0) / paymentCycleRows.length : 0;
    const paymentCycleByVendorMap = new Map<string, number[]>();
    for (const r of paymentCycleRows) {
      const list = paymentCycleByVendorMap.get(r.vendorName) ?? [];
      list.push(r.days);
      paymentCycleByVendorMap.set(r.vendorName, list);
    }
    const paymentCycleByVendor = Array.from(paymentCycleByVendorMap.entries()).map(([vendorName, days]) => ({
      vendorName, avgDays: days.reduce((s, d) => s + d, 0) / days.length,
    }));

    const totalProjectValue = allMilestones.reduce((s, m) => s + (m.value || 0), 0);
    const delayCost = estimateDelayCost(kpis.totalOverrunDays, {
      dailyOverheadCost: scheduleConfig?.dailyOverheadCost ?? 0,
      penaltyRatePerDay: scheduleConfig?.penaltyRatePerDay ?? 0,
      opportunityCostFactor: scheduleConfig?.opportunityCostFactor ?? 1.0,
      totalProjectValue,
    });

    // Critical + near-critical milestones, tightest float first — capped for a readable report.
    const criticality = cpmResult.nodes
      .slice()
      .sort((a, b) => a.totalFloat - b.totalFloat)
      .slice(0, 15)
      .map((n) => ({ title: n.title, isCritical: n.isCritical, totalFloat: n.totalFloat, duration: n.duration }));

    const executionIntelligence = {
      kpis,
      vendorScorecards,
      sCurve: sCurveRaw,
      burndown: burndownRaw,
      delayHistogram,
      escalationTrend,
      paymentCycles: { avgDays: paymentCycleAvgDays, byVendor: paymentCycleByVendor },
      delayCost,
      criticality,
    };

    // Project Stakeholders — Client/PMC/Consultant from ProjectRole (namesByRole above), plus
    // the real vendor names actually assigned to activities (no separate "contractor" concept
    // in this schema — vendors are assigned per-activity via Milestone.vendorUserId).
    const vendorNames = Array.from(new Set(allActivitiesOut.map((a) => a.vendorName).filter((n): n is string => Boolean(n))));

    // Executive Dashboard — Physical/Financial progress vs a simple time-linear planned
    // baseline (elapsed/total duration), since this app doesn't store a formal baseline
    // S-curve to compare against. Labeled clearly as "time-linear" wherever displayed so it
    // reads as an estimate, not a real baseline programme figure.
    const physicalActualPercent = execution.overview.verifiedPercent;
    const financialActualPercent = variance.bills.totals.totalPlannedValue > 0
      ? (variance.bills.totals.totalApprovedValue / variance.bills.totals.totalPlannedValue) * 100
      : 0;
    const timeElapsedPercent = duration && duration.totalDurationDays > 0
      ? Math.min(100, Math.max(0, (duration.elapsedDays / duration.totalDurationDays) * 100))
      : null;
    const physicalVariancePoints = timeElapsedPercent !== null ? physicalActualPercent - timeElapsedPercent : null;
    const scheduleStatusLabel = physicalVariancePoints === null ? 'Unknown'
      : physicalVariancePoints > 2 ? 'Ahead'
      : physicalVariancePoints < -2 ? 'Behind'
      : 'On Track';

    // Health Flags (RAG) — Schedule/Cost computed now; Quality is computed just below once
    // allOkCount/allNotOkCount/allNaCount exist. Safety/HSE and Business/Legal are deliberately
    // omitted rather than shown as fake green/amber/red, since this system tracks nothing for
    // either area.
    const scheduleRag: 'GREEN' | 'AMBER' | 'RED' = physicalVariancePoints === null ? 'AMBER' : physicalVariancePoints < -10 ? 'RED' : physicalVariancePoints < -2 ? 'AMBER' : 'GREEN';
    const costRag: 'GREEN' | 'AMBER' | 'RED' = variance.bills.totals.totalVariancePercent > 40 ? 'RED' : variance.bills.totals.totalVariancePercent > 15 ? 'AMBER' : 'GREEN';

    const allRABillsOut = allRABills.map((b) => ({
      billNumber: b.billNumber,
      orderName: b.order.name,
      status: b.status,
      submittedValue: b.submittedValue ?? 0,
      approvedValue: b.approvedValue ?? 0,
      releasedValue: b.releasedValue ?? 0,
      measurementSheetCount: b.measurementSheets.length,
    }));

    const measurementSheetsOut = allRABills.flatMap((b) =>
      b.measurementSheets.map((s) => ({
        billNumber: b.billNumber,
        orderName: b.order.name,
        fileName: s.fileName,
        uploadedByName: s.uploadedBy.name,
        uploadedAt: s.uploadedAt,
        remarks: s.remarks,
      })),
    );

    let allOkCount = 0, allNotOkCount = 0, allNaCount = 0;
    const allChecklistsOut = allChecklists.map((c) => {
      const filledCount = c.items.filter((i) => i.result !== null).length;
      for (const item of c.items) {
        if (item.result === 'OK') allOkCount++;
        else if (item.result === 'NOT_OK') allNotOkCount++;
        else if (item.result === 'NA') allNaCount++;
      }
      return { docRefNo: c.docRefNo, title: c.title, status: c.status, itemCount: c.items.length, filledCount };
    });

    const totalChecklistItems = allOkCount + allNotOkCount + allNaCount;
    const notOkRate = totalChecklistItems > 0 ? (allNotOkCount / totalChecklistItems) * 100 : 0;
    const qualityRag: 'GREEN' | 'AMBER' | 'RED' = notOkRate > 15 ? 'RED' : notOkRate > 5 ? 'AMBER' : 'GREEN';

    // Activities due this period — plannedEnd inside [start, end], however far along they
    // actually are, so PMC/Client can see at a glance what was supposed to finish and whether
    // it did.
    const dueThisPeriod = allActivitiesOut.filter((a) => a.plannedEnd && a.plannedEnd >= start && a.plannedEnd <= end);
    let dueCompletedCount = 0, dueOngoingCount = 0, dueUndoneCount = 0;
    for (const a of dueThisPeriod) {
      if (a.lifecycleStatus === 'COMPLETE' || a.lifecycleStatus === 'CLOSED') dueCompletedCount++;
      else if (a.lifecycleStatus === 'IN_PROGRESS') dueOngoingCount++;
      else dueUndoneCount++; // DRAFT, UPCOMING, or DELAYED — due but not actually done
    }

    // Drawings touched this period — Architecture module. Listed for visibility only, not
    // embedded as images: DrawingVersion.uploadType is PDF/URL, not a raster image, so there's
    // no thumbnail to render the way Evidence/DPR photos are rendered below.
    const drawingsThisPeriod = drawingVersionsInPeriod.map((v) => ({
      serialNo: v.drawingRow.serialNo,
      name: v.drawingRow.name,
      category: v.drawingRow.category,
      status: v.reviewStatus,
      uploadedByName: v.uploadedBy.name,
      date: v.uploadedAt,
    }));

    return {
      project: { id: project.id, name: project.name },
      clientName: namesByRole('CLIENT'),
      pmcName: namesByRole('PMC'),
      consultantName: namesByRole('CONSULTANT'),
      period,
      wbsTree,
      boqItems: boqItemsOut,
      executionIntelligence,

      overview: {
        description: project.description,
        status: project.status,
        location: metadata.location ?? null,
        duration,
      },

      stakeholders: {
        clientName: namesByRole('CLIENT'),
        pmcName: namesByRole('PMC'),
        consultantName: namesByRole('CONSULTANT'),
        vendorNames,
      },

      dashboard: {
        physicalActualPercent,
        financialActualPercent,
        timeElapsedPercent,
        physicalVariancePoints,
        scheduleStatusLabel,
      },
      healthFlags: {
        scheduleRag, costRag, qualityRag,
      },

      execution: {
        overview: execution.overview,
        allActivities: allActivitiesOut,
        dueThisPeriod,
        dueCompletedCount, dueOngoingCount, dueUndoneCount,
      },
      financial: {
        totals: variance.bills.totals,
        byOrder: variance.bills.byOrder,
      },

      keyRisks: {
        overdueActivities: variance.schedule.overdueActivities,
        overdueBills: variance.overdueBills,
      },

      materials,
      nonConformances,

      evidencePhotos: [...evidencePhotoGroups, ...dprPhotoGroups],
      drawings: drawingsThisPeriod,

      activities: {
        progressUpdates: progressUpdates.map((e) => ({
          date: e.submittedAt,
          activityTitle: e.milestone.title,
          percentComplete: e.qtyOrPercent,
          authorName: e.submittedBy.name,
          remarks: e.remarks,
        })),
        stateTransitions: stateTransitions.map((t) => ({
          date: t.createdAt,
          activityTitle: t.milestone.title,
          fromState: t.fromState,
          toState: t.toState,
          actorName: t.actor.name,
        })),
        completedThisPeriodCount: activitiesCompletedThisPeriod.length,
        updatesThisPeriodCount: progressUpdates.length,
      },

      payments: {
        events: billEvents,
        billsTouchedCount: raBillsInPeriod.length,
        allBills: allRABillsOut,
        measurementSheets: measurementSheetsOut,
      },

      checklists: {
        createdCount: checklistsCreated.length,
        signedCount: checklistsSigned.length,
        okCount, notOkCount, naCount,
        signed: checklistsSigned.map((c) => ({
          docRefNo: c.docRefNo, title: c.title, referenceDrawingNo: c.referenceDrawingNo,
          createdByName: c.createdBy.name, signedByName: c.signedBy?.name ?? null, signedAt: c.signedAt,
          itemCount: c.items.length,
        })),
        allChecklists: allChecklistsOut,
        allTimeOkCount: allOkCount,
        allTimeNotOkCount: allNotOkCount,
        allTimeNaCount: allNaCount,
      },

      dpr: {
        reportsFiledCount: dprsInPeriod.length,
        calendarDaysInPeriod,
        manpowerActualTotal,
        manpowerPlannedTotal,
        highlightsTotal,
        photosTotal,
        criticalIssueReports,
        manpowerByDay,
        reports: dprsInPeriod.map((d) => ({
          reportDate: d.reportDate, docRefNo: d.docRefNo, createdByName: d.createdBy.name,
          manpowerActual: d.manpowerRows.reduce((s, m) => s + m.actualCount, 0),
          manpowerPlanned: d.manpowerRows.reduce((s, m) => s + m.plannedCount, 0),
          highlightsCount: d.highlights.length, photosCount: d.photos.length,
          hasCriticalIssues: Boolean(d.criticalIssues && d.criticalIssues.trim()),
        })),
      },

      documents: {
        uploadedCount: documentsInPeriod.length,
        uploaded: documentsInPeriod.map((doc) => ({
          title: doc.title, category: doc.category, uploadedByName: doc.uploadedBy.name, createdAt: doc.createdAt,
        })),
      },
    };
  }
}

export type ProjectReportData = Awaited<ReturnType<typeof ReportService.buildProjectReportData>>;
