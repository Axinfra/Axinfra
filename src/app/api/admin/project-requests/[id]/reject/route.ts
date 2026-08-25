import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';
import { sendProjectRequestRejectedEmail } from '@/lib/email';

export const dynamic = 'force-dynamic';

const schema = z.object({ reason: z.string().max(1000).optional() });

// POST /api/admin/project-requests/[id]/reject
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth();
    await requireAdminAccess(auth.email);
    const { id } = await params;

    const body = await request.json().catch(() => ({}));
    const { reason } = schema.parse(body);

    const projectRequest = await prisma.projectRequest.findUnique({ where: { id } });
    if (!projectRequest) {
      return NextResponse.json({ error: 'Request not found' }, { status: 404 });
    }
    if (projectRequest.status !== 'PENDING') {
      return NextResponse.json({ error: `This request has already been ${projectRequest.status.toLowerCase()}` }, { status: 409 });
    }

    await prisma.projectRequest.update({
      where: { id },
      data: {
        status: 'REJECTED',
        reviewedByEmail: auth.email,
        reviewedAt: new Date(),
        rejectionReason: reason,
      },
    });

    await prisma.systemEvent.create({
      data: {
        eventType: 'PROJECT_REQUEST_REJECTED',
        severity: 'INFO',
        actorId: auth.userId,
        entityType: 'ProjectRequest',
        entityId: id,
        message: `${auth.email} rejected project request from ${projectRequest.email} — "${projectRequest.projectName}"`,
      },
    }).catch((e) => console.error('[project-requests/reject] systemEvent create failed:', e));

    sendProjectRequestRejectedEmail(projectRequest.email, projectRequest.name, projectRequest.projectName, reason).catch((e) =>
      console.error('[email] project request rejected email failed:', e)
    );

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (msg === 'FORBIDDEN') return NextResponse.json({ error: 'Admin access required' }, { status: 403 });
    if (err instanceof z.ZodError) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });
    console.error('[admin/project-requests/reject]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
