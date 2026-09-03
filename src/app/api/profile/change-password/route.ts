import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { sendPasswordChangedConfirmationEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters').max(128),
});

// POST /api/profile/change-password — the logged-in user changes their own password, knowing
// their current one (as opposed to /api/auth/forgot-password, which is for when they don't).
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const body = await request.json();
    const { currentPassword, newPassword } = changePasswordSchema.parse(body);

    const user = await prisma.user.findUnique({ where: { id: auth.userId } });
    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }
    if (!user.hashedPassword) {
      return NextResponse.json(
        { success: false, error: 'This account uses Google sign-in and has no password to change.' },
        { status: 400 },
      );
    }

    const currentValid = await bcrypt.compare(currentPassword, user.hashedPassword);
    if (!currentValid) {
      return NextResponse.json({ success: false, error: 'Current password is incorrect.' }, { status: 401 });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { id: user.id }, data: { hashedPassword } });

    sendPasswordChangedConfirmationEmail(user.email, user.name).catch((err) =>
      console.error('Failed to send password-changed confirmation email:', err),
    );

    return NextResponse.json({ success: true, data: { message: 'Password changed successfully.' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0].message }, { status: 400 });
    }
    console.error('Change password error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
