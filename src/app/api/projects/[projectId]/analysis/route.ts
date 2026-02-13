import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AnalysisService } from '@/services/AnalysisService';

/**
 * Project Analysis API - READ-ONLY intelligence endpoint.
 *
 * CRITICAL SAFETY CONSTRAINTS:
 * - This endpoint is GET-ONLY
 * - NO mutation operations
 * - NO state transitions
 * - Only aggregates existing CC-OS data
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

    let data;

    if (tab) {
      // Load specific tab only (for performance)
      switch (tab) {
        case 'execution':
          data = { execution: await AnalysisService.getExecutionAnalysis(projectId) };
          break;
        case 'financial':
          data = { financial: await AnalysisService.getFinancialAnalysis(projectId) };
          break;
        case 'vendor':
          data = { vendor: await AnalysisService.getVendorAnalysis(projectId) };
          break;
        case 'delay-risk':
          data = { delayRisk: await AnalysisService.getDelayRiskAnalysis(projectId) };
          break;
        case 'compliance':
          data = { compliance: await AnalysisService.getComplianceAuditAnalysis(projectId) };
          break;
        default:
          return NextResponse.json(
            { success: false, error: 'Invalid tab parameter' },
            { status: 400 }
          );
      }
    } else {
      // Load full analysis
      data = await AnalysisService.getFullAnalysis(projectId);
    }

    return NextResponse.json({
      success: true,
      data,
      generatedAt: new Date().toISOString(),
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
