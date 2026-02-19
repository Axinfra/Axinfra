/**
 * PATCH /api/execution-intelligence/[projectId]/milestones/[milestoneId]/planned-dates
 *
 * Update planned start/end dates for a milestone (Level 2 Gantt editing).
 * Only OWNER and PMC can write planned dates.
 * Writes an audit log entry on change.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

export async function PATCH(
  request: NextRequest,
  { params }: { params: { projectId: string; milestoneId: string } },
) {
  try {
    const auth = await requireProjectAuth(params.projectId);
    if (auth.role !== 'OWNER' && auth.role !== 'PMC') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const body = await request.json();
    const plannedStart = body.plannedStart ? new Date(body.plannedStart) : undefined;
    const plannedEnd = body.plannedEnd ? new Date(body.plannedEnd) : undefined;

    if (!plannedStart && !plannedEnd) {
      return NextResponse.json(
        { success: false, error: 'At least one of plannedStart or plannedEnd is required' },
        { status: 400 },
      );
    }

    // Verify milestone belongs to project
    const milestone = await prisma.milestone.findFirst({
      where: { id: params.milestoneId, projectId: params.projectId },
    });
    if (!milestone) {
      return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });
    }

    const updated = await prisma.milestone.update({
      where: { id: params.milestoneId },
      data: {
        ...(plannedStart !== undefined && { plannedStart }),
        ...(plannedEnd !== undefined && { plannedEnd }),
      },
    });

    // Write audit log
    await prisma.auditLog.create({
      data: {
        id: crypto.randomUUID(),
        projectId: params.projectId,
        actorId: auth.userId,
        role: auth.role,
        actionType: 'MILESTONE_UPDATE',
        entityType: 'Milestone',
        entityId: params.milestoneId,
        beforeJson: JSON.stringify({
          plannedStart: milestone.plannedStart,
          plannedEnd: milestone.plannedEnd,
        }),
        afterJson: JSON.stringify({
          plannedStart: updated.plannedStart,
          plannedEnd: updated.plannedEnd,
        }),
        reason: 'Planned dates updated via Gantt editor',
      },
    });

    return NextResponse.json({ success: true, data: { id: updated.id, plannedStart: updated.plannedStart, plannedEnd: updated.plannedEnd } });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : '';
    if (message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[planned-dates PATCH]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
