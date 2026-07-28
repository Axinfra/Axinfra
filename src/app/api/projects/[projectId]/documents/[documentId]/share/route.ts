import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { ShareService } from '@/services/ShareService';

export const dynamic = 'force-dynamic';

interface ShareBody {
  method: 'EMAIL' | 'MESSAGE';
  emails?: string[];
  recipientIds?: string[];
  note?: string;
}

// POST /api/projects/[projectId]/documents/[documentId]/share
// Shares this document's (first) file via email or as a direct message, without re-uploading —
// reuses the file already stored for it.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; documentId: string }> },
) {
  try {
    const { projectId, documentId } = await params;
    const auth = await requireProjectAuth(projectId);

    const document = await prisma.projectDocument.findFirst({
      where: { id: documentId, projectId, deletedAt: null },
      include: { files: { take: 1 } },
    });
    if (!document) {
      return NextResponse.json({ success: false, error: 'Document not found' }, { status: 404 });
    }
    const file = document.files[0];
    if (!file) {
      return NextResponse.json({ success: false, error: 'This document has no file to share' }, { status: 400 });
    }

    const body = (await request.json().catch(() => ({}))) as ShareBody;
    const shareableFile = { storageKey: file.filePath, fileName: file.fileName, mimeType: file.mimeType, fileSize: file.size };

    if (body.method === 'EMAIL') {
      const emails = (body.emails ?? []).map((e) => e.trim()).filter(Boolean);
      const result = await ShareService.shareByEmail({
        senderName: auth.name,
        to: emails,
        subject: `${document.title} — shared from Axinfra`,
        note: body.note?.trim() || undefined,
        file: shareableFile,
      });
      if (!result.success) return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    if (body.method === 'MESSAGE') {
      const recipientIds = body.recipientIds ?? [];
      const result = await ShareService.shareByMessage({
        projectId,
        senderId: auth.userId,
        recipientIds,
        note: body.note?.trim() || `Shared: ${document.title}`,
        file: shareableFile,
      });
      if (!result.success) return NextResponse.json({ success: false, error: result.error ?? 'Failed to send to some recipients' }, { status: 400 });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ success: false, error: 'Invalid share method' }, { status: 400 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Document share error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
