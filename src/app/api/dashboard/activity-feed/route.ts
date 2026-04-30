/**
 * GET /api/dashboard/activity-feed?projectId=xxx&page=0&pageSize=20
 *
 * Reads project audit log and returns natural-language activity entries for
 * the Owner Dashboard. OWNER and PMC only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { Role } from '@/types';
import { formatAuditEntry, type AuditEntryInput } from '@/lib/activityFormatter';

export const dynamic = 'force-dynamic';

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 100;

export async function GET(request: NextRequest) {
  try {
    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId required' },
        { status: 400 },
      );
    }

    const auth = await requireProjectAuth(projectId);
    if (auth.role !== Role.OWNER && auth.role !== Role.PMC) {
      return NextResponse.json(
        { success: false, error: 'Owner or PMC access required' },
        { status: 403 },
      );
    }

    const page = Math.max(0, parseInt(request.nextUrl.searchParams.get('page') || '0', 10));
    const requestedPageSize = parseInt(
      request.nextUrl.searchParams.get('pageSize') || String(DEFAULT_PAGE_SIZE),
      10,
    );
    const pageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, requestedPageSize));

    // Hide private cash module entries from PMC; only OWNER sees those.
    const excludeActionTypes =
      auth.role === Role.OWNER ? [] : ['CASH_ADJUSTMENT_CREATE', 'PRIVATE_COST_CREATE'];

    const [logs, totalCount] = await Promise.all([
      prisma.auditLog.findMany({
        where: {
          projectId,
          ...(excludeActionTypes.length > 0
            ? { actionType: { notIn: excludeActionTypes } }
            : {}),
        },
        include: {
          actor: { select: { name: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: pageSize + 1, // peek one extra to know if there's a next page
        skip: page * pageSize,
      }),
      prisma.auditLog.count({
        where: {
          projectId,
          ...(excludeActionTypes.length > 0
            ? { actionType: { notIn: excludeActionTypes } }
            : {}),
        },
      }),
    ]);

    const hasMore = logs.length > pageSize;
    const pageLogs = hasMore ? logs.slice(0, pageSize) : logs;

    // Resolve context labels in batch for entity types that benefit from it.
    const milestoneIds = new Set<string>();
    const evidenceIds = new Set<string>();
    const eligibilityIds = new Set<string>();
    const verificationIds = new Set<string>();
    const userIds = new Set<string>();
    for (const log of pageLogs) {
      switch (log.entityType) {
        case 'Milestone':
          milestoneIds.add(log.entityId);
          break;
        case 'Evidence':
          evidenceIds.add(log.entityId);
          break;
        case 'PaymentEligibility':
          eligibilityIds.add(log.entityId);
          break;
        case 'Verification':
          verificationIds.add(log.entityId);
          break;
        case 'User':
        case 'ProjectRole':
          userIds.add(log.entityId);
          break;
      }
    }

    const [
      milestones,
      evidenceRows,
      eligibilities,
      verifications,
      relatedUsers,
    ] = await Promise.all([
      milestoneIds.size > 0
        ? prisma.milestone.findMany({
            where: { id: { in: Array.from(milestoneIds) } },
            select: { id: true, title: true },
          })
        : Promise.resolve([]),
      evidenceIds.size > 0
        ? prisma.evidence.findMany({
            where: { id: { in: Array.from(evidenceIds) } },
            select: { id: true, milestone: { select: { title: true } } },
          })
        : Promise.resolve([]),
      eligibilityIds.size > 0
        ? prisma.paymentEligibility.findMany({
            where: { id: { in: Array.from(eligibilityIds) } },
            select: { id: true, milestone: { select: { title: true } } },
          })
        : Promise.resolve([]),
      verificationIds.size > 0
        ? prisma.verification.findMany({
            where: { id: { in: Array.from(verificationIds) } },
            select: { id: true, milestone: { select: { title: true } } },
          })
        : Promise.resolve([]),
      userIds.size > 0
        ? prisma.user.findMany({
            where: { id: { in: Array.from(userIds) } },
            select: { id: true, name: true },
          })
        : Promise.resolve([]),
    ]);

    const milestoneTitles = new Map(milestones.map((m) => [m.id, m.title]));
    const evidenceTitles = new Map(
      evidenceRows.map((e) => [e.id, e.milestone?.title || '']),
    );
    const eligibilityTitles = new Map(
      eligibilities.map((p) => [p.id, p.milestone?.title || '']),
    );
    const verificationTitles = new Map(
      verifications.map((v) => [v.id, v.milestone?.title || '']),
    );
    const userNames = new Map(relatedUsers.map((u) => [u.id, u.name]));

    const items = pageLogs.map((log) => {
      let contextLabel: string | undefined;
      switch (log.entityType) {
        case 'Milestone':
          contextLabel = milestoneTitles.get(log.entityId);
          break;
        case 'Evidence':
          contextLabel = evidenceTitles.get(log.entityId);
          break;
        case 'PaymentEligibility':
          contextLabel = eligibilityTitles.get(log.entityId);
          break;
        case 'Verification':
          contextLabel = verificationTitles.get(log.entityId);
          break;
        case 'User':
        case 'ProjectRole':
          contextLabel = userNames.get(log.entityId);
          break;
      }

      const input: AuditEntryInput = {
        id: log.id,
        actionType: log.actionType,
        entityType: log.entityType,
        entityId: log.entityId,
        role: log.role,
        reason: log.reason,
        createdAt: log.createdAt,
        actorName: log.actor?.name || 'Someone',
        contextLabel,
      };
      return formatAuditEntry(input);
    });

    return NextResponse.json({
      success: true,
      data: {
        items,
        page,
        pageSize,
        total: totalCount,
        hasMore,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[dashboard/activity-feed]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
