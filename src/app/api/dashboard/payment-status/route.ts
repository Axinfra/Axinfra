/**
 * GET /api/dashboard/payment-status
 * Returns payment status counts for the donut chart.
 *  - Pending  = NOT_DUE / DUE_PENDING_VERIFICATION / VERIFIED_NOT_ELIGIBLE
 *  - Approved = PARTIALLY_ELIGIBLE / FULLY_ELIGIBLE / MARKED_PAID
 *  - Disputed = BLOCKED
 *
 * Owner-only. Scope: all projects where the caller has OWNER role.
 */

import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { cached } from '@/lib/cache';
import { Role, EligibilityState } from '@/types';

export const dynamic = 'force-dynamic';

const PENDING_STATES: string[] = [
  EligibilityState.NOT_DUE,
  EligibilityState.DUE_PENDING_VERIFICATION,
  EligibilityState.VERIFIED_NOT_ELIGIBLE,
];
const APPROVED_STATES: string[] = [
  EligibilityState.PARTIALLY_ELIGIBLE,
  EligibilityState.FULLY_ELIGIBLE,
  EligibilityState.MARKED_PAID,
];
const DISPUTED_STATES: string[] = [EligibilityState.BLOCKED];

export async function GET() {
  try {
    const auth = await requireAuth();

    const data = await cached(
      `dashboard:payment-status:${auth.userId}`,
      120_000,
      async () => {
        const ownerProjects = await prisma.projectRole.findMany({
          where: { userId: auth.userId, role: Role.OWNER, project: { deletedAt: null } },
          select: { projectId: true },
        });
        const projectIds = ownerProjects.map((p) => p.projectId);
        if (projectIds.length === 0) return { pending: 0, approved: 0, disputed: 0, total: 0 };

        const eligibilities = await prisma.paymentEligibility.findMany({
          where: { milestone: { projectId: { in: projectIds } } },
          select: { state: true },
        });

        let pending = 0, approved = 0, disputed = 0;
        for (const e of eligibilities) {
          if (PENDING_STATES.includes(e.state)) pending += 1;
          else if (APPROVED_STATES.includes(e.state)) approved += 1;
          else if (DISPUTED_STATES.includes(e.state)) disputed += 1;
        }
        return { pending, approved, disputed, total: pending + approved + disputed };
      },
    );

    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[dashboard/payment-status]', err);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 },
    );
  }
}
