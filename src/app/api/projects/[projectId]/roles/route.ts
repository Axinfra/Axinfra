import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth, invalidateProjectAuth } from '@/lib/auth';
import {
  invalidateProjectAndMemberCaches,
  invalidateUserWorkspaceCaches,
} from '@/lib/cache-invalidation';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, Role } from '@/types';
import { z } from 'zod';
import { sendProjectAssignedEmail, sendProjectInviteEmail } from '@/lib/email';
import { randomBytes } from 'crypto';

const assignRoleSchema = z.object({
  email: z.string().email(),
  role: z.enum(['CLIENT', 'PMC', 'VENDOR', 'VIEWER', 'CONSULTANT']),
});

const removeRoleSchema = z.object({
  userId: z.string().uuid().optional(),
  inviteId: z.string().uuid().optional(),
});

const ROLE_LABELS: Record<string, string> = {
  CLIENT: 'Project Owner',
  PMC: 'PMC',
  VENDOR: 'Vendor',
  CONSULTANT: 'Consultant',
  VIEWER: 'Viewer',
};

// GET /api/projects/[projectId]/roles - List project roles + pending invites
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const [roles, invites] = await Promise.all([
      prisma.projectRole.findMany({
        where: { projectId },
        include: {
          user: { select: { id: true, name: true, email: true } },
        },
      }),
      prisma.$queryRaw<Array<{ id: string; email: string; role: string; createdAt: Date }>>`
        SELECT id, email, role, "createdAt"
        FROM "ProjectInvite"
        WHERE "projectId" = ${projectId}
          AND status = 'PENDING'
          AND "expiresAt" > NOW()
      `,
    ]);

    const roleEntries = roles.map((r) => ({
      userId: r.userId,
      name: r.user.name,
      email: r.user.email,
      role: r.role,
      createdAt: r.createdAt,
      isPendingInvite: false,
    }));

    const inviteEntries = invites.map((inv) => ({
      userId: null,
      inviteId: inv.id,
      name: 'Pending Invite',
      email: inv.email,
      role: inv.role,
      createdAt: inv.createdAt,
      isPendingInvite: true,
    }));

    return NextResponse.json({
      success: true,
      data: [...roleEntries, ...inviteEntries],
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Roles list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/roles - Assign role or send invite
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['CLIENT']);

    const body = await request.json();
    const { email, role } = assignRoleSchema.parse(body);

    // $queryRaw used for user so we can read preferredRole (Prisma client predates that column)
    const [userRows, project] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; name: string; email: string; preferredRole: string | null }>>`
        SELECT id, name, email, "preferredRole" FROM "User" WHERE email = ${email} LIMIT 1
      `,
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
    ]);
    const user = userRows[0] ?? null;

    // ── User not in DB → create a pending invite ─────────────────────────────
    if (!user) {
      // Cancel any previous expired/pending invite for this email+project
      await prisma.$executeRaw`
        DELETE FROM "ProjectInvite"
        WHERE "projectId" = ${projectId} AND email = ${email}
      `;

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

      await prisma.$executeRaw`
        INSERT INTO "ProjectInvite" (id, "projectId", email, role, token, status, "invitedById", "expiresAt", "createdAt")
        VALUES (
          gen_random_uuid(),
          ${projectId},
          ${email},
          ${role},
          ${token},
          'PENDING',
          ${auth.userId},
          ${expiresAt},
          NOW()
        )
      `;

      if (project) {
        sendProjectInviteEmail(email, auth.name, project.name, role, token).catch((e) =>
          console.error('[email] project-invite failed:', e)
        );
      }

      return NextResponse.json({
        success: true,
        invited: true,
        message: `Invitation sent to ${email}. They will appear as "Pending Invite" until they accept.`,
      });
    }

    // ── User exists → validate preferredRole ─────────────────────────────────
    if (user.preferredRole && user.preferredRole !== role) {
      return NextResponse.json(
        {
          success: false,
          error: `This user registered as ${ROLE_LABELS[user.preferredRole] ?? user.preferredRole}. You can only assign them the ${ROLE_LABELS[user.preferredRole] ?? user.preferredRole} role.`,
        },
        { status: 400 }
      );
    }

    // Check no duplicate role
    const existingRole = await prisma.projectRole.findUnique({
      where: { projectId_userId: { projectId, userId: user.id } },
    });

    if (existingRole) {
      return NextResponse.json(
        { success: false, error: 'User already has a role in this project. Remove first.' },
        { status: 400 }
      );
    }

    await prisma.projectRole.create({
      data: { projectId, userId: user.id, role: role as Role },
    });

    await invalidateProjectAuth(projectId, user.id);
    await invalidateProjectAndMemberCaches(projectId);

    if (project) {
      sendProjectAssignedEmail(user.email, user.name, project.name, role, projectId).catch((e) =>
        console.error('[email] project-assigned notification failed:', e)
      );
    }

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.ROLE_ASSIGN,
      entityType: 'ProjectRole',
      entityId: `${projectId}-${user.id}`,
      afterJson: { userId: user.id, email, role },
    });

    return NextResponse.json({
      success: true,
      data: { userId: user.id, name: user.name, email: user.email, role },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    console.error('Role assign error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/roles - Remove role or cancel invite
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['CLIENT']);

    const body = await request.json();
    const parsed = removeRoleSchema.parse(body);

    // ── Cancel a pending invite ───────────────────────────────────────────────
    if (parsed.inviteId) {
      await prisma.$executeRaw`
        DELETE FROM "ProjectInvite"
        WHERE id = ${parsed.inviteId} AND "projectId" = ${projectId}
      `;
      return NextResponse.json({ success: true });
    }

    // ── Remove an existing role ───────────────────────────────────────────────
    if (!parsed.userId) {
      return NextResponse.json({ success: false, error: 'userId or inviteId required' }, { status: 400 });
    }

    const userId = parsed.userId;

    if (userId === auth.userId) {
      const clientCount = await prisma.projectRole.count({
        where: { projectId, role: Role.CLIENT },
      });
      if (clientCount <= 1) {
        return NextResponse.json(
          { success: false, error: 'Cannot remove the only Owner' },
          { status: 400 }
        );
      }
    }

    const existingRole = await prisma.projectRole.findUnique({
      where: { projectId_userId: { projectId, userId } },
      include: { user: true },
    });

    if (!existingRole) {
      return NextResponse.json({ success: false, error: 'Role not found' }, { status: 404 });
    }

    await prisma.projectRole.delete({
      where: { projectId_userId: { projectId, userId } },
    });

    await invalidateProjectAuth(projectId, userId);
    await invalidateUserWorkspaceCaches(userId);
    await invalidateProjectAndMemberCaches(projectId);

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.ROLE_REMOVE,
      entityType: 'ProjectRole',
      entityId: `${projectId}-${userId}`,
      beforeJson: { userId, email: existingRole.user.email, role: existingRole.role },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    console.error('Role remove error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
