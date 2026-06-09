import { prisma } from '@/lib/db';

/**
 * ViseronQueryEngine - Natural language query engine for project intelligence.
 *
 * Pattern-matches user queries against known question types and returns
 * structured answers derived from project data.
 *
 * READ-ONLY: Never mutates data.
 *
 * Schema notes:
 * - Milestone.vendorUserId -> vendorUser (User relation) for vendor name
 * - Milestone.evidence (not "evidences"), Evidence.status (not "approvalStatus")
 * - No "actualEnd" — derive from actualVerification ?? actualSubmission
 * - AuditLog.actionType (not "action")
 */

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

/** Derive "actual end" date from actualVerification or actualSubmission */
function getActualEnd(m: { actualVerification: Date | null; actualSubmission: Date | null }): Date | null {
  return m.actualVerification ?? m.actualSubmission ?? null;
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
    : `${risky.length} milestone(s) at risk: ${critical} critical, ${high} high risk. Total value at risk: ${formatCurrency(risky.reduce((s, r) => s + r.value, 0))}.`;

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

  const summary = `Project health: ${healthLabel} (${healthScore}/100). ${completionPct}% milestones complete (${verified}/${total}). ${overdue} overdue, ${blocked} blocked. Value certified: ${formatCurrency(verifiedValue)} of ${formatCurrency(totalValue)}.`;

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
// MAIN ENTRY POINT
// ============================================

export async function executeQuery(projectId: string, query: string): Promise<ViseronAnswer> {
  const { type, params } = classifyQuery(query.trim());

  switch (type) {
    case 'vendor_delay':
      return handleVendorDelay(projectId, params.vendorName || '');
    case 'risky_milestones':
      return handleRiskyMilestones(projectId);
    case 'vendor_reliability':
      return handleVendorReliability(projectId);
    case 'project_health':
      return handleProjectHealth(projectId);
    default:
      return {
        type: 'fallback',
        query,
        summary:
          "I can answer questions like: \"Why is vendor X delayed?\", \"Which milestones are risky?\", \"Which vendor has lowest reliability?\", and \"What is project health?\" — try one of those.",
        details: [],
        confidence: 0,
        timestamp: new Date().toISOString(),
      };
  }
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

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: n >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
}
