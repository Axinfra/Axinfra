import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, Role } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
});

// GET /api/projects - List projects for current user
export async function GET() {
  try {
    const auth = await requireAuth();

    const projectRoles = await prisma.projectRole.findMany({
      where: { userId: auth.userId },
      include: {
        project: {
          include: {
            roles: {
              include: {
                user: {
                  select: {
                    id: true,
                    name: true,
                    email: true,
                  },
                },
              },
            },
            _count: {
              select: {
                milestones: true,
              },
            },
          },
        },
      },
    });

    const projects = projectRoles.map((pr) => ({
      id: pr.project.id,
      name: pr.project.name,
      description: pr.project.description,
      status: pr.project.status,
      isExampleProject: pr.project.isExampleProject,
      myRole: pr.role,
      roles: pr.project.roles.map((r) => ({
        userId: r.userId,
        userName: r.user.name,
        role: r.role,
      })),
      milestoneCount: pr.project._count.milestones,
      createdAt: pr.project.createdAt,
    }));

    return NextResponse.json({ success: true, data: projects });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Projects list error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects - Create a new project
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const body = await request.json();
    const { name, description } = createProjectSchema.parse(body);

    // Create project and assign all demo users with their roles
    const project = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name,
          description,
        },
      });

      // Find all demo users by their email patterns
      const ownerUser = await tx.user.findFirst({ where: { email: 'owner@example.com' } });
      const pmcUser = await tx.user.findFirst({ where: { email: 'pmc@example.com' } });
      const vendorUser = await tx.user.findFirst({ where: { email: 'vendor@example.com' } });
      const viewerUser = await tx.user.findFirst({ where: { email: 'viewer@example.com' } });

      // Create roles for all users that exist
      const roleAssignments = [];

      if (ownerUser) {
        roleAssignments.push({ projectId: project.id, userId: ownerUser.id, role: Role.OWNER });
      }
      if (pmcUser) {
        roleAssignments.push({ projectId: project.id, userId: pmcUser.id, role: Role.PMC });
      }
      if (vendorUser) {
        roleAssignments.push({ projectId: project.id, userId: vendorUser.id, role: Role.VENDOR });
      }
      if (viewerUser) {
        roleAssignments.push({ projectId: project.id, userId: viewerUser.id, role: Role.VIEWER });
      }

      // If no demo users found, at least assign the creator as owner
      if (roleAssignments.length === 0) {
        roleAssignments.push({ projectId: project.id, userId: auth.userId, role: Role.OWNER });
      }

      await tx.projectRole.createMany({
        data: roleAssignments,
      });

      return project;
    });

    // Log creation
    await AuditLogger.log({
      projectId: project.id,
      actorId: auth.userId,
      role: Role.OWNER,
      actionType: AuditActionTypes.PROJECT_CREATE,
      entityType: 'Project',
      entityId: project.id,
      afterJson: { name, description },
    });

    return NextResponse.json({
      success: true,
      data: {
        id: project.id,
        name: project.name,
        description: project.description,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid input' },
        { status: 400 }
      );
    }
    console.error('Project create error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
