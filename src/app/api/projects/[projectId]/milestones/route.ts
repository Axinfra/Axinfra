import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, PaymentModel, EligibilityState } from '@/types';
import { z } from 'zod';

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
  boqLinks: z.array(z.object({
    boqItemId: z.string().uuid(),
    plannedQty: z.number().positive(),
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

    const milestones = await prisma.milestone.findMany({
      where: { projectId },
      include: {
        boqLinks: {
          include: {
            boqItem: true,
          },
        },
        evidence: {
          orderBy: { submittedAt: 'desc' },
          take: 1,
        },
        verifications: {
          orderBy: { verifiedAt: 'desc' },
          take: 1,
        },
        paymentEligibility: true,
        vendorUser: {
          select: { id: true, name: true, email: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({ success: true, data: milestones });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Milestones list error:', error);
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

    RoleGuard.requireRole(auth, ['OWNER', 'PMC']);

    const body = await request.json();
    const data = createMilestoneSchema.parse(body);

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
          isExtra: data.isExtra,
          vendorUserId: data.vendorUserId ?? null,
        },
      });

      // Create BOQ links if provided
      if (data.boqLinks && data.boqLinks.length > 0) {
        await tx.milestoneBOQLink.createMany({
          data: data.boqLinks.map((link) => ({
            milestoneId: milestone.id,
            boqItemId: link.boqItemId,
            plannedQty: link.plannedQty,
          })),
        });
      }

      // Create initial payment eligibility record
      // Advance is due immediately (NOT_DUE until milestone starts)
      // Remaining is due on verification
      await tx.paymentEligibility.create({
        data: {
          milestoneId: milestone.id,
          state: EligibilityState.NOT_DUE,
          eligibleAmount: data.value,
          advanceAmount: advanceAmount,
          remainingAmount: remainingAmount,
          dueDate: data.plannedEnd ? new Date(data.plannedEnd) : null,
        },
      });

      return milestone;
    });

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
        isExtra: data.isExtra,
        vendorUserId: data.vendorUserId ?? null,
        boqLinks: data.boqLinks,
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
