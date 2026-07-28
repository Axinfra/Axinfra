/**
 * GET /api/vendor/variances
 *
 * RA Bills where the Site Engineer edited the vendor's claimed quantities before forwarding
 * to PMC — i.e. `siteEngineerReviewedValue` differs from the vendor's own `submittedValue`.
 * Gives the vendor a single place to see exactly where and by how much their claims were
 * adjusted, instead of having to open each bill individually to spot the difference.
 *
 * Paginated the same way as the other vendor list endpoints — `limit`/`offset` opt-in.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role } from '@/types';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const { searchParams } = new URL(request.url);
    const rawLimit = searchParams.get('limit');
    const rawOffset = searchParams.get('offset');
    const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10), 1), 100) : undefined;
    const offset = rawOffset ? Math.max(parseInt(rawOffset, 10), 0) : 0;

    const vendorRoles = await prisma.projectRole.findMany({
      where: { userId: auth.userId, role: Role.VENDOR, project: { deletedAt: null } },
      select: { projectId: true },
    });
    if (vendorRoles.length === 0) {
      return NextResponse.json(
        { success: false, error: 'You are not assigned as a vendor to any active project.' },
        { status: 403 }
      );
    }
    const projectIds = vendorRoles.map((r) => r.projectId);

    // A bill only counts as a "variance" once the Site Engineer has actually reviewed it AND
    // the reviewed value differs from what the vendor originally claimed — an unedited
    // forward-through isn't a variance worth surfacing.
    const where = {
      order: { vendorUserId: auth.userId },
      projectId: { in: projectIds },
      siteEngineerReviewedAt: { not: null },
      submittedValue: { not: null },
    };

    // "Reviewed value differs from submitted value" isn't expressible as a Prisma where clause
    // (comparing two columns on the same row), so fetch every reviewed bill for this vendor —
    // a bounded, small set in practice — and filter/paginate in JS.
    const bills = await prisma.rABill.findMany({
      where,
      include: {
        project: { select: { id: true, name: true } },
        order: { select: { id: true, name: true } },
        siteEngineerReviewedBy: { select: { name: true } },
      },
      orderBy: { siteEngineerReviewedAt: 'desc' },
    });

    const variances = bills
      .filter((b) => b.siteEngineerReviewedValue !== null && b.siteEngineerReviewedValue !== b.submittedValue)
      .map((b) => {
        const submitted = b.submittedValue ?? 0;
        const reviewed = b.siteEngineerReviewedValue ?? 0;
        const delta = reviewed - submitted;
        return {
          id: b.id,
          billNumber: b.billNumber,
          status: b.status,
          projectId: b.project.id,
          projectName: b.project.name,
          orderId: b.order.id,
          orderName: b.order.name,
          submittedValue: submitted,
          siteEngineerReviewedValue: reviewed,
          delta,
          deltaPct: submitted !== 0 ? (delta / submitted) * 100 : 0,
          siteEngineerRemarks: b.siteEngineerRemarks,
          siteEngineerReviewedByName: b.siteEngineerReviewedBy?.name ?? null,
          siteEngineerReviewedAt: b.siteEngineerReviewedAt,
        };
      });

    const paged = limit !== undefined ? variances.slice(offset, offset + limit) : variances;

    return NextResponse.json({ success: true, data: paged, total: variances.length });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor variances list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
