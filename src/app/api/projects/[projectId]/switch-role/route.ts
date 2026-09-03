git checkout feature/multi-role-per-projectimport { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth, getMyProjectRoles, SESSION_COOKIE_MAX_AGE_SECONDS } from '@/lib/auth';

const switchRoleSchema = z.object({
  role: z.enum(['CLIENT', 'PMC', 'VENDOR', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']),
});

// POST /api/projects/[projectId]/switch-role - Set which of the caller's roles on this
// project is active for this browser (activeRole_<projectId> cookie, read by
// getProjectAuth()). Only ever lets someone switch into a role they actually hold — this is
// a UI convenience, not a privilege grant.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireAuth();

    const body = await request.json();
    const { role } = switchRoleSchema.parse(body);

    const heldRoles = await getMyProjectRoles(projectId);
    if (!heldRoles.includes(role)) {
      return NextResponse.json(
        { success: false, error: `You do not hold the ${role} role on this project.` },
        { status: 403 }
      );
    }

    const response = NextResponse.json({ success: true, data: { role } });
    response.cookies.set(`activeRole_${projectId}`, role, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: SESSION_COOKIE_MAX_AGE_SECONDS,
      path: '/',
    });
    return response;
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    console.error('Switch role error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
