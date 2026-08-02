export interface WorkOrderPdfBoqItem {
  itemNo: number;
  description: string;
  unit: string;
  quantity: string;
  rate: string;
  amount: string;
}

export interface SignatoryInfo {
  name: string;
  designation: string;
}

export interface TermsAndConditions {
  payment: string;
  quality: string;
  safety: string;
  delayPenalty: string;
  warranty: string;
  other: string;
}

export interface Signatories {
  preparedBy: SignatoryInfo;
  vendor: SignatoryInfo;
  consultant: SignatoryInfo;
  pmc: SignatoryInfo;
  client: SignatoryInfo;
}

/** Narrative/terms/signatory fields the "Generate Work Order PDF" form collects — persisted
 * verbatim as WorkOrderRevision.pdfDetailsJson so regenerating reproduces the same document. */
export interface WorkOrderPdfDetails {
  workDescription: string;
  scopeOfWork: string;
  completionTimeline: string;
  paymentTerms: string;
  deliveryTerms: string;
  generalNotes: string;
  specialInstructions: string;
  taxPercent: number | null;
  termsAndConditions: TermsAndConditions;
  signatories: Signatories;
}

export function emptyPdfDetails(): WorkOrderPdfDetails {
  return {
    workDescription: '',
    scopeOfWork: '',
    completionTimeline: '',
    paymentTerms: '',
    deliveryTerms: '',
    generalNotes: '',
    specialInstructions: '',
    taxPercent: null,
    termsAndConditions: { payment: '', quality: '', safety: '', delayPenalty: '', warranty: '', other: '' },
    signatories: {
      preparedBy: { name: '', designation: '' },
      vendor: { name: '', designation: '' },
      consultant: { name: '', designation: '' },
      pmc: { name: '', designation: '' },
      client: { name: '', designation: '' },
    },
  };
}

/** Fully-resolved, display-ready data for the PDF template — every field is a formatted
 * string so WorkOrderDocument.tsx never needs to know about dates/currency/nullability. */
export interface WorkOrderPdfData {
  woNumber: string;
  revisionNumber: number;
  issueDateFormatted: string;
  projectName: string;
  clientName: string;
  consultantName: string;
  pmcName: string;

  vendor: {
    name: string;
    companyName: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    gstNumber: string;
  };

  workDescription: string;
  scopeOfWork: string;
  startDateFormatted: string;
  endDateFormatted: string;
  completionTimeline: string;
  paymentTerms: string;
  deliveryTerms: string;
  generalNotes: string;
  specialInstructions: string;

  boqItems: WorkOrderPdfBoqItem[];
  subtotalFormatted: string;
  taxLabel: string | null;
  taxAmountFormatted: string | null;
  grandTotalFormatted: string;

  termsAndConditions: TermsAndConditions;
  signatories: Signatories;

  generatedAtFormatted: string;
  logoDataUri: string;
  qrDataUri: string;
}

export interface ChecklistPdfItem {
  no: number;
  description: string;
  result: 'OK' | 'NOT_OK' | 'NA' | null;
  remarks: string;
}

/** Fully-resolved, display-ready data for the Checklist PDF template. Project/Client/Location
 * are resolved from Project + ProjectRole at build time (not stored on Checklist itself). */
export interface ChecklistPdfData {
  docRefNo: string;
  title: string;
  projectName: string;
  clientName: string;
  location: string;
  referenceDrawingNo: string;
  statusLabel: string;
  items: ChecklistPdfItem[];
  certificationRemarks: string;
  preparedBy: SignatoryInfo;
  signedBy: SignatoryInfo;
  signedDateFormatted: string;
  generatedAtFormatted: string;
  logoDataUri: string;
  qrDataUri: string;
}

export interface DPRPdfProcurementRow {
  no: number;
  materialName: string;
  description: string;
  unit: string;
  alreadyReceived: string;
  receivedThisWeek: string;
  cumulativeReceivedTillDate: string;
  consumedTillDate: string;
  balanceAtSite: string;
  additionalRequirement: string;
}

export interface DPRPdfManpowerTradeRow {
  tradeName: string;
  unit: string;
  actualCount: number;
  plannedCount: number;
}

export interface DPRPdfManpowerGroup {
  vendorName: string;
  rows: DPRPdfManpowerTradeRow[];
}

export interface DPRPdfHighlight {
  no: string;
  description: string;
}

export interface DPRPdfPhoto {
  dataUri: string;
  remarks: string;
}

/** Fully-resolved, display-ready data for the Daily Progress Report PDF. Total/Elapsed/Balance
 * days are computed (not stored) from Project.metadata.startDate/endDate. */
export interface DPRPdfData {
  docRefNo: string;
  reportDateFormatted: string;
  periodFormatted: string;
  projectName: string;
  clientName: string;
  statusLabel: string;
  totalDurationDays: number | null;
  elapsedDays: number | null;
  balanceDays: number | null;
  procurementRows: DPRPdfProcurementRow[];
  manpowerGroups: DPRPdfManpowerGroup[];
  highlights: DPRPdfHighlight[];
  criticalIssues: string;
  photos: DPRPdfPhoto[];
  signedBy: SignatoryInfo;
  signedDateFormatted: string;
  generatedAtFormatted: string;
  logoDataUri: string;
  qrDataUri: string;
}

export interface RABillPdfLineItem {
  itemNo: number;
  description: string;
  unit: string;
  executedQty: string;
  previousBilledQty: string;
  currentBilledQty: string;
  balanceQty: string;
  rate: string;
  amount: string;
}

/** Fully-resolved, display-ready data for the RA Bill PDF template. Unlike the Work Order PDF,
 * this has no separate "details form" — everything comes straight off the RABill record and
 * its already-captured approval trail (createdBy/certifiedBy/approvedBy/releasedBy), since RA
 * Bills don't have a narrative/T&C concept the way Work Orders do. */
export interface RABillPdfData {
  billNumber: string;
  workOrderNumber: string | null;
  purchaseOrderNumber: string;
  statusLabel: string;
  projectName: string;
  clientName: string;
  consultantName: string;
  pmcName: string;

  vendor: {
    name: string;
    companyName: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    gstNumber: string;
  };

  periodFormatted: string;

  lineItems: RABillPdfLineItem[];
  totalAmountFormatted: string;
  deductionsFormatted: string | null;
  netPayableFormatted: string;

  remarks: string;

  signatories: Signatories;

  generatedAtFormatted: string;
  logoDataUri: string;
  qrDataUri: string;
}

/** A Direct Order has no line items or multi-stage approval trail the way an RA Bill does —
 * one item, one ordered value, and (once generated) one billed value — so this is deliberately
 * a single-panel document rather than a line-item table. */
export interface DirectOrderBillPdfData {
  doNumber: string;
  statusLabel: string;
  projectName: string;
  clientName: string;
  pmcName: string;

  vendor: {
    name: string;
    companyName: string;
    contactPerson: string;
    email: string;
    phone: string;
    address: string;
    gstNumber: string;
  };

  itemDescription: string;
  orderedValueFormatted: string;
  billedValueFormatted: string | null;
  varianceFormatted: string | null;
  remarks: string;

  orderedAtFormatted: string;
  billGeneratedAtFormatted: string | null;

  signatories: { preparedBy: SignatoryInfo; vendor: SignatoryInfo; pmc: SignatoryInfo };

  generatedAtFormatted: string;
  logoDataUri: string;
  qrDataUri: string;
}

export interface ReportKeyStat {
  label: string;
  value: string;
}

export interface ReportOrderRow {
  orderName: string;
  plannedValueFormatted: string;
  submittedValueFormatted: string;
  approvedValueFormatted: string;
  releasedValueFormatted: string;
  variancePercentFormatted: string;
}

export interface ReportActivityUpdateRow {
  dateFormatted: string;
  activityTitle: string;
  percentComplete: string;
  authorName: string;
  remarks: string;
}

export interface ReportBillEventRow {
  dateFormatted: string;
  billLabel: string;
  orderName: string;
  stage: string;
  amountFormatted: string;
}

export interface ReportChecklistRow {
  docRefNo: string;
  title: string;
  referenceDrawingNo: string;
  itemCount: number;
  signedByName: string;
  signedDateFormatted: string;
}

export interface ReportDprRow {
  reportDateFormatted: string;
  docRefNo: string;
  createdByName: string;
  manpowerActual: number;
  manpowerPlanned: number;
  highlightsCount: number;
  photosCount: number;
  hasCriticalIssues: boolean;
}

export interface ReportDocumentRow {
  title: string;
  category: string;
  uploadedByName: string;
  dateFormatted: string;
}

export interface ReportActivityRosterRow {
  title: string;
  statusLabel: string;
  percentComplete: number;
  plannedEndFormatted: string;
  vendorName: string;
}

export interface ReportRABillRosterRow {
  billLabel: string;
  orderName: string;
  statusLabel: string;
  submittedValueFormatted: string;
  approvedValueFormatted: string;
  releasedValueFormatted: string;
  measurementSheetCount: number;
}

export interface ReportMeasurementSheetRow {
  billLabel: string;
  orderName: string;
  fileName: string;
  uploadedByName: string;
  dateFormatted: string;
  remarks: string | null;
}

export interface ReportChecklistRosterRow {
  docRefNo: string;
  title: string;
  statusLabel: string;
  filledCount: number;
  itemCount: number;
}

export interface ReportBarDatum {
  label: string;
  value: number;
  maxValue: number;
  valueLabel: string;
  color: string;
}

export interface ReportEvidencePhoto {
  dataUri: string;
  fileName: string;
}

export interface ReportEvidencePhotoGroup {
  activityTitle: string;
  submittedByName: string;
  dateFormatted: string;
  remarks: string;
  authorRoleLabel: string;
  photos: ReportEvidencePhoto[];
}

export interface ReportDrawingRow {
  serialNo: number;
  name: string;
  category: string;
  statusLabel: string;
  uploadedByName: string;
  dateFormatted: string;
}

export interface ReportManpowerDayRow {
  dateFormatted: string;
  actual: number;
  planned: number;
}

export type RagStatus = 'GREEN' | 'AMBER' | 'RED';

export interface ReportDashboardRow {
  label: string;
  plannedFormatted: string;
  actualFormatted: string;
  varianceFormatted: string;
}

export interface ReportHealthFlagRow {
  area: string;
  status: RagStatus;
  remark: string;
}

export interface ReportStakeholderRow {
  role: string;
  name: string;
}

export interface ReportMaterialRow {
  materialName: string;
  unit: string;
  receivedThisPeriod: string;
  cumulativeReceived: string;
  consumedTillDate: string;
  balanceAtSite: string;
}

export interface ReportNonConformanceRow {
  docRefNo: string;
  checklistTitle: string;
  description: string;
  remarks: string;
}

export interface ReportRiskRow {
  description: string;
  severity: string;
  detail: string;
}

/** One historical snapshot point for the S-curve chart — built up over time from the
 * ProjectMetrics table, one row per period a report was ever generated for this project. */
export interface ReportSCurvePoint {
  periodLabel: string;
  plannedPercent: number;
  actualPercent: number;
}

/** One bar in the schedule/Gantt timeline chart. Offsets are pre-computed (0-100, relative to
 * the overall date range of the plotted activities) so the PDF template only draws bars. */
export interface ReportGanttRow {
  kind: 'PHASE' | 'MILESTONE';
  indent: number;
  title: string;
  lifecycleStatus: string;
  startOffsetPercent: number;
  durationPercent: number;
  plannedStartFormatted: string;
  plannedEndFormatted: string;
}

/** One row in the Work Breakdown Structure / Schedule table (Annexure I). */
export interface ReportWbsRow {
  wbsCode: string;
  kind: 'PHASE' | 'MILESTONE';
  indent: number;
  title: string;
  lifecycleStatus: string;
  percentComplete: number;
  plannedStartFormatted: string;
  plannedEndFormatted: string;
  vendorName: string;
}

export interface ReportBoqItemRow {
  itemNo: number;
  description: string;
  unit: string;
  plannedQtyFormatted: string;
  rateFormatted: string;
  plannedValueFormatted: string;
}

/** One Purchase Order's BOQ line items, for Annexure IV. */
export interface ReportBoqOrderGroup {
  orderName: string;
  items: ReportBoqItemRow[];
  subtotalFormatted: string;
}

/** Project-wide schedule KPIs from the Execution Intelligence engine (scheduleMetrics.ts). */
export interface ReportExecutionKpis {
  netScheduleDaysFormatted: string;
  totalSavedDaysFormatted: string;
  totalOverrunDaysFormatted: string;
  onTimePctFormatted: string;
  avgApprovalCycleDaysFormatted: string;
  criticalMilestoneCount: number;
  escalationsLast30Days: number;
  completedMilestones: number;
  totalMilestones: number;
}

export interface ReportVendorScorecardRow {
  vendorName: string;
  totalMilestones: number;
  completedOnTime: number;
  completedLate: number;
  inProgress: number;
  onTimePctFormatted: string;
  avgDelayDaysFormatted: string;
  avgApprovalCycleDaysFormatted: string;
  escalationCount: number;
  rank: number;
}

export interface ReportDelayBucket {
  bucket: string;
  count: number;
}

export interface ReportEscalationWeek {
  weekLabel: string;
  count: number;
}

export interface ReportCriticalityRow {
  title: string;
  isCritical: boolean;
  totalFloatDaysFormatted: string;
  durationDaysFormatted: string;
}

export interface ReportPaymentCycles {
  avgDaysFormatted: string;
  byVendor: Array<{ vendorName: string; avgDaysFormatted: string }>;
}

export interface ReportDelayCost {
  isConfigured: boolean;
  totalOverrunDays: number;
  overheadCostFormatted: string;
  penaltyCostFormatted: string;
  opportunityCostFormatted: string;
  totalEstimatedCostFormatted: string;
}

/** Fully-resolved, display-ready data for the weekly/monthly Project Report PDF. Every number
 * is pre-formatted the same way every other PDF in this app does it, so ProjectReportDocument
 * never needs to know about currency/date formatting rules. */
export interface ProjectReportPdfData {
  projectName: string;
  clientName: string;
  pmcName: string;
  consultantName: string;
  periodTypeLabel: string; // "Weekly" | "Monthly"
  periodLabel: string; // formatted date range

  keyStats: ReportKeyStat[];

  /** AI-generated (Claude) narrative summary paragraph — null when AI isn't configured or the call failed. */
  aiExecutiveSummary: string | null;
  /** AI-generated (Claude) recommendations/next-steps text — null when AI isn't configured or the call failed. */
  aiRecommendations: string | null;
  /** AI-generated (Claude) plain-language explanation of the S-curve/Gantt charts. */
  aiScheduleNote: string | null;
  /** AI-generated (Claude) plain-language explanation of the financial/variance numbers. */
  aiFinancialNote: string | null;
  /** AI-generated (Claude) plain-language explanation of the quality/checklist results. */
  aiQualityNote: string | null;
  /** AI-generated (Claude) plain-language explanation of manpower/DPR coverage. */
  aiResourceNote: string | null;
  /** AI-generated (Claude) plain-language explanation of the key risks. */
  aiRiskNote: string | null;
  /** AI-generated (Claude) 2-3 line plain-language overview of the project particulars section. */
  aiOverviewNote: string | null;
  /** AI-generated (Claude) 2-3 line plain-language explanation of the BOQ line items/value split. */
  aiBoqNote: string | null;
  /** AI-generated (Claude) 2-3 line plain-language explanation of the S-curve/burndown/vendor/delay analysis. */
  aiExecutionNote: string | null;
  /** AI-generated (Claude) 2-3 line plain-language explanation of the delay cost/criticality findings. */
  aiCostRiskNote: string | null;

  sCurve: ReportSCurvePoint[];
  burndown: ReportSCurvePoint[];
  gantt: ReportGanttRow[];
  wbs: ReportWbsRow[];
  boq: {
    byOrder: ReportBoqOrderGroup[];
    grandTotalFormatted: string;
  };
  executionKpis: ReportExecutionKpis;
  vendorScorecards: ReportVendorScorecardRow[];
  delayHistogram: ReportDelayBucket[];
  escalationTrend: ReportEscalationWeek[];
  paymentCycles: ReportPaymentCycles;
  delayCost: ReportDelayCost;
  criticality: ReportCriticalityRow[];

  overview: {
    description: string;
    status: string;
    location: string;
    totalDurationDays: number | null;
    elapsedDays: number | null;
    balanceDays: number | null;
  };

  stakeholders: ReportStakeholderRow[];
  dashboard: ReportDashboardRow[];
  scheduleStatusLabel: string;
  healthFlags: ReportHealthFlagRow[];
  keyRisks: ReportRiskRow[];
  materials: ReportMaterialRow[];
  nonConformances: ReportNonConformanceRow[];

  financial: {
    totals: {
      totalPlannedValueFormatted: string;
      totalSubmittedValueFormatted: string;
      totalApprovedValueFormatted: string;
      totalReleasedValueFormatted: string;
      totalVariancePercentFormatted: string;
    };
    byOrder: ReportOrderRow[];
    progressChart: ReportBarDatum[];
  };

  execution: {
    totalActivities: number;
    doneCount: number;
    inProgressCount: number;
    submittedCount: number;
    draftCount: number;
    verifiedPercentFormatted: string;
    updatesThisPeriodCount: number;
    completedThisPeriodCount: number;
    progressUpdates: ReportActivityUpdateRow[];
    stateChart: ReportBarDatum[];
    allActivities: ReportActivityRosterRow[];
    dueThisPeriod: ReportActivityRosterRow[];
    dueThisPeriodChart: ReportBarDatum[];
  };

  payments: {
    billsTouchedCount: number;
    events: ReportBillEventRow[];
    allBills: ReportRABillRosterRow[];
    measurementSheets: ReportMeasurementSheetRow[];
  };

  evidencePhotos: ReportEvidencePhotoGroup[];
  drawings: ReportDrawingRow[];

  checklists: {
    createdCount: number;
    signedCount: number;
    okCount: number;
    notOkCount: number;
    naCount: number;
    signed: ReportChecklistRow[];
    resultChart: ReportBarDatum[];
    allChecklists: ReportChecklistRosterRow[];
  };

  dpr: {
    reportsFiledCount: number;
    calendarDaysInPeriod: number;
    manpowerActualTotal: number;
    manpowerPlannedTotal: number;
    highlightsTotal: number;
    photosTotal: number;
    criticalIssueReports: Array<{ reportDateFormatted: string; docRefNo: string; criticalIssues: string }>;
    reports: ReportDprRow[];
    manpowerByDay: ReportManpowerDayRow[];
  };

  documents: {
    uploadedCount: number;
    uploaded: ReportDocumentRow[];
  };

  generatedAtFormatted: string;
  logoDataUri: string;
  qrDataUri: string;
}
