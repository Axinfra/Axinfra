import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const procurementRowSchema = z.object({
  materialName: z.string().trim().min(1).max(200),
  description: z.string().trim().max(500).optional().nullable(),
  unit: z.string().trim().min(1).max(30),
  alreadyReceived: z.number().default(0),
  receivedThisWeek: z.number().default(0),
  cumulativeReceivedTillDate: z.number().default(0),
  consumedTillDate: z.number().default(0),
  balanceAtSite: z.number().default(0),
  additionalRequirement: z.string().trim().max(500).optional().nullable(),
});

const manpowerRowSchema = z.object({
  vendorName: z.string().trim().min(1).max(200),
  tradeName: z.string().trim().min(1).max(100),
  unit: z.string().trim().max(30).default(''),
  actualCount: z.number().int().default(0),
  plannedCount: z.number().int().default(0),
});

const highlightSchema = z.object({
  description: z.string().trim().min(1).max(500),
});

const createDprSchema = z.object({
  reportDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'reportDate must be YYYY-MM-DD'),
  periodFrom: z.string().optional().nullable(),
  periodTo: z.string().optional().nullable(),
  procurementRows: z.array(procurementRowSchema).default([]),
  manpowerRows: z.array(manpowerRowSchema).default([]),
  highlights: z.array(highlightSchema).default([]),
});

// GET /api/projects/[projectId]/dpr - dated list, optional ?from=&to= (YYYY-MM-DD)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']);

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');

    const dprs = await prisma.dailyProgressReport.findMany({
      where: {
        projectId,
        ...(from ? { reportDate: { gte: from } } : {}),
        ...(to ? { reportDate: { lte: to } } : {}),
      },
      select: {
        id: true, reportDate: true, docRefNo: true, status: true,
        createdBy: { select: { name: true } },
      },
      orderBy: { reportDate: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: dprs.map((d) => ({ id: d.id, reportDate: d.reportDate, docRefNo: d.docRefNo, status: d.status, createdByName: d.createdBy.name })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('DPR list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/dpr - Site Engineer creates today's (or a given date's) DPR.
// One per project per calendar day, enforced by @@unique([projectId, reportDate]).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['SITE_ENGINEER']);

    const input = createDprSchema.parse(await request.json());

    const dpr = await prisma.$transaction(async (tx) => {
      // Lock the Project row so two concurrent "create DPR" requests can't both compute the
      // same next docRefNo — mirrors RABillService's FOR UPDATE pattern for billNumber.
      await tx.$queryRaw`SELECT id FROM "Project" WHERE id = ${projectId} FOR UPDATE`;
      const count = await tx.dailyProgressReport.count({ where: { projectId } });
      const docRefNo = `DPR-${String(count + 1).padStart(3, '0')}`;

      const created = await tx.dailyProgressReport.create({
        data: {
          projectId,
          reportDate: input.reportDate,
          periodFrom: input.periodFrom ?? input.reportDate,
          periodTo: input.periodTo ?? input.reportDate,
          docRefNo,
          createdById: auth.userId,
          procurementRows: { create: input.procurementRows.map((r, i) => ({ ...r, sortOrder: i })) },
          manpowerRows: { create: input.manpowerRows.map((r, i) => ({ ...r, sortOrder: i })) },
          highlights: { create: input.highlights.map((h, i) => ({ ...h, sortOrder: i })) },
        },
      });

      await tx.auditLog.create({
        data: {
          projectId, actorId: auth.userId, role: auth.role,
          actionType: AuditActionTypes.DPR_CREATE,
          entityType: 'DailyProgressReport', entityId: created.id,
          afterJson: JSON.stringify({ reportDate: created.reportDate, docRefNo: created.docRefNo }),
        },
      });

      return created;
    });

    return NextResponse.json({ success: true, data: dpr });
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ success: false, error: 'A DPR already exists for this date.' }, { status: 409 });
    }
    console.error('DPR create error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
