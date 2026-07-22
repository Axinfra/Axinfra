import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { validateMilestoneOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { AuditLogger } from '@/services/AuditLogger';
import { SystemEventService, SystemEventType } from '@/services/SystemEventService';
import { fileStorage } from '@/lib/file-storage';
import { generateStorageKey } from '@/lib/utils';
import { invalidatePrefix } from '@/lib/cache';
import { AuditActionTypes, MilestoneState, Role } from '@/types';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'video/mp4', 'video/quicktime',
]);

/** Status is never set by hand — it's derived straight from percentComplete: 0% is Not
 * Started, 1-99% is In Progress, 100% is Completed. Reuses the existing MilestoneState enum
 * values (DRAFT/IN_PROGRESS/VERIFIED) so payment-eligibility's and dependency-blocking's
 * existing `state === VERIFIED/CLOSED` checks keep working unchanged. */
function deriveState(percentComplete: number): MilestoneState {
  if (percentComplete <= 0) return MilestoneState.DRAFT;
  if (percentComplete >= 100) return MilestoneState.VERIFIED;
  return MilestoneState.IN_PROGRESS;
}

// POST /api/projects/[projectId]/milestones/[milestoneId]/progress-update
// PMC or Site Engineer. The single entry point for moving an activity's progress — every call
// appends a new history entry (Evidence row, authorRole=the caller's actual role) and never
// overwrites a previous one.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, [Role.PMC, Role.SITE_ENGINEER]);

    const milestone = await validateMilestoneOwnership(milestoneId, projectId);
    if (!milestone) {
      return NextResponse.json({ success: false, error: 'Activity not found' }, { status: 404 });
    }

    const formData = await request.formData();
    const percentRaw = formData.get('percentComplete');
    const percentComplete = percentRaw !== null ? Number(percentRaw) : NaN;
    if (!Number.isFinite(percentComplete) || percentComplete < 0 || percentComplete > 100) {
      return NextResponse.json({ success: false, error: 'percentComplete must be between 0 and 100' }, { status: 400 });
    }
    const remarks = (formData.get('remarks') as string | null)?.trim() || undefined;
    if (remarks && remarks.length > 2000) {
      return NextResponse.json({ success: false, error: 'Remarks must be 2000 characters or fewer' }, { status: 400 });
    }
    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);

    for (const file of files) {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        return NextResponse.json({ success: false, error: `File ${file.name} exceeds maximum size of ${MAX_FILE_SIZE_MB}MB` }, { status: 400 });
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return NextResponse.json({ success: false, error: `File ${file.name} has disallowed type: ${file.type}` }, { status: 400 });
      }
    }

    const fromState = milestone.state as MilestoneState;
    const toState = deriveState(percentComplete);
    const isStarting = fromState === MilestoneState.DRAFT && toState !== MilestoneState.DRAFT;

    // Same predecessor-dependency guard the old Start Work transition enforced — a Finish-to-
    // Start or Start-to-Start predecessor that hasn't cleared still blocks the very first
    // progress update, so sequencing integrity isn't lost along with the manual state machine.
    if (isStarting) {
      const deps = await prisma.milestoneDependency.findMany({
        where: { successorId: milestoneId },
        include: { predecessor: { select: { title: true, state: true } } },
      });
      const violations = deps
        .filter((d) =>
          (d.dependencyType === 'FS' && d.predecessor.state !== MilestoneState.CLOSED) ||
          (d.dependencyType === 'SS' && d.predecessor.state === MilestoneState.DRAFT)
        )
        .map((d) => `"${d.predecessor.title}" (${d.dependencyType})`);
      if (violations.length > 0) {
        return NextResponse.json(
          { success: false, error: `Predecessor dependency not met: ${violations.join(', ')}` },
          { status: 400 },
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

    const now = new Date();
    const milestoneUpdateData: Record<string, unknown> = { percentComplete, state: toState };
    if (isStarting && !milestone.actualStart) milestoneUpdateData.actualStart = now;
    if (toState === MilestoneState.VERIFIED && fromState !== MilestoneState.VERIFIED) {
      milestoneUpdateData.actualEnd = now;
      milestoneUpdateData.actualVerification = now;
    }

    const evidence = await prisma.$transaction(async (tx) => {
      const created = await tx.evidence.create({
        data: {
          milestoneId,
          submittedById: auth.userId,
          qtyOrPercent: percentComplete,
          remarks,
          frozen: false,
          status: 'SUBMITTED',
          authorRole: auth.role,
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

      await tx.milestone.update({ where: { id: milestoneId }, data: milestoneUpdateData });

      if (toState !== fromState) {
        await tx.milestoneStateTransition.create({
          data: {
            milestoneId,
            fromState,
            toState,
            actorId: auth.userId,
            role: auth.role,
            reason: `Progress updated to ${percentComplete}%`,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          projectId,
          actorId: auth.userId,
          role: auth.role,
          actionType: AuditActionTypes.MILESTONE_UPDATE,
          entityType: 'Milestone',
          entityId: milestoneId,
          beforeJson: JSON.stringify({ percentComplete: milestone.percentComplete, state: fromState }),
          afterJson: JSON.stringify({ percentComplete, state: toState, remarks }),
        },
      });

      return created;
    });

    await Promise.all([
      invalidatePrefix(`milestone:${projectId}:list:`),
      invalidatePrefix(`project:${projectId}:detail:`),
      invalidatePrefix(`gantt:${projectId}`),
      invalidatePrefix(`analytics:${projectId}`),
      invalidatePrefix(`analysis:${projectId}`),
    ]);

    // Viseron Intelligence: emit system event for analytics pipeline (payment eligibility is
    // deliberately NOT recalculated here — Activities no longer carry a payment concept).
    if (toState !== fromState) {
      const sysEventType = toState === MilestoneState.VERIFIED ? SystemEventType.MILESTONE_VERIFIED : SystemEventType.MILESTONE_TRANSITIONED;
      SystemEventService.emit(sysEventType, projectId, 'Milestone', milestoneId, auth.userId, { fromState, toState, percentComplete });
    }

    return NextResponse.json({ success: true, data: { evidenceId: evidence.id, percentComplete, state: toState } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Only PMC or Site Engineer can update activity progress' }, { status: 403 });
    }
    console.error('Progress update error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
