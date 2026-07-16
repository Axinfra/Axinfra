/**
 * GET /api/vendor/orders
 *
 * Purchase Orders assigned to the logged-in vendor (across every project they're a VENDOR
 * on), with their Work Order status — feeds the "My Purchase Orders" vendor-portal view and
 * a pending-acceptance badge.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();

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

    const orders = await prisma.phase.findMany({
      where: { vendorUserId: auth.userId, projectId: { in: projectIds } },
      include: {
        project: { select: { id: true, name: true } },
        boqs: { select: { id: true, status: true } },
        workOrder: { select: { id: true, number: true, status: true, currentRevisionNumber: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = orders.map((o) => ({
      id: o.id,
      name: o.name,
      projectId: o.project.id,
      projectName: o.project.name,
      plannedStart: o.plannedStart,
      plannedEnd: o.plannedEnd,
      boqsCount: o.boqs.length,
      workOrder: o.workOrder,
      pendingAcceptance: o.workOrder?.status === 'PENDING_VENDOR_ACCEPTANCE',
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor orders list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
