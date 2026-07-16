import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';
import { buildRABillPdfData } from '@/lib/pdf/buildRABillPdfData';
import { generateRABillPdf } from '@/lib/pdf/generateRABillPdf';

export const dynamic = 'force-dynamic';

// GET /api/vendor/ra-bills/[raBillId]/pdf - Vendor Portal download of their own RA Bill PDF.
// Mirrors the ownership check in /api/vendor/ra-bills/[raBillId] (global auth, not
// project-scoped, since the vendor portal aggregates bills across every project).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ raBillId: string }> }
) {
  try {
    const { raBillId } = await params;
    const auth = await requireAuth();

    const bill = await prisma.rABill.findFirst({
      where: { id: raBillId, order: { vendorUserId: auth.userId } },
      select: { billNumber: true, projectId: true },
    });
    if (!bill) {
      return NextResponse.json({ success: false, error: 'RA Bill not found' }, { status: 404 });
    }

    const pdfData = await buildRABillPdfData({ projectId: bill.projectId, raBillId });
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
    console.error('Vendor RA Bill PDF generation error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
