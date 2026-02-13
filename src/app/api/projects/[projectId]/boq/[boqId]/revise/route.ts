import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { BOQService } from '@/services/BOQService';
import { z } from 'zod';

const reviseSchema = z.object({
  reason: z.string().min(1, 'Revision reason is required'),
  changes: z.object({
    addItems: z.array(z.object({
      description: z.string().min(1),
      unit: z.string().min(1),
      plannedQty: z.number().positive(),
      rate: z.number().positive(),
    })).optional(),
    updateItems: z.array(z.object({
      id: z.string().uuid(),
      updates: z.object({
        description: z.string().min(1).optional(),
        unit: z.string().min(1).optional(),
        plannedQty: z.number().positive().optional(),
        rate: z.number().positive().optional(),
      }),
    })).optional(),
    removeItemIds: z.array(z.string().uuid()).optional(),
  }),
});

// POST /api/projects/[projectId]/boq/[boqId]/revise - Create BOQ revision
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; boqId: string }> }
) {
  try {
    const { projectId, boqId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['OWNER', 'PMC']);

    const body = await request.json();
    const { reason, changes } = reviseSchema.parse(body);

    const result = await BOQService.revise(
      boqId,
      reason,
      changes,
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
    console.error('BOQ revise error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
