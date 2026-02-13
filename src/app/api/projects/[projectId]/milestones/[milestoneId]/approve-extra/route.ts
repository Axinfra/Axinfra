import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';

// POST /api/projects/[projectId]/milestones/[milestoneId]/approve-extra
// Owner approves an "Extra" milestone (outside BOQ)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only Owner can approve extras
    RoleGuard.requireRole(auth, ['OWNER']);

    const milestone = await prisma.milestone.findUnique({
      where: { id: milestoneId },
    });

    if (!milestone) {
      return NextResponse.json(
        { success: false, error: 'Milestone not found' },
        { status: 404 }
      );
    }

    if (!milestone.isExtra) {
      return NextResponse.json(
        { success: false, error: 'This milestone is not marked as Extra' },
        { status: 400 }
      );
    }

    if (milestone.extraApprovedAt) {
      return NextResponse.json(
        { success: false, error: 'This extra has already been approved' },
        { status: 400 }
      );
    }

    // Approve the extra
    const updated = await prisma.milestone.update({
      where: { id: milestoneId },
      data: {
        extraApprovedAt: new Date(),
        extraApprovedById: auth.userId,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.MILESTONE_STATE_TRANSITION,
      entityType: 'Milestone',
      entityId: milestoneId,
      beforeJson: { isExtra: true, extraApprovedAt: null },
      afterJson: { isExtra: true, extraApprovedAt: updated.extraApprovedAt },
      reason: 'Extra milestone approved by Owner',
    });

    return NextResponse.json({
      success: true,
      data: { message: 'Extra approved successfully' },
    });
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
    console.error('Approve extra error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
