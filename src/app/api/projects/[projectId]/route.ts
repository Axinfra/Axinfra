import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

const updateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional(),
  status: z.enum(['ONGOING', 'COMPLETED']).optional(),
});

// GET /api/projects/[projectId] - Get project details
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const project = await prisma.project.findUnique({
      where: { id: projectId },
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
        boqs: {
          include: {
            items: true,
          },
        },
        milestones: {
          include: {
            boqLinks: {
              include: {
                boqItem: true,
              },
            },
            paymentEligibility: true,
          },
          orderBy: { createdAt: 'asc' },
        },
      },
    });

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

    // Only Owner can update project
    RoleGuard.requireRole(auth, ['OWNER']);

    const body = await request.json();
    const updates = updateProjectSchema.parse(body);

    const beforeProject = await prisma.project.findUnique({
      where: { id: projectId },
    });

    const updatedProject = await prisma.project.update({
      where: { id: projectId },
      data: updates,
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

// DELETE /api/projects/[projectId] - Delete project (OWNER only)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only Owner can delete project
    RoleGuard.requireRole(auth, ['OWNER']);

    // Get project details before deletion
    const project = await prisma.project.findUnique({
      where: { id: projectId },
      include: {
        _count: {
          select: {
            milestones: true,
          },
        },
      },
    });

    if (!project) {
      return NextResponse.json(
        { success: false, error: 'Project not found' },
        { status: 404 }
      );
    }

    // Delete project (cascade will handle related records)
    await prisma.project.delete({
      where: { id: projectId },
    });

    // Note: Can't log to audit since project is deleted
    // In production, you might want to log to a separate system

    return NextResponse.json({
      success: true,
      data: { deleted: true, projectName: project.name },
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
        { success: false, error: 'Only Owner can delete projects' },
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
