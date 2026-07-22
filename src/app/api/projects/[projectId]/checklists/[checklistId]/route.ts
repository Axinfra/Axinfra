import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { namesByRole } from '@/lib/pdf/format';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const patchChecklistSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  referenceDrawingNo: z.string().trim().min(1).max(100).optional(),
  certificationRemarks: z.string().trim().max(2000).optional().nullable(),
});

// GET /api/projects/[projectId]/checklists/[checklistId] - full detail, incl. resolved
// Project/Client/Location (not stored on Checklist itself, same as RA Bill PDFs resolve them).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; checklistId: string }> },
) {
  try {
    const { projectId, checklistId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']);

    const [checklist, project, roles] = await Promise.all([
      prisma.checklist.findFirst({
        where: { id: checklistId, projectId },
        include: {
          items: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { name: true } },
          signedBy: { select: { name: true } },
        },
      }),
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.projectRole.findMany({
        where: { projectId, role: { in: ['CLIENT', 'PMC', 'CONSULTANT'] } },
        include: { user: { select: { name: true } } },
      }),
    ]);
    if (!checklist || !project) {
      return NextResponse.json({ success: false, error: 'Checklist not found' }, { status: 404 });
    }

    const metadata = project.metadata ? JSON.parse(project.metadata) : {};

    return NextResponse.json({
      success: true,
      data: {
        ...checklist,
        projectName: project.name,
        clientName: namesByRole(roles, 'CLIENT'),
        location: metadata.location ?? null,
        canEdit: checklist.status === 'DRAFT' && RoleGuard.canCreateChecklist(auth),
        canFill: checklist.status !== 'SIGNED' && RoleGuard.canFillChecklist(auth),
        canSign: checklist.status !== 'SIGNED' && RoleGuard.canSignChecklist(auth),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('Checklist detail error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/checklists/[checklistId] - PMC edits header fields (DRAFT
// only) or Site Engineer sets the checklist-level certification remarks (any unsigned state).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; checklistId: string }> },
) {
  try {
    const { projectId, checklistId } = await params;
    const auth = await requireProjectAuth(projectId);

    const checklist = await prisma.checklist.findFirst({ where: { id: checklistId, projectId } });
    if (!checklist) {
      return NextResponse.json({ success: false, error: 'Checklist not found' }, { status: 404 });
    }
    if (checklist.status === 'SIGNED') {
      return NextResponse.json({ success: false, error: 'Cannot edit a signed checklist' }, { status: 409 });
    }

    const body = await request.json();
    const input = patchChecklistSchema.parse(body);

    const data: Record<string, unknown> = {};
    if (input.title !== undefined || input.referenceDrawingNo !== undefined) {
      RoleGuard.requireRole(auth, ['PMC']);
      if (checklist.status !== 'DRAFT') {
        return NextResponse.json({ success: false, error: 'Cannot edit check points once filling has started' }, { status: 409 });
      }
      if (input.title !== undefined) data.title = input.title;
      if (input.referenceDrawingNo !== undefined) data.referenceDrawingNo = input.referenceDrawingNo;
    }
    if (input.certificationRemarks !== undefined) {
      RoleGuard.requireRole(auth, ['SITE_ENGINEER']);
      data.certificationRemarks = input.certificationRemarks;
    }

    const updated = await prisma.checklist.update({ where: { id: checklistId }, data });
    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: error.errors[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    console.error('Checklist update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/projects/[projectId]/checklists/[checklistId] - PMC only, DRAFT only
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; checklistId: string }> },
) {
  try {
    const { projectId, checklistId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const checklist = await prisma.checklist.findFirst({ where: { id: checklistId, projectId } });
    if (!checklist) {
      return NextResponse.json({ success: false, error: 'Checklist not found' }, { status: 404 });
    }
    if (checklist.status !== 'DRAFT') {
      return NextResponse.json({ success: false, error: 'Cannot delete a checklist once filling has started' }, { status: 409 });
    }

    await prisma.checklist.delete({ where: { id: checklistId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('Checklist delete error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
