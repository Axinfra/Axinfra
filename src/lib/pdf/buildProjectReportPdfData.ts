import QRCode from 'qrcode';
import { ReportService } from '@/services/ReportService';
import { AIReportSummaryService } from '@/services/AIReportSummaryService';
import { fileStorage } from '@/lib/file-storage';
import type { ReportPeriod } from '@/lib/reportPeriod';
import { formatDate, formatDateTime } from '@/lib/utils';
import { getLogoDataUri } from './logo';
import { formatCurrencyForPdf, qtyFormatter } from './format';
import { GOLD } from './theme';
import type {
  ProjectReportPdfData, ReportEvidencePhotoGroup, ReportSCurvePoint, ReportGanttRow, ReportWbsRow, ReportBoqOrderGroup,
  ReportExecutionKpis, ReportVendorScorecardRow, ReportDelayBucket, ReportEscalationWeek, ReportPaymentCycles, ReportDelayCost, ReportCriticalityRow,
} from './types';

const pct = (n: number) => `${n.toFixed(1)}%`;
const GREEN = '#5cba80';
const RED = '#e06050';
const BLUE = '#6b93c9';
const GRAY = '#9ca3af';

const LIFECYCLE_LABELS: Record<string, string> = {
  DRAFT: 'Draft', UPCOMING: 'Upcoming', IN_PROGRESS: 'In Progress',
  DELAYED: 'Delayed', COMPLETE: 'Complete', CLOSED: 'Closed',
};

/** Assembles fully display-ready PDF data for a weekly/monthly Project Report, mirroring
 * buildDPRPdfData.ts's/buildRABillPdfData.ts's pattern — this file owns all formatting so the
 * PDF template only deals with already-formatted strings. */
export async function buildProjectReportPdfData(params: { projectId: string; period: ReportPeriod }): Promise<ProjectReportPdfData> {
  const { projectId, period } = params;
  const data = await ReportService.buildProjectReportData(projectId, period);

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://axinfra.in';
  const qrDataUri = await QRCode.toDataURL(`${appUrl}/projects/${projectId}/reports`, { margin: 1, width: 200 });

  const periodTypeLabel = period.type === 'WEEK' ? 'Weekly' : 'Monthly';

  // ── WBS / Schedule (Annexure I) + Gantt timeline — both built from the real Phase→Milestone
  // hierarchy (data.wbsTree from ReportService), not wbsCode/outlineLevel: those are only ever
  // populated for MS-Project-imported schedules, so most projects would otherwise render as a
  // flat, un-grouped list here.
  const wbs: ReportWbsRow[] = data.wbsTree.map((row) => ({
    wbsCode: row.code,
    kind: row.kind,
    indent: Math.min(row.depth, 4),
    title: row.title,
    lifecycleStatus: row.lifecycleStatus,
    percentComplete: row.percentComplete,
    plannedStartFormatted: row.plannedStart ? formatDate(row.plannedStart) : '—',
    plannedEndFormatted: row.plannedEnd ? formatDate(row.plannedEnd) : '—',
    vendorName: row.vendorName ?? '—',
  }));

  // Gantt plots PHASE rows (which roll up to a date range even when the phase itself has no
  // explicit dates, as long as a descendant milestone does — see ReportService.buildWbsTree) plus
  // any MILESTONE row with its own dates, capped for readability, sorted by start date.
  const GANTT_MAX_ROWS = 25;
  const ganttSource = data.wbsTree
    .filter((row) => row.plannedStart && row.plannedEnd)
    .sort((a, b) => a.plannedStart!.getTime() - b.plannedStart!.getTime())
    .slice(0, GANTT_MAX_ROWS);
  let gantt: ReportGanttRow[] = [];
  if (ganttSource.length > 0) {
    const minStart = Math.min(...ganttSource.map((r) => r.plannedStart!.getTime()));
    const maxEnd = Math.max(...ganttSource.map((r) => r.plannedEnd!.getTime()));
    const totalSpan = Math.max(maxEnd - minStart, 1);
    gantt = ganttSource.map((r) => ({
      kind: r.kind,
      indent: Math.min(r.depth, 2),
      title: r.title,
      lifecycleStatus: r.lifecycleStatus,
      startOffsetPercent: ((r.plannedStart!.getTime() - minStart) / totalSpan) * 100,
      durationPercent: Math.max(((r.plannedEnd!.getTime() - r.plannedStart!.getTime()) / totalSpan) * 100, 0.5),
      plannedStartFormatted: formatDate(r.plannedStart),
      plannedEndFormatted: formatDate(r.plannedEnd),
    }));
  }

  // ── S-Curve & Burndown — computed directly from every milestone's planned/actual dates via
  // the same Execution Intelligence engine (scheduleMetrics.ts) that powers that dashboard, so
  // these show real, meaningful data immediately rather than needing weeks of accumulated
  // snapshots to become a proper curve.
  const sCurve: ReportSCurvePoint[] = data.executionIntelligence.sCurve.map((p) => ({
    periodLabel: formatDate(new Date(p.date)),
    plannedPercent: p.plannedCumulative,
    actualPercent: p.actualCumulative,
  }));
  const burndown: ReportSCurvePoint[] = data.executionIntelligence.burndown.map((p) => ({
    periodLabel: formatDate(new Date(p.date)),
    plannedPercent: p.plannedRemaining,
    actualPercent: p.actualRemaining,
  }));

  const { kpis, vendorScorecards: rawVendorScorecards, delayHistogram: rawDelayHistogram, escalationTrend: rawEscalationTrend, paymentCycles: rawPaymentCycles, delayCost: rawDelayCost, criticality: rawCriticality } = data.executionIntelligence;

  const executionKpis: ReportExecutionKpis = {
    netScheduleDaysFormatted: `${kpis.netScheduleDays >= 0 ? '+' : ''}${kpis.netScheduleDays} day(s)`,
    totalSavedDaysFormatted: `${kpis.totalSavedDays} day(s)`,
    totalOverrunDaysFormatted: `${kpis.totalOverrunDays} day(s)`,
    onTimePctFormatted: pct(kpis.onTimePct),
    avgApprovalCycleDaysFormatted: `${kpis.avgApprovalCycleDays} day(s)`,
    criticalMilestoneCount: kpis.criticalMilestoneCount,
    escalationsLast30Days: kpis.escalationsLast30Days,
    completedMilestones: kpis.completedMilestones,
    totalMilestones: kpis.totalMilestones,
  };

  const vendorScorecards: ReportVendorScorecardRow[] = rawVendorScorecards.map((v) => ({
    vendorName: v.vendorName,
    totalMilestones: v.totalMilestones,
    completedOnTime: v.completedOnTime,
    completedLate: v.completedLate,
    inProgress: v.inProgress,
    onTimePctFormatted: pct(v.onTimePct),
    avgDelayDaysFormatted: `${v.avgDelayDays} day(s)`,
    avgApprovalCycleDaysFormatted: `${v.avgApprovalCycleDays} day(s)`,
    escalationCount: v.escalationCount,
    rank: v.rank,
  }));

  const delayHistogram: ReportDelayBucket[] = rawDelayHistogram;

  const escalationTrend: ReportEscalationWeek[] = rawEscalationTrend.map((w) => ({
    weekLabel: formatDate(w.weekEndDate),
    count: w.count,
  }));

  const paymentCycles: ReportPaymentCycles = {
    avgDaysFormatted: `${Math.round(rawPaymentCycles.avgDays * 10) / 10} day(s)`,
    byVendor: rawPaymentCycles.byVendor.map((v) => ({ vendorName: v.vendorName, avgDaysFormatted: `${Math.round(v.avgDays * 10) / 10} day(s)` })),
  };

  const delayCost: ReportDelayCost = {
    isConfigured: rawDelayCost.isConfigured,
    totalOverrunDays: rawDelayCost.totalOverrunDays,
    overheadCostFormatted: formatCurrencyForPdf(rawDelayCost.overheadCost),
    penaltyCostFormatted: formatCurrencyForPdf(rawDelayCost.penaltyCost),
    opportunityCostFormatted: formatCurrencyForPdf(rawDelayCost.opportunityCost),
    totalEstimatedCostFormatted: formatCurrencyForPdf(rawDelayCost.totalEstimatedCost),
  };

  const criticality: ReportCriticalityRow[] = rawCriticality.map((c) => ({
    title: c.title,
    isCritical: c.isCritical,
    totalFloatDaysFormatted: `${c.totalFloat} day(s)`,
    durationDaysFormatted: `${c.duration} day(s)`,
  }));

  // BOQ line items grouped by Purchase Order, for Annexure IV.
  const boqByOrderMap = new Map<string, typeof data.boqItems>();
  for (const item of data.boqItems) {
    const list = boqByOrderMap.get(item.orderName) ?? [];
    list.push(item);
    boqByOrderMap.set(item.orderName, list);
  }
  const boqByOrder: ReportBoqOrderGroup[] = Array.from(boqByOrderMap.entries()).map(([orderName, items]) => ({
    orderName,
    items: items.map((item, i) => ({
      itemNo: i + 1,
      description: item.description,
      unit: item.unit,
      plannedQtyFormatted: qtyFormatter.format(item.plannedQty),
      rateFormatted: formatCurrencyForPdf(item.rate),
      plannedValueFormatted: formatCurrencyForPdf(item.plannedValue),
    })),
    subtotalFormatted: formatCurrencyForPdf(items.reduce((sum, item) => sum + item.plannedValue, 0)),
  }));
  const boqGrandTotal = data.boqItems.reduce((sum, item) => sum + item.plannedValue, 0);

  // Evidence photos — read each image's bytes and embed as a data URI, same technique as
  // buildDPRPdfData.ts's photo loop (react-pdf's Image needs a public URL or a data URI, and
  // these live behind private storage).
  const evidencePhotos: ReportEvidencePhotoGroup[] = [];
  for (const group of data.evidencePhotos) {
    const photos: { dataUri: string; fileName: string }[] = [];
    for (const file of group.photoFiles) {
      const buffer = await fileStorage.read(file.filePath);
      if (!buffer) continue;
      photos.push({ dataUri: `data:${file.mimeType};base64,${buffer.toString('base64')}`, fileName: file.fileName });
    }
    if (photos.length === 0) continue;
    evidencePhotos.push({
      activityTitle: group.activityTitle,
      submittedByName: group.submittedByName,
      dateFormatted: formatDate(group.submittedAt),
      remarks: group.remarks ?? '',
      authorRoleLabel: group.authorRole === 'VENDOR' ? 'Vendor' : group.authorRole === 'PMC' ? 'PMC' : group.authorRole === 'SITE_ENGINEER' ? 'Site Engineer' : 'Unknown',
      photos,
    });
  }

  const pdfData = {
    projectName: data.project.name,
    clientName: data.clientName,
    pmcName: data.pmcName,
    consultantName: data.consultantName,
    periodTypeLabel,
    periodLabel: data.period.label,

    keyStats: [
      { label: 'BOQ Planned Value', value: formatCurrencyForPdf(data.financial.totals.totalPlannedValue) },
      { label: 'Billed to Date', value: formatCurrencyForPdf(data.financial.totals.totalSubmittedValue) },
      { label: 'Approved to Date', value: formatCurrencyForPdf(data.financial.totals.totalApprovedValue) },
      { label: 'Released to Date', value: formatCurrencyForPdf(data.financial.totals.totalReleasedValue) },
      { label: 'Activities Updated', value: String(data.activities.updatesThisPeriodCount) },
      { label: 'Activities Completed', value: String(data.activities.completedThisPeriodCount) },
      { label: 'Checklists Signed', value: String(data.checklists.signedCount) },
      { label: 'DPR Coverage', value: `${data.dpr.reportsFiledCount}/${data.dpr.calendarDaysInPeriod} days` },
      { label: 'Critical Issues Flagged', value: String(data.dpr.criticalIssueReports.length) },
    ],

    overview: {
      description: data.overview.description ?? '',
      status: data.overview.status,
      location: data.overview.location ?? '',
      totalDurationDays: data.overview.duration?.totalDurationDays ?? null,
      elapsedDays: data.overview.duration?.elapsedDays ?? null,
      balanceDays: data.overview.duration?.balanceDays ?? null,
    },

    stakeholders: [
      { role: 'Client / Owner', name: data.stakeholders.clientName },
      { role: 'Project Management Consultant', name: data.stakeholders.pmcName },
      { role: 'Design / Architect Consultant', name: data.stakeholders.consultantName },
      { role: 'Vendors / Subcontractors', name: data.stakeholders.vendorNames.join(', ') || '—' },
    ],

    dashboard: [
      {
        label: 'Overall Physical Progress (%)',
        plannedFormatted: data.dashboard.timeElapsedPercent !== null ? `${data.dashboard.timeElapsedPercent.toFixed(1)}% (time-linear est.)` : 'Not set',
        actualFormatted: pct(data.dashboard.physicalActualPercent),
        varianceFormatted: data.dashboard.physicalVariancePoints !== null ? `${data.dashboard.physicalVariancePoints >= 0 ? '+' : ''}${data.dashboard.physicalVariancePoints.toFixed(1)} pts` : '—',
      },
      {
        label: 'Overall Financial Progress (%)',
        plannedFormatted: data.dashboard.timeElapsedPercent !== null ? `${data.dashboard.timeElapsedPercent.toFixed(1)}% (time-linear est.)` : 'Not set',
        actualFormatted: pct(data.dashboard.financialActualPercent),
        varianceFormatted: data.dashboard.timeElapsedPercent !== null ? `${(data.dashboard.financialActualPercent - data.dashboard.timeElapsedPercent) >= 0 ? '+' : ''}${(data.dashboard.financialActualPercent - data.dashboard.timeElapsedPercent).toFixed(1)} pts` : '—',
      },
      {
        label: 'Time Elapsed (%)',
        plannedFormatted: '—',
        actualFormatted: data.dashboard.timeElapsedPercent !== null ? pct(data.dashboard.timeElapsedPercent) : 'Not set',
        varianceFormatted: '—',
      },
    ],
    scheduleStatusLabel: data.dashboard.scheduleStatusLabel,

    healthFlags: [
      { area: 'Time / Schedule', status: data.healthFlags.scheduleRag, remark: data.dashboard.physicalVariancePoints !== null ? `${data.dashboard.physicalVariancePoints.toFixed(1)} pts vs time-linear plan` : 'Baseline not set' },
      { area: 'Cost / Finance', status: data.healthFlags.costRag, remark: `${pct(data.financial.totals.totalVariancePercent)} unbilled of planned value` },
      { area: 'Quality', status: data.healthFlags.qualityRag, remark: `${data.checklists.allTimeNotOkCount} Not O.K. check point(s) all-time` },
    ],

    keyRisks: [
      ...data.keyRisks.overdueActivities.map((a) => ({
        description: `Activity overdue: ${a.title}`,
        severity: a.severity.charAt(0) + a.severity.slice(1).toLowerCase(),
        detail: `${a.daysOverdue} day(s) overdue (due ${formatDate(a.dueDate)})`,
      })),
      ...data.keyRisks.overdueBills.map((b) => ({
        description: `RA-${b.billNumber} (${b.orderName}) stuck in ${b.stage}`,
        severity: b.daysInStage > 30 ? 'Major' : 'Minor',
        detail: `${b.daysInStage} day(s) in stage · ${formatCurrencyForPdf(b.amount)}`,
      })),
    ],

    materials: data.materials.map((m) => ({
      materialName: m.materialName,
      unit: m.unit,
      receivedThisPeriod: qtyFormatter.format(m.receivedThisPeriod),
      cumulativeReceived: qtyFormatter.format(m.cumulativeReceived),
      consumedTillDate: qtyFormatter.format(m.consumedTillDate),
      balanceAtSite: qtyFormatter.format(m.balanceAtSite),
    })),

    nonConformances: data.nonConformances.map((n) => ({
      docRefNo: n.docRefNo,
      checklistTitle: n.checklistTitle,
      description: n.description,
      remarks: n.remarks ?? '',
    })),

    financial: {
      totals: {
        totalPlannedValueFormatted: formatCurrencyForPdf(data.financial.totals.totalPlannedValue),
        totalSubmittedValueFormatted: formatCurrencyForPdf(data.financial.totals.totalSubmittedValue),
        totalApprovedValueFormatted: formatCurrencyForPdf(data.financial.totals.totalApprovedValue),
        totalReleasedValueFormatted: formatCurrencyForPdf(data.financial.totals.totalReleasedValue),
        totalVariancePercentFormatted: pct(data.financial.totals.totalVariancePercent),
      },
      byOrder: data.financial.byOrder.map((o) => ({
        orderName: o.orderName,
        plannedValueFormatted: formatCurrencyForPdf(o.boqPlannedValue),
        submittedValueFormatted: formatCurrencyForPdf(o.submittedValue),
        approvedValueFormatted: formatCurrencyForPdf(o.approvedValue),
        releasedValueFormatted: formatCurrencyForPdf(o.releasedValue),
        variancePercentFormatted: pct(o.variancePercent),
      })),
      progressChart: data.financial.byOrder.map((o) => ({
        label: o.orderName,
        value: o.releasedValue,
        maxValue: Math.max(o.boqPlannedValue, 1),
        valueLabel: pct(o.boqPlannedValue > 0 ? (o.releasedValue / o.boqPlannedValue) * 100 : 0),
        color: GOLD,
      })),
    },

    execution: {
      totalActivities: data.execution.overview.totalMilestones,
      doneCount: data.execution.overview.doneCount,
      inProgressCount: data.execution.overview.inProgressCount,
      submittedCount: data.execution.overview.submittedCount,
      draftCount: data.execution.overview.draftCount,
      verifiedPercentFormatted: pct(data.execution.overview.verifiedPercent),
      updatesThisPeriodCount: data.activities.updatesThisPeriodCount,
      completedThisPeriodCount: data.activities.completedThisPeriodCount,
      progressUpdates: data.activities.progressUpdates.map((u) => ({
        dateFormatted: formatDate(u.date),
        activityTitle: u.activityTitle,
        percentComplete: `${u.percentComplete}%`,
        authorName: u.authorName,
        remarks: u.remarks ?? '',
      })),
      stateChart: [
        { label: 'Done', value: data.execution.overview.doneCount, maxValue: Math.max(data.execution.overview.totalMilestones, 1), valueLabel: String(data.execution.overview.doneCount), color: GREEN },
        { label: 'In Progress', value: data.execution.overview.inProgressCount, maxValue: Math.max(data.execution.overview.totalMilestones, 1), valueLabel: String(data.execution.overview.inProgressCount), color: GOLD },
        { label: 'Submitted', value: data.execution.overview.submittedCount, maxValue: Math.max(data.execution.overview.totalMilestones, 1), valueLabel: String(data.execution.overview.submittedCount), color: BLUE },
        { label: 'Draft', value: data.execution.overview.draftCount, maxValue: Math.max(data.execution.overview.totalMilestones, 1), valueLabel: String(data.execution.overview.draftCount), color: GRAY },
      ],
      allActivities: data.execution.allActivities.map((a) => ({
        title: a.title,
        statusLabel: LIFECYCLE_LABELS[a.lifecycleStatus] ?? a.lifecycleStatus,
        percentComplete: a.percentComplete,
        plannedEndFormatted: a.plannedEnd ? formatDate(a.plannedEnd) : '—',
        vendorName: a.vendorName ?? '—',
      })),
      dueThisPeriod: data.execution.dueThisPeriod.map((a) => ({
        title: a.title,
        statusLabel: LIFECYCLE_LABELS[a.lifecycleStatus] ?? a.lifecycleStatus,
        percentComplete: a.percentComplete,
        plannedEndFormatted: a.plannedEnd ? formatDate(a.plannedEnd) : '—',
        vendorName: a.vendorName ?? '—',
      })),
      dueThisPeriodChart: (() => {
        const total = Math.max(data.execution.dueCompletedCount + data.execution.dueOngoingCount + data.execution.dueUndoneCount, 1);
        return [
          { label: 'Completed', value: data.execution.dueCompletedCount, maxValue: total, valueLabel: String(data.execution.dueCompletedCount), color: GREEN },
          { label: 'Ongoing', value: data.execution.dueOngoingCount, maxValue: total, valueLabel: String(data.execution.dueOngoingCount), color: GOLD },
          { label: 'Undone', value: data.execution.dueUndoneCount, maxValue: total, valueLabel: String(data.execution.dueUndoneCount), color: RED },
        ];
      })(),
    },

    payments: {
      billsTouchedCount: data.payments.billsTouchedCount,
      events: data.payments.events.map((e) => ({
        dateFormatted: formatDate(e.date),
        billLabel: `RA-${e.billNumber}`,
        orderName: e.orderName,
        stage: e.stage,
        amountFormatted: formatCurrencyForPdf(e.amount),
      })),
      allBills: data.payments.allBills.map((b) => ({
        billLabel: `RA-${b.billNumber}`,
        orderName: b.orderName,
        statusLabel: b.status.replace(/_/g, ' '),
        submittedValueFormatted: formatCurrencyForPdf(b.submittedValue),
        approvedValueFormatted: formatCurrencyForPdf(b.approvedValue),
        releasedValueFormatted: formatCurrencyForPdf(b.releasedValue),
        measurementSheetCount: b.measurementSheetCount,
      })),
      measurementSheets: data.payments.measurementSheets.map((s) => ({
        billLabel: `RA-${s.billNumber}`,
        orderName: s.orderName,
        fileName: s.fileName,
        uploadedByName: s.uploadedByName,
        dateFormatted: formatDate(s.uploadedAt),
        remarks: s.remarks || null,
      })),
    },

    checklists: {
      createdCount: data.checklists.createdCount,
      signedCount: data.checklists.signedCount,
      okCount: data.checklists.okCount,
      notOkCount: data.checklists.notOkCount,
      naCount: data.checklists.naCount,
      signed: data.checklists.signed.map((c) => ({
        docRefNo: c.docRefNo,
        title: c.title,
        referenceDrawingNo: c.referenceDrawingNo,
        itemCount: c.itemCount,
        signedByName: c.signedByName ?? '—',
        signedDateFormatted: c.signedAt ? formatDate(c.signedAt) : '—',
      })),
      resultChart: (() => {
        const total = Math.max(data.checklists.allTimeOkCount + data.checklists.allTimeNotOkCount + data.checklists.allTimeNaCount, 1);
        return [
          { label: 'O.K.', value: data.checklists.allTimeOkCount, maxValue: total, valueLabel: String(data.checklists.allTimeOkCount), color: GREEN },
          { label: 'Not O.K.', value: data.checklists.allTimeNotOkCount, maxValue: total, valueLabel: String(data.checklists.allTimeNotOkCount), color: RED },
          { label: 'N.A.', value: data.checklists.allTimeNaCount, maxValue: total, valueLabel: String(data.checklists.allTimeNaCount), color: GRAY },
        ];
      })(),
      allChecklists: data.checklists.allChecklists.map((c) => ({
        docRefNo: c.docRefNo,
        title: c.title,
        statusLabel: c.status.replace(/_/g, ' '),
        filledCount: c.filledCount,
        itemCount: c.itemCount,
      })),
    },

    dpr: {
      reportsFiledCount: data.dpr.reportsFiledCount,
      calendarDaysInPeriod: data.dpr.calendarDaysInPeriod,
      manpowerActualTotal: data.dpr.manpowerActualTotal,
      manpowerPlannedTotal: data.dpr.manpowerPlannedTotal,
      highlightsTotal: data.dpr.highlightsTotal,
      photosTotal: data.dpr.photosTotal,
      criticalIssueReports: data.dpr.criticalIssueReports.map((r) => ({
        reportDateFormatted: formatDate(r.reportDate),
        docRefNo: r.docRefNo,
        criticalIssues: r.criticalIssues,
      })),
      manpowerByDay: data.dpr.manpowerByDay.map((d) => ({
        dateFormatted: formatDate(d.reportDate),
        actual: d.actual,
        planned: d.planned,
      })),
      reports: data.dpr.reports.map((r) => ({
        reportDateFormatted: formatDate(r.reportDate),
        docRefNo: r.docRefNo,
        createdByName: r.createdByName,
        manpowerActual: r.manpowerActual,
        manpowerPlanned: r.manpowerPlanned,
        highlightsCount: r.highlightsCount,
        photosCount: r.photosCount,
        hasCriticalIssues: r.hasCriticalIssues,
      })),
    },

    documents: {
      uploadedCount: data.documents.uploadedCount,
      uploaded: data.documents.uploaded.map((d) => ({
        title: d.title,
        category: d.category,
        uploadedByName: d.uploadedByName,
        dateFormatted: formatDate(d.createdAt),
      })),
    },

    evidencePhotos,
    drawings: data.drawings.map((d) => ({
      serialNo: d.serialNo,
      name: d.name,
      category: d.category,
      statusLabel: d.status,
      uploadedByName: d.uploadedByName,
      dateFormatted: formatDate(d.date),
    })),

    wbs,
    gantt,
    sCurve,
    burndown,
    boq: { byOrder: boqByOrder, grandTotalFormatted: formatCurrencyForPdf(boqGrandTotal) },
    executionKpis,
    vendorScorecards,
    delayHistogram,
    escalationTrend,
    paymentCycles,
    delayCost,
    criticality,

    generatedAtFormatted: formatDateTime(new Date()),
    logoDataUri: getLogoDataUri(),
    qrDataUri,
  };

  const insights = await AIReportSummaryService.generateExecutiveInsights({
    projectId,
    periodType: period.type,
    periodStart: period.start,
    periodEnd: period.end,
    data: pdfData,
  });

  return {
    ...pdfData,
    aiExecutiveSummary: insights?.summary ?? null,
    aiRecommendations: insights?.recommendations ?? null,
    aiScheduleNote: insights?.scheduleNote ?? null,
    aiFinancialNote: insights?.financialNote ?? null,
    aiQualityNote: insights?.qualityNote ?? null,
    aiResourceNote: insights?.resourceNote ?? null,
    aiRiskNote: insights?.riskNote ?? null,
    aiOverviewNote: insights?.overviewNote ?? null,
    aiBoqNote: insights?.boqNote ?? null,
    aiExecutionNote: insights?.executionNote ?? null,
    aiCostRiskNote: insights?.costRiskNote ?? null,
  };
}
