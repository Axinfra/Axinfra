/**
 * GET  /api/admin/vendors?projectId=xxx — List vendor users + pending invites in a project
 * POST /api/admin/vendors               — Invite or directly assign a vendor to a project
 *
 * Access: CLIENT or PMC only (checked per-project).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role } from '@/types';
import { z } from 'zod';
import { randomBytes } from 'crypto';
import { sendProjectInviteEmail, sendProjectAssignedEmail, sendRoleConflictInviteEmail } from '@/lib/email';

const createVendorSchema = z.object({
  email: z.string().email('Invalid email address'),
  projectId: z.string().uuid('Invalid project ID'),
  force: z.boolean().optional().default(false),
});

// ─── GET: list vendors + pending invites for a project ───────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();

    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId query param required' },
        { status: 400 },
      );
    }

    const callerRole = await prisma.projectRole.findUnique({
      where: { projectId_userId: { projectId, userId: auth.userId } },
    });
    if (!callerRole || (callerRole.role !== Role.CLIENT && callerRole.role !== Role.PMC)) {
      return NextResponse.json(
        { success: false, error: 'You must be Owner or PMC of this project' },
        { status: 403 },
      );
    }

    const [vendorRoles, pendingInvites] = await Promise.all([
      prisma.projectRole.findMany({
        where: { projectId, role: Role.VENDOR },
        include: {
          user: { select: { id: true, name: true, email: true, createdAt: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.$queryRaw<Array<{ id: string; email: string; createdAt: Date }>>`
        SELECT id, email, "createdAt"
        FROM "ProjectInvite"
        WHERE "projectId" = ${projectId}
          AND role = 'VENDOR'
          AND status = 'PENDING'
          AND "expiresAt" > NOW()
        ORDER BY "createdAt" DESC
      `,
    ]);

    return NextResponse.json({
      success: true,
      data: [
        ...vendorRoles.map((vr) => ({
          userId: vr.user.id,
          inviteId: null,
          name: vr.user.name,
          email: vr.user.email,
          role: vr.role,
          assignedAt: vr.createdAt,
          userCreatedAt: vr.user.createdAt,
          isPendingInvite: false,
        })),
        ...pendingInvites.map((inv) => ({
          userId: null,
          inviteId: inv.id,
          name: 'Pending Invite',
          email: inv.email,
          role: 'VENDOR',
          assignedAt: inv.createdAt,
          userCreatedAt: null,
          isPendingInvite: true,
        })),
      ],
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (msg.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }
    console.error('[admin/vendors GET]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}

// ─── POST: invite or directly assign vendor ──────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();

    const body = await request.json();
    const { email, projectId, force } = createVendorSchema.parse(body);

    const [project, callerRole] = await Promise.all([
      prisma.project.findUnique({ where: { id: projectId }, select: { name: true } }),
      prisma.projectRole.findUnique({
        where: { projectId_userId: { projectId, userId: auth.userId } },
      }),
    ]);

    if (!project) {
      return NextResponse.json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    if (!callerRole || (callerRole.role !== Role.CLIENT && callerRole.role !== Role.PMC)) {
      return NextResponse.json(
        { success: false, error: 'You must be Owner or PMC of this project' },
        { status: 403 },
      );
    }

    const userRows = await prisma.$queryRaw<Array<{ id: string; name: string; email: string; preferredRole: string | null }>>`
      SELECT id, name, email, "preferredRole" FROM "User" WHERE email = ${email} LIMIT 1
    `;
    const existingUser = userRows[0] ?? null;

    // ── Vendor not in DB → send invite ───────────────────────────────────────
    if (!existingUser) {
      // Remove any previous invite for this email+project before creating a new one
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
          'VENDOR',
          ${token},
          'PENDING',
          ${auth.userId},
          ${expiresAt},
          NOW()
        )
      `;

      sendProjectInviteEmail(email, auth.name, project.name, 'VENDOR', token).catch((e) =>
        console.error('[email] vendor-invite failed:', e)
      );

      return NextResponse.json({
        success: true,
        invited: true,
        message: `Invitation sent to ${email}. They will appear as "Pending Invite" until they accept.`,
      });
    }

    // ── Vendor in DB → check preferredRole conflict ──────────────────────────
    const ROLE_LABELS: Record<string, string> = {
      CLIENT: 'Project Owner', PMC: 'PMC', VENDOR: 'Vendor', CONSULTANT: 'Consultant', VIEWER: 'Viewer',
    };

    if (existingUser.preferredRole && existingUser.preferredRole !== 'VENDOR') {
      if (!force) {
        return NextResponse.json(
          {
            success: false,
            conflict: true,
            userPreferredRole: existingUser.preferredRole,
            error: `This user is registered as ${ROLE_LABELS[existingUser.preferredRole] ?? existingUser.preferredRole}. Invite them as Vendor anyway? They will receive a notification and must accept.`,
          },
          { status: 409 },
        );
      }

      // force=true → create pending invite so user accepts explicitly
      await prisma.$executeRaw`
        DELETE FROM "ProjectInvite"
        WHERE "projectId" = ${projectId} AND email = ${email}
      `;

      const token = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      await prisma.$executeRaw`
        INSERT INTO "ProjectInvite" (id, "projectId", email, role, token, status, "invitedById", "expiresAt", "createdAt")
        VALUES (
          gen_random_uuid(),
          ${projectId},
          ${email},
          'VENDOR',
          ${token},
          'PENDING',
          ${auth.userId},
          ${expiresAt},
          NOW()
        )
      `;

      sendRoleConflictInviteEmail(email, existingUser.name, auth.name, project.name, 'VENDOR', existingUser.preferredRole, token).catch((e) =>
        console.error('[email] vendor-conflict-invite failed:', e)
      );

      return NextResponse.json({
        success: true,
        invited: true,
        message: `Invitation sent to ${email}. They will be notified about the role change and must accept.`,
      });
    }

    // ── No conflict → assign directly ────────────────────────────────────────
    const existingRole = await prisma.projectRole.findUnique({
      where: { projectId_userId: { projectId, userId: existingUser.id } },
    });

    if (existingRole) {
      return NextResponse.json(
        { success: false, error: 'This user already has a role in this project' },
        { status: 400 },
      );
    }

    await prisma.projectRole.create({
      data: { projectId, userId: existingUser.id, role: Role.VENDOR },
    });

    sendProjectAssignedEmail(existingUser.email, existingUser.name, project.name, 'VENDOR', projectId).catch((e) =>
      console.error('[email] vendor-assigned failed:', e)
    );

    return NextResponse.json({
      success: true,
      invited: false,
      data: {
        userId: existingUser.id,
        name: existingUser.name,
        email: existingUser.email,
        role: Role.VENDOR,
        projectId,
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    if (msg === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (msg.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: msg }, { status: 403 });
    }
    if (err instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input', details: err.errors },
        { status: 400 },
      );
    }
    console.error('[admin/vendors POST]', err);
    return NextResponse.json({ success: false, error: 'Internal error' }, { status: 500 });
  }
}
