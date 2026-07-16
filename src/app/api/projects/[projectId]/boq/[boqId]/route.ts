import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { validateBOQOwnership } from '@/lib/validate-ownership';
import { BOQService, getOverviewRollup } from '@/services/BOQService';

// GET /api/projects/[projectId]/boq/[boqId] - Get BOQ with items + Overview rollup
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; boqId: string }> }
) {
  try {
    const { projectId, boqId } = await params;
    await requireProjectAuth(projectId);

    // IDOR guard: verify BOQ belongs to this project
    const ownershipCheck = await validateBOQOwnership(boqId, projectId);
    if (!ownershipCheck) {
      return NextResponse.json(
        { success: false, error: 'BOQ not found' },
        { status: 404 }
      );
    }

    const boq = await BOQService.getWithItems(boqId);

    if (!boq) {
      return NextResponse.json(
        { success: false, error: 'BOQ not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: { ...boq, rollup: getOverviewRollup(boq.items) } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('BOQ get error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId]/boq/[boqId] - Update BOQ header fields
export async function PATCH(
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

    const body = await request.json().catch(() => ({}));
    const result = await BOQService.update(
      boqId,
      {
        name: body.name,
        description: body.description,
        category: body.category,
        scope: body.scope,
        plannedStart: body.plannedStart !== undefined ? (body.plannedStart ? new Date(body.plannedStart) : null) : undefined,
        plannedEnd: body.plannedEnd !== undefined ? (body.plannedEnd ? new Date(body.plannedEnd) : null) : undefined,
      },
      auth.userId,
      auth.role,
      projectId
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('BOQ update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
