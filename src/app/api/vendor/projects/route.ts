/**
 * GET /api/vendor/projects
 *
 * Every project the logged-in vendor is assigned to (VENDOR role), with per-project stats —
 * count of Purchase Orders assigned to *this* vendor and count of RA Bills needing the
 * vendor's action. Feeds the vendor portal landing page, which reads like the PMC/Client
 * "All Projects" view instead of a single-project switcher.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role, RABillStatus } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth();

    const vendorRoles = await prisma.projectRole.findMany({
      where: { userId: auth.userId, role: Role.VENDOR, project: { deletedAt: null } },
      include: { project: { select: { id: true, name: true, status: true, isExampleProject: true, createdAt: true } } },
      orderBy: { project: { createdAt: 'desc' } },
    });

    const projectIds = vendorRoles.map((r) => r.projectId);

    const [orders, bills] = await Promise.all([
      prisma.phase.findMany({
        where: { vendorUserId: auth.userId, projectId: { in: projectIds } },
        select: { id: true, projectId: true },
      }),
      prisma.rABill.findMany({
        where: { projectId: { in: projectIds }, order: { vendorUserId: auth.userId } },
        select: { projectId: true, status: true },
      }),
    ]);

    const ordersByProject = new Map<string, number>();
    for (const o of orders) {
      ordersByProject.set(o.projectId, (ordersByProject.get(o.projectId) ?? 0) + 1);
    }

    const pendingBillsByProject = new Map<string, number>();
    const totalBillsByProject = new Map<string, number>();
    for (const b of bills) {
      totalBillsByProject.set(b.projectId, (totalBillsByProject.get(b.projectId) ?? 0) + 1);
      if (b.status === RABillStatus.DRAFT || b.status === RABillStatus.REVISION_REQUESTED) {
        pendingBillsByProject.set(b.projectId, (pendingBillsByProject.get(b.projectId) ?? 0) + 1);
      }
    }

    const data = vendorRoles.map((r) => ({
      id: r.project.id,
      name: r.project.name,
      status: r.project.status,
      isExampleProject: r.project.isExampleProject,
      createdAt: r.project.createdAt,
      ordersCount: ordersByProject.get(r.projectId) ?? 0,
      totalBillsCount: totalBillsByProject.get(r.projectId) ?? 0,
      pendingBillsCount: pendingBillsByProject.get(r.projectId) ?? 0,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor projects list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
