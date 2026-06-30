import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';

// POST /api/projects/[projectId]/custom-schedule/phases/[phaseId]/milestones
// Body: { milestoneIds: string[] }
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> },
) {
  try {
    const { projectId, phaseId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await req.json() as { milestoneIds: string[] };
    const ids  = Array.isArray(body.milestoneIds) ? body.milestoneIds.filter(Boolean) : [];
    if (ids.length === 0) return NextResponse.json({ success: false, error: 'milestoneIds must be a non-empty array' }, { status: 400 });

    const cs = await prisma.customSchedule.findUnique({ where: { projectId } });
    if (!cs) return NextResponse.json({ success: false, error: 'Custom schedule not found' }, { status: 404 });

    const phase = await prisma.customSchedulePhase.findFirst({
      where: { id: phaseId, customScheduleId: cs.id },
    });
    if (!phase) return NextResponse.json({ success: false, error: 'Phase not found' }, { status: 404 });

    // Verify all milestones belong to this project
    const milestones = await prisma.milestone.findMany({
      where: { id: { in: ids }, projectId },
      select: { id: true },
    });
    const validIds = milestones.map((m) => m.id);

    await prisma.customScheduleMilestoneLink.createMany({
      data: validIds.map((milestoneId) => ({ customSchedulePhaseId: phaseId, milestoneId })),
      skipDuplicates: true,
    });

    return NextResponse.json({ success: true, data: { added: validIds.length } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ success: false, error: msg }, { status: 403 });
    console.error('[custom-schedule milestones POST]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/custom-schedule/phases/[phaseId]/milestones
// Body: { milestoneIds: string[] }
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string; phaseId: string }> },
) {
  try {
    const { projectId, phaseId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await req.json() as { milestoneIds: string[] };
    const ids  = Array.isArray(body.milestoneIds) ? body.milestoneIds.filter(Boolean) : [];
    if (ids.length === 0) return NextResponse.json({ success: false, error: 'milestoneIds is required' }, { status: 400 });

    const cs = await prisma.customSchedule.findUnique({ where: { projectId } });
    if (!cs) return NextResponse.json({ success: false, error: 'Custom schedule not found' }, { status: 404 });

    await prisma.customScheduleMilestoneLink.deleteMany({
      where: { customSchedulePhaseId: phaseId, milestoneId: { in: ids } },
    });

    return NextResponse.json({ success: true, data: { removed: ids.length } });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ success: false, error: msg }, { status: 403 });
    console.error('[custom-schedule milestones DELETE]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
