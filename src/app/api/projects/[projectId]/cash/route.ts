/**
 * Builder Cash Module API - Cash Adjustments & Summary
 *
 * SECURITY: All endpoints enforce RoleGuard.canAccessCashModule().
 * Only OWNER role can access.
 *
 * GET  /api/projects/[projectId]/cash         - List adjustments + summary
 * POST /api/projects/[projectId]/cash         - Create cash adjustment
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { CashModuleService } from '@/services/CashModuleService';
import { CashAdjustmentType } from '@/types';
import { z } from 'zod';

// ─── Validation Schemas ─────────────────────────────────────────────────────

const createAdjustmentSchema = z.object({
  description: z.string().min(1, 'Description is required').max(500),
  amount: z.number().positive('Amount must be positive'),
  type: z.enum([CashAdjustmentType.CREDIT, CashAdjustmentType.DEBIT]),
  reason: z.string().max(1000).optional(),
});

// ─── GET: List cash adjustments + summary ───────────────────────────────────

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // SECURITY: Only OWNER role
    if (!RoleGuard.canAccessCashModule(auth)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Cash module is restricted to Owner role' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') as CashAdjustmentType | null;
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500);
    const offset = Math.max(parseInt(searchParams.get('offset') || '0', 10), 0);

    const [adjustmentsResult, summary] = await Promise.all([
      CashModuleService.listCashAdjustments({
        projectId,
        type: type || undefined,
        limit,
        offset,
      }),
      CashModuleService.getCashSummary(projectId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        adjustments: adjustmentsResult.adjustments,
        total: adjustmentsResult.total,
        summary,
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Cash module list error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// ─── POST: Create cash adjustment ──────────────────────────────────────────

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // SECURITY: Only OWNER role
    if (!RoleGuard.canAccessCashModule(auth)) {
      return NextResponse.json(
        { success: false, error: 'Forbidden: Cash module is restricted to Owner role' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const data = createAdjustmentSchema.parse(body);

    const adjustment = await CashModuleService.createCashAdjustment({
      projectId,
      description: data.description,
      amount: data.amount,
      type: data.type,
      reason: data.reason,
      actorId: auth.userId,
      actorRole: auth.role,
    });

    return NextResponse.json({ success: true, data: adjustment }, { status: 201 });
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
    console.error('Cash adjustment create error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
