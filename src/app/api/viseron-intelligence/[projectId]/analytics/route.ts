/**
 * GET /api/viseron-intelligence/[projectId]/analytics
 *
 * Returns Viseron Intelligence analytics metrics for a project.
 * Aggregates execution, financial, and schedule data.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { ViseronAnalyticsEngine } from '@/services/ViseronAnalyticsEngine';
import { handleApiError } from '@/lib/api-error-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    await requireProjectAuth(params.projectId);

    const metrics = await ViseronAnalyticsEngine.refreshAndPersist(params.projectId);

    return NextResponse.json({ success: true, data: metrics });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/viseron-intelligence/[projectId]/analytics',
      projectId: params.projectId,
    });
  }
}
