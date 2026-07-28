/**
 * GET /api/vendor/work-orders
 *
 * Work Orders issued against Purchase Orders assigned to the logged-in vendor, across every
 * project they're a VENDOR on. Surfaces the two things a vendor actually needs from this list:
 * ones needing their acceptance right now (ISSUED / PENDING_VENDOR_ACCEPTANCE), and ones
 * already accepted — the upcoming work still to be completed, sorted by the order's planned
 * end date so the nearest deadline shows first.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
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

    const workOrders = await prisma.workOrder.findMany({
      where: { projectId: { in: projectIds }, order: { vendorUserId: auth.userId } },
      include: {
        project: { select: { id: true, name: true } },
        order: { select: { id: true, name: true, plannedStart: true, plannedEnd: true } },
        revisions: {
          orderBy: { revisionNumber: 'desc' },
          take: 1,
          select: { plannedStart: true, plannedEnd: true, issueDate: true },
        },
      },
      orderBy: [{ order: { plannedEnd: 'asc' } }],
    });

    const data = workOrders.map((wo) => {
      const latestRevision = wo.revisions[0] ?? null;
      return {
        id: wo.id,
        number: wo.number,
        status: wo.status,
        projectId: wo.project.id,
        projectName: wo.project.name,
        orderId: wo.order.id,
        orderName: wo.order.name,
        plannedStart: latestRevision?.plannedStart ?? wo.order.plannedStart,
        plannedEnd: latestRevision?.plannedEnd ?? wo.order.plannedEnd,
        issueDate: latestRevision?.issueDate ?? null,
        needsAcceptance: wo.status === 'ISSUED' || wo.status === 'PENDING_VENDOR_ACCEPTANCE',
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor work orders list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
