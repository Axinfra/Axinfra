import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

// GET /api/directory — platform-wide roster of every Vendor/Consultant across all projects,
// so PMC/Client/Owner can browse and reach out to onboard them for new work. Deliberately not
// project-scoped (unlike everything else in this app), since the whole point is looking
// beyond a single project's assigned roles — gated instead on "does this user hold CLIENT or
// PMC on at least one project," checked directly rather than via RoleGuard/ProjectAuthContext
// since those are both built around a single projectId.
export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }

    const hasAccess = await prisma.projectRole.findFirst({
      where: { userId: session.userId, role: { in: ['CLIENT', 'PMC'] } },
    });
    if (!hasAccess) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }

    const vendorConsultantIds = await prisma.projectRole.findMany({
      where: { role: { in: ['VENDOR', 'CONSULTANT'] } },
      select: { userId: true },
      distinct: ['userId'],
    });

    const users = await prisma.user.findMany({
      where: { id: { in: vendorConsultantIds.map((v) => v.userId) } },
      select: {
        id: true,
        name: true,
        email: true,
        mobile: true,
        companyName: true,
        contactPerson: true,
        address: true,
        createdAt: true,
        projectRoles: {
          where: { role: { in: ['VENDOR', 'CONSULTANT'] } },
          select: { role: true, createdAt: true, project: { select: { id: true, name: true, status: true } } },
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { name: 'asc' },
    });

    const data = users.map((u) => {
      const roleTypes = Array.from(new Set(u.projectRoles.map((pr) => pr.role)));
      return {
        id: u.id,
        name: u.name,
        email: u.email,
        mobile: u.mobile,
        companyName: u.companyName,
        contactPerson: u.contactPerson,
        address: u.address,
        memberSince: u.createdAt,
        roleTypes,
        projects: u.projectRoles.map((pr) => ({
          projectId: pr.project.id,
          projectName: pr.project.name,
          projectStatus: pr.project.status,
          role: pr.role,
          since: pr.createdAt,
        })),
      };
    });

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('Directory list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
