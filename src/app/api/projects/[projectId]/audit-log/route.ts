import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditActionTypes } from '@/types';

/**
 * SECURITY: Cash-module audit action types are PRIVATE to OWNER role.
 * Non-OWNER roles must never see these entries in the shared audit log.
 */
const PRIVATE_CASH_ACTION_TYPES: string[] = [
  AuditActionTypes.CASH_ADJUSTMENT_CREATE,
  AuditActionTypes.PRIVATE_COST_CREATE,
];

// GET /api/projects/[projectId]/audit-log - Get audit logs
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const { searchParams } = new URL(request.url);

    const options = {
      entityType: searchParams.get('entityType') || undefined,
      entityId: searchParams.get('entityId') || undefined,
      actorId: searchParams.get('actorId') || undefined,
      actionType: searchParams.get('actionType') || undefined,
      startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
      endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
      limit: searchParams.get('limit') ? parseInt(searchParams.get('limit')!, 10) : 100,
      offset: searchParams.get('offset') ? parseInt(searchParams.get('offset')!, 10) : 0,
      // SECURITY: Non-OWNER users must never see cash module audit entries
      excludeActionTypes: !RoleGuard.canAccessCashModule(auth)
        ? PRIVATE_CASH_ACTION_TYPES
        : undefined,
    };

    const { logs, total } = await AuditLogger.getProjectLogs(projectId, options);

    return NextResponse.json({
      success: true,
      data: {
        logs,
        total,
        limit: options.limit,
        offset: options.offset,
      },
    });
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
