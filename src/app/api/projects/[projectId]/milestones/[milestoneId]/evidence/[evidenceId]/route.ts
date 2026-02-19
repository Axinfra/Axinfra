import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { validateEvidenceOwnership } from '@/lib/validate-ownership';

// GET /api/projects/[projectId]/milestones/[milestoneId]/evidence/[evidenceId] - Get evidence details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string; evidenceId: string }> }
) {
  try {
    const { projectId, evidenceId } = await params;
    await requireProjectAuth(projectId);

    // IDOR guard: verify evidence belongs to this project via milestone→projectId
    const ownershipCheck = await validateEvidenceOwnership(evidenceId, projectId);
    if (!ownershipCheck) {
      return NextResponse.json(
        { success: false, error: 'Evidence not found' },
        { status: 404 }
      );
    }

    const evidence = await prisma.evidence.findUnique({
      where: { id: evidenceId },
      include: {
        files: {
          select: {
            id: true,
            storageKey: true,
            fileName: true,
            mimeType: true,
            size: true,
            createdAt: true,
            // NOTE: intentionally excludes 'data' (binary blob) from response
          },
        },
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
