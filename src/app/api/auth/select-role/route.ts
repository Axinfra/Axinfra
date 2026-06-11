import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const VALID_ROLES = ['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT', 'VIEWER'] as const;

const schema = z.object({
  role: z.enum(VALID_ROLES),
});

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'Invalid role' }, { status: 400 });
    }

    await prisma.user.update({
      where: { id: auth.userId },
      data: { preferredRole: parsed.data.role },
    });

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[select-role]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
