import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/admin/project-requests — list every ProjectRequest, newest first.
export async function GET() {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);

    const requests = await prisma.projectRequest.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        requestedBy: { select: { id: true, name: true, email: true } },
        createdProject: { select: { id: true, name: true } },
      },
    });

    return NextResponse.json({ success: true, data: { requests } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[admin/project-requests GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
