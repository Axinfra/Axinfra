/**
 * GET  /api/admin/vendors?projectId=xxx — List vendor users in a project
 * POST /api/admin/vendors               — Create a new vendor user + assign to project
 *
 * Access: OWNER or PMC only (checked via any project role).
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { Role } from '@/types';
import bcrypt from 'bcryptjs';
import { z } from 'zod';

const createVendorSchema = z.object({
  username: z
    .string()
    .min(3, 'Username must be at least 3 characters')
    .max(50)
    .regex(/^[a-zA-Z0-9_.-]+$/, 'Username may only contain letters, numbers, dots, hyphens, underscores'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  displayName: z.string().min(1, 'Display name is required').max(100),
  projectId: z.string().uuid('Invalid project ID'),
});

/** Verify caller is OWNER or PMC in at least one project */
async function requireAdminCaller(userId: string) {
  const adminRole = await prisma.projectRole.findFirst({
    where: {
      userId,
      role: { in: [Role.OWNER, Role.PMC] },
    },
  });
  if (!adminRole) {
    throw new Error('FORBIDDEN: Only Owner or PMC can manage vendors');
  }
  return adminRole;
}

// ─── GET: list vendors for a project ────────────────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const auth = await requireAuth();
    await requireAdminCaller(auth.userId);

    const projectId = request.nextUrl.searchParams.get('projectId');
    if (!projectId) {
      return NextResponse.json(
        { success: false, error: 'projectId query param required' },
        { status: 400 },
      );
    }

    const vendorRoles = await prisma.projectRole.findMany({
      where: { projectId, role: Role.VENDOR },
      include: {
        user: { select: { id: true, name: true, email: true, createdAt: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: vendorRoles.map((vr) => ({
        userId: vr.user.id,
        name: vr.user.name,
        email: vr.user.email,
        role: vr.role,
        assignedAt: vr.createdAt,
        userCreatedAt: vr.user.createdAt,
      })),
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

// ─── POST: create vendor user + assign to project ───────────────────────────
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    await requireAdminCaller(auth.userId);

    const body = await request.json();
    const { username, password, displayName, projectId } = createVendorSchema.parse(body);

    // Build email from username (demo convention)
    const email = username.includes('@') ? username : `${username}@vendor.local`;

    // Check project exists
    const project = await prisma.project.findUnique({ where: { id: projectId } });
    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 },
      );
    }

    // Verify caller has OWNER or PMC role in THIS project
    const callerRole = await prisma.projectRole.findUnique({
      where: { projectId_userId: { projectId, userId: auth.userId } },
    });
    if (!callerRole || (callerRole.role !== Role.OWNER && callerRole.role !== Role.PMC)) {
      return NextResponse.json(
        { success: false, error: 'You must be Owner or PMC of this project' },
        { status: 403 },
      );
    }

    // Check if email already taken
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      // User exists — just assign vendor role if not already assigned
      const existingRole = await prisma.projectRole.findUnique({
        where: { projectId_userId: { projectId, userId: existingUser.id } },
      });
      if (existingRole) {
        return NextResponse.json(
          { success: false, error: 'User already has a role in this project' },
          { status: 400 },
        );
      }

      await prisma.projectRole.create({
        data: { projectId, userId: existingUser.id, role: Role.VENDOR },
      });

      return NextResponse.json({
        success: true,
        data: {
          userId: existingUser.id,
          name: existingUser.name,
          email: existingUser.email,
          role: Role.VENDOR,
          projectId,
          created: false,
        },
      });
    }

    // Create new user with hashed password
    const hashedPassword = await bcrypt.hash(password, 10);

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          name: displayName,
          email,
          hashedPassword,
        },
      });

      await tx.projectRole.create({
        data: {
          projectId,
          userId: user.id,
          role: Role.VENDOR,
        },
      });

      return user;
    });

    return NextResponse.json({
      success: true,
      data: {
        userId: result.id,
        name: result.name,
        email: result.email,
        role: Role.VENDOR,
        projectId,
        created: true,
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
