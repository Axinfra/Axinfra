import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { ShareService } from '@/services/ShareService';
import { buildChecklistPdfData } from '@/lib/pdf/buildChecklistPdfData';
import { generateChecklistPdf } from '@/lib/pdf/generateChecklistPdf';
import { fileStorage } from '@/lib/file-storage';

export const dynamic = 'force-dynamic';

interface ShareBody {
  method: 'EMAIL' | 'MESSAGE';
  emails?: string[];
  recipientIds?: string[];
  note?: string;
}

// POST /api/projects/[projectId]/checklists/[checklistId]/share
// Generates the checklist's PDF on the fly (same renderer as the download route) and shares it
// via email or as a direct message.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; checklistId: string }> },
) {
  try {
    const { projectId, checklistId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']);

    const checklist = await prisma.checklist.findFirst({ where: { id: checklistId, projectId }, select: { docRefNo: true, title: true } });
    if (!checklist) {
      return NextResponse.json({ success: false, error: 'Checklist not found' }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as ShareBody;

    const pdfData = await buildChecklistPdfData({ projectId, checklistId });
    const pdfBuffer = await generateChecklistPdf(pdfData);
    const fileName = `Checklist-${checklist.docRefNo}.pdf`;
    const storageKey = await fileStorage.save(`checklists/${projectId}/${checklistId}-share-${randomUUID()}.pdf`, pdfBuffer, 'application/pdf');
    const shareableFile = { storageKey, fileName, mimeType: 'application/pdf', fileSize: pdfBuffer.byteLength };

    if (body.method === 'EMAIL') {
      const emails = (body.emails ?? []).map((e) => e.trim()).filter(Boolean);
      const result = await ShareService.shareByEmail({
        senderName: auth.name,
        to: emails,
        subject: `Checklist ${checklist.docRefNo} — ${checklist.title} — shared from Axinfra`,
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
        note: body.note?.trim() || `Shared: Checklist ${checklist.docRefNo} — ${checklist.title}`,
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
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('Checklist share error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
