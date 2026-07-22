import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditActionTypes } from '@/types';

export const dynamic = 'force-dynamic';

// POST /api/projects/[projectId]/dpr/[dprId]/sign - Site Engineer digitally signs, freezing
// the DPR. Same atomic freeze-write + audit-log pattern as Checklist sign-off.
export async function POST(
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
      return NextResponse.json({ success: false, error: 'DPR is already signed' }, { status: 409 });
    }

    const signed = await prisma.$transaction(async (tx) => {
      const updated = await tx.dailyProgressReport.update({
        where: { id: dprId },
        data: { status: 'SIGNED', signedAt: new Date(), signedByActorId: auth.userId },
      });
      await tx.auditLog.create({
        data: {
          projectId, actorId: auth.userId, role: auth.role,
          actionType: AuditActionTypes.DPR_SIGNED,
          entityType: 'DailyProgressReport', entityId: dprId,
          afterJson: JSON.stringify({ signedAt: updated.signedAt, signedByActorId: auth.userId }),
        },
      });
      return updated;
    });

    return NextResponse.json({ success: true, data: signed });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('DPR sign error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
