import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { BOQService } from '@/services/BOQService';

// POST /api/projects/[projectId]/boq/[boqId]/approve - Approve BOQ
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; boqId: string }> }
) {
  try {
    const { projectId, boqId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only Owner can approve BOQ
    RoleGuard.requireRole(auth, ['OWNER']);

    const result = await BOQService.approve(boqId, auth.userId, auth.role, projectId);

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
    console.error('BOQ approve error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
