import { prisma } from '@/lib/db';
import { generateAiText } from '@/lib/ai/claude';
import { RABillService } from './RABillService';
import type { Role } from '@/types';

/**
 * ViseronQueryEngine - Natural language query engine for project intelligence.
 *
 * Pattern-matches user queries against known question types, computes
 * deterministic answers from real project data, then (when ANTHROPIC_API_KEY
 * is configured) asks Claude to rewrite the answer as a natural chat reply
 * grounded strictly in those computed facts — never inventing numbers/names.
 * Unrecognized queries fall through to `handleAiFallback`, which grounds
 * Claude in a full project snapshot (`getProjectFullContext`) spanning
 * milestones/schedule (gantt), RA Bills & payments, BOQ, Work Orders, DPR,
 * Checklists, Documents, and Drawings — so the chatbot can answer *any*
 * question about the project, not just the four hard-coded patterns above.
 *
 * AI is an enhancement, not a dependency: if no API key is set or a Claude
 * call fails, callers fall back to the original deterministic summary text.
 *
 * READ-ONLY: every code path here only ever reads (prisma `findMany`/
 * `findUnique`/`count`) — nothing in this file, or in the Claude prompts it
 * builds, ever writes to the database or claims it can. Financial data (RA
 * Bills, BOQ, Work Orders) is scoped to the caller's own orders when the
 * caller is a VENDOR, and Checklists/DPR are omitted for VENDOR entirely —
 * mirroring the same role checks each of those already applies on their own
 * list endpoints, so this chatbot never shows a vendor more than the app
 * already would.
 *
 * Schema notes:
 * - Milestone.vendorUserId -> vendorUser (User relation) for vendor name
 * - Milestone.evidence (not "evidences"), Evidence.status (not "approvalStatus")
 * - "Actual end" date: actualVerification ?? actualSubmission ?? actualEnd (see getActualEnd) —
 *   the first two are payment-workflow-only and stay null for schedule-imported milestones
 * - AuditLog.actionType (not "action")
 */

export interface ViseronAuthContext {
  role: Role;
  userId: string;
}

export interface ViseronAnswer {
  type: 'vendor_delay' | 'risky_milestones' | 'vendor_reliability' | 'project_health' | 'fallback';
  query: string;
  summary: string;
  details: Record<string, unknown>[];
  confidence: number; // 0-1
  timestamp: string;
}

interface QueryPattern {
  type: ViseronAnswer['type'];
  patterns: RegExp[];
  extract: (match: RegExpMatchArray, query: string) => { vendorName?: string };
}

const QUERY_PATTERNS: QueryPattern[] = [
  {
    type: 'vendor_delay',
    patterns: [
      /why\s+is\s+(?:vendor\s+)?(.+?)\s+delayed/i,
      /what(?:'s|\s+is)\s+delaying\s+(?:vendor\s+)?(.+)/i,
      /(.+?)\s+delay(?:s|ed)?/i,
      /delay.*(?:vendor|for)\s+(.+)/i,
    ],
    extract: (match) => ({ vendorName: match[1]?.trim() }),
  },
  {
    type: 'risky_milestones',
    patterns: [
      /which\s+milestones?\s+(?:are|is)\s+(?:at\s+)?risk/i,
      /risky\s+milestones?/i,
      /milestones?\s+at\s+risk/i,
      /what\s+(?:are|is)\s+(?:the\s+)?risk(?:y|iest)\s+milestones?/i,
      /overdue\s+milestones?/i,
    ],
    extract: () => ({}),
  },
  {
    type: 'vendor_reliability',
    patterns: [
      /(?:which|what)\s+vendor\s+has?\s+(?:the\s+)?lowest\s+reliability/i,
      /least\s+reliable\s+vendor/i,
      /worst\s+(?:performing\s+)?vendor/i,
      /vendor\s+reliability/i,
      /unreliable\s+vendor/i,
    ],
    extract: () => ({}),
  },
  {
    type: 'project_health',
    patterns: [
      /(?:what|how)\s+is\s+(?:the\s+)?project\s+health/i,
      /project\s+(?:health|status|overview)/i,
      /how\s+(?:is|are)\s+(?:the\s+)?project(?:s)?\s+doing/i,
      /overall\s+(?:project\s+)?health/i,
      /health\s+(?:score|check|report)/i,
    ],
    extract: () => ({}),
  },
];

function classifyQuery(query: string): { type: ViseronAnswer['type']; params: Record<string, string> } {
  for (const pattern of QUERY_PATTERNS) {
    for (const regex of pattern.patterns) {
      const match = query.match(regex);
      if (match) {
        const extracted = pattern.extract(match, query);
        return { type: pattern.type, params: extracted as Record<string, string> };
      }
    }
  }
  return { type: 'fallback', params: {} };
}

/** The project's actual configured currency (Project.metadata.currency, set at project
 * creation) — defaults to INR for projects created before that field existed. Every money
 * figure Viseron reports, deterministic or AI-generated, must be labeled with this rather
 * than a hardcoded currency, or it'll silently mislabel non-INR projects. */
async function getProjectCurrency(projectId: string): Promise<string> {
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { metadata: true } });
  if (!project?.metadata) return 'INR';
  try {
    return JSON.parse(project.metadata).currency || 'INR';
  } catch {
    return 'INR';
  }
}

// ============================================
// Shared include pattern for milestones
// ============================================
const MILESTONE_INCLUDE = {
  vendorUser: { select: { id: true, name: true } },
  evidence: {
    orderBy: { submittedAt: 'desc' as const },
    take: 3,
    include: { submittedBy: { select: { id: true, name: true } } },
  },
  paymentEligibility: true,
} as const;

/** Derive vendor name from vendorUser FK or first evidence submitter */
function getVendorName(m: {
  vendorUser?: { id: string; name: string } | null;
  evidence?: Array<{ submittedBy?: { id: string; name: string } | null }>;
}): string | null {
  return m.vendorUser?.name ?? m.evidence?.[0]?.submittedBy?.name ?? null;
}

/** Derive "actual end" date — actualVerification/actualSubmission only get set by the
 * payment-workflow state machine, which schedule-imported milestones never enter, so both stay
 * null for them; falls back to the milestone's own actualEnd column (schedule import's MSPDI
 * ActualFinish, or any direct completion write) so a completed schedule-imported milestone
 * doesn't read as having no actual end date at all — callers that then default a missing date
 * to "today" would otherwise report a milestone finished in the past as wildly overdue. */
function getActualEnd(m: { actualVerification: Date | null; actualSubmission: Date | null; actualEnd: Date | null }): Date | null {
  return m.actualVerification ?? m.actualSubmission ?? m.actualEnd ?? null;
}

// ============================================
// QUERY HANDLERS
// ============================================

async function handleVendorDelay(projectId: string, vendorName: string): Promise<ViseronAnswer> {
  // Find milestones for this project, then filter by vendor name in JS
  // (vendorUser.name is a relation — can't directly filter via contains)
  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    include: MILESTONE_INCLUDE,
    orderBy: { sortOrder: 'asc' },
  });

  const vendorLower = vendorName.toLowerCase();
  const vendorMilestones = milestones.filter((m) => {
    const vName = getVendorName(m);
    return vName && vName.toLowerCase().includes(vendorLower);
  });

  if (vendorMilestones.length === 0) {
    return {
      type: 'vendor_delay',
      query: `Why is ${vendorName} delayed?`,
      summary: `No milestones found for vendor matching "${vendorName}" in this project.`,
      details: [],
      confidence: 0.3,
      timestamp: new Date().toISOString(),
    };
  }

  const now = new Date();
  const delayed = vendorMilestones.filter((m) => {
    if (m.state === 'VERIFIED' || m.state === 'CLOSED') return false;
    if (m.plannedEnd && new Date(m.plannedEnd) < now) return true;
    return false;
  });

  const reasons: string[] = [];
  const details: Record<string, unknown>[] = [];

  for (const m of delayed) {
    const daysOverdue = m.plannedEnd
      ? Math.ceil((now.getTime() - new Date(m.plannedEnd).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const hasRejections = m.evidence.some((e) => e.status === 'REJECTED');
    const hasBlocked = m.paymentEligibility?.state === 'BLOCKED';
    const isStuckInProgress = m.state === 'IN_PROGRESS' && daysOverdue > 7;
    const isStuckSubmitted = m.state === 'SUBMITTED' && daysOverdue > 3;

    const milestoneReasons: string[] = [];
    if (hasRejections) milestoneReasons.push('Evidence was rejected — rework needed');
    if (hasBlocked) milestoneReasons.push(`Payment blocked: ${m.paymentEligibility?.blockReasonCode || 'unknown'}`);
    if (isStuckInProgress) milestoneReasons.push(`Stuck in progress for ${daysOverdue} days past deadline`);
    if (isStuckSubmitted) milestoneReasons.push(`Awaiting PMC review for ${daysOverdue} days past deadline`);
    if (milestoneReasons.length === 0) milestoneReasons.push(`Overdue by ${daysOverdue} days`);

    reasons.push(...milestoneReasons);
    details.push({
      milestoneId: m.id,
      title: m.title,
      state: m.state,
      daysOverdue,
      reasons: milestoneReasons,
    });
  }

  const summary = delayed.length === 0
    ? `Vendor "${vendorName}" has ${vendorMilestones.length} milestones — none are currently delayed.`
    : `Vendor "${vendorName}" has ${delayed.length} delayed milestone(s). ${reasons.slice(0, 3).join('. ')}.`;

  return {
    type: 'vendor_delay',
    query: `Why is ${vendorName} delayed?`,
    summary,
    details,
    confidence: delayed.length > 0 ? 0.85 : 0.7,
    timestamp: new Date().toISOString(),
  };
}

async function handleRiskyMilestones(projectId: string): Promise<ViseronAnswer> {
  const now = new Date();
  const currency = await getProjectCurrency(projectId);
  const milestones = await prisma.milestone.findMany({
    where: {
      projectId,
      state: { in: ['DRAFT', 'IN_PROGRESS', 'SUBMITTED'] },
    },
    include: {
      paymentEligibility: true,
      vendorUser: { select: { id: true, name: true } },
    },
    orderBy: { plannedEnd: 'asc' },
  });

  const risky = milestones
    .map((m) => {
      const plannedEnd = m.plannedEnd ? new Date(m.plannedEnd) : null;
      const daysRemaining = plannedEnd
        ? Math.ceil((plannedEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const isOverdue = daysRemaining !== null && daysRemaining < 0;
      const isAtRisk = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7;
      const isBlocked = m.paymentEligibility?.state === 'BLOCKED';

      let riskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
      if (isOverdue) riskLevel = 'critical';
      else if (isBlocked || (isAtRisk && m.state === 'DRAFT')) riskLevel = 'high';
      else if (isAtRisk) riskLevel = 'medium';

      return {
        milestoneId: m.id,
        title: m.title,
        state: m.state,
        vendorName: m.vendorUser?.name ?? null,
        daysRemaining,
        isOverdue,
        isBlocked,
        riskLevel,
        value: m.value ? Number(m.value) : 0,
      };
    })
    .filter((m) => m.riskLevel !== 'low')
    .sort((a, b) => {
      const order = { critical: 0, high: 1, medium: 2, low: 3 };
      return order[a.riskLevel] - order[b.riskLevel];
    });

  const critical = risky.filter((r) => r.riskLevel === 'critical').length;
  const high = risky.filter((r) => r.riskLevel === 'high').length;

  const summary = risky.length === 0
    ? 'No milestones are currently at risk. All active milestones are on track.'
    : `${risky.length} milestone(s) at risk: ${critical} critical, ${high} high risk. Total value at risk: ${formatCurrency(risky.reduce((s, r) => s + r.value, 0), currency)}.`;

  return {
    type: 'risky_milestones',
    query: 'Which milestones are risky?',
    summary,
    details: risky as unknown as Record<string, unknown>[],
    confidence: 0.9,
    timestamp: new Date().toISOString(),
  };
}

async function handleVendorReliability(projectId: string): Promise<ViseronAnswer> {
  const milestones = await prisma.milestone.findMany({
    where: { projectId, vendorUserId: { not: null } },
    include: {
      vendorUser: { select: { id: true, name: true } },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const now = new Date();
  const vendorMap = new Map<string, { total: number; onTime: number; late: number; avgDelay: number; delays: number[] }>();

  for (const m of milestones) {
    const vName = m.vendorUser?.name;
    if (!vName) continue;
    if (!vendorMap.has(vName)) {
      vendorMap.set(vName, { total: 0, onTime: 0, late: 0, avgDelay: 0, delays: [] });
    }
    const v = vendorMap.get(vName)!;
    v.total++;

    const actualEnd = getActualEnd(m);

    if ((m.state === 'VERIFIED' || m.state === 'CLOSED') && m.plannedEnd) {
      const actual = actualEnd ? new Date(actualEnd) : now;
      const planned = new Date(m.plannedEnd);
      const diffDays = Math.ceil((actual.getTime() - planned.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays <= 0) v.onTime++;
      else {
        v.late++;
        v.delays.push(diffDays);
      }
    } else if (m.plannedEnd && new Date(m.plannedEnd) < now) {
      v.late++;
      v.delays.push(Math.ceil((now.getTime() - new Date(m.plannedEnd).getTime()) / (1000 * 60 * 60 * 24)));
    }
  }

  const vendors = Array.from(vendorMap.entries()).map(([name, data]) => {
    const avgDelay = data.delays.length > 0 ? data.delays.reduce((s, d) => s + d, 0) / data.delays.length : 0;
    const reliability = data.total > 0 ? Math.round((data.onTime / data.total) * 100) : 100;
    return { vendorName: name, ...data, avgDelay: Math.round(avgDelay), reliability };
  });

  vendors.sort((a, b) => a.reliability - b.reliability);

  const worst = vendors[0];
  const summary = vendors.length === 0
    ? 'No vendor data available for this project.'
    : worst
      ? `"${worst.vendorName}" has the lowest reliability at ${worst.reliability}% on-time (${worst.late} late out of ${worst.total} milestones, avg ${worst.avgDelay} days delay).`
      : 'All vendors are performing well.';

  return {
    type: 'vendor_reliability',
    query: 'Which vendor has lowest reliability?',
    summary,
    details: vendors as unknown as Record<string, unknown>[],
    confidence: vendors.length > 0 ? 0.85 : 0.5,
    timestamp: new Date().toISOString(),
  };
}

async function handleProjectHealth(projectId: string): Promise<ViseronAnswer> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) {
    return {
      type: 'project_health',
      query: 'What is project health?',
      summary: 'Project not found.',
      details: [],
      confidence: 0,
      timestamp: new Date().toISOString(),
    };
  }

  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    include: { paymentEligibility: true },
  });

  const now = new Date();
  const total = milestones.length;
  const verified = milestones.filter((m) => m.state === 'VERIFIED' || m.state === 'CLOSED').length;
  const inProgress = milestones.filter((m) => m.state === 'IN_PROGRESS').length;
  const overdue = milestones.filter(
    (m) => m.plannedEnd && new Date(m.plannedEnd) < now && m.state !== 'VERIFIED' && m.state !== 'CLOSED',
  ).length;
  const blocked = milestones.filter((m) => m.paymentEligibility?.state === 'BLOCKED').length;

  const completionPct = total > 0 ? Math.round((verified / total) * 100) : 0;
  const overduePct = total > 0 ? Math.round((overdue / total) * 100) : 0;

  // Health score: 100 base, minus penalties
  let healthScore = 100;
  healthScore -= overduePct * 0.5; // penalize overdue
  healthScore -= blocked * 3; // penalize blocked payments
  if (total > 0 && completionPct < 25 && inProgress < 2) healthScore -= 15; // stalled project
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  let healthLabel = 'Excellent';
  if (healthScore < 40) healthLabel = 'Critical';
  else if (healthScore < 60) healthLabel = 'At Risk';
  else if (healthScore < 80) healthLabel = 'Fair';
  else if (healthScore < 90) healthLabel = 'Good';

  const totalValue = milestones.reduce((s, m) => s + (m.value ? Number(m.value) : 0), 0);
  const verifiedValue = milestones
    .filter((m) => m.state === 'VERIFIED' || m.state === 'CLOSED')
    .reduce((s, m) => s + (m.value ? Number(m.value) : 0), 0);

  const currency = project.metadata ? (JSON.parse(project.metadata).currency || 'INR') : 'INR';
  const summary = `Project health: ${healthLabel} (${healthScore}/100). ${completionPct}% milestones complete (${verified}/${total}). ${overdue} overdue, ${blocked} blocked. Value certified: ${formatCurrency(verifiedValue, currency)} of ${formatCurrency(totalValue, currency)}.`;

  return {
    type: 'project_health',
    query: 'What is project health?',
    summary,
    details: [
      {
        healthScore,
        healthLabel,
        completionPct,
        total,
        verified,
        inProgress,
        overdue,
        blocked,
        totalValue,
        verifiedValue,
      },
    ],
    confidence: 0.9,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// FULL PROJECT CONTEXT — everything Viseron is allowed to read
// ============================================

export interface ViseronProjectContext {
  /** `currency` is the ISO code every monetary figure in this context is denominated in —
   * always state amounts using this code, never assume INR or infer a currency from `name`/
   * `description` text. */
  project: { name: string; status: string; description: string | null; currency: string };
  health: {
    healthScore: number;
    healthLabel: string;
    completionPct: number;
    totalMilestones: number;
    verifiedMilestones: number;
    overdueMilestones: number;
    blockedPayments: number;
    totalValue: number;
    verifiedValue: number;
  };
  schedule: {
    stateDistribution: Array<{ state: string; count: number }>;
    upcomingOrOverdue: Array<{
      title: string;
      state: string;
      vendorName: string | null;
      plannedStart: string | null;
      plannedEnd: string | null;
      daysRemaining: number | null;
    }>;
  };
  vendorScores: ViseronDashboardData['vendorScores'];
  raBills: {
    total: number;
    totalSubmittedValue: number;
    totalApprovedValue: number;
    totalReleasedValue: number;
    pendingSiteEngineerReviewCount: number;
    pendingCertificationCount: number;
    pendingApprovalCount: number;
    recent: Array<{
      orderName: string;
      billNumber: number;
      status: string;
      submittedValue: number | null;
      approvedValue: number | null;
      releasedValue: number | null;
      periodStart: string;
      periodEnd: string;
    }>;
  };
  boq: {
    total: number;
    byStatus: Record<string, number>;
    recent: Array<{ name: string | null; orderName: string | null; status: string; itemCount: number; plannedValue: number }>;
  };
  workOrders: { total: number; byStatus: Record<string, number> };
  /** null for VENDOR — Checklists are never visible to that role, same as the Documents tab. */
  checklists: {
    total: number;
    byStatus: Record<string, number>;
    open: Array<{ docRefNo: string; title: string; status: string; referenceDrawingNo: string }>;
  } | null;
  /** null for VENDOR — DPRs are never visible to that role, same as the Documents tab. */
  dpr: {
    total: number;
    recent: Array<{ docRefNo: string; reportDate: string; status: string; highlightsCount: number; criticalIssues: string | null }>;
  } | null;
  documents: {
    specsCount: number;
    otherDocsCount: number;
    recentTitles: Array<{ title: string; category: string }>;
  };
  drawings: { total: number; byStatus: Record<string, number>; byCategory: Record<string, number> };
  recentActivity: ViseronDashboardData['recentActivity'];
}

function countBy<T>(rows: T[], key: (row: T) => string): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    const k = key(row);
    counts[k] = (counts[k] ?? 0) + 1;
  }
  return counts;
}

/** Assembles the read-only project snapshot Viseron grounds every free-form answer in.
 * Scoped exactly like each module's own list endpoint: RA Bills/BOQ/Work Orders narrow to the
 * caller's own order when they're a VENDOR, Checklists/DPR are omitted entirely for VENDOR, and
 * Drawings narrow to APPROVED — nothing here is ever visible to a role that couldn't already
 * see it on the corresponding project page. */
export async function getProjectFullContext(projectId: string, auth: ViseronAuthContext): Promise<ViseronProjectContext | null> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) return null;

  const currency = project.metadata ? (JSON.parse(project.metadata).currency || 'INR') : 'INR';
  const isVendor = auth.role === 'VENDOR';
  const vendorOrderFilter = isVendor ? { order: { vendorUserId: auth.userId } } : {};

  const [dashboard, raBillData, boqRows, workOrderRows, checklistRows, dprRows, specDocs, otherDocs, drawingRows] = await Promise.all([
    getDashboardData(projectId),
    RABillService.getForProject(projectId, { vendorUserId: isVendor ? auth.userId : undefined }),
    prisma.bOQ.findMany({
      where: { projectId, ...vendorOrderFilter },
      select: { name: true, boqNumber: true, status: true, order: { select: { name: true } }, items: { select: { plannedValue: true } } },
      orderBy: { createdAt: 'desc' },
      take: 20,
    }),
    prisma.workOrder.findMany({
      where: { projectId, ...(isVendor ? { order: { vendorUserId: auth.userId } } : {}) },
      select: { status: true },
    }),
    isVendor
      ? Promise.resolve(null)
      : prisma.checklist.findMany({
          where: { projectId },
          select: { docRefNo: true, title: true, status: true, referenceDrawingNo: true },
          orderBy: { createdAt: 'desc' },
          take: 30,
        }),
    isVendor
      ? Promise.resolve(null)
      : prisma.dailyProgressReport.findMany({
          where: { projectId },
          select: { docRefNo: true, reportDate: true, status: true, criticalIssues: true, highlights: { select: { id: true } } },
          orderBy: { reportDate: 'desc' },
          take: 10,
        }),
    prisma.projectDocument.count({ where: { projectId, deletedAt: null, category: 'SPEC' } }),
    prisma.projectDocument.count({ where: { projectId, deletedAt: null, category: 'OTHER' } }),
    prisma.drawingRow.findMany({
      where: { projectId, ...(isVendor ? { status: 'APPROVED' } : {}) },
      select: { status: true, category: true },
    }),
  ]);

  const recentDocs = await prisma.projectDocument.findMany({
    where: { projectId, deletedAt: null },
    select: { title: true, category: true },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });

  const upcomingOrOverdue = dashboard.riskyMilestones.slice(0, 15).map((m) => ({
    title: m.title,
    state: m.state,
    vendorName: m.vendorName,
    plannedStart: m.plannedStart,
    plannedEnd: m.plannedEnd,
    daysRemaining: m.daysRemaining,
  }));

  return {
    project: { name: project.name, status: project.status, description: project.description, currency },
    health: {
      healthScore: dashboard.healthScore,
      healthLabel: dashboard.healthLabel,
      completionPct: dashboard.completionPct,
      totalMilestones: dashboard.totalMilestones,
      verifiedMilestones: dashboard.verifiedMilestones,
      overdueMilestones: dashboard.overdueMilestones,
      blockedPayments: dashboard.blockedPayments,
      totalValue: dashboard.totalValue,
      verifiedValue: dashboard.verifiedValue,
    },
    schedule: { stateDistribution: dashboard.stateDistribution, upcomingOrOverdue },
    vendorScores: dashboard.vendorScores,
    raBills: {
      total: raBillData.total,
      totalSubmittedValue: raBillData.summary.totalSubmittedValue,
      totalApprovedValue: raBillData.summary.totalApprovedValue,
      totalReleasedValue: raBillData.summary.totalReleasedValue,
      pendingSiteEngineerReviewCount: raBillData.summary.pendingSiteEngineerReviewCount,
      pendingCertificationCount: raBillData.summary.pendingCertificationCount,
      pendingApprovalCount: raBillData.summary.pendingApprovalCount,
      recent: raBillData.raBills.slice(0, 10).map((b) => ({
        orderName: b.order.name,
        billNumber: b.billNumber,
        status: b.status,
        submittedValue: b.submittedValue,
        approvedValue: b.approvedValue,
        releasedValue: b.releasedValue,
        periodStart: b.periodStart.toISOString().slice(0, 10),
        periodEnd: b.periodEnd.toISOString().slice(0, 10),
      })),
    },
    boq: {
      total: boqRows.length,
      byStatus: countBy(boqRows, (b) => b.status),
      recent: boqRows.slice(0, 10).map((b) => ({
        name: b.name ?? b.boqNumber,
        orderName: b.order?.name ?? null,
        status: b.status,
        itemCount: b.items.length,
        plannedValue: b.items.reduce((s, i) => s + i.plannedValue, 0),
      })),
    },
    workOrders: { total: workOrderRows.length, byStatus: countBy(workOrderRows, (w) => w.status) },
    checklists: checklistRows === null
      ? null
      : {
          total: checklistRows.length,
          byStatus: countBy(checklistRows, (c) => c.status),
          open: checklistRows.filter((c) => c.status !== 'SIGNED').slice(0, 10).map((c) => ({
            docRefNo: c.docRefNo, title: c.title, status: c.status, referenceDrawingNo: c.referenceDrawingNo,
          })),
        },
    dpr: dprRows === null
      ? null
      : {
          total: dprRows.length,
          recent: dprRows.map((d) => ({
            docRefNo: d.docRefNo, reportDate: d.reportDate, status: d.status,
            highlightsCount: d.highlights.length, criticalIssues: d.criticalIssues,
          })),
        },
    documents: {
      specsCount: specDocs,
      otherDocsCount: otherDocs,
      recentTitles: recentDocs.map((d) => ({ title: d.title, category: d.category })),
    },
    drawings: {
      total: drawingRows.length,
      byStatus: countBy(drawingRows, (r) => r.status),
      byCategory: countBy(drawingRows, (r) => r.category),
    },
    recentActivity: dashboard.recentActivity,
  };
}

// ============================================
// AI ANSWER GENERATION (Claude)
// ============================================

const CANNED_FALLBACK =
  'I can answer questions about this project\'s milestones/schedule, RA Bills and payments, BOQ, ' +
  'Work Orders, DPRs, Checklists, Documents, and Drawings — e.g. "why is vendor X delayed?", ' +
  '"which RA bills are pending approval?", "what\'s the BOQ status?", or "what is project health?".';

/** Rewrite a deterministic answer as a natural chat reply, grounded strictly in the
 * facts already computed — Claude may not add any number, name, or claim not present
 * in `facts`. Returns the original `deterministicSummary` unchanged if AI is unavailable
 * or the call fails. */
async function polishSummary(
  query: string,
  deterministicSummary: string,
  facts: Record<string, unknown>[],
): Promise<string> {
  const aiText = await generateAiText({
    system:
      'You are Viseron, an AI project-intelligence assistant embedded in a construction ' +
      'project management platform. Rewrite the given factual summary as a natural, ' +
      'confident chat answer (2-3 short sentences) to the user\'s exact question. ' +
      'Use ONLY the facts provided — never invent or alter any number, name, or date ' +
      'that isn\'t present in them. No markdown, no headers, plain conversational prose.',
    prompt: `User question: "${query}"\n\nFactual summary: ${deterministicSummary}\n\nSupporting facts (JSON): ${JSON.stringify(facts.slice(0, 10))}`,
    maxTokens: 220,
  });
  return aiText ?? deterministicSummary;
}

/** Handles queries that don't match one of the four hard-coded patterns by asking Claude to
 * answer freely, grounded in the full read-only project snapshot (`getProjectFullContext`) —
 * schedule/gantt, RA Bills & payments, BOQ, Work Orders, DPR, Checklists, Documents, Drawings.
 * Falls back to the canned "here's what I can answer" message if AI is unavailable, the call
 * fails, or the context can't be built. */
async function handleAiFallback(projectId: string, query: string, auth: ViseronAuthContext): Promise<ViseronAnswer> {
  const fallbackAnswer: ViseronAnswer = {
    type: 'fallback',
    query,
    summary: CANNED_FALLBACK,
    details: [],
    confidence: 0,
    timestamp: new Date().toISOString(),
  };

  const context = await getProjectFullContext(projectId, auth).catch(() => null);
  if (!context) return fallbackAnswer;

  const aiText = await generateAiText({
    system:
      'You are Viseron, a READ-ONLY AI project-intelligence assistant embedded in a construction ' +
      'project management platform. You have full read access to this project\'s milestones and ' +
      'schedule (gantt), RA Bills and payments, BOQ, Work Orders, DPRs, Checklists, Documents, and ' +
      'Drawings — given to you below as JSON. Answer the user\'s question using ONLY those facts — ' +
      'never invent a number, name, date, or status not present in them. All monetary figures in ' +
      'the JSON (submittedValue, approvedValue, releasedValue, totalValue, plannedValue, etc.) are ' +
      'unitless numbers — always state them using `project.currency`\'s ISO code (e.g. "AED ' +
      '758,760"), and NEVER assume INR or any other currency, and never infer a currency from the ' +
      'project name or description text. If the facts don\'t contain enough to answer, say so ' +
      'plainly rather than guessing. You cannot create, edit, approve, or delete anything — you ' +
      'only answer questions about existing data; if asked to change something, say you\'re ' +
      'read-only and point to the relevant page instead. Answer in 2-4 concise, natural sentences. ' +
      'No markdown.',
    prompt: `User question: "${query}"\n\nProject facts (JSON):\n${JSON.stringify(context)}`,
    maxTokens: 320,
  });

  if (!aiText) return fallbackAnswer;

  return {
    type: 'fallback',
    query,
    summary: aiText,
    details: [],
    confidence: 0.6,
    timestamp: new Date().toISOString(),
  };
}

// ============================================
// MAIN ENTRY POINT
// ============================================

export async function executeQuery(projectId: string, query: string, auth: ViseronAuthContext): Promise<ViseronAnswer> {
  const trimmed = query.trim();
  const { type, params } = classifyQuery(trimmed);

  let answer: ViseronAnswer;
  switch (type) {
    case 'vendor_delay':
      answer = await handleVendorDelay(projectId, params.vendorName || '');
      break;
    case 'risky_milestones':
      answer = await handleRiskyMilestones(projectId);
      break;
    case 'vendor_reliability':
      answer = await handleVendorReliability(projectId);
      break;
    case 'project_health':
      answer = await handleProjectHealth(projectId);
      break;
    default:
      return handleAiFallback(projectId, trimmed, auth);
  }

  const polished = await polishSummary(trimmed, answer.summary, answer.details);
  return polished === answer.summary ? answer : { ...answer, summary: polished };
}

// ============================================
// DASHBOARD DATA (aggregated view)
// ============================================

export interface ViseronDashboardData {
  healthScore: number;
  healthLabel: string;
  completionPct: number;
  totalMilestones: number;
  verifiedMilestones: number;
  overdueMilestones: number;
  blockedPayments: number;
  totalValue: number;
  verifiedValue: number;
  riskyMilestones: Array<{
    id: string;
    title: string;
    state: string;
    vendorName: string | null;
    plannedStart: string | null;
    plannedEnd: string | null;
    daysRemaining: number | null;
    riskLevel: string;
    value: number;
  }>;
  vendorScores: Array<{
    vendorName: string;
    total: number;
    onTime: number;
    late: number;
    reliability: number;
    avgDelay: number;
  }>;
  stateDistribution: Array<{ state: string; count: number }>;
  recentActivity: Array<{ type: string; description: string; date: string }>;
}

export async function getDashboardData(projectId: string): Promise<ViseronDashboardData> {
  const milestones = await prisma.milestone.findMany({
    where: { projectId },
    include: {
      paymentEligibility: true,
      vendorUser: { select: { id: true, name: true } },
      evidence: { orderBy: { submittedAt: 'desc' }, take: 1, include: { submittedBy: { select: { id: true, name: true } } } },
    },
    orderBy: { sortOrder: 'asc' },
  });

  const now = new Date();
  const total = milestones.length;
  const verified = milestones.filter((m) => m.state === 'VERIFIED' || m.state === 'CLOSED').length;
  const overdue = milestones.filter(
    (m) => m.plannedEnd && new Date(m.plannedEnd) < now && m.state !== 'VERIFIED' && m.state !== 'CLOSED',
  ).length;
  const blocked = milestones.filter((m) => m.paymentEligibility?.state === 'BLOCKED').length;
  const completionPct = total > 0 ? Math.round((verified / total) * 100) : 0;
  const overduePct = total > 0 ? Math.round((overdue / total) * 100) : 0;

  let healthScore = 100;
  healthScore -= overduePct * 0.5;
  healthScore -= blocked * 3;
  healthScore = Math.max(0, Math.min(100, Math.round(healthScore)));

  let healthLabel = 'Excellent';
  if (healthScore < 40) healthLabel = 'Critical';
  else if (healthScore < 60) healthLabel = 'At Risk';
  else if (healthScore < 80) healthLabel = 'Fair';
  else if (healthScore < 90) healthLabel = 'Good';

  const totalValue = milestones.reduce((s, m) => s + (m.value ? Number(m.value) : 0), 0);
  const verifiedValue = milestones
    .filter((m) => m.state === 'VERIFIED' || m.state === 'CLOSED')
    .reduce((s, m) => s + (m.value ? Number(m.value) : 0), 0);

  // Risky milestones
  const riskyMilestones = milestones
    .filter((m) => m.state !== 'VERIFIED' && m.state !== 'CLOSED')
    .map((m) => {
      const plannedEnd = m.plannedEnd ? new Date(m.plannedEnd) : null;
      const daysRemaining = plannedEnd
        ? Math.ceil((plannedEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
        : null;
      const isOverdue = daysRemaining !== null && daysRemaining < 0;
      const isAtRisk = daysRemaining !== null && daysRemaining >= 0 && daysRemaining <= 7;
      const isBlocked = m.paymentEligibility?.state === 'BLOCKED';

      let riskLevel = 'low';
      if (isOverdue) riskLevel = 'critical';
      else if (isBlocked || (isAtRisk && m.state === 'DRAFT')) riskLevel = 'high';
      else if (isAtRisk) riskLevel = 'medium';

      return {
        id: m.id,
        title: m.title,
        state: m.state,
        vendorName: getVendorName(m),
        plannedStart: m.plannedStart ? new Date(m.plannedStart).toISOString().slice(0, 10) : null,
        plannedEnd: m.plannedEnd ? new Date(m.plannedEnd).toISOString().slice(0, 10) : null,
        daysRemaining,
        riskLevel,
        value: m.value ? Number(m.value) : 0,
      };
    })
    .filter((m) => m.riskLevel !== 'low')
    .sort((a, b) => {
      const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
      return (order[a.riskLevel] ?? 3) - (order[b.riskLevel] ?? 3);
    });

  // Vendor scores
  const vendorMap = new Map<string, { total: number; onTime: number; late: number; delays: number[] }>();
  for (const m of milestones) {
    const vName = getVendorName(m);
    if (!vName) continue;
    if (!vendorMap.has(vName)) vendorMap.set(vName, { total: 0, onTime: 0, late: 0, delays: [] });
    const v = vendorMap.get(vName)!;
    v.total++;
    if ((m.state === 'VERIFIED' || m.state === 'CLOSED') && m.plannedEnd) {
      const actualEnd = getActualEnd(m);
      const actual = actualEnd ? new Date(actualEnd) : now;
      const planned = new Date(m.plannedEnd);
      const diff = Math.ceil((actual.getTime() - planned.getTime()) / (1000 * 60 * 60 * 24));
      if (diff <= 0) v.onTime++;
      else { v.late++; v.delays.push(diff); }
    } else if (m.plannedEnd && new Date(m.plannedEnd) < now) {
      v.late++;
      v.delays.push(Math.ceil((now.getTime() - new Date(m.plannedEnd).getTime()) / (1000 * 60 * 60 * 24)));
    }
  }

  const vendorScores = Array.from(vendorMap.entries())
    .map(([name, data]) => ({
      vendorName: name,
      total: data.total,
      onTime: data.onTime,
      late: data.late,
      reliability: data.total > 0 ? Math.round((data.onTime / data.total) * 100) : 100,
      avgDelay: data.delays.length > 0 ? Math.round(data.delays.reduce((s, d) => s + d, 0) / data.delays.length) : 0,
    }))
    .sort((a, b) => b.reliability - a.reliability);

  // State distribution
  const stateCounts = new Map<string, number>();
  for (const m of milestones) {
    stateCounts.set(m.state, (stateCounts.get(m.state) || 0) + 1);
  }
  const stateDistribution = Array.from(stateCounts.entries()).map(([state, count]) => ({ state, count }));

  // Recent activity from audit log
  const recentLogs = await prisma.auditLog.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 8,
  });
  const recentActivity = recentLogs.map((log) => ({
    type: log.actionType,
    description: `${log.actionType.replace(/_/g, ' ').toLowerCase()}${log.entityType ? ` on ${log.entityType}` : ''}`,
    date: log.createdAt.toISOString(),
  }));

  return {
    healthScore,
    healthLabel,
    completionPct,
    totalMilestones: total,
    verifiedMilestones: verified,
    overdueMilestones: overdue,
    blockedPayments: blocked,
    totalValue,
    verifiedValue,
    riskyMilestones,
    vendorScores,
    stateDistribution,
    recentActivity,
  };
}

const CURRENCY_LOCALE: Record<string, string> = { INR: 'en-IN', AED: 'en-AE', USD: 'en-US', EUR: 'en-IE', GBP: 'en-GB' };

function formatCurrency(n: number, currency: string = 'INR') {
  return new Intl.NumberFormat(CURRENCY_LOCALE[currency] ?? 'en-US', {
    style: 'currency',
    currency,
    notation: n >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
}
