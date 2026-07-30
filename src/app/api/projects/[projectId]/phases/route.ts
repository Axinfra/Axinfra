import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { sendPhaseCreatedEmail } from '@/lib/email';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';

// GET /api/projects/[projectId]/phases - List all phases for project
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // PMC still drafting some of these — Owner shouldn't see a Purchase Order until something
    // in it has been submitted, Vendor/Consultant only once something's actually approved. A PO
    // with zero visible-status BOQs is hidden entirely for those roles, not just its BOQs.
    const visibleStatuses = RoleGuard.visibleBOQStatuses(auth);

    const phases = await prisma.phase.findMany({
      // Top-level AND never touched by a schedule import — Execution/WBS phases (and their
      // subphases, promoted to top-level when a redundant wrapper phase gets skipped during
      // import — see mspdiParser's echo-phase detection) are a Schedule-tab concept, not
      // "Purchase Orders". Without the scheduleImportId filter, a promoted top-level WBS
      // phase would otherwise satisfy parentPhaseId: null and leak into the BOQ/Order pickers.
      where: {
        projectId,
        parentPhaseId: null,
        scheduleImportId: null,
        ...(visibleStatuses && { boqs: { some: { status: { in: visibleStatuses } } } }),
      },
      include: {
        boqs: {
          where: visibleStatuses ? { status: { in: visibleStatuses } } : undefined,
          select: { id: true, status: true, _count: { select: { items: true } } },
        },
      },
      orderBy: { sortOrder: 'asc' },
    });

    const data = phases.map((p) => ({
      id: p.id,
      name: p.name,
      sortOrder: p.sortOrder,
      plannedStart: p.plannedStart?.toISOString() ?? null,
      plannedEnd:   p.plannedEnd?.toISOString()   ?? null,
      estimatedCost: p.estimatedCost,
      createdAt: p.createdAt,
      vendorUserId: p.vendorUserId,
      boqs: p.boqs.map((b) => ({ id: b.id, status: b.status, itemsCount: b._count.items })),
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Phase list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/phases - Create a new phase
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

    const body = await request.json();
    const name: string = (body.name ?? '').trim();

    if (!name) {
      return NextResponse.json({ success: false, error: 'name is required' }, { status: 400 });
    }

    const plannedStart = body.plannedStart ? new Date(body.plannedStart) : null;
    const plannedEnd   = body.plannedEnd   ? new Date(body.plannedEnd)   : null;

    if (plannedStart && isNaN(plannedStart.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid plannedStart date' }, { status: 400 });
    }
    if (plannedEnd && isNaN(plannedEnd.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid plannedEnd date' }, { status: 400 });
    }
    if (plannedStart && plannedEnd && plannedStart >= plannedEnd) {
      return NextResponse.json({ success: false, error: 'Start date must be before end date' }, { status: 400 });
    }

    let estimatedCost: number | null = null;
    if (body.estimatedCost !== undefined && body.estimatedCost !== null && body.estimatedCost !== '') {
      estimatedCost = Number(body.estimatedCost);
      if (isNaN(estimatedCost) || estimatedCost < 0) {
        return NextResponse.json({ success: false, error: 'Estimated cost must be a non-negative number' }, { status: 400 });
      }
    }

    let { sortOrder } = body;
    if (sortOrder === undefined || sortOrder === null) {
      const last = await prisma.phase.findFirst({
        where: { projectId },
        orderBy: { sortOrder: 'desc' },
        select: { sortOrder: true },
      });
      sortOrder = (last?.sortOrder ?? 0) + 1;
    }

    const [phase, actor, project, allRoles] = await Promise.all([
      prisma.phase.create({
        data: { projectId, name, sortOrder, plannedStart, plannedEnd, estimatedCost },
      }),
      prisma.user.findUnique({
        where: { id: auth.userId },
        select: { name: true },
      }),
      prisma.project.findUnique({
        where: { id: projectId },
        select: { name: true },
      }),
      prisma.projectRole.findMany({
        where: { projectId },
        include: { user: { select: { id: true, name: true, email: true } } },
      }),
    ]);

    await invalidateProjectAndMemberCaches(projectId);

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.PHASE_CREATE,
      entityType: 'Phase',
      entityId: phase.id,
      afterJson: {
        name: phase.name,
        sortOrder: phase.sortOrder,
        plannedStart: phase.plannedStart,
        plannedEnd: phase.plannedEnd,
        estimatedCost: phase.estimatedCost,
      },
    });

    // Fire-and-forget notification to all project members except actor
    if (project && actor) {
      const recipients = allRoles
        .map((r) => r.user)
        .filter((u) => u.id !== auth.userId);

      if (recipients.length > 0) {
        void Promise.allSettled(
          recipients.map((r) =>
            sendPhaseCreatedEmail(
              r.email,
              r.name,
              project.name,
              name,
              plannedStart?.toISOString() ?? null,
              plannedEnd?.toISOString()   ?? null,
              projectId,
              actor.name,
              auth.role,
            ),
          ),
        );
      }
    }

    return NextResponse.json({ success: true, data: phase }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Phase create error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
