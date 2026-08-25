import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { createSession, SESSION_COOKIE_MAX_AGE_SECONDS } from '@/lib/auth';
import { sendSignupWelcomeEmail } from '@/lib/email';
import { autoAcceptPendingInvites, isDemoEmail } from '@/lib/invite-utils';
import { registerRateLimiter } from '@/lib/rate-limiter';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

// CLIENT is deliberately excluded — the platform charges per project, so a Client account (and
// its first project) is only ever created by an admin approving a ProjectRequest, never by
// self-service. See POST /api/project-requests and /api/admin/project-requests/[id]/approve.
const VALID_ROLES = ['PMC', 'VENDOR', 'CONSULTANT', 'SITE_ENGINEER'] as const;

const registerSchema = z.object({
  name:          z.string().min(2).max(100).trim(),
  email:         z.string().email().toLowerCase().trim(),
  password:      z.string().min(8).max(128),
  preferredRole: z.string(),
});

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = registerSchema.parse(body);
    const { name, email, password } = parsed;

    if (parsed.preferredRole === 'CLIENT') {
      return NextResponse.json(
        { success: false, error: 'Client accounts are created once your project request is approved — submit a request instead of registering here.' },
        { status: 400 },
      );
    }
    if (!VALID_ROLES.includes(parsed.preferredRole as typeof VALID_ROLES[number])) {
      return NextResponse.json(
        { success: false, error: 'Please select a valid role to create an account.' },
        { status: 400 },
      );
    }
    const preferredRole = parsed.preferredRole as typeof VALID_ROLES[number];

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const rateCheck = await registerRateLimiter.check(`${clientIp}:${email}`);
    if (!rateCheck.allowed) {
      const retryAfterSeconds = Math.ceil((rateCheck.retryAfterMs || 0) / 1000);
      return NextResponse.json(
        { success: false, error: 'Too many signup attempts. Please try again later.', retryAfterSeconds },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
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
      // `token` alongside the cookie, same reasoning as /api/auth/login —
      // native clients read it and store it themselves (see MOBILE_APP_SETUP.md §3.1).
      data: { token, user: { id: user.id, name: user.name, email: user.email } },
    });

    response.cookies.set('session', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
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
