import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';

// POST /api/projects/[projectId]/custom-schedule/phases
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await req.json() as {
      name: string;
      plannedStart: string;
      plannedEnd: string;
    };

    const name = (body.name ?? '').trim();
    if (!name) return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    if (!body.plannedStart) return NextResponse.json({ success: false, error: 'plannedStart is required' }, { status: 400 });
    if (!body.plannedEnd)   return NextResponse.json({ success: false, error: 'plannedEnd is required' }, { status: 400 });

    const start = new Date(body.plannedStart);
    const end   = new Date(body.plannedEnd);
    if (isNaN(start.getTime())) return NextResponse.json({ success: false, error: 'Invalid plannedStart' }, { status: 400 });
    if (isNaN(end.getTime()))   return NextResponse.json({ success: false, error: 'Invalid plannedEnd' }, { status: 400 });
    if (start >= end) return NextResponse.json({ success: false, error: 'Start must be before end' }, { status: 400 });

    // Ensure custom schedule exists for this project
    let cs = await prisma.customSchedule.findUnique({ where: { projectId } });
    if (!cs) {
      cs = await prisma.customSchedule.create({
        data: { projectId, createdById: auth.userId, isPreferred: false },
      });
    }

    const last = await prisma.customSchedulePhase.findFirst({
      where: { customScheduleId: cs.id },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const sortOrder = (last?.sortOrder ?? 0) + 1;

    const phase = await prisma.customSchedulePhase.create({
      data: { customScheduleId: cs.id, name, plannedStart: start, plannedEnd: end, sortOrder },
    });

    return NextResponse.json({ success: true, data: phase }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ success: false, error: msg }, { status: 403 });
    console.error('[custom-schedule/phases POST]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
