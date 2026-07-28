import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RABillService } from '@/services/RABillService';

// GET /api/projects/[projectId]/ra-bills - Project-wide, paginated RA Bill list
// `limit`/`offset` are opt-in (omitting them returns every RA Bill for the project).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const { searchParams } = new URL(request.url);
    const orderId = searchParams.get('orderId') || undefined;
    // Repeatable — e.g. ?status=PENDING_VENDOR_REVIEW&status=CERTIFIED for a combined
    // "waiting on me" queue (PMC's default view) rather than one exact status match.
    const statusValues = searchParams.getAll('status').filter(Boolean);
    const status = statusValues.length > 1 ? statusValues : statusValues[0] || undefined;
    const rawLimit = searchParams.get('limit');
    const rawOffset = searchParams.get('offset');
    const limit = rawLimit ? Math.min(Math.max(parseInt(rawLimit, 10), 1), 200) : undefined;
    const offset = rawOffset ? Math.max(parseInt(rawOffset, 10), 0) : 0;
    // A project can have several Purchase Orders assigned to different vendors — a vendor
    // only ever sees their own bills here, never another vendor's sharing the same project.
    const vendorUserId = auth.role === 'VENDOR' ? auth.userId : undefined;

    const { raBills, total, summary } = await RABillService.getForProject(projectId, { orderId, status, limit, offset, vendorUserId });

    return NextResponse.json(
      { success: true, data: { raBills, total, summary } },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('RA Bill project list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
