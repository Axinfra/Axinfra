/**
 * PATCH /api/admin/users/[userId]
 * Admin-only endpoint to update a user's email or reset their password.
 * Fires notification emails to the user after each change.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { sendPasswordChangedEmail, sendEmailChangedEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const schema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('email'),
    newEmail: z.string().email('Invalid email address'),
  }),
  z.object({
    type: z.literal('password'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  }),
]);

export async function PATCH(
  request: NextRequest,
  { params }: { params: { userId: string } },
) {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);

    const { userId } = params;

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, name: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const body = await request.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    if (parsed.data.type === 'email') {
      const { newEmail } = parsed.data;
      const existing = await prisma.user.findUnique({ where: { email: newEmail } });
      if (existing && existing.id !== userId) {
        return NextResponse.json({ error: 'That email is already in use by another account' }, { status: 409 });
      }
      await prisma.user.update({ where: { id: userId }, data: { email: newEmail } });

      // Notify both old and new email addresses
      sendEmailChangedEmail(user.email, newEmail, user.name).catch(e =>
        console.error('[email] email-changed notification failed:', e)
      );

      return NextResponse.json({ success: true, message: `Email updated to ${newEmail}` });
    }

    if (parsed.data.type === 'password') {
      const { newPassword } = parsed.data;
      const hashedPassword = await bcrypt.hash(newPassword, 12);
      await prisma.user.update({ where: { id: userId }, data: { hashedPassword } });

      // Send new password to user
      sendPasswordChangedEmail(user.email, user.name, newPassword).catch(e =>
        console.error('[email] password-changed notification failed:', e)
      );

      return NextResponse.json({ success: true, message: 'Password has been reset successfully' });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[admin/users/[userId] PATCH]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
