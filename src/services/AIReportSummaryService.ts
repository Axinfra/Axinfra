import { createHash } from 'crypto';
import { prisma } from '@/lib/db';
import { generateAiJson, isAiEnabled } from '@/lib/ai/claude';
import type { ProjectReportPdfData } from '@/lib/pdf/types';

export interface AIReportInsights {
  /** 3-5 sentence narrative covering schedule, financial progress, and the biggest risk/highlight. */
  summary: string;
  /** 2-4 short, actionable next-steps/recommendations for the coming period. */
  recommendations: string;
  /** 1-2 plain-language sentences explaining what the S-curve/schedule charts show. */
  scheduleNote: string;
  /** 1-2 plain-language sentences explaining the financial/BOQ/RA-bill variance numbers. */
  financialNote: string;
  /** 1-2 plain-language sentences explaining the quality/checklist results. */
  qualityNote: string;
  /** 1-2 plain-language sentences explaining manpower/DPR coverage for the period. */
  resourceNote: string;
  /** 1-2 plain-language sentences explaining the key risks and what they mean practically. */
  riskNote: string;
  /** 2-3 lines giving plain-language context on the project particulars (status/duration/location). */
  overviewNote: string;
  /** 2-3 lines explaining the BOQ value split across orders in plain language. */
  boqNote: string;
  /** 2-3 lines explaining the S-curve/burndown/vendor-scorecard/delay-analysis findings. */
  executionNote: string;
  /** 2-3 lines explaining the delay-cost estimate and critical-path findings. */
  costRiskNote: string;
}

const INSIGHTS_SCHEMA = {
  type: 'object',
  properties: {
    summary: { type: 'string' },
    recommendations: { type: 'string' },
    scheduleNote: { type: 'string' },
    financialNote: { type: 'string' },
    qualityNote: { type: 'string' },
    resourceNote: { type: 'string' },
    riskNote: { type: 'string' },
    overviewNote: { type: 'string' },
    boqNote: { type: 'string' },
    executionNote: { type: 'string' },
    costRiskNote: { type: 'string' },
  },
  required: [
    'summary', 'recommendations', 'scheduleNote', 'financialNote', 'qualityNote',
    'resourceNote', 'riskNote', 'overviewNote', 'boqNote', 'executionNote', 'costRiskNote',
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  'You write eleven short plain-English text blocks for a construction project status report read ' +
  'by clients, PMCs, and consultants who are not necessarily engineers — avoid jargon, explain ' +
  'numbers in everyday terms. Every "Note" field is a 2-3 line summary of its section, written so ' +
  'someone can understand that section without reading the tables above it:\n' +
  '1. "summary" — 3-5 sentences covering schedule status, financial progress, and the single ' +
  'biggest risk or highlight this period.\n' +
  '2. "recommendations" — 2-4 short, concrete, actionable next steps for the coming period, one ' +
  'per line, no bullets/numbering prefix.\n' +
  '3. "overviewNote" — 2-3 lines on the project particulars: status, how far into its overall ' +
  'duration it is, and any notable stakeholder gaps.\n' +
  '4. "scheduleNote" — 2-3 lines explaining, in simple terms, what the progress trend (S-curve) ' +
  'and activity timeline mean for someone glancing at the charts: are we ahead, on track, or behind, ' +
  'and by roughly how much.\n' +
  '5. "financialNote" — 2-3 lines explaining the billing/payment variance numbers in plain ' +
  'language: how much of the contract value has actually been paid out vs planned, and whether that gap is normal or a concern.\n' +
  '6. "boqNote" — 2-3 lines on how the BOQ value is split across purchase orders — which order(s) ' +
  'carry the most value, and anything unusual about the split.\n' +
  '7. "qualityNote" — 2-3 lines explaining the checklist/inspection results in plain language ' +
  '(is quality on track or are there recurring problems), ending with one concrete corrective step ' +
  '(e.g. what to inspect next, or who should walk the site) if there are Not-O.K. results to address.\n' +
  '8. "resourceNote" — 2-3 lines explaining manpower deployment and daily-report coverage: was ' +
  'the site adequately staffed and were reports filed consistently this period.\n' +
  '9. "riskNote" — 2-3 lines on the key risks listed: what they practically mean for the ' +
  'project and how urgent they are.\n' +
  '10. "executionNote" — 2-3 lines covering the S-curve/burndown trend (ahead/behind and by how ' +
  'much), which vendor(s) are performing best/worst on the scorecard, and what the delay ' +
  'distribution says about how often work finishes late.\n' +
  '11. "costRiskNote" — 2-3 lines on the estimated cost of delay (only if configured — say so ' +
  'plainly if it is not) and which activities on the critical path most threaten the finish date.\n' +
  'Be direct and factual — no headings, no restating the input verbatim, no filler like "this report ' +
  'covers" or "in conclusion". Only reference numbers and facts you were given; never invent data. ' +
  'If a section has too little data to say anything meaningful, say so briefly instead of guessing.';

/** Compact, token-minimal projection of the already-built report data — never raw DB rows.
 * Deliberately excludes anything large or unbounded (photo arrays, full activity/bill rosters).
 * This exact object (stringified) is what gets hashed to decide whether Claude needs to run again. */
function buildCondensedContext(data: Pick<
  ProjectReportPdfData,
  | 'projectName' | 'periodTypeLabel' | 'periodLabel' | 'scheduleStatusLabel' | 'keyStats' | 'dashboard' | 'healthFlags' | 'keyRisks'
  | 'financial' | 'checklists' | 'dpr' | 'sCurve' | 'burndown' | 'gantt' | 'overview' | 'stakeholders' | 'boq'
  | 'executionKpis' | 'vendorScorecards' | 'delayHistogram' | 'escalationTrend' | 'paymentCycles' | 'delayCost' | 'criticality'
>) {
  return {
    project: data.projectName,
    period: `${data.periodTypeLabel} — ${data.periodLabel}`,
    scheduleStatus: data.scheduleStatusLabel,
    overview: data.overview,
    stakeholders: data.stakeholders,
    dashboard: data.dashboard,
    healthFlags: data.healthFlags,
    topRisks: data.keyRisks.slice(0, 5),
    financialTotals: data.financial.totals,
    financialByOrder: data.financial.byOrder.slice(0, 10),
    boqByOrder: data.boq.byOrder.map((o) => ({ orderName: o.orderName, itemCount: o.items.length, subtotalFormatted: o.subtotalFormatted })),
    boqGrandTotalFormatted: data.boq.grandTotalFormatted,
    checklists: {
      signedCount: data.checklists.signedCount,
      notOkCount: data.checklists.notOkCount,
      allTimeNotOkCount: data.checklists.allChecklists.length,
    },
    dpr: {
      reportsFiledCount: data.dpr.reportsFiledCount,
      calendarDaysInPeriod: data.dpr.calendarDaysInPeriod,
      criticalIssueCount: data.dpr.criticalIssueReports.length,
      manpowerActualTotal: data.dpr.manpowerActualTotal,
      manpowerPlannedTotal: data.dpr.manpowerPlannedTotal,
    },
    sCurveLatest: data.sCurve.at(-1) ?? null,
    burndownLatest: data.burndown.at(-1) ?? null,
    ganttSummary: data.gantt.slice(0, 10).map((g) => ({ name: g.title, statusLabel: g.lifecycleStatus })),
    executionKpis: data.executionKpis,
    vendorScorecards: data.vendorScorecards.slice(0, 10),
    delayHistogram: data.delayHistogram,
    escalationTrendLatest4Weeks: data.escalationTrend.slice(-4),
    paymentCycles: data.paymentCycles,
    delayCost: data.delayCost,
    topCriticalPath: data.criticality.filter((c) => c.isCritical).slice(0, 10),
  };
}

function hashContext(context: unknown): string {
  return createHash('sha256').update(JSON.stringify(context)).digest('hex');
}

function toInsights(row: {
  summary: string;
  recommendations: string;
  scheduleNote: string;
  financialNote: string;
  qualityNote: string;
  resourceNote: string;
  riskNote: string;
  overviewNote: string;
  boqNote: string;
  executionNote: string;
  costRiskNote: string;
}): AIReportInsights {
  return {
    summary: row.summary,
    recommendations: row.recommendations,
    scheduleNote: row.scheduleNote,
    financialNote: row.financialNote,
    qualityNote: row.qualityNote,
    resourceNote: row.resourceNote,
    riskNote: row.riskNote,
    overviewNote: row.overviewNote,
    boqNote: row.boqNote,
    executionNote: row.executionNote,
    costRiskNote: row.costRiskNote,
  };
}

export const AIReportSummaryService = {
  /** Returns AI-written executive summary + recommendations + per-section plain-language notes
   * for the report PDF, or `null` when AI isn't configured and no prior insight exists for this
   * report. Persisted in the ReportInsight table keyed by project+period+a hash of the condensed
   * input: if the hash matches what's stored, the DB row is reused directly and Claude is never
   * called — only a real change in the underlying numbers (new bills, progress, checklist
   * results, etc.) triggers a fresh (paid) generation. On a transient API failure, falls back to
   * the last successfully generated insight for this period rather than showing nothing. */
  async generateExecutiveInsights(params: {
    projectId: string;
    periodType: 'WEEK' | 'MONTH';
    periodStart: Date;
    periodEnd: Date;
    data: Parameters<typeof buildCondensedContext>[0];
  }): Promise<AIReportInsights | null> {
    const context = buildCondensedContext(params.data);
    const dataHash = hashContext(context);

    const where = {
      projectId_periodType_periodStart_periodEnd: {
        projectId: params.projectId,
        periodType: params.periodType,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
      },
    };

    const existing = await prisma.reportInsight.findUnique({ where });
    if (existing && existing.dataHash === dataHash) {
      return toInsights(existing);
    }

    if (!isAiEnabled()) {
      return existing ? toInsights(existing) : null;
    }

    const insights = await generateAiJson<AIReportInsights>({
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(context),
      schema: INSIGHTS_SCHEMA,
      // 11 fields, each up to ~2-3 lines — keep generous headroom to avoid a repeat of the
      // max_tokens truncation bug found while testing the work order draft.
      maxTokens: 2400,
    });

    if (!insights) {
      // Transient failure — serve the last good version for this period (now stale-by-data,
      // but still more useful than an empty report) rather than nothing.
      return existing ? toInsights(existing) : null;
    }

    await prisma.reportInsight.upsert({
      where,
      create: {
        projectId: params.projectId,
        periodType: params.periodType,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        dataHash,
        ...insights,
      },
      update: { dataHash, ...insights },
    });

    return insights;
  },
};
