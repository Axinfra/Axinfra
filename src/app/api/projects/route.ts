import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { isAdminEmail } from '@/lib/adminAuth';
import { cached } from '@/lib/cache';
import { ProjectService } from '@/services/ProjectService';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').max(200),
  description: z.string().optional(),
  location: z.string().max(200).optional(),
  contractValue: z.number().positive('Contract value must be positive').optional(),
  // The create-project form doesn't expose a currency picker, so this default applies to
  // every project created through the normal UI — was 'AED', which mislabeled every
  // INR-denominated project until someone noticed and fixed it by hand (twice).
  currency: z.string().default('INR').optional(),
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

    const [projectRoles, user] = await Promise.all([
      cached(
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
      ),
      prisma.user.findUnique({ where: { id: auth.userId }, select: { preferredRole: true } }),
    ]);

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

    return NextResponse.json({ success: true, data: projects, preferredRole: user?.preferredRole ?? null });
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

// POST /api/projects - Create a new project directly (platform admin only).
//
// This used to be open to any user whose account preferredRole was CLIENT — removed because
// the platform charges per project, so a project can no longer be created for free by
// self-service. The normal path now is POST /api/project-requests (a prospective or existing
// Client asks for one) → an admin reviews it and calls
// POST /api/admin/project-requests/[id]/approve, which creates the Client account (if new) and
// the project together. This route stays as a direct escape hatch for admin use only, sharing
// the same ProjectService.createForOwner the approval route uses — see that service for why.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const body = await request.json();
    const parsed = createProjectSchema.parse(body);

    if (!isAdminEmail(auth.email)) {
      return NextResponse.json(
        { success: false, error: 'Projects are created by an admin approving a project request — see /request-project.' },
        { status: 403 },
      );
    }

    const project = await ProjectService.createForOwner(auth.userId, parsed);

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
