/**
 * GET/PUT /api/execution-intelligence/[projectId]/schedule-config
 *
 * Manage per-project schedule configuration (daily cost, penalty rate, etc.)
 * Only OWNER and PMC can write. All roles can read.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

export async function GET(
  _request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    await requireProjectAuth(params.projectId);
    const config = await prisma.projectScheduleConfig.findUnique({
      where: { projectId: params.projectId },
    });
    return NextResponse.json({ success: true, data: config ?? null });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { projectId: string } },
) {
  try {
    const auth = await requireProjectAuth(params.projectId);
    if (auth.role !== 'CLIENT' && auth.role !== 'PMC') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    // Partial update: a caller that only sends e.g. { dailyOverheadCost } (the analytics page's
    // "configure delay cost" form does exactly this) must not silently blank out
    // projectStartDate or reset the other rates to their bare defaults — only touch a field
    // when the request body actually includes it.
    const hasStart = Object.prototype.hasOwnProperty.call(body, 'projectStartDate');
    const hasOverhead = Object.prototype.hasOwnProperty.call(body, 'dailyOverheadCost');
    const hasPenalty = Object.prototype.hasOwnProperty.call(body, 'penaltyRatePerDay');
    const hasOpportunity = Object.prototype.hasOwnProperty.call(body, 'opportunityCostFactor');

    for (const [has, field] of [[hasOverhead, 'dailyOverheadCost'], [hasPenalty, 'penaltyRatePerDay'], [hasOpportunity, 'opportunityCostFactor']] as const) {
      if (has && (typeof body[field] !== 'number' || !Number.isFinite(body[field]) || body[field] < 0)) {
        return NextResponse.json({ success: false, error: `${field} must be a non-negative number` }, { status: 400 });
      }
    }

    const config = await prisma.projectScheduleConfig.upsert({
      where: { projectId: params.projectId },
      create: {
        id: crypto.randomUUID(),
        projectId: params.projectId,
        projectStartDate: hasStart && body.projectStartDate ? new Date(body.projectStartDate) : null,
        dailyOverheadCost: hasOverhead ? Number(body.dailyOverheadCost) : 0,
        penaltyRatePerDay: hasPenalty ? Number(body.penaltyRatePerDay) : 0,
        opportunityCostFactor: hasOpportunity ? Number(body.opportunityCostFactor) : 1,
      },
      update: {
        ...(hasStart && { projectStartDate: body.projectStartDate ? new Date(body.projectStartDate) : null }),
        ...(hasOverhead && { dailyOverheadCost: Number(body.dailyOverheadCost) }),
        ...(hasPenalty && { penaltyRatePerDay: Number(body.penaltyRatePerDay) }),
        ...(hasOpportunity && { opportunityCostFactor: Number(body.opportunityCostFactor) }),
        updatedAt: new Date(),
      },
    });
    return NextResponse.json({ success: true, data: config });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[schedule-config PUT]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
