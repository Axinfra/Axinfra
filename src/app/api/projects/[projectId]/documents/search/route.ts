import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const RESULTS_PER_TYPE = 8;

// GET /api/projects/[projectId]/documents/search?q=... - one query bar across every document
// type living under the Documents tab: drawings (Architecture), Specs/Other Docs, Checklists,
// DPRs, and RA Bill measurement sheets. Each section applies the same visibility rules as its
// own list endpoint (Checklists/DPR hidden from VENDOR, drawings/measurement sheets scoped to
// what that vendor can already see elsewhere) so this never leaks more than the source tabs do.
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const q = (request.nextUrl.searchParams.get('q') ?? '').trim();
    if (!q) {
      return NextResponse.json({ success: true, data: [] });
    }

    const insensitive = { contains: q, mode: 'insensitive' as const };
    const serialNoMatch = /^\d+$/.test(q) ? parseInt(q, 10) : undefined;
    const isVendor = auth.role === 'VENDOR';

    const [drawings, specDocs, checklists, dprs, measurementSheets] = await Promise.all([
      prisma.drawingRow.findMany({
        where: {
          projectId,
          ...(isVendor ? { status: 'APPROVED' } : {}),
          OR: [
            { name: insensitive },
            { category: insensitive },
            { floor: insensitive },
            ...(serialNoMatch !== undefined ? [{ serialNo: serialNoMatch }] : []),
          ],
        },
        include: {
          versions: {
            orderBy: { versionNumber: 'desc' as const },
            take: 1,
            include: { uploadedBy: { select: { name: true } } },
          },
        },
        take: RESULTS_PER_TYPE,
        orderBy: { serialNo: 'asc' },
      }),
      prisma.projectDocument.findMany({
        where: {
          projectId,
          deletedAt: null,
          OR: [{ title: insensitive }, { description: insensitive }],
        },
        include: { files: { select: { id: true, fileName: true }, take: 1 } },
        take: RESULTS_PER_TYPE,
        orderBy: { createdAt: 'desc' },
      }),
      isVendor
        ? Promise.resolve([])
        : prisma.checklist.findMany({
            where: {
              projectId,
              OR: [{ title: insensitive }, { docRefNo: insensitive }, { referenceDrawingNo: insensitive }],
            },
            take: RESULTS_PER_TYPE,
            orderBy: { createdAt: 'desc' },
          }),
      isVendor
        ? Promise.resolve([])
        : prisma.dailyProgressReport.findMany({
            where: {
              projectId,
              OR: [{ docRefNo: insensitive }, { reportDate: insensitive }, { criticalIssues: insensitive }],
            },
            take: RESULTS_PER_TYPE,
            orderBy: { createdAt: 'desc' },
          }),
      prisma.rABillMeasurementSheet.findMany({
        where: {
          raBill: { projectId, ...(isVendor ? { order: { vendorUserId: auth.userId } } : {}) },
          OR: [{ fileName: insensitive }, { remarks: insensitive }],
        },
        include: { raBill: { select: { id: true, billNumber: true, orderId: true, order: { select: { name: true } } } } },
        take: RESULTS_PER_TYPE,
        orderBy: { uploadedAt: 'desc' },
      }),
    ]);

    const data = [
      ...drawings.map((row) => {
        const current = row.versions[0];
        return {
          type: 'DRAWING' as const,
          id: row.id,
          title: `#${row.serialNo} · ${row.name}`,
          subtitle: `${row.category} · ${row.floor}`,
          drawing: {
            id: row.id,
            serialNo: row.serialNo,
            name: row.name,
            category: row.category,
            floor: row.floor,
            status: row.status,
            versions: current
              ? [{
                  id: current.id,
                  versionNumber: current.versionNumber,
                  uploadType: current.uploadType,
                  fileUrl: current.fileUrl,
                  fileName: current.fileName,
                  reviewStatus: current.reviewStatus,
                  uploadedAt: current.uploadedAt.toISOString(),
                  uploadedBy: { name: current.uploadedBy.name },
                }]
              : [],
          },
        };
      }),
      ...specDocs.map((d) => ({
        type: (d.category === 'SPEC' ? 'SPEC' : 'OTHER') as 'SPEC' | 'OTHER',
        id: d.id,
        title: d.title,
        subtitle: d.description ?? (d.files[0]?.fileName ?? ''),
        href: d.files[0] ? `/api/projects/${projectId}/documents/${d.id}/files/${d.files[0].id}` : `/projects/${projectId}/documents`,
      })),
      ...checklists.map((c) => ({
        type: 'CHECKLIST' as const,
        id: c.id,
        title: `${c.docRefNo} · ${c.title}`,
        subtitle: `Drawing ${c.referenceDrawingNo} · ${c.status.replace('_', ' ')}`,
        href: `/projects/${projectId}/documents/checklists/${c.id}`,
      })),
      ...dprs.map((d) => ({
        type: 'DPR' as const,
        id: d.id,
        title: `${d.docRefNo} · ${d.reportDate}`,
        subtitle: d.status,
        href: `/projects/${projectId}/documents/dpr/${d.id}`,
      })),
      ...measurementSheets.map((m) => ({
        type: 'MEASUREMENT_SHEET' as const,
        id: m.id,
        title: m.fileName,
        subtitle: `RA-${m.raBill.billNumber} · ${m.raBill.order.name}${m.remarks ? ` · ${m.remarks}` : ''}`,
        href: `/api/projects/${projectId}/orders/${m.raBill.orderId}/ra-bills/${m.raBill.id}/measurement-sheets/${m.id}/file`,
      })),
    ];

    return NextResponse.json({ success: true, data }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Document search error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
