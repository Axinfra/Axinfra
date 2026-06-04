import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { EvidenceService } from '@/services/EvidenceService';

// GET /api/files/[fileId] - Download evidence file
// IDOR protection: verify the requesting user belongs to the project that owns this file
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ fileId: string }> }
) {
  try {
    const { fileId } = await params;
    const session = await getSession();

    if (!session) {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }

    // IDOR guard: verify file belongs to a project the user has access to
    const fileRecord = await prisma.evidenceFile.findUnique({
      where: { id: fileId },
      include: {
        evidence: {
          include: {
            milestone: {
              select: { projectId: true },
            },
          },
        },
      },
    });

    if (!fileRecord || !fileRecord.evidence?.milestone) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // Check if user has a role in the project that owns this file
    const projectRole = await prisma.projectRole.findFirst({
      where: {
        projectId: fileRecord.evidence.milestone.projectId,
        userId: session.userId,
      },
    });

    if (!projectRole) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // Cloud storage (Vercel Blob): redirect the browser directly to the CDN URL
    // to avoid proxying the file through the serverless function.
    const blobUrl = fileRecord.filePath || fileRecord.storageKey;
    if (blobUrl?.startsWith('https://')) {
      let downloadUrl = blobUrl;
      if (!blobUrl.includes('.public.blob.vercel-storage.com')) {
        const { getDownloadUrl } = await import('@vercel/blob');
        downloadUrl = await getDownloadUrl(blobUrl);
      }
      return NextResponse.redirect(downloadUrl);
    }

    // Local disk (development): proxy through the function
    const file = await EvidenceService.getFile(fileId);

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }
    const contentType = file.mimeType || 'application/octet-stream';
    const safeName = encodeURIComponent(file.fileName).replace(/'/g, '%27');
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': contentType,
        'Content-Disposition': `inline; filename*=UTF-8''${safeName}`,
        'Content-Length': file.buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    console.error('File download error:', error);

    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
