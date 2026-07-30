import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

// GET /api/vendor/profile - The logged-in user's own company/contact details (self-service,
// not project-scoped — used by the post-invite "Complete your profile" step and can be
// reused by any authenticated user, not just VENDOR, since these are plain optional profile
// fields with no role-specific meaning).
export async function GET() {
  try {
    const auth = await requireAuth();

    const user = await prisma.user.findUnique({
      where: { id: auth.userId },
      select: { id: true, name: true, email: true, companyName: true, contactPerson: true, mobile: true, gstNumber: true, address: true },
    });

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor self-profile get error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/vendor/profile - Update the logged-in user's own company/contact details
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();

    const body = await request.json().catch(() => ({}));
    const fields = ['companyName', 'contactPerson', 'mobile', 'gstNumber', 'address'] as const;
    const data: Record<string, string | null> = {};
    for (const f of fields) {
      if (body[f] !== undefined) data[f] = (body[f] as string)?.trim() || null;
    }

    const user = await prisma.user.update({
      where: { id: auth.userId },
      data,
      select: { id: true, name: true, email: true, companyName: true, contactPerson: true, mobile: true, gstNumber: true, address: true },
    });

    return NextResponse.json({ success: true, data: user });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor self-profile update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
