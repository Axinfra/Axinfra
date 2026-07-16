import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { WorkOrderService } from '@/services/WorkOrderService';

// POST /api/projects/[projectId]/work-orders/[workOrderId]/revisions/[revisionId]/reject
// Vendor sends the current Work Order revision back with remarks instead of accepting it.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; workOrderId: string; revisionId: string }> }
) {
  try {
    const { projectId, revisionId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['VENDOR']);

    const body = await request.json().catch(() => ({}));
    const remarks = typeof body.remarks === 'string' ? body.remarks.trim() : '';

    const result = await WorkOrderService.requestChanges(revisionId, projectId, auth.userId, auth.role, remarks);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Work order reject error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
