import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';

/** SECURITY: Cash-module audit entries are private to BUILDER role */
const PRIVATE_CASH_ACTION_TYPES = [
  AuditActionTypes.CASH_ADJUSTMENT_CREATE,
  AuditActionTypes.PRIVATE_COST_CREATE,
];

// GET /api/projects/[projectId]/audit-log/export - Export audit logs as CSV
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (!RoleGuard.canExportAuditLog(auth)) {
      return NextResponse.json(
        { success: false, error: 'Only Owner or PMC can export audit logs' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);

    const options = {
      entityType: searchParams.get('entityType') || undefined,
      startDate: searchParams.get('startDate') ? new Date(searchParams.get('startDate')!) : undefined,
      endDate: searchParams.get('endDate') ? new Date(searchParams.get('endDate')!) : undefined,
      // SECURITY: Non-BUILDER users must not export cash module audit entries
      excludeActionTypes: !RoleGuard.canAccessCashModule(auth)
        ? PRIVATE_CASH_ACTION_TYPES
        : undefined,
    };

    const csvContent = await AuditLogger.exportProjectLogs(projectId, options);

    return new NextResponse(csvContent, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="audit-log-${projectId}-${new Date().toISOString().split('T')[0]}.csv"`,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Audit log export error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
