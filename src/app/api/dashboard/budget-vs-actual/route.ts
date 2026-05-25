/**
 * GET /api/dashboard/budget-vs-actual
 * Returns per-project budget vs actual spend for the grouped bar chart.
 * Owner-only. Scope: all projects where the caller has OWNER role.
 *
 * Budget = sum of BOQ planned values across all BOQs in the project.
 * Actual = sum of paid eligibility amounts (what has actually been disbursed).
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { cached } from '@/lib/cache';
import { Role, EligibilityState } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const auth = await requireAuth();

    const result = await cached(
      `dashboard:budget-vs-actual:${auth.userId}`,
      120_000,
      async () => {
        const ownerProjects = await prisma.projectRole.findMany({
          where: {
            userId: auth.userId,
            role: Role.OWNER,
            project: { deletedAt: null },
          },
          select: { projectId: true, project: { select: { id: true, name: true } } },
        });

        const projectIds = ownerProjects.map((p) => p.projectId);
        if (projectIds.length === 0) return [];

        const [boqItems, paidEligibilities] = await Promise.all([
          prisma.bOQItem.findMany({
            where: { boq: { projectId: { in: projectIds } } },
            select: { plannedValue: true, boq: { select: { projectId: true } } },
          }),
          prisma.paymentEligibility.findMany({
            where: {
              milestone: { projectId: { in: projectIds } },
              state: EligibilityState.MARKED_PAID,
            },
            select: { eligibleAmount: true, milestone: { select: { projectId: true } } },
          }),
        ]);

        const budgetByProject = new Map<string, number>();
        for (const item of boqItems) {
          const pid = item.boq.projectId;
          budgetByProject.set(pid, (budgetByProject.get(pid) || 0) + item.plannedValue);
        }
        const actualByProject = new Map<string, number>();
        for (const elig of paidEligibilities) {
          const pid = elig.milestone.projectId;
          actualByProject.set(pid, (actualByProject.get(pid) || 0) + elig.eligibleAmount);
        }

        return ownerProjects.map(({ project }) => ({
          projectId: project.id,
          projectName: project.name,
          budgeted: Math.round(budgetByProject.get(project.id) || 0),
          actual: Math.round(actualByProject.get(project.id) || 0),
        }));
      },
    );

    return NextResponse.json({ success: true, data: result });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[dashboard/budget-vs-actual]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
