import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { validateBOQOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { BOQService } from '@/services/BOQService';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';

// POST /api/projects/[projectId]/boq/[boqId]/submit - PMC sends BOQ for Owner approval
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; boqId: string }> }
) {
  try {
    const { projectId, boqId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['PMC']);

    const ownershipCheck = await validateBOQOwnership(boqId, projectId);
    if (!ownershipCheck) {
      return NextResponse.json({ success: false, error: 'BOQ not found' }, { status: 404 });
    }

    const result = await BOQService.sendForApproval(boqId, auth.userId, auth.role, projectId);

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    await invalidateProjectAndMemberCaches(projectId);

    await prisma.systemEvent.create({
      data: {
        projectId,
        eventType: 'BOQ_SUBMITTED',
        severity: 'INFO',
        message: 'PMC has submitted a BOQ for Owner approval.',
        entityType: 'BOQ',
        entityId: boqId,
        actorId: auth.userId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('BOQ submit error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
