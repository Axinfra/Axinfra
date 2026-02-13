import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { CustomViewService, CustomViewConfig } from '@/services/CustomViewService';
import { z } from 'zod';

/**
 * Custom Views API - READ-ONLY view configurations.
 *
 * CRITICAL SAFETY:
 * - This API only manages VIEW CONFIGURATIONS
 * - NO milestone mutations
 * - NO state changes
 * - Views are visual projections only
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

const createViewSchema = z.object({
  name: z.string().min(1).max(100),
  config: customViewConfigSchema,
});

// GET /api/projects/[projectId]/views - List user's custom views
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const views = await CustomViewService.getViewsForUser(projectId, auth.userId);
    const templates = CustomViewService.getPredefinedTemplates();

    return NextResponse.json({
      success: true,
      data: {
        views,
        templates,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('List views error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/views - Create a new custom view
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const body = await request.json();
    const { name, config } = createViewSchema.parse(body);

    const view = await CustomViewService.createView(
      projectId,
      auth.userId,
      name,
      config as CustomViewConfig
    );

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
    console.error('Create view error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
