import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { WorkOrderService } from '@/services/WorkOrderService';
import { fileStorage } from '@/lib/file-storage';
import { buildWorkOrderPdfData, type RevisionMeta } from '@/lib/pdf/buildWorkOrderPdfData';
import { generateWorkOrderPdf } from '@/lib/pdf/generateWorkOrderPdf';
import { emptyPdfDetails, type WorkOrderPdfDetails } from '@/lib/pdf/types';

export const dynamic = 'force-dynamic';

interface RequestBody {
  mode: 'download' | 'issue' | 'revise';
  issueDate?: string;
  plannedStart?: string;
  plannedEnd?: string;
  remarks?: string;
  reason?: string;
  details: Partial<WorkOrderPdfDetails>;
}

// POST /api/projects/[projectId]/orders/[orderId]/work-order/pdf
// Generates a professional Work Order PDF from live project/vendor/BOQ data plus the
// narrative/terms/signatory fields submitted by GenerateWorkOrderPdfModal. PMC-only — keyed by
// `orderId` (not `workOrderId`) because "issue" mode runs before any WorkOrder row exists.
//
//  - mode=download : renders the *current* revision's data, saves the submitted fields onto it
//                     for next time, returns the PDF. No new revision.
//  - mode=issue     : only when no WorkOrder exists yet. Saves the rendered PDF via fileStorage
//                     and issues R0 through WorkOrderService.issue — identical downstream
//                     behavior (audit log, BOQ status sync) to a manually-uploaded file.
//  - mode=revise    : only when a WorkOrder exists. Same save-then-WorkOrderService.createRevision
//                     pattern as "Add Revision" today.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = (await request.json()) as RequestBody;
    if (!body.mode || !['download', 'issue', 'revise'].includes(body.mode)) {
      return NextResponse.json({ success: false, error: 'Invalid mode' }, { status: 400 });
    }
    const details: WorkOrderPdfDetails = { ...emptyPdfDetails(), ...body.details };

    const order = await prisma.phase.findFirst({
      where: { id: orderId, projectId, parentPhaseId: null, scheduleImportId: null },
      select: { id: true, vendorUserId: true },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Purchase order not found in this project' }, { status: 404 });
    }
    if (!order.vendorUserId) {
      return NextResponse.json({ success: false, error: 'Assign a vendor to this purchase order before generating a Work Order' }, { status: 400 });
    }

    const existingWorkOrder = await WorkOrderService.getForOrder(orderId, projectId);

    const issueDateRaw = body.issueDate ? new Date(body.issueDate) : new Date();
    if (isNaN(issueDateRaw.getTime())) {
      return NextResponse.json({ success: false, error: 'Invalid issue date' }, { status: 400 });
    }
    const plannedStart = body.plannedStart ? new Date(body.plannedStart) : null;
    const plannedEnd = body.plannedEnd ? new Date(body.plannedEnd) : null;
    const remarks = body.remarks?.trim() || null;

    let revisionNumber: number;
    let revisionMeta: RevisionMeta;

    if (body.mode === 'issue') {
      if (existingWorkOrder) {
        return NextResponse.json(
          { success: false, error: 'This purchase order already has a Work Order — use "Generate & Add Revision" instead' },
          { status: 400 },
        );
      }
      revisionNumber = 0;
      revisionMeta = { revisionNumber, issueDate: issueDateRaw, plannedStart, plannedEnd };
    } else {
      if (!existingWorkOrder) {
        return NextResponse.json({ success: false, error: 'No Work Order exists yet for this purchase order' }, { status: 400 });
      }
      const workOrder = existingWorkOrder;

      if (body.mode === 'revise') {
        revisionNumber = workOrder.currentRevisionNumber + 1;
        revisionMeta = { revisionNumber, issueDate: issueDateRaw, plannedStart, plannedEnd };
      } else {
        const currentRevision = workOrder.revisions.find((r) => r.revisionNumber === workOrder.currentRevisionNumber);
        if (!currentRevision) {
          return NextResponse.json({ success: false, error: 'Current revision not found' }, { status: 404 });
        }
        revisionNumber = workOrder.currentRevisionNumber;
        revisionMeta = {
          revisionNumber,
          issueDate: currentRevision.issueDate,
          plannedStart: currentRevision.plannedStart,
          plannedEnd: currentRevision.plannedEnd,
        };
      }
    }

    const pdfData = await buildWorkOrderPdfData({
      projectId,
      orderId,
      revisionMeta,
      details,
      preparedByName: auth.name,
    });
    const pdfBuffer = await generateWorkOrderPdf(pdfData);
    const pdfDetailsJson = JSON.stringify(details);

    if (body.mode === 'download') {
      if (!existingWorkOrder) {
        return NextResponse.json({ success: false, error: 'No Work Order exists yet for this purchase order' }, { status: 400 });
      }
      const result = await WorkOrderService.saveDraftPdfDetails(existingWorkOrder.id, projectId, pdfDetailsJson);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error }, { status: 400 });
      }
    } else {
      const key = `work-orders/${projectId}/${orderId}/r${revisionNumber}-${randomUUID()}.pdf`;
      const storageKey = await fileStorage.save(key, pdfBuffer, 'application/pdf');
      const fileInput = {
        storageKey,
        fileName: `${pdfData.woNumber}-Rev-${revisionNumber}.pdf`,
        mimeType: 'application/pdf',
        fileSize: pdfBuffer.byteLength,
      };

      if (body.mode === 'issue') {
        const result = await WorkOrderService.issue(
          orderId, projectId, auth.userId, auth.role, fileInput,
          { issueDate: issueDateRaw, plannedStart, plannedEnd, remarks },
        );
        if (!result.success || !result.workOrderId) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }
        await WorkOrderService.saveDraftPdfDetails(result.workOrderId, projectId, pdfDetailsJson);
      } else {
        if (!existingWorkOrder) {
          return NextResponse.json({ success: false, error: 'No Work Order exists yet for this purchase order' }, { status: 400 });
        }
        if (!body.reason || !body.reason.trim()) {
          return NextResponse.json({ success: false, error: 'A reason is required for a new revision' }, { status: 400 });
        }
        const result = await WorkOrderService.createRevision(
          existingWorkOrder.id, projectId, auth.userId, auth.role, fileInput,
          { issueDate: issueDateRaw, plannedStart, plannedEnd, remarks }, body.reason.trim(),
        );
        if (!result.success) {
          return NextResponse.json({ success: false, error: result.error }, { status: 400 });
        }
        await WorkOrderService.saveDraftPdfDetails(existingWorkOrder.id, projectId, pdfDetailsJson);
      }
    }

    const filename = `${pdfData.woNumber}-Rev-${revisionNumber}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': pdfBuffer.byteLength.toString(),
        'X-Revision-Number': String(revisionNumber),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('Work order PDF generation error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
