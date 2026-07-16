import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { WorkOrderService } from '@/services/WorkOrderService';

// GET /api/projects/[projectId]/work-orders/[workOrderId]/revisions/compare?a=&b=
// Returns two revisions' raw field snapshots for the compare/diff UI.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; workOrderId: string }> }
) {
  try {
    const { projectId, workOrderId } = await params;
    await requireProjectAuth(projectId);

    const a = Number(request.nextUrl.searchParams.get('a'));
    const b = Number(request.nextUrl.searchParams.get('b'));
    if (isNaN(a) || isNaN(b)) {
      return NextResponse.json({ success: false, error: 'Query params a and b (revision numbers) are required' }, { status: 400 });
    }

    const data = await WorkOrderService.getRevisionsForCompare(workOrderId, projectId, a, b);
    if (!data.a || !data.b) {
      return NextResponse.json({ success: false, error: 'One or both revisions not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Work order compare error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
