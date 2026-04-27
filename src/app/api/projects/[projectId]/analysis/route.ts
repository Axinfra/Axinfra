import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AnalysisService } from '@/services/AnalysisService';
import { cached } from '@/lib/cache';

/**
 * Project Analysis API - READ-ONLY intelligence endpoint.
 *
 * CRITICAL SAFETY CONSTRAINTS:
 * - This endpoint is GET-ONLY
 * - NO mutation operations
 * - NO state transitions
 * - Only aggregates existing Axinfra data
 * - Accessible to OWNER and PMC only
 */

// GET /api/projects/[projectId]/analysis - Get full project analysis
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only OWNER and PMC can access analysis
    RoleGuard.requireRole(auth, ['OWNER', 'PMC']);

    // Get tab parameter for partial loading
    const searchParams = request.nextUrl.searchParams;
    const tab = searchParams.get('tab');

    // Analysis is heavy aggregation — cache 120s per (project, tab).
    const ttlMs = 120_000;
    let data;

    if (tab) {
      // Load specific tab only (for performance)
      switch (tab) {
        case 'execution':
          data = {
            execution: await cached(`analysis:${projectId}:execution`, ttlMs, () =>
              AnalysisService.getExecutionAnalysis(projectId),
            ),
          };
          break;
        case 'financial':
          data = {
            financial: await cached(`analysis:${projectId}:financial`, ttlMs, () =>
              AnalysisService.getFinancialAnalysis(projectId),
            ),
          };
          break;
        case 'vendor':
          data = {
            vendor: await cached(`analysis:${projectId}:vendor`, ttlMs, () =>
              AnalysisService.getVendorAnalysis(projectId),
            ),
          };
          break;
        case 'delay-risk':
          data = {
            delayRisk: await cached(`analysis:${projectId}:delay-risk`, ttlMs, () =>
              AnalysisService.getDelayRiskAnalysis(projectId),
            ),
          };
          break;
        case 'compliance':
          data = {
            compliance: await cached(`analysis:${projectId}:compliance`, ttlMs, () =>
              AnalysisService.getComplianceAuditAnalysis(projectId),
            ),
          };
          break;
        default:
          return NextResponse.json(
            { success: false, error: 'Invalid tab parameter' },
            { status: 400 }
          );
      }
    } else {
      // Load full analysis
      data = await cached(`analysis:${projectId}:full`, ttlMs, () =>
        AnalysisService.getFullAnalysis(projectId),
      );
    }

    return NextResponse.json(
      {
        success: true,
        data,
        generatedAt: new Date().toISOString(),
      },
      { headers: { 'Cache-Control': 's-maxage=60, stale-while-revalidate=300' } },
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { success: false, error: 'Access denied. Analysis is available to Owner and PMC only.' },
        { status: 403 }
      );
    }
    console.error('Analysis error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
