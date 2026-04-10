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

    const file = await EvidenceService.getFile(fileId);

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }
    const safeFileName = file.fileName.replace(/[^\x20-\x7E]/g, "_");
    // Return file with proper headers - convert Buffer to Uint8Array for NextResponse
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `inline; filename="${safeFileName}"`,
        'Content-Length': file.buffer.length.toString(),
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
