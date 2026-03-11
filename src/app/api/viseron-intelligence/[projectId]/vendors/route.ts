/**
 * GET /api/viseron-intelligence/[projectId]/vendors
 *
 * Returns Viseron Intelligence vendor analysis for a project.
 * Includes per-vendor risk levels, exposure, and performance metrics.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { AnalysisService } from '@/services/AnalysisService';
import { cached } from '@/lib/cache';
import { handleApiError } from '@/lib/api-error-handler';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const auth = await requireProjectAuth(params.projectId);

    const vendorAnalysis = await cached(
      `viseron-vendors:${params.projectId}`,
      60_000,
      () => AnalysisService.getVendorAnalysis(params.projectId),
    );

    // For VENDOR role, only show their own data
    if (auth.role === 'VENDOR') {
      const filtered = {
        ...vendorAnalysis,
        vendors: vendorAnalysis.vendors.filter((v) => v.vendorId === auth.userId),
      };
      return NextResponse.json({ success: true, data: filtered });
    }

    return NextResponse.json({ success: true, data: vendorAnalysis });
  } catch (error) {
    return handleApiError(error, {
      route: 'GET /api/viseron-intelligence/[projectId]/vendors',
      projectId: params.projectId,
    });
  }
}
