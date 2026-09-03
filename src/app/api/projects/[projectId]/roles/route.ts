import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, requireProjectAuth, invalidateProjectAuth } from '@/lib/auth';
import {
  invalidateProjectAndMemberCaches,
  invalidateUserWorkspaceCaches,
} from '@/lib/cache-invalidation';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, Role } from '@/types';
import { z } from 'zod';
import { sendProjectAssignedEmail, sendProjectInviteEmail, sendRoleConflictInviteEmail, sendVendorPOAssignmentEmail } from '@/lib/email';
import { isDemoEmail } from '@/lib/invite-utils';
import { randomBytes } from 'crypto';
import { loadAssignablePhase } from '@/lib/vendor-po-assignment';
import { isAdminEmail } from '@/lib/adminAuth';

/**
 * Who may assign/edit/remove roles on this project: normally just its own CLIENT, but a
 * platform admin (see adminAuth.ts) can also manage roles on *any* project from /admin —
 * including ones they aren't a member of at all, where requireProjectAuth() would 401 them
 * before RoleGuard ever got a say. Returns a minimal auth-shaped object (only userId/name/role
 * are read by the handlers below) so both paths share the same POST/PATCH/DELETE logic.
 * Admin actions are audit-logged under the synthetic 'PLATFORM_ADMIN' role, not a borrowed
 * project role that wouldn't actually apply to them.
 */
async function requireRoleManager(projectId: string): Promise<{ userId: string; name: string; role: string }> {
  const session = await requireAuth();
  if (isAdminEmail(session.email)) {
    return { userId: session.userId, name: session.name, role: 'PLATFORM_ADMIN' };
  }
  const auth = await requireProjectAuth(projectId);
  RoleGuard.requireRole(auth, ['CLIENT']);
  return auth;
}

const assignRoleSchema = z.object({
  email: z.string().email(),
  role: z.enum(['CLIENT', 'PMC', 'VENDOR', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']),
  force: z.boolean().optional().default(false),
  // Only meaningful when role === 'VENDOR' — the "Assign to Purchase Order" onboarding
  // option. A plain "Email Invite" leaves this unset, same as before this field existed.
  phaseId: z.string().uuid().optional(),
  // Required when role === 'CONSULTANT' — the fee must be set before the consultant is
  // added to the project (see the role === 'CONSULTANT' check below), so PMC never sees
  // a consultant with no fee attached.
  fee: z.number().positive().optional(),
  // Optional display label for a CONSULTANT invite — only meaningful pre-acceptance, since
  // an already-registered user's name comes from their own account.
  name: z.string().trim().min(1).max(200).optional(),
});

const removeRoleSchema = z.object({
  userId: z.string().uuid().optional(),
  inviteId: z.string().uuid().optional(),
  // Required alongside userId now — a user can hold several roles on this project, so the
  // caller must say which row to remove. Not needed for the inviteId path (an invite only
  // ever grants one role).
  role: z.enum(['CLIENT', 'PMC', 'VENDOR', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']).optional(),
});

const updateConsultantSchema = z.object({
  // Exactly one of these — userId for an already-accepted Consultant, inviteId for one
  // still sitting as a Pending Invite (both name and fee need to stay editable pre-acceptance;
  // only fee is editable once they've accepted, since name then belongs to their own account).
  userId: z.string().uuid().optional(),
  inviteId: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  fee: z.number().positive().optional(),
}).refine((v) => v.name !== undefined || v.fee !== undefined, { message: 'name or fee required' });

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
      prisma.$queryRaw<Array<{ id: string; email: string; role: string; fee: number | null; name: string | null; createdAt: Date }>>`
        SELECT id, email, role, fee, name, "createdAt"
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
      fee: r.fee,
      createdAt: r.createdAt,
      isPendingInvite: false,
    }));

    const inviteEntries = invites.map((inv) => ({
      userId: null,
      inviteId: inv.id,
      name: inv.name || 'Pending Invite',
      email: inv.email,
      role: inv.role,
      fee: inv.fee,
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
    const auth = await requireRoleManager(projectId);

    const body = await request.json();
    const { email, role, force, phaseId, fee, name } = assignRoleSchema.parse(body);

    // Consultants must have a fee set before they're added to the project — there's no
    // separate "assign fee" step for PMC to chase down afterward.
    if (role === 'CONSULTANT' && !fee) {
      return NextResponse.json({ success: false, error: 'Consultant fee is required.' }, { status: 400 });
    }

    // $queryRaw used for user so we can read preferredRole (Prisma client predates that column)
    const [userRows, project, projectMeta] = await Promise.all([
      prisma.$queryRaw<Array<{ id: string; name: string; email: string; preferredRole: string | null }>>`
        SELECT id, name, email, "preferredRole" FROM "User" WHERE email = ${email} LIMIT 1
      `,
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      prisma.project.findUnique({ where: { id: projectId }, select: { metadata: true } }),
    ]);
    const user = userRows[0] ?? null;
    const currency = projectMeta?.metadata ? (JSON.parse(projectMeta.metadata).currency || 'INR') : 'INR';

    // "Assign to Purchase Order" onboarding option — only valid for a VENDOR invite, and only
    // onto a Purchase Order that doesn't already have a vendor.
    let poAssignment: Extract<Awaited<ReturnType<typeof loadAssignablePhase>>, { ok: true }> | null = null;
    if (phaseId && role === 'VENDOR') {
      const result = await loadAssignablePhase(projectId, phaseId);
      if (!result.ok) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
      poAssignment = result;
    }

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
        INSERT INTO "ProjectInvite" (id, "projectId", email, role, "phaseId", fee, name, token, status, "invitedById", "expiresAt", "createdAt")
        VALUES (
          gen_random_uuid(),
          ${projectId},
          ${email},
          ${role},
          ${poAssignment?.phase.id ?? null},
          ${role === 'CONSULTANT' ? fee : null},
          ${role === 'CONSULTANT' ? (name ?? null) : null},
          ${token},
          'PENDING',
          ${auth.userId},
          ${expiresAt},
          NOW()
        )
      `;

      // Skip sending email for demo/placeholder addresses (@example.com).
      // Those users get auto-accepted when they register — no email needed.
      if (project && !isDemoEmail(email)) {
        if (poAssignment) {
          sendVendorPOAssignmentEmail({
            to: email,
            vendorName: 'there',
            actorName: auth.name,
            projectName: project.name,
            currency,
            acceptUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://axinfra.in'}/invite/${token}`,
            isNewUser: true,
            ...poAssignment.emailPayload,
          }).catch((e) => console.error('[email] vendor-po-assignment failed:', e));
        } else {
          sendProjectInviteEmail(email, auth.name, project.name, role, token).catch((e) =>
            console.error('[email] project-invite failed:', e)
          );
        }
      }

      const isDemo = isDemoEmail(email);
      return NextResponse.json({
        success: true,
        invited: true,
        message: isDemo
          ? `Demo vendor added. They will be auto-assigned to this project when they register with ${email}.`
          : `Invitation sent to ${email}. They will appear as "Pending Invite" until they accept.`,
      });
    }

    // ── User exists → check preferredRole conflict ───────────────────────────
    if (user.preferredRole && user.preferredRole !== role) {
      if (!force) {
        // Warn the admin — let them confirm before proceeding
        return NextResponse.json(
          {
            success: false,
            conflict: true,
            userPreferredRole: user.preferredRole,
            error: `This user is registered as ${ROLE_LABELS[user.preferredRole] ?? user.preferredRole}. Do you want to invite them as ${ROLE_LABELS[role] ?? role} instead? They will receive a notification and must accept.`,
          },
          { status: 409 }
        );
      }

      // force=true: admin confirmed — create a pending invite so the user accepts explicitly
      await prisma.$executeRaw`
        DELETE FROM "ProjectInvite"
        WHERE "projectId" = ${projectId} AND email = ${email}
      `;

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await prisma.$executeRaw`
        INSERT INTO "ProjectInvite" (id, "projectId", email, role, "phaseId", fee, name, token, status, "invitedById", "expiresAt", "createdAt")
        VALUES (
          gen_random_uuid(),
          ${projectId},
          ${email},
          ${role},
          ${poAssignment?.phase.id ?? null},
          ${role === 'CONSULTANT' ? fee : null},
          ${role === 'CONSULTANT' ? (name ?? null) : null},
          ${token},
          'PENDING',
          ${auth.userId},
          ${expiresAt},
          NOW()
        )
      `;

      if (project) {
        if (poAssignment) {
          sendVendorPOAssignmentEmail({
            to: email,
            vendorName: user.name,
            actorName: auth.name,
            projectName: project.name,
            currency,
            acceptUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://axinfra.in'}/invite/${token}`,
            isNewUser: true,
            ...poAssignment.emailPayload,
          }).catch((e) => console.error('[email] vendor-po-assignment failed:', e));
        } else {
          sendRoleConflictInviteEmail(email, user.name, auth.name, project.name, role, user.preferredRole, token).catch((e) =>
            console.error('[email] role-conflict-invite failed:', e)
          );
        }
      }

      return NextResponse.json({
        success: true,
        invited: true,
        message: `Invitation sent to ${email}. They will be notified about the role change and must accept.`,
      });
    }

    // ── No conflict → assign directly ────────────────────────────────────────
    // A user can now hold several roles on the same project — only block an exact duplicate
    // of the role being assigned; a user who already holds e.g. PMC can also be granted
    // CONSULTANT here.
    const existingRole = await prisma.projectRole.findFirst({
      where: { projectId, userId: user.id, role },
    });

    if (existingRole) {
      return NextResponse.json(
        { success: false, error: `User already has the ${ROLE_LABELS[role] ?? role} role on this project.` },
        { status: 400 }
      );
    }

    const roleData = { projectId, userId: user.id, role: role as Role, fee: role === 'CONSULTANT' ? fee : null };
    if (poAssignment) {
      await prisma.$transaction([
        prisma.projectRole.create({ data: roleData }),
        prisma.phase.update({ where: { id: poAssignment.phase.id }, data: { vendorUserId: user.id } }),
      ]);
    } else {
      await prisma.projectRole.create({ data: roleData });
    }

    await invalidateProjectAuth(projectId, user.id);
    await invalidateProjectAndMemberCaches(projectId);

    if (project) {
      if (poAssignment) {
        sendVendorPOAssignmentEmail({
          to: user.email,
          vendorName: user.name,
          actorName: auth.name,
          projectName: project.name,
          currency,
          acceptUrl: `${process.env.NEXT_PUBLIC_APP_URL ?? 'https://axinfra.in'}/projects/${projectId}`,
          isNewUser: false,
          ...poAssignment.emailPayload,
        }).catch((e) => console.error('[email] vendor-po-assignment failed:', e));
      } else {
        sendProjectAssignedEmail(user.email, user.name, project.name, role, projectId).catch((e) =>
          console.error('[email] project-assigned notification failed:', e)
        );
      }
    }

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.ROLE_ASSIGN,
      entityType: 'ProjectRole',
      entityId: `${projectId}-${user.id}`,
      afterJson: { userId: user.id, email, role, phaseId: poAssignment?.phase.id ?? null, fee: roleData.fee },
    });

    return NextResponse.json({
      success: true,
      data: { userId: user.id, name: user.name, email: user.email, role, fee: roleData.fee },
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

// PATCH /api/projects/[projectId]/roles - Edit a consultant's name and/or fee
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireRoleManager(projectId);

    const body = await request.json();
    const { userId, inviteId, fee, name } = updateConsultantSchema.parse(body);

    if (!userId && !inviteId) {
      return NextResponse.json({ success: false, error: 'userId or inviteId required' }, { status: 400 });
    }

    // ── Editing name/fee on a still-pending invite ──────────────────────────
    if (inviteId) {
      const invite = await prisma.projectInvite.findFirst({ where: { id: inviteId, projectId } });
      if (!invite) {
        return NextResponse.json({ success: false, error: 'Invite not found' }, { status: 404 });
      }
      if (invite.role !== 'CONSULTANT') {
        return NextResponse.json({ success: false, error: 'Only Consultants can be edited here' }, { status: 400 });
      }

      const before = { fee: invite.fee, name: invite.name };
      const data: { fee?: number; name?: string } = {};
      if (fee !== undefined) data.fee = fee;
      if (name !== undefined) data.name = name;
      await prisma.projectInvite.update({ where: { id: inviteId }, data });

      await AuditLogger.log({
        projectId,
        actorId: auth.userId,
        role: auth.role,
        actionType: AuditActionTypes.ROLE_ASSIGN,
        entityType: 'ProjectInvite',
        entityId: inviteId,
        beforeJson: before,
        afterJson: { fee: data.fee ?? before.fee, name: data.name ?? before.name },
      });

      return NextResponse.json({ success: true, data: { inviteId, fee: data.fee ?? before.fee, name: data.name ?? before.name } });
    }

    // ── Editing fee on an already-accepted Consultant — name isn't editable here, it
    // belongs to their own User account ──────────────────────────────────────
    if (fee === undefined) {
      return NextResponse.json({ success: false, error: 'Fee is required' }, { status: 400 });
    }

    // A user can hold several roles on this project now — look up the CONSULTANT row
    // specifically, since fee only ever applies to that one.
    const existingRole = await prisma.projectRole.findFirst({
      where: { projectId, userId: userId!, role: 'CONSULTANT' },
    });

    if (!existingRole) {
      return NextResponse.json({ success: false, error: 'Consultant role not found for this user' }, { status: 404 });
    }

    const before = existingRole.fee;
    await prisma.projectRole.update({ where: { id: existingRole.id }, data: { fee } });

    await invalidateProjectAndMemberCaches(projectId);

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.ROLE_ASSIGN,
      entityType: 'ProjectRole',
      entityId: `${projectId}-${userId}`,
      beforeJson: { fee: before },
      afterJson: { fee },
    });

    return NextResponse.json({ success: true, data: { userId, fee } });
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
    console.error('Role fee update error:', error);
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
    const auth = await requireRoleManager(projectId);

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
    // `role` is required alongside userId now — a user can hold several roles on this
    // project, so the caller must say which row to remove.
    if (!parsed.userId || !parsed.role) {
      return NextResponse.json({ success: false, error: 'userId and role are required' }, { status: 400 });
    }

    const userId = parsed.userId;
    const roleToRemove = parsed.role;

    // Only block removing the last CLIENT row specifically — under multi-role a CLIENT
    // removing one of their own other roles (e.g. CONSULTANT) on this project is fine.
    if (userId === auth.userId && roleToRemove === Role.CLIENT) {
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

    const existingRole = await prisma.projectRole.findFirst({
      where: { projectId, userId, role: roleToRemove },
      include: { user: true },
    });

    if (!existingRole) {
      return NextResponse.json({ success: false, error: 'Role not found' }, { status: 404 });
    }

    await prisma.projectRole.delete({
      where: { id: existingRole.id },
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
