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
    const config = await prisma.projectScheduleConfig.upsert({
      where: { projectId: params.projectId },
      create: {
        id: crypto.randomUUID(),
        projectId: params.projectId,
        projectStartDate: body.projectStartDate ? new Date(body.projectStartDate) : null,
        dailyOverheadCost: Number(body.dailyOverheadCost ?? 0),
        penaltyRatePerDay: Number(body.penaltyRatePerDay ?? 0),
        opportunityCostFactor: Number(body.opportunityCostFactor ?? 1),
      },
      update: {
        projectStartDate: body.projectStartDate ? new Date(body.projectStartDate) : null,
        dailyOverheadCost: Number(body.dailyOverheadCost ?? 0),
        penaltyRatePerDay: Number(body.penaltyRatePerDay ?? 0),
        opportunityCostFactor: Number(body.opportunityCostFactor ?? 1),
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
