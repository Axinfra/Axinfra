import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { buildDirectOrderBillPdfData } from '@/lib/pdf/buildDirectOrderBillPdfData';
import { generateDirectOrderBillPdf } from '@/lib/pdf/generateDirectOrderBillPdf';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/direct-orders/[orderId]/bill/pdf
// Downloads a Direct Order bill PDF built from live data. PMC can download any order in the
// project; a Vendor only their own — same visibility as the rest of the Direct Orders API.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);

    const order = await prisma.directOrder.findFirst({
      where: { id: orderId, projectId },
      select: { doNumber: true, vendorUserId: true },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Direct order not found' }, { status: 404 });
    }
    if (auth.role === 'VENDOR' && order.vendorUserId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }
    if (auth.role !== 'PMC' && auth.role !== 'VENDOR') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const pdfData = await buildDirectOrderBillPdfData({ projectId, orderId });
    const pdfBuffer = await generateDirectOrderBillPdf(pdfData);

    const filename = `Direct-Order-Bill-${order.doNumber}.pdf`;
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
    console.error('Direct order bill PDF generation error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
