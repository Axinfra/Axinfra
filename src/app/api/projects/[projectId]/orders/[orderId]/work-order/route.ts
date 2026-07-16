import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { WorkOrderService } from '@/services/WorkOrderService';
import { fileStorage } from '@/lib/file-storage';
import { sanitizeFileExt } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/octet-stream',
];
const ALLOWED_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx'];
const MAX_SIZE = 20 * 1024 * 1024;

// GET /api/projects/[projectId]/orders/[orderId]/work-order - Fetch the Work Order + revisions
// for this Purchase Order. Readable by CLIENT/PMC/CONSULTANT, or the assigned vendor.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);

    const order = await prisma.phase.findFirst({ where: { id: orderId, projectId }, select: { vendorUserId: true } });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Purchase order not found' }, { status: 404 });
    }
    if (auth.role === 'VENDOR' && order.vendorUserId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const workOrder = await WorkOrderService.getForOrder(orderId, projectId);
    return NextResponse.json({ success: true, data: workOrder });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Work order get error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/orders/[orderId]/work-order - Issue the first Work Order (R0)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC']);

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    if (!file) return NextResponse.json({ success: false, error: 'No file uploaded' }, { status: 400 });

    const fileExt = (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_TYPES.includes(file.type) && !ALLOWED_EXTS.includes(fileExt)) {
      return NextResponse.json({ success: false, error: 'File type not allowed' }, { status: 400 });
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json({ success: false, error: 'File too large (max 20 MB)' }, { status: 400 });
    }

    const issueDateRaw = formData.get('issueDate');
    const issueDate = issueDateRaw ? new Date(String(issueDateRaw)) : new Date();
    if (isNaN(issueDate.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid issue date' }, { status: 400 });
    }
    const plannedStartRaw = formData.get('plannedStart');
    const plannedEndRaw = formData.get('plannedEnd');
    const plannedStart = plannedStartRaw ? new Date(String(plannedStartRaw)) : null;
    const plannedEnd = plannedEndRaw ? new Date(String(plannedEndRaw)) : null;
    const remarks = formData.get('remarks') ? String(formData.get('remarks')) : null;

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = sanitizeFileExt(file.name);
    const mimeType = file.type || 'application/octet-stream';
    const key = `work-orders/${projectId}/${orderId}/r0-${randomUUID()}.${ext}`;
    const storageKey = await fileStorage.save(key, buffer, mimeType);

    const result = await WorkOrderService.issue(
      orderId,
      projectId,
      auth.userId,
      auth.role,
      { storageKey, fileName: file.name, mimeType, fileSize: file.size },
      { issueDate, plannedStart, plannedEnd, remarks }
    );

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: { workOrderId: result.workOrderId } }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Work order issue error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
