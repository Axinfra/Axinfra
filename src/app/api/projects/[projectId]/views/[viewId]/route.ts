import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { CustomViewService, CustomViewConfig } from '@/services/CustomViewService';
import { z } from 'zod';

/**
 * Custom View Detail API - READ-ONLY operations.
 *
 * CRITICAL SAFETY:
 * - GET: Returns view config + READ-ONLY milestone projections
 * - PUT: Updates view CONFIG only (not milestones)
 * - DELETE: Removes view config only
 */

const customViewConfigSchema = z.object({
  filters: z.object({
    trade: z.string().optional(),
    vendor: z.string().optional(),
    paymentStatus: z.array(z.string()).optional(),
    milestoneState: z.array(z.string()).optional(),
    isDelayed: z.boolean().optional(),
    completionMin: z.number().min(0).max(100).optional(),
    completionMax: z.number().min(0).max(100).optional(),
    dueDateFrom: z.string().optional(),
    dueDateTo: z.string().optional(),
  }).optional().default({}),
  groupBy: z.enum(['trade', 'vendor', 'zone', 'paymentStatus', 'milestoneState', 'completionBucket']).optional(),
  sortBy: z.enum(['dueDate', 'completion', 'value', 'createdAt']).optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

const updateViewSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  config: customViewConfigSchema.optional(),
});

// GET /api/projects/[projectId]/views/[viewId] - Get view with milestone data
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; viewId: string }> }
) {
  try {
    const { projectId, viewId } = await params;
    await requireProjectAuth(projectId);

    // Check if viewId is "preview" (for ad-hoc view)
    if (viewId === 'preview') {
      const searchParams = request.nextUrl.searchParams;
      const configParam = searchParams.get('config');

      if (!configParam) {
        return NextResponse.json(
          { success: false, error: 'Config parameter required for preview' },
          { status: 400 }
        );
      }

      try {
        const config = JSON.parse(decodeURIComponent(configParam)) as CustomViewConfig;
        const groups = await CustomViewService.applyView(projectId, config);

        return NextResponse.json({
          success: true,
          data: {
            view: null,
            groups,
            isPreview: true,
          },
        });
      } catch {
        return NextResponse.json(
          { success: false, error: 'Invalid config format' },
          { status: 400 }
        );
      }
    }

    // Get saved view
    const view = await CustomViewService.getView(viewId);

    if (!view) {
      return NextResponse.json(
        { success: false, error: 'View not found' },
        { status: 404 }
      );
    }

    // Apply view to get milestone projections (READ-ONLY)
    const groups = await CustomViewService.applyView(projectId, view.config);

    return NextResponse.json({
      success: true,
      data: {
        view,
        groups,
        isPreview: false,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Get view error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PUT /api/projects/[projectId]/views/[viewId] - Update view config
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; viewId: string }> }
) {
  try {
    const { projectId, viewId } = await params;
    const auth = await requireProjectAuth(projectId);

    const body = await request.json();
    const updates = updateViewSchema.parse(body);

    const view = await CustomViewService.updateView(viewId, auth.userId, {
      name: updates.name,
      config: updates.config as CustomViewConfig | undefined,
    });

    if (!view) {
      return NextResponse.json(
        { success: false, error: 'View not found or access denied' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: view,
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
        { success: false, error: `Invalid input: ${error.errors.map(e => e.message).join(', ')}` },
        { status: 400 }
      );
    }
    console.error('Update view error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/views/[viewId] - Delete view config
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; viewId: string }> }
) {
  try {
    const { projectId, viewId } = await params;
    const auth = await requireProjectAuth(projectId);

    const success = await CustomViewService.deleteView(viewId, auth.userId);

    if (!success) {
      return NextResponse.json(
        { success: false, error: 'View not found or access denied' },
        { status: 404 }
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
    console.error('Delete view error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
