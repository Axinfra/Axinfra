import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);

    const [systemEvents, followUps, auditLogs] = await Promise.all([
      prisma.systemEvent.findMany({
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          eventType: true,
          severity: true,
          message: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.followUp.findMany({
        where: { status: { in: ['OPEN', 'ESCALATED'] } },
        orderBy: [{ status: 'desc' }, { createdAt: 'desc' }],
        take: 40,
        select: {
          id: true,
          type: true,
          description: true,
          status: true,
          createdAt: true,
          project: { select: { id: true, name: true } },
        },
      }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 30,
        select: {
          id: true,
          actionType: true,
          entityType: true,
          role: true,
          createdAt: true,
          actor: { select: { id: true, name: true, email: true } },
          project: { select: { id: true, name: true } },
        },
      }),
    ]);

    return NextResponse.json({ success: true, data: { systemEvents, followUps, auditLogs } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[admin/system]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
