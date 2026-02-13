import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { MilestoneStateMachine } from '@/services/MilestoneStateMachine';
import { MilestoneState } from '@/types';
import { z } from 'zod';

const transitionSchema = z.object({
  toState: z.enum(['DRAFT', 'IN_PROGRESS', 'SUBMITTED', 'VERIFIED', 'CLOSED']),
  reason: z.string().optional(),
});

// POST /api/projects/[projectId]/milestones/[milestoneId]/transition - Transition milestone state
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    const body = await request.json();
    const { toState, reason } = transitionSchema.parse(body);

    // MilestoneStateMachine.transition now automatically triggers
    // PaymentEligibilityEngine.recalculatePaymentEligibility internally
    const result = await MilestoneStateMachine.transition(
      milestoneId,
      toState as MilestoneState,
      auth.userId,
      auth.role,
      projectId,
      reason
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      data: result.milestone,
    });
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
    console.error('Milestone transition error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
