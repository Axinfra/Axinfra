import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { buildChecklistPdfData } from '@/lib/pdf/buildChecklistPdfData';
import { generateChecklistPdf } from '@/lib/pdf/generateChecklistPdf';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/checklists/[checklistId]/pdf
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; checklistId: string }> },
) {
  try {
    const { projectId, checklistId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']);

    const checklist = await prisma.checklist.findFirst({ where: { id: checklistId, projectId }, select: { docRefNo: true } });
    if (!checklist) {
      return NextResponse.json({ success: false, error: 'Checklist not found' }, { status: 404 });
    }

    const pdfData = await buildChecklistPdfData({ projectId, checklistId });
    const pdfBuffer = await generateChecklistPdf(pdfData);

    const filename = `Checklist-${checklist.docRefNo}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('Checklist PDF generation error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
