import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { buildDPRPdfData } from '@/lib/pdf/buildDPRPdfData';
import { generateDPRPdf } from '@/lib/pdf/generateDPRPdf';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/dpr/[dprId]/pdf
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; dprId: string }> },
) {
  try {
    const { projectId, dprId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']);

    const dpr = await prisma.dailyProgressReport.findFirst({ where: { id: dprId, projectId }, select: { docRefNo: true } });
    if (!dpr) {
      return NextResponse.json({ success: false, error: 'DPR not found' }, { status: 404 });
    }

    const pdfData = await buildDPRPdfData({ projectId, dprId });
    const pdfBuffer = await generateDPRPdf(pdfData);

    const filename = `DPR-${dpr.docRefNo}.pdf`;
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
    console.error('DPR PDF generation error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
