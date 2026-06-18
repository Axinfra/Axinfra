import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sendWelcomeEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const createUserSchema = z.object({
  name: z.string().min(1).max(100),
  email: z.string().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export async function GET() {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);

    const users = await prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        email: true,
        createdAt: true,
        preferredRole: true,
        googleId: true,
        projectRoles: {
          orderBy: { createdAt: 'desc' },
          select: {
            role: true,
            createdAt: true,
            project: { select: { id: true, name: true, status: true } },
          },
        },
      },
    });

    return NextResponse.json({ success: true, data: { users } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[admin/users GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);

    const body = await request.json();
    const parsed = createUserSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { name, email, password } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json({ error: 'A user with that email already exists' }, { status: 409 });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, hashedPassword },
      select: { id: true, name: true, email: true, createdAt: true, projectRoles: true },
    });

    // Send welcome email — fire-and-forget, don't block on failure
    sendWelcomeEmail(email, name, password).catch(e =>
      console.error('[email] welcome email failed:', e)
    );

    return NextResponse.json({ success: true, data: { user } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[admin/users POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
