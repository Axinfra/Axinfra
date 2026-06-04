import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { fileStorage } from '@/lib/file-storage';

export const dynamic = 'force-dynamic';

// GET — Serve a vendor request attachment
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; requestId: string; fileId: string }> }
) {
  try {
    const { projectId, requestId, fileId } = await params;
    await requireProjectAuth(projectId);

    const file = await prisma.vendorRequestFile.findFirst({
      where: { id: fileId, requestId, request: { projectId } },
    });
    if (!file) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    // Cloud storage (Vercel Blob): redirect the browser directly to the CDN URL.
    // This avoids proxying the file through the serverless function (double bandwidth,
    // function timeout on large files). Auth is already enforced above.
    if (file.storageKey.startsWith('https://')) {
      let downloadUrl = file.storageKey;
      // Private blobs (uploaded before the public-access fix) need a signed URL
      if (!file.storageKey.includes('.public.blob.vercel-storage.com')) {
        const { getDownloadUrl } = await import('@vercel/blob');
        downloadUrl = await getDownloadUrl(file.storageKey);
      }
      return NextResponse.redirect(downloadUrl);
    }

    // Local disk (development): proxy through the function
    const buffer = await fileStorage.read(file.storageKey);
    if (!buffer) return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });

    const contentType = file.mimeType || 'application/octet-stream';
    const safeName = encodeURIComponent(file.fileName).replace(/'/g, '%27');
    const disposition = request.nextUrl.searchParams.get('download') === '1' ? 'attachment' : 'inline';

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `${disposition}; filename*=UTF-8''${safeName}`,
        'Content-Length': String(buffer.byteLength),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[vendor-request file serve]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
