import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/architecture — overview stats
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const isVendor = auth.role === 'VENDOR';

    // Vendor only sees approved rows from approved sets
    const [sets, rows] = await Promise.all([
      isVendor
        ? prisma.drawingSet.findMany({
            where: { projectId, status: 'APPROVED' },
            select: { id: true, status: true },
          })
        : prisma.drawingSet.findMany({
            where: { projectId },
            select: { id: true, status: true },
          }),
      isVendor
        ? prisma.drawingRow.findMany({
            where: { projectId, status: 'APPROVED', set: { status: 'APPROVED' } },
            select: { id: true, status: true },
          })
        : prisma.drawingRow.findMany({
            where: { projectId },
            select: { id: true, status: true },
          }),
    ]);

    const setsTotal = sets.length;
    const setsApproved = sets.filter((s) => s.status === 'APPROVED' || s.status === 'PAID').length;
    const setsPaid = sets.filter((s) => s.status === 'PAID').length;

    const rowsTotal = rows.length;
    const rowsPending = rows.filter((r) => r.status === 'PENDING').length;
    const rowsSubmitted = rows.filter((r) => r.status === 'SUBMITTED').length;
    const rowsApproved = rows.filter((r) => r.status === 'APPROVED').length;
    const rowsRejected = rows.filter((r) => r.status === 'REJECTED').length;

    // Pending review count (versions PENDING review)
    const pendingReview = isVendor ? 0 : await prisma.drawingVersion.count({
      where: {
        drawingRow: { projectId },
        reviewStatus: 'PENDING',
        isCurrent: true,
      },
    });

    return NextResponse.json({
      success: true,
      data: {
        sets: { total: setsTotal, approved: setsApproved, paid: setsPaid },
        rows: { total: rowsTotal, pending: rowsPending, submitted: rowsSubmitted, approved: rowsApproved, rejected: rowsRejected },
        pendingReview,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Architecture overview error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
