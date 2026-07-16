import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { RABillService } from '@/services/RABillService';

// POST .../ra-bills/[raBillId]/release-payment - Owner or PMC records payment release
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string; raBillId: string }> }
) {
  try {
    const { projectId, raBillId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

    const body = await request.json().catch(() => ({}));
    const result = await RABillService.releasePayment(raBillId, projectId, auth.userId, auth.role, {
      releasedValue: body.releasedValue !== undefined ? Number(body.releasedValue) : undefined,
      paymentReference: body.paymentReference,
    });
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
    console.error('RA Bill release-payment error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
