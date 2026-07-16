import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { RABillService } from '@/services/RABillService';

// GET /api/projects/[projectId]/orders/[orderId]/ra-bills/[raBillId] - RA Bill detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string; raBillId: string }> }
) {
  try {
    const { projectId, raBillId } = await params;
    const auth = await requireProjectAuth(projectId);

    const raBill = await RABillService.getById(raBillId, projectId);
    if (!raBill) {
      return NextResponse.json({ success: false, error: 'RA Bill not found' }, { status: 404 });
    }
    if (auth.role === 'VENDOR' && raBill.order.vendorUserId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ success: true, data: raBill });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('RA Bill get error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/orders/[orderId]/ra-bills/[raBillId] - Vendor edits their own Draft
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string; raBillId: string }> }
) {
  try {
    const { projectId, raBillId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['VENDOR']);

    const body = await request.json().catch(() => ({}));
    const result = await RABillService.updateDraft(raBillId, projectId, auth.userId, auth.role, {
      periodStart: body.periodStart ? new Date(body.periodStart) : undefined,
      periodEnd: body.periodEnd ? new Date(body.periodEnd) : undefined,
      remarks: body.remarks,
      lineItems: body.lineItems,
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
    console.error('RA Bill update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
