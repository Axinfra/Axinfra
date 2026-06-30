import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSession } from '@/lib/auth';
import { sendSignupWelcomeEmail } from '@/lib/email';
import { autoAcceptPendingInvites, isDemoEmail } from '@/lib/invite-utils';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const VALID_ROLES = ['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT'] as const;

const registerSchema = z.object({
  name:          z.string().min(2).max(100).trim(),
  email:         z.string().email().toLowerCase().trim(),
  password:      z.string().min(8).max(128),
  preferredRole: z.enum(VALID_ROLES),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, email, password, preferredRole } = registerSchema.parse(body);

    if (!preferredRole) {
      return NextResponse.json(
        { success: false, error: 'Please select your role to create an account.' },
        { status: 400 },
      );
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return NextResponse.json(
        { success: false, error: 'An account with this email already exists.' },
        { status: 409 },
      );
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, hashedPassword, preferredRole: preferredRole ?? null },
    });

    sendSignupWelcomeEmail(user.email, user.name).catch(e =>
      console.error('[email] signup welcome failed:', e)
    );

    // Auto-accept pending invites ONLY for demo @example.com addresses.
    // Real email vendors must click their invitation link to accept.
    if (isDemoEmail(user.email)) {
      autoAcceptPendingInvites(user.id, user.email).catch(e =>
        console.error('[invite] auto-accept failed on register:', e)
      );
    }

    const token = await createSession({ id: user.id, email: user.email, name: user.name });

    const response = NextResponse.json({
      success: true,
      data: { user: { id: user.id, name: user.name, email: user.email } },
    });

    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
      path: '/',
    });

    return response;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.errors[0];
      return NextResponse.json(
        { success: false, error: first?.message ?? 'Invalid input' },
        { status: 400 },
      );
    }
    console.error('Register error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
