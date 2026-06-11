import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);

    const projects = await prisma.project.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        description: true,
        status: true,
        createdAt: true,
        isExampleProject: true,
        roles: {
          orderBy: { createdAt: 'asc' },
          select: {
            role: true,
            createdAt: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
        _count: { select: { milestones: true } },
      },
    });

    return NextResponse.json({ success: true, data: { projects } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[admin/projects]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
