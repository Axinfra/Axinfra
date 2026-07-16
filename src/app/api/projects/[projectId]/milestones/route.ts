import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, PaymentModel, EligibilityState, Role } from '@/types';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { z } from 'zod';

const milestoneListSelect = {
  id: true,
  title: true,
  description: true,
  state: true,
  paymentModel: true,
  plannedStart: true,
  plannedEnd: true,
  actualStart: true,
  actualEnd: true,
  baselinePlannedStart: true,
  baselinePlannedEnd: true,
  durationDays: true,
  actualWorkHours: true,
  remainingWorkHours: true,
  value: true,
  advancePercent: true,
  isExtra: true,
  extraApprovedAt: true,
  vendorUserId: true,
  phaseId: true,
  readyForReview: true,
  readyForReviewAt: true,
  createdAt: true,
  wbsCode: true,
  isMsProjectMilestone: true,
  percentComplete: true,
  priority: true,
  remarks: true,
  vendorUser: { select: { id: true, name: true, email: true } },
  phase: { select: { id: true, name: true } },
  // This milestone's predecessors (things that must happen before it) and successors (things
  // that depend on it) — feeds the Milestones page's dependency filter (Has Dependencies /
  // Blocked / etc.) without a separate round trip to the Gantt endpoint.
  predecessorDependencies: {
    select: {
      dependencyType: true,
      lagDays: true,
      predecessor: { select: { id: true, title: true, state: true } },
    },
  },
  successorDependencies: {
    select: {
      dependencyType: true,
      lagDays: true,
      successor: { select: { id: true, title: true, state: true } },
    },
  },
  boqLinks: {
    select: {
      id: true,
      plannedQty: true,
      boqItem: { select: { id: true, description: true, unit: true, rate: true } },
    },
  },
  verifications: {
    orderBy: { verifiedAt: 'desc' as const },
    take: 1,
    select: { id: true, verifiedAt: true },
  },
  paymentEligibility: {
    select: {
      id: true,
      state: true,
      eligibleAmount: true,
      advanceAmount: true,
      remainingAmount: true,
      dueDate: true,
    },
  },
} as const;

const createMilestoneSchema = z.object({
  title: z.string().min(1).max(200),
  description: z.string().optional(),
  plannedStart: z.string().optional(),
  plannedEnd: z.string().optional(),
  plannedQtyOrPercent: z.number().min(0).max(100).default(100),
  value: z.number().min(0).default(0), // Milestone value in currency (required)
  advancePercent: z.number().min(0).max(100).default(0), // Advance percentage (0-100)
  isExtra: z.boolean().default(false), // Outside BOQ - requires owner approval
  vendorUserId: z.string().uuid().optional().nullable(), // Optional vendor assignment
  phaseId: z.string().uuid().optional().nullable(),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  remarks: z.string().trim().max(2000).optional().nullable(),
  boqLinks: z.array(z.object({
    boqItemId: z.string().uuid(),
    plannedQty: z.number().positive(),
  })).optional(),
  predecessorLinks: z.array(z.object({
    predecessorId: z.string().uuid(),
    dependencyType: z.enum(['FS', 'SS', 'FF', 'SF']).default('FS'),
    lagDays: z.number().int().default(0),
  })).optional(),
});

// GET /api/projects/[projectId]/milestones - List milestones
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    await requireProjectAuth(projectId);

    const url = new URL(request.url);
    const all = url.searchParams.get('all') === 'true';
    const rawPage = Number(url.searchParams.get('page') ?? '1');
    const rawLimit = Number(url.searchParams.get('limit') ?? '50');
    const page = Number.isFinite(rawPage) && rawPage > 0 ? Math.floor(rawPage) : 1;
    const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? Math.min(Math.floor(rawLimit), 500) : 50;
    const skip = all ? 0 : (page - 1) * limit;
    const take = all ? undefined : limit;

    const [rows, total] = await Promise.all([
      prisma.milestone.findMany({
        where: { projectId },
        select: milestoneListSelect,
        orderBy: { createdAt: 'desc' },
        ...(take !== undefined ? { take, skip } : {}),
      }),
      prisma.milestone.count({ where: { projectId } }),
    ]);

    return NextResponse.json(
      {
        success: true,
        data: rows,
        total,
        page: all ? 1 : page,
        limit: all ? total : limit,
      },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    const err = error as Error;
    console.error('Milestones list error:', {
      name: err?.name,
      message: err?.message,
      stack: err?.stack,
    });
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/milestones - Create milestone
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

    const body = await request.json();
    const data = createMilestoneSchema.parse(body);
    const isExtra = auth.role === Role.CLIENT || data.isExtra || !data.phaseId;
    const phaseId = isExtra ? null : data.phaseId ?? null;
    const boqLinks = isExtra ? undefined : data.boqLinks;

    // A milestone may only link to BOQ items whose BOQ has been approved by the client —
    // DRAFT/PENDING_APPROVAL/REVISED BOQs aren't verified yet.
    if (boqLinks && boqLinks.length > 0) {
      const linkedItems = await prisma.bOQItem.findMany({
        where: { id: { in: boqLinks.map((l) => l.boqItemId) } },
        select: { id: true, boq: { select: { projectId: true, status: true } } },
      });
      const invalid = linkedItems.find((i) => i.boq.projectId !== projectId || i.boq.status !== 'APPROVED');
      if (invalid || linkedItems.length !== boqLinks.length) {
        return NextResponse.json(
          { success: false, error: 'BOQ items can only be linked once their BOQ is approved by the client' },
          { status: 400 }
        );
      }
    }

    // Calculate advance and remaining amounts
    const advanceAmount = data.value * (data.advancePercent / 100);
    const remainingAmount = data.value - advanceAmount;

    const milestone = await prisma.$transaction(async (tx) => {
      const milestone = await tx.milestone.create({
        data: {
          projectId,
          title: data.title,
          description: data.description,
          paymentModel: PaymentModel.PROGRESS_BASED, // Default - not used anymore
          plannedStart: data.plannedStart ? new Date(data.plannedStart) : null,
          plannedEnd: data.plannedEnd ? new Date(data.plannedEnd) : null,
          plannedQtyOrPercent: data.plannedQtyOrPercent,
          value: data.value,
          advancePercent: data.advancePercent,
          isExtra,
          vendorUserId: data.vendorUserId ?? null,
          phaseId,
          priority: data.priority,
          remarks: data.remarks ?? null,
        },
      });

      // Create BOQ links if provided
      if (boqLinks && boqLinks.length > 0) {
        await tx.milestoneBOQLink.createMany({
          data: boqLinks.map((link) => ({
            milestoneId: milestone.id,
            boqItemId: link.boqItemId,
            plannedQty: link.plannedQty,
          })),
        });
      }

      // Create predecessor dependency links if provided
      if (data.predecessorLinks && data.predecessorLinks.length > 0) {
        await tx.milestoneDependency.createMany({
          data: data.predecessorLinks.map((link) => ({
            predecessorId: link.predecessorId,
            successorId: milestone.id,
            dependencyType: link.dependencyType,
            lagDays: link.lagDays,
          })),
          skipDuplicates: true,
        });
      }

      // Create initial payment eligibility record
      // eligibleAmount starts at 0 — it's computed by PaymentEligibilityEngine
      // only when the milestone reaches VERIFIED state
      await tx.paymentEligibility.create({
        data: {
          milestoneId: milestone.id,
          state: EligibilityState.NOT_DUE,
          eligibleAmount: 0,
          advanceAmount: advanceAmount,
          remainingAmount: remainingAmount,
          dueDate: data.plannedEnd ? new Date(data.plannedEnd) : null,
        },
      });

      return milestone;
    });

    await invalidateProjectAndMemberCaches(projectId);

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.MILESTONE_CREATE,
      entityType: 'Milestone',
      entityId: milestone.id,
      afterJson: {
        title: data.title,
        value: data.value,
        advancePercent: data.advancePercent,
        advanceAmount,
        remainingAmount,
        isExtra,
        phaseId,
        vendorUserId: data.vendorUserId ?? null,
        boqLinks,
      },
    });

    return NextResponse.json({
      success: true,
      data: { milestoneId: milestone.id },
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
        { success: false, error: 'Invalid input', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Milestone create error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
