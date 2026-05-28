import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { fileStorage } from '@/lib/file-storage';

export const dynamic = 'force-dynamic';

// GET /api/projects/[projectId]/architecture/rows/[rowId]/versions
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; rowId: string }> }
) {
  try {
    const { projectId, rowId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role === 'VENDOR') {
      return NextResponse.json({ success: false, error: 'Forbidden' }, { status: 403 });
    }

    const row = await prisma.drawingRow.findFirst({ where: { id: rowId, projectId } });
    if (!row) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    const versions = await prisma.drawingVersion.findMany({
      where: { drawingRowId: rowId },
      include: {
        uploadedBy: { select: { id: true, name: true } },
        reviewedBy: { select: { id: true, name: true } },
      },
      orderBy: { versionNumber: 'desc' },
    });

    return NextResponse.json({ success: true, data: versions });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/architecture/rows/[rowId]/versions
// Accepts either multipart/form-data (PDF upload) or application/json (URL)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; rowId: string }> }
) {
  try {
    const { projectId, rowId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'ARTIFACTS') {
      return NextResponse.json({ success: false, error: 'Only Architects can upload drawing versions' }, { status: 403 });
    }

    const row = await prisma.drawingRow.findFirst({ where: { id: rowId, projectId } });
    if (!row) return NextResponse.json({ success: false, error: 'Not found' }, { status: 404 });

    if (row.status === 'APPROVED') {
      return NextResponse.json({ success: false, error: 'Drawing is approved and locked. Contact Owner to unlock.' }, { status: 400 });
    }

    // Figure out next version number
    const lastVersion = await prisma.drawingVersion.findFirst({
      where: { drawingRowId: rowId },
      orderBy: { versionNumber: 'desc' },
      select: { versionNumber: true },
    });
    const nextVersionNumber = (lastVersion?.versionNumber ?? -1) + 1;

    let fileUrl = '';
    let fileName: string | null = null;
    let fileSizeKb: number | null = null;
    let uploadType = 'PDF';

    const contentType = request.headers.get('content-type') ?? '';

    if (contentType.includes('multipart/form-data')) {
      // PDF upload
      const formData = await request.formData();
      const file = formData.get('file') as File | null;
      if (!file) return NextResponse.json({ success: false, error: 'No file provided' }, { status: 400 });
      if (file.type !== 'application/pdf') {
        return NextResponse.json({ success: false, error: 'Only PDF files are accepted' }, { status: 400 });
      }
      const buffer = Buffer.from(await file.arrayBuffer());
      const key = `drawings/${projectId}/${rowId}/v${nextVersionNumber}-${Date.now()}.pdf`;
      fileUrl = await fileStorage.save(key, buffer, 'application/pdf');
      fileName = file.name;
      fileSizeKb = Math.ceil(buffer.length / 1024);
      uploadType = 'PDF';
    } else {
      // URL (Google Drive, etc.)
      const body = await request.json();
      if (!body.url || typeof body.url !== 'string') {
        return NextResponse.json({ success: false, error: 'Provide a url field' }, { status: 400 });
      }
      fileUrl = body.url;
      fileName = body.fileName ?? null;
      uploadType = 'URL';
    }

    // Mark all previous versions as not current
    await prisma.drawingVersion.updateMany({
      where: { drawingRowId: rowId },
      data: { isCurrent: false },
    });

    const version = await prisma.drawingVersion.create({
      data: {
        drawingRowId: rowId,
        versionNumber: nextVersionNumber,
        uploadType,
        fileUrl,
        fileName,
        fileSizeKb,
        uploadedById: auth.userId,
        isCurrent: true,
        reviewStatus: 'PENDING',
      },
    });

    // Update DrawingRow status → SUBMITTED
    await prisma.drawingRow.update({
      where: { id: rowId },
      data: { status: 'SUBMITTED' },
    });

    // Check if all rows in the set are submitted → set DELIVERED
    if (row.setId) {
      const setRows = await prisma.drawingRow.findMany({
        where: { setId: row.setId },
        select: { status: true },
      });
      const allDelivered = setRows.every((r) => ['SUBMITTED', 'APPROVED'].includes(r.status));
      if (allDelivered) {
        await prisma.drawingSet.update({
          where: { id: row.setId },
          data: { status: 'DELIVERED', deliveredAt: new Date() },
        });
      } else {
        // Ensure set is IN_PROGRESS
        const set = await prisma.drawingSet.findUnique({ where: { id: row.setId } });
        if (set && ['REQUESTED', 'DRAFT'].includes(set.status)) {
          await prisma.drawingSet.update({ where: { id: row.setId }, data: { status: 'IN_PROGRESS' } });
        }
      }
    }

    await prisma.systemEvent.create({
      data: {
        projectId,
        eventType: 'ARCH_DRAWING_SUBMITTED',
        severity: 'INFO',
        message: `Architect submitted ${row.name} (v${version.versionNumber}) for review.`,
        entityType: 'DrawingVersion',
        entityId: version.id,
        actorId: auth.userId,
      },
    });

    return NextResponse.json({ success: true, data: { id: version.id, versionNumber: version.versionNumber } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Version upload error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
