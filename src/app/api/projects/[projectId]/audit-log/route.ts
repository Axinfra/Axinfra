import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditActionTypes } from '@/types';
import { cached } from '@/lib/cache';
import { resolveAuditContextLabels } from '@/lib/auditContext';
import { formatAuditEntry } from '@/lib/activityFormatter';

function safeParseJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'string') return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function buildAuditCacheKey(
  projectId: string,
  role: string,
  options: {
    entityType?: string;
    entityId?: string;
    actorId?: string;
    actionType?: string;
    startDate?: Date;
    endDate?: Date;
    limit: number;
    offset: number;
  },
): string {
  return [
    'auditlog',
    projectId,
    role, // Role affects excludeActionTypes filter — must scope cache by role
    options.entityType ?? '',
    options.entityId ?? '',
    options.actorId ?? '',
    options.actionType ?? '',
    options.startDate?.toISOString() ?? '',
    options.endDate?.toISOString() ?? '',
    options.limit,
    options.offset,
  ].join(':');
}

/**
 * SECURITY: Cash-module audit action types are PRIVATE to OWNER role.
 * Non-OWNER roles must never see these entries in the shared audit log.
 */
const PRIVATE_CASH_ACTION_TYPES: string[] = [
  AuditActionTypes.CASH_ADJUSTMENT_CREATE,
  AuditActionTypes.PRIVATE_COST_CREATE,
];

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

// GET /api/projects/[projectId]/audit-log - Get audit logs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    // Every existing role stays included here — this only closes the tab off for the new
    // read-only SITE_ENGINEER role, matching its Navbar entry (previously `always: true`
    // with no API-level check at all).
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VENDOR', 'VIEWER', 'CONSULTANT']);

    const { searchParams } = new URL(request.url);

    const parsedLimit = searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : DEFAULT_LIMIT;
    const parsedOffset = searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0;
    const limit = Number.isFinite(parsedLimit) ? Math.min(Math.max(parsedLimit, 1), MAX_LIMIT) : DEFAULT_LIMIT;
    const offset = Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0;

    const options = {
      entityType: searchParams.get('entityType') || undefined,
      entityId: searchParams.get('entityId') || undefined,
      actorId: searchParams.get('actorId') || undefined,
      actionType: searchParams.get('actionType') || undefined,
      startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
      endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
      limit,
      offset,
      // SECURITY: Non-OWNER users must never see cash module audit entries
      excludeActionTypes: !RoleGuard.canAccessCashModule(auth)
        ? PRIVATE_CASH_ACTION_TYPES
        : undefined,
    };

    // Audit logs are append-only — cache for 120s. The human-readable description/detail
    // are computed here too so a cache hit skips both the log fetch AND the resolution
    // queries (milestone titles, phase names, etc.) that build them.
    const cacheKey = buildAuditCacheKey(projectId, auth.role, options);
    const { logs, total } = await cached(cacheKey, 120_000, async () => {
      const { logs: rawLogs, total } = await AuditLogger.getProjectLogs(projectId, options);

      const parsedLogs = rawLogs.map((log) => ({
        ...log,
        beforeJson: safeParseJson(log.beforeJson),
        afterJson: safeParseJson(log.afterJson),
      }));

      const { labels: contextLabels, humanizeJson } = await resolveAuditContextLabels(parsedLogs);

      const logs = parsedLogs.map((log) => {
        const { sentence, detail } = formatAuditEntry({
          id: log.id,
          actionType: log.actionType,
          entityType: log.entityType,
          entityId: log.entityId,
          role: log.role,
          reason: log.reason,
          createdAt: log.createdAt,
          actorName: log.actor.name,
          contextLabel: contextLabels.get(log.id),
          beforeJson: log.beforeJson,
          afterJson: log.afterJson,
        });
        // The formatter above reads the raw JSON; the client only ever sees the
        // humanized version (IDs swapped for names, or dropped if unresolved).
        return {
          ...log,
          description: sentence,
          detail,
          beforeJson: humanizeJson(log.beforeJson),
          afterJson: humanizeJson(log.afterJson),
        };
      });

      return { logs, total };
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          logs,
          total,
          limit: options.limit,
          offset: options.offset,
        },
      },
      { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { success: false, error: 'Access denied.' },
        { status: 403 }
      );
    }
    console.error('Audit log error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
