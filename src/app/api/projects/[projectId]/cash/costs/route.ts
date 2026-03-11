/**
 * Builder Cash Module API - Private Cost Entries
 *
 * SECURITY: All endpoints enforce RoleGuard.canAccessCashModule().
 * Only BUILDER role can access. PMC_MANAGER, ENGINEER, PMC, VENDOR are DENIED.
 *
 * GET  /api/projects/[projectId]/cash/costs   - List private cost entries
 * POST /api/projects/[projectId]/cash/costs   - Create private cost entry
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { CashModuleService } from '@/services/CashModuleService';
import { PrivateCostCategory } from '@/types';
import { z } from 'zod';

// ─── Validation Schemas ─────────────────────────────────────────────────────

const createCostSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  amount: z.number().positive('Amount must be positive'),
  category: z.enum([
    PrivateCostCategory.LABOR,
    PrivateCostCategory.MATERIALS,
    PrivateCostCategory.EQUIPMENT,
    PrivateCostCategory.SUBCONTRACTOR,
    PrivateCostCategory.OVERHEAD,
    PrivateCostCategory.PERMITS,
    PrivateCostCategory.INSURANCE,
    PrivateCostCategory.TRANSPORT,
    PrivateCostCategory.OTHER,
  ]),
  vendor: z.string().max(200).optional(),
  notes: z.string().max(1000).optional(),
  incurredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be YYYY-MM-DD date').optional(),
});

// ─── GET: List private cost entries ─────────────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // SECURITY: Only BUILDER role
    if (!RoleGuard.canAccessCashModule(auth)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Cash module is restricted to Builder role' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || undefined;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const result = await CashModuleService.listPrivateCosts({
      projectId,
      category,
      limit,
      offset,
    });

    return NextResponse.json({
      success: true,
      data: {
        costs: result.costs,
        total: result.total,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Private costs list error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── POST: Create private cost entry ────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // SECURITY: Only BUILDER role
    if (!RoleGuard.canAccessCashModule(auth)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Cash module is restricted to Builder role' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = createCostSchema.parse(body);

    const costEntry = await CashModuleService.createPrivateCostEntry({
      projectId,
      description: data.description,
      amount: data.amount,
      category: data.category,
      vendor: data.vendor,
      notes: data.notes,
      incurredAt: data.incurredAt ? new Date(data.incurredAt + 'T00:00:00Z') : undefined,
      actorId: auth.userId,
      actorRole: auth.role,
    });

    return NextResponse.json({ success: true, data: costEntry }, { status: 201 });
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
    console.error('Private cost create error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
