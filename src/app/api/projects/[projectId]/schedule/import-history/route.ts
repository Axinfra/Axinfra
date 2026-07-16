import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/schedule/import-history
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const imports = await prisma.scheduleImport.findMany({
      where: { projectId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true, fileName: true, sourceFormat: true, status: true, errorMessage: true,
        phasesFound: true, milestonesFound: true, dependenciesFound: true, resourcesFound: true,
        parsedAt: true, confirmedAt: true, createdAt: true,
        uploadedBy: { select: { name: true } },
      },
    });

    return NextResponse.json({ success: true, data: imports });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[schedule/import-history]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
