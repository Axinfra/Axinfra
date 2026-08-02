/**
 * GET /api/vendor/direct-orders
 *
 * Direct Orders assigned to the logged-in vendor (across every project they're a VENDOR on) —
 * feeds the "Direct Orders" vendor-portal view, mirroring /api/vendor/orders.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(_request: NextRequest) {
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

    const orders = await prisma.directOrder.findMany({
      where: { vendorUserId: auth.userId, projectId: { in: projectIds } },
      include: { project: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });

    const data = orders.map((o) => ({
      id: o.id,
      doNumber: o.doNumber,
      projectId: o.project.id,
      projectName: o.project.name,
      itemDescription: o.itemDescription,
      value: o.value,
      billedValue: o.billedValue,
      status: o.status,
      remarks: o.remarks,
      createdAt: o.createdAt,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor direct orders list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
