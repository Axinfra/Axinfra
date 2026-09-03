import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth, pickActiveRole } from '@/lib/auth';
import type { Role } from '@/types';
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

    // A user can hold several roles on the same project now (see ProjectRole's
    // @@unique([projectId, userId, role])), so `projectRoles` can carry more than one row per
    // project — group them into one card per project instead of one per role, or the list
    // shows the same project several times over. `myRole` is the same "which one is active by
    // default" resolution getProjectAuth() uses; `myRoles` carries the full set for a project
    // card that wants to show them all (e.g. a role switcher).
    const byProject = new Map<string, { project: (typeof projectRoles)[number]['project']; heldRoles: Role[] }>();
    for (const pr of projectRoles) {
      const entry = byProject.get(pr.project.id);
      if (entry) {
        entry.heldRoles.push(pr.role as Role);
      } else {
        byProject.set(pr.project.id, { project: pr.project, heldRoles: [pr.role as Role] });
      }
    }

    const projects = Array.from(byProject.values()).map(({ project, heldRoles }) => ({
      id: project.id,
      name: project.name,
      description: project.description,
      status: project.status,
      isExampleProject: project.isExampleProject,
      myRole: pickActiveRole(heldRoles, undefined),
      myRoles: heldRoles,
      roles: project.roles.map((r) => ({
        userId: r.userId,
        userName: r.user.name,
        role: r.role,
      })),
      milestoneCount: project._count.milestones,
      createdAt: project.createdAt,
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

// POST /api/projects - Create a new project directly.
//
// A brand-new prospective Client has no account yet, so their *first* project can only ever
// come from POST /api/project-requests → an admin approving it via
// POST /api/admin/project-requests/[id]/approve, which creates the Client account and that
// first project together (billing verified out-of-band before approval). Once a Client already
// has an account and at least one project from that flow, every *additional* project they make
// is a direct, self-service create through this route — no repeat admin approval — since the
// relationship (and how billing works with them) is already established. Admins can also always
// create directly here.
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth();
    const body = await request.json();
    const parsed = createProjectSchema.parse(body);

    const isAdmin = isAdminEmail(auth.email);
    if (!isAdmin) {
      const existingProjectCount = await prisma.projectRole.count({
        where: { userId: auth.userId, role: 'CLIENT' },
      });
      if (existingProjectCount === 0) {
        return NextResponse.json(
          { success: false, error: 'Your first project is set up by an admin approving a request — see /request-project.' },
          { status: 403 },
        );
      }
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
