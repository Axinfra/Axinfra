import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { getSession } from '@/lib/auth';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { Role } from '@/types';

// GET /api/invite/[token] — fetch invite details (public, no auth required)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;

    const rows = await prisma.$queryRaw<Array<{
      id: string;
      email: string;
      role: string;
      status: string;
      expiresAt: Date;
      projectName: string;
      inviterName: string;
    }>>`
      SELECT
        pi.id,
        pi.email,
        pi.role,
        pi.status,
        pi."expiresAt",
        p.name AS "projectName",
        u.name AS "inviterName"
      FROM "ProjectInvite" pi
      JOIN "Project" p ON p.id = pi."projectId"
      JOIN "User" u ON u.id = pi."invitedById"
      WHERE pi.token = ${token}
      LIMIT 1
    `;

    const invite = rows[0];

    if (!invite) {
      return NextResponse.json({ success: false, error: 'Invite not found or already used.' }, { status: 404 });
    }

    if (invite.status !== 'PENDING') {
      return NextResponse.json({ success: false, error: 'This invite has already been accepted.' }, { status: 410 });
    }

    if (new Date(invite.expiresAt) < new Date()) {
      return NextResponse.json({ success: false, error: 'This invite link has expired.' }, { status: 410 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: invite.id,
        email: invite.email,
        role: invite.role,
        projectName: invite.projectName,
        inviterName: invite.inviterName,
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

    const rows = await prisma.$queryRaw<Array<{
      id: string;
      projectId: string;
      email: string;
      role: string;
      status: string;
      expiresAt: Date;
    }>>`
      SELECT id, "projectId", email, role, status, "expiresAt"
      FROM "ProjectInvite"
      WHERE token = ${token}
      LIMIT 1
    `;

    const invite = rows[0];

    if (!invite) {
      return NextResponse.json({ success: false, error: 'Invite not found.' }, { status: 404 });
    }

    if (invite.status !== 'PENDING') {
      return NextResponse.json({ success: false, error: 'This invite has already been accepted.' }, { status: 410 });
    }

    if (new Date(invite.expiresAt) < new Date()) {
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
      await prisma.$executeRaw`
        UPDATE "ProjectInvite" SET status = 'ACCEPTED' WHERE id = ${invite.id}
      `;
      return NextResponse.json({ success: true, projectId: invite.projectId });
    }

    // Create project role + mark invite accepted in a transaction
    await prisma.$transaction([
      prisma.projectRole.create({
        data: {
          projectId: invite.projectId,
          userId: session.userId,
          role: invite.role as Role,
        },
      }),
      prisma.$executeRaw`
        UPDATE "ProjectInvite" SET status = 'ACCEPTED' WHERE id = ${invite.id}
      `,
    ]);

    await invalidateProjectAndMemberCaches(invite.projectId);

    return NextResponse.json({ success: true, projectId: invite.projectId });
  } catch (error) {
    console.error('Invite accept error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
