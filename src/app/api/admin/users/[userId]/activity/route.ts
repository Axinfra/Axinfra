import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(
  _request: NextRequest,
  { params }: { params: { userId: string } }
) {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);

    const logs = await prisma.systemEvent.findMany({
      where: {
        actorId: params.userId,
        eventType: 'USER_SIGNIN',
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        message: true,
        metadata: true,
        createdAt: true,
      },
    });

    return NextResponse.json({ success: true, data: { logs } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
