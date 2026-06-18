import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);

    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [
      totalUsers,
      newUsers30d,
      roleDistributionRaw,
      totalProjects,
      activeProjects,
      newProjects30d,
      projectsByStatus,
      milestonesByState,
      openFollowUps,
      escalatedFollowUps,
      totalMilestones,
      recentUsers,
      recentProjects,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: thirtyDaysAgo } } }),
      prisma.$queryRaw<{ role: string; count: bigint }[]>`
        SELECT role, COUNT(DISTINCT id) as count FROM (
          SELECT role, "userId" AS id FROM "ProjectRole"
          UNION ALL
          SELECT "preferredRole" AS role, id FROM "User"
          WHERE "preferredRole" IS NOT NULL
          AND id NOT IN (SELECT DISTINCT "userId" FROM "ProjectRole")
        ) combined
        GROUP BY role
      `,
      prisma.project.count({ where: { deletedAt: null } }),
      prisma.project.count({ where: { deletedAt: null, status: 'ONGOING' } }),
      prisma.project.count({ where: { deletedAt: null, createdAt: { gte: thirtyDaysAgo } } }),
      prisma.project.groupBy({ by: ['status'], _count: { _all: true }, where: { deletedAt: null } }),
      prisma.milestone.groupBy({ by: ['state'], _count: { _all: true } }),
      prisma.followUp.count({ where: { status: 'OPEN' } }),
      prisma.followUp.count({ where: { status: 'ESCALATED' } }),
      prisma.milestone.count(),
      prisma.user.findMany({
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: { id: true, name: true, email: true, createdAt: true },
      }),
      prisma.project.findMany({
        where: { deletedAt: null },
        orderBy: { createdAt: 'desc' },
        take: 6,
        select: {
          id: true,
          name: true,
          status: true,
          createdAt: true,
          isExampleProject: true,
          _count: { select: { roles: true, milestones: true } },
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        users: { total: totalUsers, new30Days: newUsers30d },
        roleDistribution: Object.fromEntries(roleDistributionRaw.map((r) => [r.role, Number(r.count)])),
        projects: {
          total: totalProjects,
          active: activeProjects,
          new30Days: newProjects30d,
          byStatus: Object.fromEntries(projectsByStatus.map((p) => [p.status, p._count._all])),
        },
        milestones: {
          total: totalMilestones,
          byState: Object.fromEntries(milestonesByState.map((m) => [m.state, m._count._all])),
        },
        followUps: { open: openFollowUps, escalated: escalatedFollowUps },
        recentUsers,
        recentProjects,
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    console.error('[admin/stats]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
