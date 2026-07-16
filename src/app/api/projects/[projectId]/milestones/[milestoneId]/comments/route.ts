import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { validateMilestoneOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const commentSchema = z.object({
  body: z.string().min(1).max(2000),
});

// POST /api/projects/[projectId]/milestones/[milestoneId]/comments
// PMC/Owner feedback on a milestone. Purely informational — never changes state.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['PMC', 'CLIENT']);

    const milestone = await validateMilestoneOwnership(milestoneId, projectId);
    if (!milestone) {
      return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 });
    }

    const body = await request.json();
    const { body: commentBody } = commentSchema.parse(body);

    const comment = await prisma.milestoneComment.create({
      data: {
        milestoneId,
        authorId: auth.userId,
        role: auth.role,
        body: commentBody,
      },
      include: {
        author: { select: { id: true, name: true } },
      },
    });

    // PMC/Owner feedback acknowledges the vendor's "ready for review" flag —
    // clears it so the milestone drops off the review queue until re-flagged.
    if (milestone.readyForReview) {
      await prisma.milestone.update({
        where: { id: milestoneId },
        data: { readyForReview: false },
      });
    }

    // Notify the vendor — best-effort.
    try {
      if (milestone.vendorUserId) {
        await prisma.systemEvent.create({
          data: {
            eventType: 'MILESTONE_COMMENT',
            severity: 'INFO',
            actorId: auth.userId,
            projectId,
            entityType: 'Milestone',
            entityId: milestoneId,
            message: `${auth.role} commented on "${milestone.title}": ${commentBody.slice(0, 140)}`,
          },
        });
      }
    } catch {
      // best-effort
    }

    return NextResponse.json({ success: true, data: comment });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    console.error('Milestone comment error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
