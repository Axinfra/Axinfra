import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { sendScheduleUpdatedEmail } from '@/lib/email';
import { z } from 'zod';

const patchSchema = z
  .object({
    phaseId:      z.string().uuid(),
    newStartDate: z.string().optional(),
    newEndDate:   z.string().optional(),
  })
  .refine((d) => d.newStartDate || d.newEndDate, {
    message: 'At least one of newStartDate or newEndDate is required',
  });

type MilestoneSlim = {
  id: string;
  title: string;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  state: string;
  value: number;
  vendorUserId: string | null;
  vendorUser: { id: string; name: string; email: string } | null;
};

function computePhaseStats(milestones: MilestoneSlim[]) {
  const withDates = milestones.filter((m) => m.plannedStart || m.plannedEnd);

  const starts = milestones.map((m) => m.plannedStart).filter(Boolean) as Date[];
  const ends = milestones.map((m) => m.plannedEnd).filter(Boolean) as Date[];

  const computedStart = starts.length ? new Date(Math.min(...starts.map((d) => d.getTime()))) : null;
  const computedEnd = ends.length ? new Date(Math.max(...ends.map((d) => d.getTime()))) : null;

  const stateBreakdown = milestones.reduce<Record<string, number>>((acc, m) => {
    acc[m.state] = (acc[m.state] ?? 0) + 1;
    return acc;
  }, {});

  const completedCount = milestones.filter((m) => m.state === 'CLOSED').length;

  const vendorMap = new Map<string, { id: string; name: string; email: string; milestoneCount: number }>();
  for (const m of milestones) {
    if (m.vendorUser) {
      const existing = vendorMap.get(m.vendorUser.id);
      if (existing) {
        existing.milestoneCount += 1;
      } else {
        vendorMap.set(m.vendorUser.id, { ...m.vendorUser, milestoneCount: 1 });
      }
    }
  }

  const totalValue = milestones.reduce((sum, m) => sum + (m.value ?? 0), 0);
  const durationDays =
    computedStart && computedEnd
      ? Math.round((computedEnd.getTime() - computedStart.getTime()) / (1000 * 60 * 60 * 24))
      : null;

  return {
    computedStart: computedStart?.toISOString() ?? null,
    computedEnd: computedEnd?.toISOString() ?? null,
    durationDays,
    milestoneCount: milestones.length,
    completedCount,
    datedCount: withDates.length,
    stateBreakdown,
    vendors: Array.from(vendorMap.values()),
    totalValue,
  };
}

// GET /api/projects/[projectId]/schedule
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT']);

    const [project, phases, unphased] = await Promise.all([
      prisma.project.findUnique({
        where: { id: projectId, deletedAt: null },
        select: { id: true, name: true, metadata: true, status: true },
      }),
      prisma.phase.findMany({
        where: { projectId },
        orderBy: { sortOrder: 'asc' },
        select: {
          id: true,
          name: true,
          sortOrder: true,
          plannedStart: true,
          plannedEnd: true,
          milestones: {
            select: {
              id: true,
              title: true,
              plannedStart: true,
              plannedEnd: true,
              state: true,
              value: true,
              vendorUserId: true,
              vendorUser: { select: { id: true, name: true, email: true } },
            },
          },
        },
      }),
      prisma.milestone.findMany({
        where: { projectId, phaseId: null },
        select: {
          id: true,
          title: true,
          plannedStart: true,
          plannedEnd: true,
          state: true,
          value: true,
          vendorUserId: true,
          vendorUser: { select: { id: true, name: true, email: true } },
        },
      }),
    ]);

    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    const meta: Record<string, unknown> = project.metadata ? JSON.parse(project.metadata) : {};

    const phaseData = phases.map((phase) => {
      const stats = computePhaseStats(phase.milestones);
      // Phase-level planned dates take priority; fall back to milestone-computed dates
      const effectiveStart = phase.plannedStart?.toISOString() ?? stats.computedStart;
      const effectiveEnd   = phase.plannedEnd?.toISOString()   ?? stats.computedEnd;
      const durationDays = effectiveStart && effectiveEnd
        ? Math.round((new Date(effectiveEnd).getTime() - new Date(effectiveStart).getTime()) / 86400000)
        : stats.durationDays;

      return {
        id: phase.id,
        name: phase.name,
        sortOrder: phase.sortOrder,
        plannedStart: phase.plannedStart?.toISOString() ?? null,
        plannedEnd:   phase.plannedEnd?.toISOString()   ?? null,
        ...stats,
        computedStart: effectiveStart,
        computedEnd:   effectiveEnd,
        durationDays,
        milestones: phase.milestones.map((m) => ({
          id:           m.id,
          title:        m.title,
          state:        m.state,
          value:        m.value,
          plannedStart: m.plannedStart?.toISOString() ?? null,
          plannedEnd:   m.plannedEnd?.toISOString()   ?? null,
          vendorUser:   m.vendorUser
            ? { id: m.vendorUser.id, name: m.vendorUser.name, email: m.vendorUser.email }
            : null,
        })),
      };
    });

    const allMilestones = [...phases.flatMap((p) => p.milestones), ...unphased];
    const allStarts = allMilestones.map((m) => m.plannedStart).filter(Boolean) as Date[];
    const allEnds = allMilestones.map((m) => m.plannedEnd).filter(Boolean) as Date[];
    const projectComputedStart = allStarts.length
      ? new Date(Math.min(...allStarts.map((d) => d.getTime())))
      : null;
    const projectComputedEnd = allEnds.length
      ? new Date(Math.max(...allEnds.map((d) => d.getTime())))
      : null;

    return NextResponse.json({
      success: true,
      data: {
        project: {
          id: project.id,
          name: project.name,
          status: project.status,
          location: (meta.location as string) ?? null,
          contractValue: (meta.contractValue as number) ?? null,
          metaStartDate: (meta.startDate as string) ?? null,
          metaEndDate: (meta.endDate as string) ?? null,
          computedStart: projectComputedStart?.toISOString() ?? null,
          computedEnd: projectComputedEnd?.toISOString() ?? null,
        },
        phases: phaseData,
        unphased: unphased.length > 0
          ? { id: '__unphased__', name: 'Extra / Unphased Milestones', sortOrder: 9999, plannedStart: null, plannedEnd: null, ...computePhaseStats(unphased) }
          : null,
        myRole: auth.role,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (msg.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }
    console.error('[schedule GET]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

const ROLE_LABELS: Record<string, string> = {
  CLIENT: 'Project Owner', PMC: 'PMC', VENDOR: 'Vendor',
  CONSULTANT: 'Consultant', VIEWER: 'Viewer',
};

// PATCH /api/projects/[projectId]/schedule
// CLIENT or PMC updates a phase's planned start/end date directly on the Phase record.
// Notifies all team members.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

    const body = await request.json();
    const { phaseId, newStartDate, newEndDate } = patchSchema.parse(body);

    const newStart = newStartDate ? new Date(newStartDate) : null;
    const newEnd   = newEndDate   ? new Date(newEndDate)   : null;

    if (newStart && isNaN(newStart.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid start date' }, { status: 400 });
    }
    if (newEnd && isNaN(newEnd.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid end date' }, { status: 400 });
    }

    const [phase, actor, project] = await Promise.all([
      prisma.phase.findFirst({
        where: { id: phaseId, projectId },
        select: { id: true, name: true, plannedStart: true, plannedEnd: true },
      }),
      prisma.user.findUnique({
        where: { id: auth.userId },
        select: { id: true, name: true, email: true },
      }),
      prisma.project.findUnique({
        where: { id: projectId, deletedAt: null },
        select: { name: true },
      }),
    ]);

    if (!phase)   return NextResponse.json({ success: false, error: 'Phase not found' }, { status: 404 });
    if (!project) return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });

    // Validate ordering: start must be before end
    const resolvedStart = newStart ?? phase.plannedStart;
    const resolvedEnd   = newEnd   ?? phase.plannedEnd;
    if (resolvedStart && resolvedEnd && resolvedStart >= resolvedEnd) {
      return NextResponse.json(
        { success: false, error: 'Start date must be before end date' },
        { status: 400 },
      );
    }

    const actorName      = actor?.name ?? 'Unknown';
    const actorRoleLabel = ROLE_LABELS[auth.role] ?? auth.role;
    const projectName    = project.name;

    const updateData: { plannedStart?: Date; plannedEnd?: Date } = {};
    if (newStart) updateData.plannedStart = newStart;
    if (newEnd)   updateData.plannedEnd   = newEnd;

    await prisma.phase.update({
      where: { id: phaseId },
      data: updateData,
    });

    const fmtDate = (d: Date) =>
      d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

    const changeParts: string[] = [];
    if (newStart) changeParts.push(`start → ${fmtDate(newStart)}`);
    if (newEnd)   changeParts.push(`end → ${fmtDate(newEnd)}`);
    const eventMessage = `"${phase.name}" dates updated (${changeParts.join(', ')}) by ${actorName} (${actorRoleLabel})`;

    await prisma.systemEvent.create({
      data: {
        id: crypto.randomUUID(),
        eventType: 'SCHEDULE_UPDATED',
        severity: 'INFO',
        actorId: auth.userId,
        projectId,
        entityType: 'Phase',
        entityId: phaseId,
        message: eventMessage,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.PROJECT_UPDATE,
      entityType: 'Phase',
      entityId: phaseId,
      beforeJson: { phaseName: phase.name, plannedStart: phase.plannedStart, plannedEnd: phase.plannedEnd },
      afterJson: { phaseName: phase.name, plannedStart: newStart ?? phase.plannedStart, plannedEnd: newEnd ?? phase.plannedEnd, changedBy: actorName },
    });

    await invalidateProjectAndMemberCaches(projectId);

    // Notify ALL project role holders except the actor
    const allRoles = await prisma.projectRole.findMany({
      where: { projectId },
      include: { user: { select: { id: true, name: true, email: true } } },
    });

    const recipientMap = new Map<string, { id: string; name: string; email: string }>();
    for (const r of allRoles) recipientMap.set(r.user.id, r.user);
    recipientMap.delete(auth.userId);

    const recipients = Array.from(recipientMap.values());

    const resolvedStartIso = (newStart ?? phase.plannedStart)?.toISOString() ?? '';
    const resolvedEndIso   = (newEnd   ?? phase.plannedEnd)?.toISOString()   ?? '';

    if (recipients.length > 0) {
      void Promise.allSettled(
        recipients.map((r) =>
          sendScheduleUpdatedEmail(
            r.email,
            r.name,
            projectName,
            phase.name,
            resolvedEndIso,
            projectId,
            actorName,
            auth.role,
            resolvedStartIso || undefined,
          ),
        ),
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        phaseId,
        phaseName: phase.name,
        newStartDate: (newStart ?? phase.plannedStart)?.toISOString() ?? null,
        newEndDate:   (newEnd   ?? phase.plannedEnd)?.toISOString()   ?? null,
        notifiedCount: recipients.length,
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (msg.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    console.error('[schedule PATCH]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
