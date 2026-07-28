import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { fileStorage, getFileRedirectUrl } from '@/lib/file-storage';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/messages/attachments/[attachmentId]
// Serves a file attached to a direct message. Readable only by the message's sender or
// recipient — direct messages are private between the two participants, unlike RA Bill/Work
// Order attachments which every project member can see.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; attachmentId: string }> },
) {
  try {
    const { projectId, attachmentId } = await params;
    const auth = await requireProjectAuth(projectId);
    const download = request.nextUrl.searchParams.get('download') === '1';

    const attachment = await prisma.messageAttachment.findFirst({
      where: { id: attachmentId, message: { projectId } },
      include: { message: { select: { senderId: true, recipientId: true } } },
    });

    if (!attachment) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }
    if (attachment.message.senderId !== auth.userId && attachment.message.recipientId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const redirectUrl = await getFileRedirectUrl(attachment.storageKey);
    if (redirectUrl) return NextResponse.redirect(redirectUrl);

    const buffer = await fileStorage.read(attachment.storageKey);
    if (!buffer) {
      return NextResponse.json({ success: false, error: 'File not found' }, { status: 404 });
    }

    const safeName = encodeURIComponent(attachment.fileName).replace(/'/g, '%27');
    return new NextResponse(new Uint8Array(buffer), {
      headers: {
        'Content-Type': attachment.mimeType || 'application/octet-stream',
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${safeName}`,
        'Content-Length': buffer.byteLength.toString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Message attachment download error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
