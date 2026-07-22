import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { buildProjectReportPdfData } from '@/lib/pdf/buildProjectReportPdfData';
import { generateProjectReportPdf } from '@/lib/pdf/generateProjectReportPdf';
import { resolveReportPeriod, type ReportPeriodType } from '@/lib/reportPeriod';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/reports/pdf?type=WEEK|MONTH&date=YYYY-MM-DD&month=YYYY-MM
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']);

    const project = await prisma.project.findUnique({ where: { id: projectId }, select: { name: true } });
    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const { searchParams } = new URL(request.url);
    const type: ReportPeriodType = searchParams.get('type') === 'MONTH' ? 'MONTH' : 'WEEK';
    const dateOrMonth = type === 'MONTH' ? searchParams.get('month') : searchParams.get('date');
    const period = resolveReportPeriod(type, dateOrMonth);

    const pdfData = await buildProjectReportPdfData({ projectId, period });
    const pdfBuffer = await generateProjectReportPdf(pdfData);

    const safeProjectName = project.name.replace(/[^a-zA-Z0-9-_]+/g, '_');
    const periodSlug = period.type === 'WEEK' ? period.start.toISOString().slice(0, 10) : period.label.replace(/\s+/g, '_');
    const filename = `Report-${safeProjectName}-${periodSlug}.pdf`;

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
    console.error('Project report PDF generation error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
