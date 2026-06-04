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

    const buffer = await fileStorage.read(file.storageKey);
    if (!buffer) return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });

    const download = request.nextUrl.searchParams.get('download') === '1';
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="${file.fileName}"`,
        'Content-Length': String(buffer.length),
        'Cache-Control': 'private, max-age=3600',
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
