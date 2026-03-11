/**
 * GET /api/viseron-intelligence/[projectId]/dashboard
 *
 * Returns aggregated dashboard data for Viseron Intelligence.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { getDashboardData } from '@/services/ViseronQueryEngine';

export async function GET(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    await requireProjectAuth(params.projectId);
    const data = await getDashboardData(params.projectId);
    return NextResponse.json({ success: true, data });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Viseron dashboard error:', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
