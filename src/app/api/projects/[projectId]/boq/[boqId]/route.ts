import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { BOQService } from '@/services/BOQService';

// GET /api/projects/[projectId]/boq/[boqId] - Get BOQ with items
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; boqId: string }> }
) {
  try {
    const { projectId, boqId } = await params;
    await requireProjectAuth(projectId);

    const boq = await BOQService.getWithItems(boqId);

    if (!boq) {
      return NextResponse.json(
        { success: false, error: 'BOQ not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: boq });
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
