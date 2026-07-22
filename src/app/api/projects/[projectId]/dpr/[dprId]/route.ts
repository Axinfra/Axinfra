import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { namesByRole } from '@/lib/pdf/format';
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
const highlightSchema = z.object({ description: z.string().trim().min(1).max(500) });

const patchDprSchema = z.object({
  procurementRows: z.array(procurementRowSchema).optional(),
  manpowerRows: z.array(manpowerRowSchema).optional(),
  highlights: z.array(highlightSchema).optional(),
  criticalIssues: z.string().trim().max(2000).optional().nullable(),
});

/** Whole-day counts between two date-only strings (inclusive), matching how the demo Excel's
 * "Total Duration / Elapsed / Balance" trio reads. Returns null if either bound is missing. */
function computeDuration(startDate: string | null, endDate: string | null, reportDate: string) {
  if (!startDate || !endDate) return null;
  const start = new Date(startDate);
  const end = new Date(endDate);
  const today = new Date(reportDate);
  const DAY_MS = 86_400_000;
  const totalDurationDays = Math.round((end.getTime() - start.getTime()) / DAY_MS);
  const elapsedDays = Math.round((today.getTime() - start.getTime()) / DAY_MS);
  const balanceDays = totalDurationDays - elapsedDays;
  return { totalDurationDays, elapsedDays, balanceDays };
}

// GET /api/projects/[projectId]/dpr/[dprId] - detail incl. computed Total/Elapsed/Balance days
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; dprId: string }> },
) {
  try {
    const { projectId, dprId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VIEWER', 'CONSULTANT', 'SITE_ENGINEER']);

    const [dpr, project, roles] = await Promise.all([
      prisma.dailyProgressReport.findFirst({
        where: { id: dprId, projectId },
        include: {
          procurementRows: { orderBy: { sortOrder: 'asc' } },
          manpowerRows: { orderBy: { sortOrder: 'asc' } },
          highlights: { orderBy: { sortOrder: 'asc' } },
          photos: { orderBy: { sortOrder: 'asc' } },
          createdBy: { select: { name: true } },
          signedBy: { select: { name: true } },
        },
      }),
      prisma.project.findUnique({ where: { id: projectId } }),
      prisma.projectRole.findMany({
        where: { projectId, role: { in: ['CLIENT'] } },
        include: { user: { select: { name: true } } },
      }),
    ]);
    if (!dpr || !project) {
      return NextResponse.json({ success: false, error: 'DPR not found' }, { status: 404 });
    }

    const metadata = project.metadata ? JSON.parse(project.metadata) : {};
    const duration = computeDuration(metadata.startDate ?? null, metadata.endDate ?? null, dpr.reportDate);

    return NextResponse.json({
      success: true,
      data: {
        ...dpr,
        projectName: project.name,
        clientName: namesByRole(roles, 'CLIENT'),
        duration,
        canFill: dpr.status !== 'SIGNED' && RoleGuard.canFillDPR(auth),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('DPR detail error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/dpr/[dprId] - Site Engineer edits while DRAFT. Full
// delete-then-recreate of whichever child row sets are supplied — simplest correct approach
// given there's no per-cell-edit requirement, one transaction so it's all-or-nothing.
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; dprId: string }> },
) {
  try {
    const { projectId, dprId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['SITE_ENGINEER']);

    const dpr = await prisma.dailyProgressReport.findFirst({ where: { id: dprId, projectId } });
    if (!dpr) {
      return NextResponse.json({ success: false, error: 'DPR not found' }, { status: 404 });
    }
    if (dpr.status === 'SIGNED') {
      return NextResponse.json({ success: false, error: 'Cannot edit a signed DPR' }, { status: 409 });
    }

    const input = patchDprSchema.parse(await request.json());

    await prisma.$transaction(async (tx) => {
      if (input.procurementRows) {
        await tx.dPRProcurementRow.deleteMany({ where: { dprId } });
        await tx.dPRProcurementRow.createMany({ data: input.procurementRows.map((r, i) => ({ ...r, dprId, sortOrder: i })) });
      }
      if (input.manpowerRows) {
        await tx.dPRManpowerRow.deleteMany({ where: { dprId } });
        await tx.dPRManpowerRow.createMany({ data: input.manpowerRows.map((r, i) => ({ ...r, dprId, sortOrder: i })) });
      }
      if (input.highlights) {
        await tx.dPRHighlight.deleteMany({ where: { dprId } });
        await tx.dPRHighlight.createMany({ data: input.highlights.map((h, i) => ({ ...h, dprId, sortOrder: i })) });
      }
      await tx.dailyProgressReport.update({
        where: { id: dprId },
        data: { updatedAt: new Date(), ...(input.criticalIssues !== undefined ? { criticalIssues: input.criticalIssues } : {}) },
      });
    });

    const updated = await prisma.dailyProgressReport.findUnique({
      where: { id: dprId },
      include: {
        procurementRows: { orderBy: { sortOrder: 'asc' } },
        manpowerRows: { orderBy: { sortOrder: 'asc' } },
        highlights: { orderBy: { sortOrder: 'asc' } },
        photos: { orderBy: { sortOrder: 'asc' } },
      },
    });

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
    console.error('DPR update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
