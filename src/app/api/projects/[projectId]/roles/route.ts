import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, Role } from '@/types';
import { z } from 'zod';

const assignRoleSchema = z.object({
  email: z.string().email(),
  role: z.enum(['OWNER', 'PMC', 'VENDOR', 'VIEWER']),
});

const removeRoleSchema = z.object({
  userId: z.string().uuid(),
});

// GET /api/projects/[projectId]/roles - List project roles
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const roles = await prisma.projectRole.findMany({
      where: { projectId },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
    });

    return NextResponse.json({
      success: true,
      data: roles.map((r) => ({
        userId: r.userId,
        name: r.user.name,
        email: r.user.email,
        role: r.role,
        createdAt: r.createdAt,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Roles list error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/roles - Assign role to user
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only Owner can manage roles
    RoleGuard.requireRole(auth, ['OWNER']);

    const body = await request.json();
    const { email, role } = assignRoleSchema.parse(body);

    // Find user by email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'User not found with that email' },
        { status: 404 }
      );
    }

    // Check if user already has a role (no role overlap per spec)
    const existingRole = await prisma.projectRole.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId: user.id,
        },
      },
    });

    if (existingRole) {
      return NextResponse.json(
        { success: false, error: 'User already has a role in this project. Remove first.' },
        { status: 400 }
      );
    }

    // Create role
    await prisma.projectRole.create({
      data: {
        projectId,
        userId: user.id,
        role: role as Role,
      },
    });

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
      data: {
        userId: user.id,
        name: user.name,
        email: user.email,
        role,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      );
    }
    console.error('Role assign error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId]/roles - Remove role from user
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only Owner can manage roles
    RoleGuard.requireRole(auth, ['OWNER']);

    const body = await request.json();
    const { userId } = removeRoleSchema.parse(body);

    // Cannot remove yourself if you're the only Owner
    if (userId === auth.userId) {
      const ownerCount = await prisma.projectRole.count({
        where: { projectId, role: Role.OWNER },
      });
      if (ownerCount <= 1) {
        return NextResponse.json(
          { success: false, error: 'Cannot remove the only Owner' },
          { status: 400 }
        );
      }
    }

    const existingRole = await prisma.projectRole.findUnique({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
      include: {
        user: true,
      },
    });

    if (!existingRole) {
      return NextResponse.json(
        { success: false, error: 'Role not found' },
        { status: 404 }
      );
    }

    await prisma.projectRole.delete({
      where: {
        projectId_userId: {
          projectId,
          userId,
        },
      },
    });

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
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      );
    }
    console.error('Role remove error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
