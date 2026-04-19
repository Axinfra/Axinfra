import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { requireProjectOwner } from '@/lib/guards/requireOwner';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, Role } from '@/types';
import { cached } from '@/lib/cache';
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
    const isOwnerOrPMC = auth.role === Role.OWNER || auth.role === Role.PMC;

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

// DELETE /api/projects/[projectId] - Soft-delete project (OWNER only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Verify requesting owner is the owner of this specific project
    await requireProjectOwner(auth, projectId);

    // Get project details before soft-deletion
    const project = await prisma.project.findUnique({
      where: { id: projectId, deletedAt: null },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    const now = new Date();

    // SOFT DELETE: Set deletedAt on project and cascade to children
    await prisma.$transaction(async (tx) => {
      // Soft-delete the project
      await tx.project.update({
        where: { id: projectId },
        data: { deletedAt: now },
      });

      // Cascade soft-delete to milestones (we don't have deletedAt on Milestone,
      // but the project-level deletedAt filter ensures they're excluded from queries)
    });

    // Audit log (project still exists for audit purposes)
    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.PROJECT_DELETE,
      entityType: 'Project',
      entityId: projectId,
      beforeJson: { name: project.name, status: project.status },
      afterJson: { deletedAt: now.toISOString() },
    });

    return NextResponse.json({
      success: true,
      data: { success: true, message: 'Project archived successfully' },
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
    console.error('Project delete error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
