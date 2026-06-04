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

    // VENDOR: can view overview stats (counts only — no sensitive cost data)

    const [sets, rows] = await Promise.all([
      prisma.drawingSet.findMany({ where: { projectId }, select: { id: true, status: true } }),
      prisma.drawingRow.findMany({ where: { projectId }, select: { id: true, status: true } }),
    ]);

    const setsTotal = sets.length;
    const setsApproved = sets.filter((s) => s.status === 'APPROVED' || s.status === 'PAID').length;
    const setsPaid = sets.filter((s) => s.status === 'PAID').length;

    const rowsTotal = rows.length;
    const rowsPending = rows.filter((r) => r.status === 'PENDING').length;
    const rowsSubmitted = rows.filter((r) => r.status === 'SUBMITTED').length;
    const rowsApproved = rows.filter((r) => r.status === 'APPROVED').length;
    const rowsRejected = rows.filter((r) => r.status === 'REJECTED').length;

    const pendingReview = await prisma.drawingVersion.count({
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
