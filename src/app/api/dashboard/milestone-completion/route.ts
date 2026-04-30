/**
 * GET /api/dashboard/milestone-completion
 * Returns per-project milestone completion percentages for the bar chart.
 * Owner-only. Scope: all projects where the caller has OWNER role.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role, MilestoneState } from '@/types';

export const dynamic = 'force-dynamic';

const COMPLETED_STATES: string[] = [MilestoneState.VERIFIED, MilestoneState.CLOSED];

export async function GET() {
  try {
    const auth = await requireAuth();

    const ownerProjects = await prisma.projectRole.findMany({
      where: {
        userId: auth.userId,
        role: Role.OWNER,
        project: { deletedAt: null },
      },
      select: {
        project: {
          select: {
            id: true,
            name: true,
            milestones: { select: { state: true } },
          },
        },
      },
    });

    const items = ownerProjects.map(({ project }) => {
      const total = project.milestones.length;
      const completed = project.milestones.filter((m) =>
        COMPLETED_STATES.includes(m.state),
      ).length;
      const percent = total > 0 ? Math.round((completed / total) * 100) : 0;
      return {
        projectId: project.id,
        projectName: project.name,
        completed,
        total,
        percent,
      };
    });

    return NextResponse.json({ success: true, data: items });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[dashboard/milestone-completion]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
