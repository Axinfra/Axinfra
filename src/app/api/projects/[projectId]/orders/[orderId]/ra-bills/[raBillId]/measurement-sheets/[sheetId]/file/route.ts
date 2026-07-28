import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { fileStorage, getFileRedirectUrl } from '@/lib/file-storage';

export const dynamic = 'force-dynamic';

// GET .../ra-bills/[raBillId]/measurement-sheets/[sheetId]/file
// Serves a Site Engineer-uploaded measurement sheet. Readable by CLIENT/PMC/CONSULTANT/
// SITE_ENGINEER/VIEWER, or the assigned vendor — same visibility as the RA Bill detail itself.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string; raBillId: string; sheetId: string }> }
) {
  try {
    const { projectId, raBillId, sheetId } = await params;
    const auth = await requireProjectAuth(projectId);
    const download = request.nextUrl.searchParams.get('download') === '1';

    const sheet = await prisma.rABillMeasurementSheet.findFirst({
      where: { id: sheetId, raBillId, raBill: { projectId } },
      include: { raBill: { include: { order: { select: { vendorUserId: true } } } } },
    });

    if (!sheet) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }
    if (auth.role === 'VENDOR' && sheet.raBill.order.vendorUserId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    // Cloud storage: redirect to a browser-accessible URL (presigned for private blobs).
    const redirectUrl = await getFileRedirectUrl(sheet.storageKey);
    if (redirectUrl) return NextResponse.redirect(redirectUrl);

    // Local disk (development): proxy through the function
    const buffer = await fileStorage.read(sheet.storageKey);
    if (!buffer) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const safeName = encodeURIComponent(sheet.fileName).replace(/'/g, '%27');
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': sheet.mimeType || 'application/octet-stream',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${safeName}`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('RA Bill measurement sheet download error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
