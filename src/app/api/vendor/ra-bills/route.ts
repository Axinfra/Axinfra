/**
 * GET /api/vendor/ra-bills
 *
 * RA Bills for Purchase Orders assigned to the logged-in vendor (across every project they're
 * a VENDOR on). By default only bills awaiting vendor action (DRAFT — needs first submission,
 * or REVISION_REQUESTED — needs a resubmission); pass ?all=true for their full history across
 * every status.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role, RABillStatus } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const all = request.nextUrl.searchParams.get('all') === 'true';

    const vendorRoles = await prisma.projectRole.findMany({
      where: { userId: auth.userId, role: Role.VENDOR, project: { deletedAt: null } },
      select: { projectId: true },
    });
    if (vendorRoles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'You are not assigned as a vendor to any active project.' },
        { status: 403 }
      );
    }
    const projectIds = vendorRoles.map((r) => r.projectId);

    const raBills = await prisma.rABill.findMany({
      where: {
        order: { vendorUserId: auth.userId },
        projectId: { in: projectIds },
        ...(all ? {} : { status: { in: [RABillStatus.DRAFT, RABillStatus.REVISION_REQUESTED] } }),
      },
      include: {
        project: { select: { id: true, name: true, metadata: true } },
        order: { select: { id: true, name: true } },
        lineItems: { select: { thisBillAmount: true } },
      },
      orderBy: [{ status: 'asc' }, { billNumber: 'desc' }],
    });

    const data = raBills.map((b) => ({
      id: b.id,
      billNumber: b.billNumber,
      status: b.status,
      periodStart: b.periodStart,
      periodEnd: b.periodEnd,
      projectId: b.project.id,
      projectName: b.project.name,
      // Vendor bills can span several projects at once — each may be denominated differently.
      currency: b.project.metadata ? (JSON.parse(b.project.metadata).currency || 'INR') : 'INR',
      orderId: b.order.id,
      orderName: b.order.name,
      draftValue: b.lineItems.reduce((sum, l) => sum + l.thisBillAmount, 0),
      submittedValue: b.submittedValue,
      certifiedAt: b.certifiedAt,
      approvedValue: b.approvedValue,
      releasedValue: b.releasedValue,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor RA Bill list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
