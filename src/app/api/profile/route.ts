import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

const patchSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  companyName: z.string().trim().max(200).optional().nullable(),
  contactPerson: z.string().trim().max(200).optional().nullable(),
  mobile: z.string().trim().max(30).optional().nullable(),
  gstNumber: z.string().trim().max(20).optional().nullable(),
  address: z.string().trim().max(500).optional().nullable(),
});

const PROFILE_SELECT = {
  id: true,
  name: true,
  email: true,
  companyName: true,
  contactPerson: true,
  mobile: true,
  gstNumber: true,
  address: true,
  createdAt: true,
} as const;

/** A profile is "complete" once the fields a vendor needs to appear on a tax invoice / Work
 * Order are filled in. GST is the hard requirement (enforced server-side at RA Bill submission
 * and Work Order issuance); company/contact/mobile are strongly recommended but not blocking. */
function isProfileComplete(user: { gstNumber: string | null }): boolean {
  return !!user.gstNumber?.trim();
}

// GET /api/profile - the logged-in user's own profile + project memberships
export async function GET() {
  try {
    const auth = await requireAuth();

    const [user, projectRoles] = await Promise.all([
      prisma.user.findUnique({ where: { id: auth.userId }, select: PROFILE_SELECT }),
      prisma.projectRole.findMany({
        where: { userId: auth.userId, project: { deletedAt: null } },
        select: { role: true, project: { select: { id: true, name: true, status: true } } },
        orderBy: { project: { createdAt: 'desc' } },
      }),
    ]);

    if (!user) {
      return NextResponse.json({ success: false, error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        ...user,
        isVendor: projectRoles.some((r) => r.role === 'VENDOR'),
        isProfileComplete: isProfileComplete(user),
        projects: projectRoles.map((r) => ({
          projectId: r.project.id,
          projectName: r.project.name,
          projectStatus: r.project.status,
          role: r.role,
        })),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Profile get error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/profile - update the logged-in user's own profile
export async function PATCH(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const body = await request.json().catch(() => ({}));
    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors[0].message }, { status: 400 });
    }

    const data: Record<string, string | null> = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    const optionalFields = ['companyName', 'contactPerson', 'mobile', 'gstNumber', 'address'] as const;
    for (const field of optionalFields) {
      const value = parsed.data[field];
      if (value === undefined) continue;
      data[field] = value || null;
    }

    const updated = await prisma.user.update({
      where: { id: auth.userId },
      data,
      select: PROFILE_SELECT,
    });

    return NextResponse.json({
      success: true,
      data: { ...updated, isProfileComplete: isProfileComplete(updated) },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Profile update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
