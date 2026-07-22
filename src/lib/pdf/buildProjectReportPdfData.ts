import QRCode from 'qrcode';
import { ReportService } from '@/services/ReportService';
import { fileStorage } from '@/lib/file-storage';
import type { ReportPeriod } from '@/lib/reportPeriod';
import { formatDate, formatDateTime } from '@/lib/utils';
import { getLogoDataUri } from './logo';
import { formatCurrencyForPdf, qtyFormatter } from './format';
import { GOLD } from './theme';
import type { ProjectReportPdfData, ReportEvidencePhotoGroup } from './types';

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

  return {
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

    generatedAtFormatted: formatDateTime(new Date()),
    logoDataUri: getLogoDataUri(),
    qrDataUri,
  };
}
