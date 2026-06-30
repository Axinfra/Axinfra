import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';

// PATCH /api/projects/[projectId]/custom-schedule/phases/[phaseId]
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> },
) {
  try {
    const { projectId, phaseId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await req.json() as {
      name?: string;
      plannedStart?: string;
      plannedEnd?: string;
    };

    const cs = await prisma.customSchedule.findUnique({ where: { projectId } });
    if (!cs) return NextResponse.json({ success: false, error: 'Custom schedule not found' }, { status: 404 });

    const existing = await prisma.customSchedulePhase.findFirst({
      where: { id: phaseId, customScheduleId: cs.id },
    });
    if (!existing) return NextResponse.json({ success: false, error: 'Phase not found' }, { status: 404 });

    const name  = body.name?.trim();
    const start = body.plannedStart ? new Date(body.plannedStart) : null;
    const end   = body.plannedEnd   ? new Date(body.plannedEnd)   : null;

    if (start && isNaN(start.getTime())) return NextResponse.json({ success: false, error: 'Invalid plannedStart' }, { status: 400 });
    if (end   && isNaN(end.getTime()))   return NextResponse.json({ success: false, error: 'Invalid plannedEnd' }, { status: 400 });

    const resolvedStart = start ?? existing.plannedStart;
    const resolvedEnd   = end   ?? existing.plannedEnd;
    if (resolvedStart >= resolvedEnd) return NextResponse.json({ success: false, error: 'Start must be before end' }, { status: 400 });

    const updated = await prisma.customSchedulePhase.update({
      where: { id: phaseId },
      data: {
        ...(name  && { name }),
        ...(start && { plannedStart: start }),
        ...(end   && { plannedEnd: end }),
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ success: false, error: msg }, { status: 403 });
    console.error('[custom-schedule/phases PATCH]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/custom-schedule/phases/[phaseId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> },
) {
  try {
    const { projectId, phaseId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const cs = await prisma.customSchedule.findUnique({ where: { projectId } });
    if (!cs) return NextResponse.json({ success: false, error: 'Custom schedule not found' }, { status: 404 });

    const existing = await prisma.customSchedulePhase.findFirst({
      where: { id: phaseId, customScheduleId: cs.id },
    });
    if (!existing) return NextResponse.json({ success: false, error: 'Phase not found' }, { status: 404 });

    await prisma.customSchedulePhase.delete({ where: { id: phaseId } });

    return NextResponse.json({ success: true, data: { deleted: true } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ success: false, error: msg }, { status: 403 });
    console.error('[custom-schedule/phases DELETE]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
