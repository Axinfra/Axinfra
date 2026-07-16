import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { WorkOrderService } from '@/services/WorkOrderService';

// POST /api/projects/[projectId]/work-orders/[workOrderId]/revisions/[revisionId]/accept
// Vendor accepts the current Work Order revision.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; workOrderId: string; revisionId: string }> }
) {
  try {
    const { projectId, revisionId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['VENDOR']);

    const result = await WorkOrderService.accept(revisionId, projectId, auth.userId, auth.role);
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
    console.error('Work order accept error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
