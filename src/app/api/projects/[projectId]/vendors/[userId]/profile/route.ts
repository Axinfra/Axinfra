import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';

async function findVendorOnProject(userId: string, projectId: string) {
  // A user can hold several roles on this project now — check for the VENDOR row
  // specifically rather than "the" (now possibly ambiguous) role.
  const role = await prisma.projectRole.findFirst({
    where: { projectId, userId, role: 'VENDOR' },
  });
  if (!role) return null;
  return prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, name: true, email: true, companyName: true, contactPerson: true, mobile: true, gstNumber: true, address: true },
  });
}

// GET /api/projects/[projectId]/vendors/[userId]/profile - View Vendor Profile
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; userId: string }> }
) {
  try {
    const { projectId, userId } = await params;
    await requireProjectAuth(projectId);

    const vendor = await findVendorOnProject(userId, projectId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: 'Vendor not found on this project' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: vendor });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Vendor profile get error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/vendors/[userId]/profile - Edit Vendor Profile (CLIENT/PMC only)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; userId: string }> }
) {
  try {
    const { projectId, userId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

    const vendor = await findVendorOnProject(userId, projectId);
    if (!vendor) {
      return NextResponse.json({ success: false, error: 'Vendor not found on this project' }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const fields = ['companyName', 'contactPerson', 'mobile', 'gstNumber', 'address'] as const;
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    const data: Record<string, string | null> = {};
    for (const field of fields) {
      if (body[field] === undefined) continue;
      const nextValue = (body[field] as string)?.trim() || null;
      if (nextValue === vendor[field]) continue;
      before[field] = vendor[field];
      after[field] = nextValue;
      data[field] = nextValue;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ success: true, data: vendor });
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: { id: true, name: true, email: true, companyName: true, contactPerson: true, mobile: true, gstNumber: true, address: true },
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.VENDOR_PROFILE_UPDATE,
      entityType: 'User',
      entityId: userId,
      beforeJson: before,
      afterJson: after,
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Vendor profile update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
