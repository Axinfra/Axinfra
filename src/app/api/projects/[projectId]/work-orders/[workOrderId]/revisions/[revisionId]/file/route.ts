import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { fileStorage, getFileRedirectUrl } from '@/lib/file-storage';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/work-orders/[workOrderId]/revisions/[revisionId]/file
// Serves the uploaded Work Order revision file. Readable by CLIENT/PMC/CONSULTANT, or the
// assigned vendor.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; workOrderId: string; revisionId: string }> }
) {
  try {
    const { projectId, workOrderId, revisionId } = await params;
    const auth = await requireProjectAuth(projectId);
    const download = request.nextUrl.searchParams.get('download') === '1';

    const revision = await prisma.workOrderRevision.findFirst({
      where: { id: revisionId, workOrderId, workOrder: { projectId } },
      include: { workOrder: { include: { order: { select: { vendorUserId: true } } } } },
    });

    if (!revision) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }
    if (auth.role === 'VENDOR' && revision.workOrder.order.vendorUserId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    // Cloud storage: redirect to a browser-accessible URL (presigned for private blobs).
    const redirectUrl = await getFileRedirectUrl(revision.storageKey);
    if (redirectUrl) return NextResponse.redirect(redirectUrl);

    // Local disk (development): proxy through the function
    const buffer = await fileStorage.read(revision.storageKey);
    if (!buffer) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const safeName = encodeURIComponent(revision.fileName).replace(/'/g, '%27');
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': revision.mimeType || 'application/octet-stream',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${safeName}`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Work order file download error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
