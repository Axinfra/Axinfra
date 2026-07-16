import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { validateMilestoneOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { fileStorage } from '@/lib/file-storage';
import { generateStorageKey } from '@/lib/utils';
import { AuditActionTypes } from '@/types';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4',
  'video/quicktime',
]);

// POST /api/projects/[projectId]/milestones/[milestoneId]/submission
// Optional, non-blocking: the assigned Vendor can attach site photos/documents and a note to
// an activity at any time, as many times as they like. Purely supplementary — it never changes
// progress or status (PMC owns that exclusively via the progress-update endpoint) and never
// gates anything; it's just a timestamped record for reference/disputes.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    if (!RoleGuard.canSubmitForVerification(auth)) {
      return NextResponse.json(
        { success: false, error: 'Only the assigned Vendor can attach documents' },
        { status: 403 }
      );
    }

    const milestone = await validateMilestoneOwnership(milestoneId, projectId);
    if (!milestone) {
      return NextResponse.json({ success: false, error: 'Milestone not found' }, { status: 404 });
    }

    if (milestone.vendorUserId && milestone.vendorUserId !== auth.userId) {
      return NextResponse.json(
        { success: false, error: 'You can only attach documents on activities assigned to you' },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const remarks = (formData.get('remarks') as string | null)?.trim() || undefined;
    const qtyOrPercentRaw = formData.get('qtyOrPercent') as string | null;
    const qtyOrPercent = qtyOrPercentRaw ? parseFloat(qtyOrPercentRaw) : 0;
    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);

    if (!remarks && files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Add a note or attach at least one file' },
        { status: 400 }
      );
    }
    if (remarks && remarks.length > 2000) {
      return NextResponse.json(
        { success: false, error: 'Remarks must be 2000 characters or fewer' },
        { status: 400 }
      );
    }

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json(
          { success: false, error: `File ${file.name} exceeds maximum size of ${MAX_FILE_SIZE_MB}MB` },
          { status: 400 }
        );
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return NextResponse.json(
          { success: false, error: `File ${file.name} has disallowed type: ${file.type}` },
          { status: 400 }
        );
      }
    }

    const savedFiles: Array<{ storageKey: string; filePath: string; originalName: string; mimeType: string; size: number }> = [];
    for (const file of files) {
      const storageKey = generateStorageKey(file.name);
      const buffer = Buffer.from(await file.arrayBuffer());
      const filePath = await fileStorage.save(storageKey, buffer, file.type);
      savedFiles.push({ storageKey, filePath, originalName: file.name, mimeType: file.type, size: file.size });
    }

    const submission = await prisma.$transaction(async (tx) => {
      const created = await tx.evidence.create({
        data: {
          milestoneId,
          submittedById: auth.userId,
          qtyOrPercent,
          remarks,
          frozen: false,
          status: 'SUBMITTED',
          authorRole: 'VENDOR',
        },
      });

      for (const f of savedFiles) {
        await tx.evidenceFile.create({
          data: {
            evidenceId: created.id,
            storageKey: f.storageKey,
            fileName: f.originalName,
            mimeType: f.mimeType,
            size: f.size,
            filePath: f.filePath,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          projectId,
          actorId: auth.userId,
          role: auth.role,
          actionType: AuditActionTypes.EVIDENCE_SUBMIT,
          entityType: 'Evidence',
          entityId: created.id,
          afterJson: JSON.stringify({ milestoneId, qtyOrPercent, remarks, fileCount: savedFiles.length }),
        },
      });

      return created;
    });

    // Notify PMC — best-effort, matches the existing notifications feed.
    try {
      const ms = await prisma.milestone.findUnique({ where: { id: milestoneId }, select: { title: true } });
      await prisma.systemEvent.create({
        data: {
          eventType: 'EVIDENCE_SUBMITTED',
          severity: 'INFO',
          actorId: auth.userId,
          projectId,
          entityType: 'Milestone',
          entityId: milestoneId,
          message: `Vendor attached documents to "${ms?.title ?? 'Milestone'}".`,
        },
      });
    } catch {
      // best-effort
    }

    return NextResponse.json({ success: true, data: { submissionId: submission.id } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Submission error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
