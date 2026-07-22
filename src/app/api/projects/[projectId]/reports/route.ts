import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { ReportService } from '@/services/ReportService';
import { resolveReportPeriod, type ReportPeriodType } from '@/lib/reportPeriod';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/reports?type=WEEK|MONTH&date=YYYY-MM-DD&month=YYYY-MM
// JSON preview of the same data the PDF is built from — powers the on-screen report page.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']);

    const { searchParams } = new URL(request.url);
    const type: ReportPeriodType = searchParams.get('type') === 'MONTH' ? 'MONTH' : 'WEEK';
    const dateOrMonth = type === 'MONTH' ? searchParams.get('month') : searchParams.get('date');
    const period = resolveReportPeriod(type, dateOrMonth);

    const data = await ReportService.buildProjectReportData(projectId, period);
    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('Project report error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
