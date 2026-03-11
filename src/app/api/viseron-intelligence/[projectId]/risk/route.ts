/**
 * GET /api/viseron-intelligence/[projectId]/risk
 *
 * Returns Viseron Intelligence risk assessment for a project.
 * Health score computed from:
 *   0.4 * milestoneCompletionRate
 * + 0.3 * timelineAdherence
 * + 0.3 * vendorReliability
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { ViseronRiskEngine } from '@/services/ViseronRiskEngine';
import { handleApiError } from '@/lib/api-error-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    await requireProjectAuth(params.projectId);

    const assessment = await ViseronRiskEngine.getCachedAssessment(params.projectId);

    return NextResponse.json({ success: true, data: assessment });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/viseron-intelligence/[projectId]/risk',
      projectId: params.projectId,
    });
  }
}
