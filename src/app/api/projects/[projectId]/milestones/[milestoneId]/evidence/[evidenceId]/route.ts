import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

// GET /api/projects/[projectId]/milestones/[milestoneId]/evidence/[evidenceId] - Get evidence details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string; evidenceId: string }> }
) {
  try {
    const { projectId, evidenceId } = await params;
    await requireProjectAuth(projectId);

    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: {
        files: true,
        submittedBy: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        milestone: {
          select: {
            id: true,
            title: true,
            state: true,
          },
        },
      },
    });

    if (!evidence) {
      return NextResponse.json(
        { success: false, error: 'Evidence not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: evidence });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Evidence get error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
