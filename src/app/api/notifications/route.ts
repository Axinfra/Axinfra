import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

/**
 * GET /api/notifications
 * Returns recent SystemEvent notifications relevant to the current user.
 * - VENDOR:  sees MILESTONE_VERIFIED and REVISION_REQUESTED events
 * - PMC:     sees EVIDENCE_SUBMITTED events
 * - OWNER:   sees PAYMENT_REQUIRED events
 */
export async function GET() {
  try {
    const auth = await requireAuth();

    // Find all projects this user has a role in
    const roles = await prisma.projectRole.findMany({
      where: { userId: auth.userId },
      select: { projectId: true, role: true },
    });

    if (roles.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    // Map role → which event types to show
    const eventTypesByRole: Record<string, string[]> = {
      VENDOR: ['MILESTONE_VERIFIED', 'REVISION_REQUESTED', 'PAYMENT_DONE', 'PAYMENT_NOT_DONE'],
      PMC: [
        'EVIDENCE_SUBMITTED', 'WORK_STARTED', 'PAYMENT_DONE', 'PAYMENT_NOT_DONE',
        'BOQ_APPROVED', 'BOQ_REVISION_REQUESTED',
        'ARCH_SET_SUBMITTED', 'ARCH_DRAWING_SUBMITTED', 'ARCH_SET_PAID',
      ],
      OWNER: [
        'PAYMENT_REQUIRED', 'MILESTONE_VERIFIED',
        'BOQ_SUBMITTED', 'ARCH_SET_APPROVED',
      ],
      CONSULTANT: [
        'BOQ_APPROVED', 'BOQ_REVISION_REQUESTED',
        'ARCH_SET_REQUESTED', 'ARCH_DRAWING_APPROVED', 'ARCH_DRAWING_REJECTED',
      ],
      VIEWER: [],
    };

    // Collect all project IDs and event types across all roles the user has
    const projectIds = Array.from(new Set(roles.map((r) => r.projectId)));
    const eventTypes = Array.from(new Set(roles.flatMap((r) => eventTypesByRole[r.role] ?? [])));

    if (eventTypes.length === 0) {
      return NextResponse.json({ success: true, data: [] });
    }

    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000); // last 7 days

    const events = await prisma.systemEvent.findMany({
      where: {
        projectId: { in: projectIds },
        eventType: { in: eventTypes },
        createdAt: { gte: cutoff },
        project: { deletedAt: null },
      },
      include: {
        project: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json({
      success: true,
      data: events.map((e) => ({
        id: e.id,
        eventType: e.eventType,
        message: e.message,
        severity: e.severity,
        projectId: e.projectId,
        projectName: e.project?.name ?? '',
        entityId: e.entityId,
        entityType: e.entityType,
        createdAt: e.createdAt,
      })),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'error';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('[notifications]', err);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
