import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { buildRABillPdfData } from '@/lib/pdf/buildRABillPdfData';
import { generateRABillPdf } from '@/lib/pdf/generateRABillPdf';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/orders/[orderId]/ra-bills/[raBillId]/pdf
// Downloads a professional RA Bill PDF built from live data. Read-only — same visibility as
// the RA Bill detail route (any project member, except a VENDOR must be the assigned vendor).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string; raBillId: string }> }
) {
  try {
    const { projectId, raBillId } = await params;
    const auth = await requireProjectAuth(projectId);

    const bill = await prisma.rABill.findFirst({
      where: { id: raBillId, projectId },
      select: { billNumber: true, order: { select: { vendorUserId: true } } },
    });
    if (!bill) {
      return NextResponse.json({ success: false, error: 'RA Bill not found' }, { status: 404 });
    }
    if (auth.role === 'VENDOR' && bill.order.vendorUserId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const pdfData = await buildRABillPdfData({ projectId, raBillId });
    const pdfBuffer = await generateRABillPdf(pdfData);

    const filename = `RA-Bill-${bill.billNumber}.pdf`;
    return new NextResponse(new Uint8Array(pdfBuffer), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        'Content-Length': pdfBuffer.byteLength.toString(),
      },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('RA Bill PDF generation error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
