import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { BOQService } from '@/services/BOQService';
import { z } from 'zod';

const rejectSchema = z.object({
  reason: z.string().min(1, 'Revision reason is required'),
});

// POST /api/projects/[projectId]/orders/[orderId]/boqs/reject
// Sends every eligible BOQ under this Purchase Order back for revision in one action, with a
// single shared reason.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT']);

    const body = await request.json();
    const { reason } = rejectSchema.parse(body);

    const result = await BOQService.requestRevisionBulk(orderId, reason, auth.userId, auth.role, projectId);
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
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Bulk BOQ reject error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
