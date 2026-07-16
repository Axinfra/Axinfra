import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { BOQService } from '@/services/BOQService';

// POST /api/projects/[projectId]/orders/[orderId]/boqs/submit
// Submits every eligible BOQ under this Purchase Order for Owner approval in one action.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const result = await BOQService.sendForApprovalBulk(orderId, auth.userId, auth.role, projectId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { count: result.count } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Bulk BOQ submit error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
