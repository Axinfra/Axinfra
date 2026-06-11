import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';
import { z } from 'zod';

export const dynamic = 'force-dynamic';

const createSchema = z.object({
  category: z.enum(['REQUEST', 'SUBMISSION']).default('REQUEST'),
  title: z.string().min(1).max(300),
  description: z.string().min(1),
  type: z.string().min(1).max(100),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'URGENT']).default('NORMAL'),
  dueDate: z.string().optional(),
  sendTo: z.enum(['PMC', 'CONSULTANT', 'CLIENT', 'VENDOR', 'BOTH', 'ALL']).default('PMC'),
  refNumber: z.string().max(100).optional(),
});

// GET /api/projects/[projectId]/vendor-requests
// Returns all requests where the caller is either the sender or a recipient.
// OWNER sees everything. Others see: own sent + addressed to their role.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Determine which sendTo values address this role
    const myRoleSendTos: string[] =
      auth.role === 'PMC'        ? ['PMC', 'BOTH', 'ALL'] :
      auth.role === 'CONSULTANT' ? ['CONSULTANT', 'BOTH', 'ALL'] :
      auth.role === 'VENDOR'     ? ['VENDOR', 'BOTH', 'ALL'] :
      auth.role === 'CLIENT'      ? ['CLIENT', 'ALL'] :
      [];

    const where =
      auth.role === 'CLIENT'
        ? { projectId }  // Owner sees everything
        : {
            projectId,
            OR: [
              { submittedById: auth.userId },
              { sendTo: { in: myRoleSendTos } },
            ],
          };

    const requests = await prisma.vendorRequest.findMany({
      where,
      include: {
        submittedBy: { select: { id: true, name: true, email: true } },
        respondedBy: { select: { id: true, name: true } },
        files: { select: { id: true, fileName: true, mimeType: true, fileSize: true, createdAt: true, uploadedById: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ success: true, data: requests });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/vendor-requests
// Any authenticated project member can create a request. VIEWER cannot.
export async function POST(request: NextRequest, { params }: { params: Promise<{ projectId: string }> }) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role === 'VIEWER') {
      return NextResponse.json({ success: false, error: 'Viewers cannot submit requests' }, { status: 403 });
    }

    const body = await request.json();
    const { category, title, description, type, priority, dueDate, sendTo, refNumber } = createSchema.parse(body);

    const req = await prisma.vendorRequest.create({
      data: {
        projectId,
        submittedById: auth.userId,
        senderRole: auth.role,
        category,
        title,
        description,
        type,
        priority,
        dueDate: dueDate ? new Date(dueDate) : null,
        sendTo,
        refNumber: refNumber ?? null,
      },
    });

    await AuditLogger.log({
      projectId,
      actorId: auth.userId,
      role: auth.role,
      actionType: AuditActionTypes.VENDOR_REQUEST_SUBMIT,
      entityType: 'VendorRequest',
      entityId: req.id,
      afterJson: { category, title, type, priority, sendTo, senderRole: auth.role, dueDate: dueDate ?? null },
    });

    return NextResponse.json({ success: true, data: { id: req.id } }, { status: 201 });
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
