import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { cached } from '@/lib/cache';
import { invalidateUserWorkspaceCaches } from '@/lib/cache-invalidation';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, Role } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  description: z.string().optional(),
  location: z.string().max(200).optional(),
  contractValue: z.number().positive('Contract value must be positive').optional(),
  currency: z.string().default('AED').optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  { message: 'End date must be after start date', path: ['endDate'] }
);

// GET /api/projects - List projects for current user
export async function GET() {
  try {
    const auth = await requireAuth();

    const projectRoles = await cached(
      `projects:list:${auth.userId}`,
      300_000,
      () => prisma.projectRole.findMany({
        where: { userId: auth.userId, project: { deletedAt: null } },
        include: {
          project: {
            include: {
              roles: { include: { user: { select: { id: true, name: true, email: true } } } },
              _count: { select: { milestones: true } },
            },
          },
        },
      }),
    );

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

// POST /api/projects - Create a new project (any authenticated user can create, becomes OWNER)
// SECURITY: Only users who are already OWNER in at least one project, or if no projects exist yet
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const body = await request.json();
    const parsed = createProjectSchema.parse(body);
    const { name, description, location, contractValue, currency, startDate, endDate } = parsed;

    // Check if user has OWNER or PMC role in any project (gatekeep project creation)
    const existingRole = await prisma.projectRole.findFirst({
      where: {
        userId: auth.userId,
        role: { in: [Role.OWNER, Role.PMC] },
      },
    });
    // Allow if user is already an owner/PMC, or if there are no projects at all (bootstrap)
    if (!existingRole) {
      const projectCount = await prisma.project.count();
      if (projectCount > 0) {
        return NextResponse.json(
          { success: false, error: 'Only project owners can create new projects' },
          { status: 403 }
        );
      }
    }

    // Build metadata from optional fields
    const metadata = (location || contractValue || currency || startDate || endDate)
      ? JSON.stringify({ location, contractValue, currency: currency || 'AED', startDate, endDate })
      : undefined;

    // Create project and assign creator as owner
    const project = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: {
          name,
          description,
          metadata,
        },
      });

      // Assign the creating user as project owner
      // Other users must be invited/assigned explicitly
      await tx.projectRole.create({
        data: {
          projectId: project.id,
          userId: auth.userId,
          role: Role.OWNER,
        },
      });

      return project;
    });

    await invalidateUserWorkspaceCaches(auth.userId);

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
