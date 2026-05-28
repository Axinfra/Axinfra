import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditActionTypes } from '@/types';
import { cached } from '@/lib/cache';

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

    // Audit logs are append-only — cache for 120s.
    const cacheKey = buildAuditCacheKey(projectId, auth.role, options);
    const { logs, total } = await cached(cacheKey, 120_000, () =>
      AuditLogger.getProjectLogs(projectId, options),
    );

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
    console.error('Audit log error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
