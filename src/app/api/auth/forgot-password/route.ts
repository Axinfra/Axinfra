import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/db';
import { forgotPasswordRateLimiter } from '@/lib/rate-limiter';
import { sendForgotPasswordEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const forgotPasswordSchema = z.object({
  email: z.string().email(),
});

// POST /api/auth/forgot-password — public. Generates a new random password and emails it,
// same "email the new password" mechanism the admin-driven resets already use (see
// sendPasswordChangedEmail / ProjectRequest approval) rather than a click-through reset link,
// so no new token/expiry model was needed on User.
//
// Always responds with the same generic message regardless of whether the email matched an
// account, has a password to reset, or the send succeeded — an "email not found" response here
// would let anyone enumerate registered accounts.
export async function POST(request: NextRequest) {
  const GENERIC_RESPONSE = NextResponse.json({
    success: true,
    data: { message: "If an account exists for that email, we've sent password reset instructions." },
  });

  try {
    const body = await request.json();
    const { email } = forgotPasswordSchema.parse(body);

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip')
      || 'unknown';
    const rateCheck = await forgotPasswordRateLimiter.check(`${clientIp}:${email.toLowerCase()}`);
    if (!rateCheck.allowed) {
      // Still generic — don't confirm/deny the account, just make them wait.
      return GENERIC_RESPONSE;
    }

    const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

    // No account, or a Google-only account with no password to reset — silently no-op.
    if (user?.hashedPassword) {
      const newPassword = randomBytes(9).toString('base64url');
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({ where: { id: user.id }, data: { hashedPassword } });
      sendForgotPasswordEmail(user.email, user.name, newPassword).catch((err) =>
        console.error('Failed to send forgot-password email:', err),
      );
    }

    return GENERIC_RESPONSE;
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'A valid email is required' }, { status: 400 });
    }
    console.error('Forgot password error:', error);
    // Still generic on unexpected errors — don't leak internals via a different response shape.
    return GENERIC_RESPONSE;
  }
}
