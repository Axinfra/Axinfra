import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

const respondSchema = z.object({
  status: z.enum(['ACKNOWLEDGED', 'IN_REVIEW', 'RESOLVED', 'REJECTED']),
  responseNote: z.string().optional(),
});

// Returns true if this role can receive/respond to this request (i.e. is a valid recipient)
function canRespondAsRecipient(role: string, sendTo: string): boolean {
  if (role === 'OWNER') return true;
  if (role === 'PMC')        return ['PMC', 'BOTH', 'ALL'].includes(sendTo);
  if (role === 'CONSULTANT') return ['CONSULTANT', 'BOTH', 'ALL'].includes(sendTo);
  if (role === 'VENDOR')     return ['VENDOR', 'BOTH', 'ALL'].includes(sendTo);
  return false;
}

// PATCH — Any sender can withdraw their own PENDING request.
//         Recipient role can respond (ACKNOWLEDGED / IN_REVIEW / RESOLVED / REJECTED).
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; requestId: string }> }
) {
  try {
    const { projectId, requestId } = await params;
    const auth = await requireProjectAuth(projectId);

    const vr = await prisma.vendorRequest.findFirst({ where: { id: requestId, projectId } });
    if (!vr) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const body = await request.json();
    const isSender = vr.submittedById === auth.userId;

    // Sender: can only withdraw their own PENDING request
    if (isSender && body.status === 'WITHDRAWN') {
      if (vr.status !== 'PENDING') {
        return NextResponse.json({ success: false, error: 'Can only withdraw pending requests' }, { status: 400 });
      }
      const updated = await prisma.vendorRequest.update({
        where: { id: requestId },
        data: { status: 'WITHDRAWN' },
      });

      await AuditLogger.log({
        projectId,
        actorId: auth.userId,
        role: auth.role,
        actionType: AuditActionTypes.VENDOR_REQUEST_RESPOND,
        entityType: 'VendorRequest',
        entityId: requestId,
        beforeJson: { status: vr.status },
        afterJson: { status: 'WITHDRAWN' },
      });

      return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status } });
    }

    // Recipient: must be a valid recipient to respond
    if (!canRespondAsRecipient(auth.role, vr.sendTo)) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const { status, responseNote } = respondSchema.parse(body);

    const updated = await prisma.vendorRequest.update({
      where: { id: requestId },
      data: {
        status,
        responseNote: responseNote ?? vr.responseNote,
        respondedById: auth.userId,
        respondedAt: new Date(),
      },
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.VENDOR_REQUEST_RESPOND,
      entityType: 'VendorRequest',
      entityId: requestId,
      beforeJson: { status: vr.status },
      afterJson: { status, responseNote: responseNote ?? null },
    });

    return NextResponse.json({ success: true, data: { id: updated.id, status: updated.status } });
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
