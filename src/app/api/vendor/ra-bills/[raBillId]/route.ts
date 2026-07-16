import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/vendor/ra-bills/[raBillId] - Vendor's own RA Bill detail
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ raBillId: string }> }
) {
  try {
    const { raBillId } = await params;
    const auth = await requireAuth();

    const raBill = await prisma.rABill.findFirst({
      where: { id: raBillId, order: { vendorUserId: auth.userId } },
      include: {
        project: { select: { id: true, name: true } },
        order: { select: { id: true, name: true, vendorUserId: true } },
        lineItems: { include: { boq: { select: { id: true, boqNumber: true, name: true } } } },
        createdBy: { select: { name: true } },
        certifiedBy: { select: { name: true } },
        approvedBy: { select: { name: true } },
      },
    });

    if (!raBill) {
      return NextResponse.json({ success: false, error: 'RA Bill not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: raBill });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor RA Bill get error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
