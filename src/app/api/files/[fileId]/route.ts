import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { EvidenceService } from '@/services/EvidenceService';

// GET /api/files/[fileId] - Download evidence file
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

    const file = await EvidenceService.getFile(fileId);

    if (!file) {
      return NextResponse.json(
        { success: false, error: 'File not found' },
        { status: 404 }
      );
    }

    // Return file with proper headers - convert Buffer to Uint8Array for NextResponse
    return new NextResponse(new Uint8Array(file.buffer), {
      headers: {
        'Content-Type': file.mimeType,
        'Content-Disposition': `inline; filename="${file.fileName}"`,
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
