import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth, invalidateProjectAuthForProject } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { requireProjectOwner } from '@/lib/guards/requireClient';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, Role } from '@/types';
import { cached } from '@/lib/cache';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { z } from 'zod';

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  location: z.string().max(200).optional(),
  contractValue: z.number().positive().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  status: z.enum(['ONGOING', 'COMPLETED']).optional(),
}).refine(
  (data) => {
    if (data.startDate && data.endDate) {
      return new Date(data.endDate) > new Date(data.startDate);
    }
    return true;
  },
  { message: 'End date must be after start date', path: ['endDate'] }
);

// GET /api/projects/[projectId] - Get project details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Role-based include: Owner/PMC see everything; Vendor/Viewer see only what's scoped to them.
    const isOwnerOrPMC = auth.role === Role.CLIENT || auth.role === Role.PMC;

    // Cache key includes userId because Vendor/Viewer queries are scoped to auth.userId,
    // so two vendors on the same project must not share cache entries.
    const cacheKey = `project:${projectId}:detail:${auth.role}:${auth.userId}`;
    const project = await cached(cacheKey, 60_000, () =>
      isOwnerOrPMC
        ? prisma.project.findUnique({
            where: { id: projectId, deletedAt: null },
            include: {
              roles: {
                include: {
                  user: { select: { id: true, name: true, email: true } },
                },
              },
              boqs: { include: { items: true } },
              milestones: {
                include: {
                  boqLinks: { include: { boqItem: true } },
                  paymentEligibility: true,
                },
                orderBy: { createdAt: 'asc' },
              },
            },
          })
        : prisma.project.findUnique({
            where: { id: projectId, deletedAt: null },
            include: {
              roles: {
                include: {
                  user: { select: { id: true, name: true, email: true } },
                },
              },
              // Vendor/Viewer: milestones scoped to this user only, no BOQ rates leaked.
              milestones: {
                where: {
                  OR: [
                    { vendorUserId: auth.userId },
                    { evidence: { some: { submittedById: auth.userId } } },
                  ],
                },
                include: {
                  boqLinks: { include: { boqItem: true } },
                  paymentEligibility: true,
                },
                orderBy: { createdAt: 'asc' },
              },
            },
          })
    );

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        ...project,
        myRole: auth.role,
        myUserId: auth.userId,
        permissions: RoleGuard.getPermissions(auth.role),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Project get error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// PATCH /api/projects/[projectId] - Update project
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Verify requesting owner is the owner of this specific project
    await requireProjectOwner(auth, projectId);

    const body = await request.json();
    const updates = updateProjectSchema.parse(body);

    const beforeProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    // Build Prisma update data (metadata fields go into metadata JSON)
    const { location, contractValue, startDate, endDate, ...directUpdates } = updates;
    let metadataUpdate: string | undefined;
    if (location !== undefined || contractValue !== undefined || startDate !== undefined || endDate !== undefined) {
      const existingMeta = beforeProject?.metadata ? JSON.parse(beforeProject.metadata) : {};
      metadataUpdate = JSON.stringify({
        ...existingMeta,
        ...(location !== undefined ? { location } : {}),
        ...(contractValue !== undefined ? { contractValue } : {}),
        ...(startDate !== undefined ? { startDate } : {}),
        ...(endDate !== undefined ? { endDate } : {}),
      });
    }

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: {
        ...directUpdates,
        ...(metadataUpdate ? { metadata: metadataUpdate } : {}),
      },
    });

    // Use appropriate action type based on what was updated
    const actionType = updates.status
      ? AuditActionTypes.PROJECT_STATUS_CHANGE
      : AuditActionTypes.PROJECT_UPDATE;

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType,
      entityType: 'Project',
      entityId: projectId,
      beforeJson: { name: beforeProject?.name, description: beforeProject?.description, status: beforeProject?.status },
      afterJson: updates,
    });

    await invalidateProjectAndMemberCaches(projectId);

    return NextResponse.json({
      success: true,
      data: updatedProject,
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
    console.error('Project update error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE /api/projects/[projectId] — Hard-delete project (CLIENT only).
// All child records are removed by DB-level ON DELETE CASCADE:
//   Phases, Milestones, Evidence, BOQ/Items, MilestoneDependencies,
//   PaymentEligibility, EligibilityEvents, Verifications, Transitions,
//   DrawingSets, DrawingRows, DrawingVersions, SetRequests,
//   VendorRequests, VendorRequestFiles, ProjectRoles, ScheduleConfig,
//   AuditLogs, FollowUps, VendorMetrics, ProjectMetrics, SystemEvents,
//   CashAdjustments, PrivateCosts, CustomViews.
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only the CLIENT role for this specific project may delete it
    await requireProjectOwner(auth, projectId);

    const project = await prisma.project.findUnique({
      where: { id: projectId, deletedAt: null },
      select: { id: true, name: true, status: true },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Invalidate all caches BEFORE deletion so in-flight requests
    // don't see stale data after the row is gone.
    await Promise.all([
      invalidateProjectAuthForProject(projectId),
      invalidateProjectAndMemberCaches(projectId),
    ]);

    // Hard-delete — all child tables cascade automatically via FK constraints.
    await prisma.project.delete({ where: { id: projectId } });

    return NextResponse.json({
      success: true,
      data: { message: `Project "${project.name}" permanently deleted.` },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Project delete error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
