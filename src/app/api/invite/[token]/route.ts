import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { Role } from '@/types';
import { getOverviewRollup } from '@/services/BOQService';

// GET /api/invite/[token] — fetch invite details (public, no auth required)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const invite = await prisma.projectInvite.findUnique({
      where: { token },
      include: {
        project: { select: { name: true, metadata: true } },
        invitedBy: { select: { name: true } },
        phase: {
          include: {
            workOrder: { select: { number: true, status: true } },
            boqs: { include: { items: { select: { plannedQty: true, unit: true, rate: true, plannedValue: true } } } },
          },
        },
      },
    });

    if (!invite) {
      return NextResponse.json({ success: false, error: 'Invite not found or already used.' }, { status: 404 });
    }

    if (invite.status !== 'PENDING') {
      return NextResponse.json({ success: false, error: 'This invite has already been accepted.' }, { status: 410 });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'This invite link has expired.' }, { status: 410 });
    }

    const currency = invite.project.metadata ? (JSON.parse(invite.project.metadata).currency || 'INR') : 'INR';

    return NextResponse.json({
      success: true,
      data: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        projectName: invite.project.name,
        inviterName: invite.invitedBy.name,
        currency,
        purchaseOrder: invite.phase
          ? {
              id: invite.phase.id,
              name: invite.phase.name,
              plannedStart: invite.phase.plannedStart,
              plannedEnd: invite.phase.plannedEnd,
              estimatedCost: invite.phase.estimatedCost,
              workOrder: invite.phase.workOrder,
              boqs: invite.phase.boqs.map((b) => ({
                id: b.id,
                boqNumber: b.boqNumber,
                name: b.name,
                plannedStart: b.plannedStart,
                plannedEnd: b.plannedEnd,
                value: getOverviewRollup(b.items).totalValue,
              })),
            }
          : null,
      },
    });
  } catch (error) {
    console.error('Invite GET error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/invite/[token] — accept invite (requires auth)
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const session = await getSession();

    if (!session) {
      return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 });
    }

    const invite = await prisma.projectInvite.findUnique({ where: { token } });

    if (!invite) {
      return NextResponse.json({ success: false, error: 'Invite not found.' }, { status: 404 });
    }

    if (invite.status !== 'PENDING') {
      return NextResponse.json({ success: false, error: 'This invite has already been accepted.' }, { status: 410 });
    }

    if (invite.expiresAt < new Date()) {
      return NextResponse.json({ success: false, error: 'This invite link has expired.' }, { status: 410 });
    }

    // Verify the logged-in user's email matches the invite
    if (session.email.toLowerCase() !== invite.email.toLowerCase()) {
      return NextResponse.json(
        { success: false, error: `This invitation was sent to ${invite.email}. Please sign in with that email address to accept it.` },
        { status: 403 }
      );
    }

    // Check not already a member
    const existing = await prisma.projectRole.findUnique({
      where: { projectId_userId: { projectId: invite.projectId, userId: session.userId } },
    });

    if (existing) {
      // Mark invite accepted and return success so they can navigate to the project
      await prisma.projectInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED' } });
      return NextResponse.json({ success: true, projectId: invite.projectId, phaseId: null });
    }

    // A Purchase Order-linked invite only actually assigns the vendor if the PO is still
    // unassigned by the time they accept — someone else may have been assigned in the
    // meantime. Either way the invite itself still grants the project role.
    let assignedPhaseId: string | null = null;
    if (invite.phaseId) {
      const phase = await prisma.phase.findUnique({ where: { id: invite.phaseId }, select: { vendorUserId: true } });
      if (phase && !phase.vendorUserId) assignedPhaseId = invite.phaseId;
    }

    await prisma.$transaction([
      prisma.projectRole.create({
        data: {
          projectId: invite.projectId,
          userId: session.userId,
          role: invite.role as Role,
        },
      }),
      prisma.projectInvite.update({ where: { id: invite.id }, data: { status: 'ACCEPTED' } }),
      ...(assignedPhaseId
        ? [prisma.phase.update({ where: { id: assignedPhaseId }, data: { vendorUserId: session.userId } })]
        : []),
    ]);

    await invalidateProjectAndMemberCaches(invite.projectId);

    return NextResponse.json({ success: true, projectId: invite.projectId, phaseId: assignedPhaseId });
  } catch (error) {
    console.error('Invite accept error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
