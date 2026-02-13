import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { FollowUpScheduler } from '@/services/FollowUpScheduler';
import { z } from 'zod';

const resolveSchema = z.object({
  followUpId: z.string().uuid(),
  resolutionNote: z.string().min(1, 'Resolution note is required'),
});

// GET /api/projects/[projectId]/follow-ups - List follow-ups
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const followUps = await FollowUpScheduler.getOpenFollowUps(projectId);

    return NextResponse.json({ success: true, data: followUps });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Follow-ups list error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/follow-ups - Resolve follow-up
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (!RoleGuard.canResolveFollowUp(auth)) {
      return NextResponse.json(
        { success: false, error: 'Only Owner or PMC can resolve follow-ups' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { followUpId, resolutionNote } = resolveSchema.parse(body);

    const result = await FollowUpScheduler.resolve(
      followUpId,
      resolutionNote,
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      );
    }
    console.error('Follow-up resolve error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
