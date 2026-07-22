import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createChecklistSchema = z.object({
  title: z.string().trim().min(1).max(200),
  referenceDrawingNo: z.string().trim().min(1).max(100),
  items: z.array(z.object({ description: z.string().trim().min(1).max(500) })).min(1),
});

// GET /api/projects/[projectId]/checklists - list, with item/fill counts
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']);

    const checklists = await prisma.checklist.findMany({
      where: { projectId },
      select: {
        id: true, title: true, docRefNo: true, referenceDrawingNo: true, status: true,
        signedAt: true, signedBy: { select: { name: true } }, createdAt: true,
        createdBy: { select: { name: true } },
        items: { select: { result: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const data = checklists.map((c) => ({
      id: c.id, title: c.title, docRefNo: c.docRefNo, referenceDrawingNo: c.referenceDrawingNo,
      status: c.status, signedAt: c.signedAt, signedByName: c.signedBy?.name ?? null,
      createdAt: c.createdAt, createdByName: c.createdBy.name,
      itemCount: c.items.length,
      filledCount: c.items.filter((i) => i.result !== null).length,
    }));

    return NextResponse.json({ success: true, data });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('Checklist list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/checklists - PMC creates a checklist with its check points
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await request.json();
    const input = createChecklistSchema.parse(body);

    const checklist = await prisma.$transaction(async (tx) => {
      // Lock the Project row so two concurrent "create checklist" requests for the same
      // project can't both compute the same next docRefNo — mirrors RABillService's
      // FOR UPDATE pattern for billNumber. @@unique([projectId, docRefNo]) is the backstop.
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
      const count = await tx.checklist.count({ where: { projectId } });
      const docRefNo = `CHK-${String(count + 1).padStart(3, '0')}`;

      const created = await tx.checklist.create({
        data: {
          projectId,
          title: input.title,
          docRefNo,
          referenceDrawingNo: input.referenceDrawingNo,
          createdById: auth.userId,
          items: {
            create: input.items.map((item, i) => ({ description: item.description, sortOrder: i })),
          },
        },
        include: { items: true },
      });

      await tx.auditLog.create({
        data: {
          projectId, actorId: auth.userId, role: auth.role,
          actionType: AuditActionTypes.CHECKLIST_CREATE,
          entityType: 'Checklist', entityId: created.id,
          afterJson: JSON.stringify({ title: created.title, docRefNo: created.docRefNo, itemCount: created.items.length }),
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: checklist });
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
    console.error('Checklist create error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
