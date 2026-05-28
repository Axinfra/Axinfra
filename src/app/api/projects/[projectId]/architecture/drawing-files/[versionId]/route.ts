import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { fileStorage } from '@/lib/file-storage';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/architecture/drawing-files/[versionId]
// Serves uploaded drawing PDFs with project-level authorization.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; versionId: string }> }
) {
  try {
    const { projectId, versionId } = await params;
    const auth = await requireProjectAuth(projectId);
    const download = request.nextUrl.searchParams.get('download') === '1';

    const version = await prisma.drawingVersion.findFirst({
      where: {
        id: versionId,
        uploadType: 'PDF',
        drawingRow: {
          projectId,
          ...(auth.role === 'VENDOR' ? { status: 'APPROVED', set: { status: 'APPROVED' } } : {}),
        },
        ...(auth.role === 'VENDOR' ? { reviewStatus: 'APPROVED', isCurrent: true } : {}),
      },
      include: {
        drawingRow: { select: { name: true } },
      },
    });

    if (!version) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const buffer = await fileStorage.read(version.fileUrl);
    if (!buffer) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const fallbackName = `${version.drawingRow.name}-v${version.versionNumber}.pdf`;
    const safeFileName = (version.fileName ?? fallbackName).replace(/[^\x20-\x7E]/g, '_');

    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${safeFileName}"`,
        'Content-Length': buffer.length.toString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Drawing file download error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
