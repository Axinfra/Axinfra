import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { validateMilestoneOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { MilestoneStateMachine } from '@/services/MilestoneStateMachine';
import { MilestoneState } from '@/types';
import { z } from 'zod';

const transitionSchema = z.object({
  toState: z.enum(['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'CLOSED']),
  reason: z.string().optional(),
});

// POST /api/projects/[projectId]/milestones/[milestoneId]/transition
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VENDOR']);

    const milestone = await validateMilestoneOwnership(milestoneId, projectId);
    if (!milestone) {
      return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 });
    }

    const body = await request.json();
    const { toState, reason } = transitionSchema.parse(body);

    // Capture fromState before transition for notification logic
    const currentMilestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
      select: { state: true, title: true, vendorUserId: true },
    });
    const fromState = currentMilestone?.state;

    const result = await MilestoneStateMachine.transition(
      milestoneId,
      toState as MilestoneState,
      auth.userId,
      auth.role,
      projectId,
      reason,
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    // ── In-app notifications ─────────────────────────────────────────────────
    // SUBMITTED → IN_PROGRESS = PMC/Owner rejected evidence → notify vendor
    if (fromState === 'SUBMITTED' && toState === 'IN_PROGRESS') {
      try {
        const title = currentMilestone?.title ?? 'Milestone';
        const reasonText = reason ? `: ${reason}` : '';
        if (currentMilestone?.vendorUserId) {
          await prisma.systemEvent.create({
            data: {
              eventType: 'REVISION_REQUESTED',
              severity: 'WARNING',
              actorId: auth.userId,
              projectId,
              entityType: 'Milestone',
              entityId: milestoneId,
              message: `Your submission for "${title}" was not approved${reasonText}. Please revise and resubmit.`,
            },
          });
        }
      } catch {
        // best-effort
      }
    }

    // DRAFT → IN_PROGRESS = vendor started work → notify PMC
    if (fromState === 'DRAFT' && toState === 'IN_PROGRESS' && auth.role === 'VENDOR') {
      try {
        const title = currentMilestone?.title ?? 'Milestone';
        await prisma.systemEvent.create({
          data: {
            eventType: 'WORK_STARTED',
            severity: 'INFO',
            actorId: auth.userId,
            projectId,
            entityType: 'Milestone',
            entityId: milestoneId,
            message: `Vendor has started work on "${title}".`,
          },
        });
      } catch {
        // best-effort
      }
    }

    return NextResponse.json({ success: true, data: result.milestone });
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
    console.error('Milestone transition error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
