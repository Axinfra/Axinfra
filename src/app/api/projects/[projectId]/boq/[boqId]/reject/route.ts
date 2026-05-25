import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { validateBOQOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { BOQService } from '@/services/BOQService';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { z } from 'zod';

const rejectSchema = z.object({
  reason: z.string().min(1, 'Revision reason is required'),
});

// POST /api/projects/[projectId]/boq/[boqId]/reject - Owner sends BOQ to revision
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; boqId: string }> }
) {
  try {
    const { projectId, boqId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['OWNER']);

    const ownershipCheck = await validateBOQOwnership(boqId, projectId);
    if (!ownershipCheck) {
      return NextResponse.json(
        { success: false, error: 'BOQ not found' },
        { status: 404 }
      );
    }

    const body = await request.json();
    const { reason } = rejectSchema.parse(body);

    const result = await BOQService.requestRevision(
      boqId,
      reason,
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

    await invalidateProjectAndMemberCaches(projectId);

    return NextResponse.json({
      success: true,
      data: { revisionNumber: result.revisionNumber },
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
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('BOQ reject error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
