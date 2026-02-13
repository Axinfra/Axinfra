import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { EvidenceService } from '@/services/EvidenceService';
import { z } from 'zod';

const reviewSchema = z.object({
  action: z.enum(['APPROVE', 'REJECT']),
  note: z.string().optional(),
});

// POST /api/projects/[projectId]/milestones/[milestoneId]/evidence/[evidenceId]/review
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string; evidenceId: string }> }
) {
  try {
    const { projectId, evidenceId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only Owner and PMC can review evidence
    RoleGuard.requireRole(auth, ['OWNER', 'PMC']);

    const body = await request.json();
    const { action, note } = reviewSchema.parse(body);

    // Rejection requires reason
    if (action === 'REJECT' && (!note || note.trim().length === 0)) {
      return NextResponse.json(
        { success: false, error: 'Rejection requires a reason' },
        { status: 400 }
      );
    }

    const result = await EvidenceService.review(
      {
        evidenceId,
        action,
        note,
      },
      auth.userId,
      auth.role,
      projectId
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      );
    }
    console.error('Evidence review error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
