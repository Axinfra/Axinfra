import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSetSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional(),
  cost: z.number().min(0).default(0),
  currency: z.string().default('INR'),
});

// GET /api/projects/[projectId]/architecture/sets
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    const isVendor = auth.role === 'VENDOR';

    const sets = await prisma.drawingSet.findMany({
      where: isVendor
        ? { projectId, status: 'APPROVED' }
        : { projectId },
      include: {
        createdBy: { select: { id: true, name: true, email: true } },
        requestedBy: { select: { id: true, name: true } },
        paymentReleaser: { select: { id: true, name: true } },
        _count: { select: { rows: true } },
        rows: {
          select: { id: true, serialNo: true, name: true, category: true, floor: true, status: true, paidAt: true, dueDate: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: sets.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        cost: s.cost,
        currency: s.currency,
        status: s.status,
        createdById: s.createdById,
        createdByName: s.createdBy.name,
        requestedByName: s.requestedBy?.name ?? null,
        paymentReleaserName: s.paymentReleaser?.name ?? null,
        requestedAt: s.requestedAt,
        dueDate: s.dueDate,
        deliveredAt: s.deliveredAt,
        approvedAt: s.approvedAt,
        paidAt: s.paidAt,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        rowCount: s._count.rows,
        rowStats: {
          total: s.rows.length,
          pending: s.rows.filter((r) => r.status === 'PENDING').length,
          submitted: s.rows.filter((r) => r.status === 'SUBMITTED').length,
          approved: s.rows.filter((r) => r.status === 'APPROVED').length,
          rejected: s.rows.filter((r) => r.status === 'REJECTED').length,
          paid: s.rows.filter((r) => r.paidAt != null).length,
        },
        rows: s.rows
          .sort((a, b) => a.serialNo - b.serialNo)
          .map((r) => ({
            id: r.id,
            serialNo: r.serialNo,
            name: r.name,
            category: r.category,
            floor: r.floor,
            status: r.status,
            paidAt: r.paidAt,
            dueDate: r.dueDate,
          })),
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/architecture/sets — Architect creates a set
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'ARTIFACTS') {
      return NextResponse.json({ success: false, error: 'Only Architects can create drawing sets' }, { status: 403 });
    }

    const body = await request.json();
    const { name, description, cost, currency } = createSetSchema.parse(body);

    const set = await prisma.drawingSet.create({
      data: { projectId, name, description, cost, currency, createdById: auth.userId },
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.PROJECT_UPDATE,
      entityType: 'DrawingSet',
      entityId: set.id,
      afterJson: { name, cost, currency },
    });

    return NextResponse.json({ success: true, data: { id: set.id, name: set.name, status: set.status } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof z.ZodError) {
      return NextResponse.json({ success: false, error: 'Invalid input' }, { status: 400 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
