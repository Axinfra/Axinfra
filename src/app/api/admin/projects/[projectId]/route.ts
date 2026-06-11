import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);

    const { projectId } = params;

    const [project, milestones, auditLogs, followUps] = await Promise.all([
      prisma.project.findFirst({
        where: { id: projectId, deletedAt: null },
        select: {
          id: true, name: true, description: true,
          status: true, createdAt: true, isExampleProject: true,
          roles: {
            orderBy: { createdAt: 'asc' },
            select: {
              role: true, createdAt: true,
              user: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.milestone.findMany({
        where: { projectId },
        orderBy: [{ state: 'asc' }, { plannedEnd: 'asc' }],
        select: {
          id: true, title: true, state: true,
          value: true, plannedStart: true, plannedEnd: true,
          vendorUser: { select: { id: true, name: true, email: true } },
          paymentEligibility: {
            select: {
              state: true, eligibleAmount: true,
              blockedAmount: true, markedPaidAt: true,
            },
          },
        },
      }),
      prisma.auditLog.findMany({
        where: { projectId },
        orderBy: { createdAt: 'desc' },
        take: 60,
        select: {
          id: true, actionType: true, entityType: true,
          role: true, reason: true, createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.followUp.findMany({
        where: { projectId },
        orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
        take: 40,
        select: {
          id: true, type: true, description: true,
          status: true, createdAt: true,
        },
      }),
    ]);

    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: { project, milestones, auditLogs, followUps } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    console.error('[admin/projects/[id]]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
