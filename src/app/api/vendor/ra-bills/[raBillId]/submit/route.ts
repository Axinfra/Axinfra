import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role } from '@/types';
import { RABillService } from '@/services/RABillService';

// POST /api/vendor/ra-bills/[raBillId]/submit - Vendor submits their own Draft RA Bill
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ raBillId: string }> }
) {
  try {
    const { raBillId } = await params;
    const auth = await requireAuth();

    const raBill = await prisma.rABill.findFirst({
      where: { id: raBillId, order: { vendorUserId: auth.userId } },
      select: { projectId: true },
    });
    if (!raBill) {
      return NextResponse.json({ success: false, error: 'RA Bill not found' }, { status: 404 });
    }

    const result = await RABillService.submit(raBillId, raBill.projectId, auth.userId, Role.VENDOR);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor RA Bill submit error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
