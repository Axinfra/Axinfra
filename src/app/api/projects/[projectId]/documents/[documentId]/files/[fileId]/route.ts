import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { fileStorage, getFileRedirectUrl } from '@/lib/file-storage';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/documents/[documentId]/files/[fileId] - serve/download,
// matches architecture/drawing-files/[versionId]'s pattern exactly.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string; fileId: string }> },
) {
  try {
    const { projectId, documentId, fileId } = await params;
    await requireProjectAuth(projectId);

    const file = await prisma.projectDocumentFile.findFirst({
      where: { id: fileId, documentId, document: { projectId, deletedAt: null } },
    });
    if (!file) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const redirectUrl = await getFileRedirectUrl(file.filePath);
    if (redirectUrl) return NextResponse.redirect(redirectUrl);

    const buffer = await fileStorage.read(file.filePath);
    if (!buffer) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const safeName = encodeURIComponent(file.fileName).replace(/'/g, '%27');
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `attachment; filename*=UTF-8''${safeName}`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Document file download error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
