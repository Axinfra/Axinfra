import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { fileStorage, getFileRedirectUrl } from '@/lib/file-storage';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/schedule/import/[importId]/download
// Re-serves the originally uploaded schedule file (satisfies "download the .mpp file"
// when the original upload was .mpp — no need to generate one, just serve the stored bytes).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; importId: string }> }
) {
  try {
    const { projectId, importId } = await params;
    await requireProjectAuth(projectId);

    const record = await prisma.scheduleImport.findFirst({ where: { id: importId, projectId } });
    if (!record) {
      return NextResponse.json({ success: false, error: 'Import not found' }, { status: 404 });
    }

    const redirectUrl = await getFileRedirectUrl(record.storageKey);
    if (redirectUrl) return NextResponse.redirect(redirectUrl);

    const buffer = await fileStorage.read(record.storageKey);
    if (!buffer) {
      return NextResponse.json({ success: false, error: 'File not found in storage' }, { status: 404 });
    }
    const safeName = encodeURIComponent(record.fileName).replace(/'/g, '%27');
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': record.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${safeName}`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[schedule/import/download]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
