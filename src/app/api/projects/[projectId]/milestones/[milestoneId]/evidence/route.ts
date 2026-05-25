import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { validateMilestoneOwnership } from '@/lib/validate-ownership';
import { RoleGuard } from '@/services/RoleGuard';
import { EvidenceService } from '@/services/EvidenceService';
import { z } from 'zod';

// Allow up to 30s for file upload + Supabase Storage write
export const maxDuration = 30;

const submitEvidenceSchema = z.object({
  qtyOrPercent: z.coerce.number().min(0).max(100),
  remarks: z.string().optional().nullable(),
});

// GET /api/projects/[projectId]/milestones/[milestoneId]/evidence - List evidence
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    await requireProjectAuth(projectId);

    // IDOR guard: verify milestone belongs to this project
    const milestone = await validateMilestoneOwnership(milestoneId, projectId);
    if (!milestone) {
      return NextResponse.json(
        { success: false, error: 'Milestone not found' },
        { status: 404 }
      );
    }

    const evidence = await EvidenceService.getForMilestone(milestoneId);

    return NextResponse.json({ success: true, data: evidence });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    console.error('Evidence list error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST /api/projects/[projectId]/milestones/[milestoneId]/evidence - Submit evidence
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; milestoneId: string }> }
) {
  try {
    const { projectId, milestoneId } = await params;
    const auth = await requireProjectAuth(projectId);

    // Only Vendor can submit evidence
    RoleGuard.requireRole(auth, ['VENDOR']);

    // IDOR guard: verify milestone belongs to this project
    const milestoneCheck = await validateMilestoneOwnership(milestoneId, projectId);
    if (!milestoneCheck) {
      return NextResponse.json(
        { success: false, error: 'Milestone not found' },
        { status: 404 }
      );
    }

    // Parse multipart form data
    const formData = await request.formData();

    const qtyOrPercent = parseFloat(formData.get('qtyOrPercent') as string);
    const remarks = formData.get('remarks') as string | null;

    // Validate basic fields
    submitEvidenceSchema.parse({ qtyOrPercent, remarks });

    // Get files
    const files: Array<{
      buffer: Buffer;
      originalName: string;
      mimeType: string;
      size: number;
    }> = [];

    const fileEntries = formData.getAll('files');
    for (const file of fileEntries) {
      if (file instanceof File) {
        const buffer = Buffer.from(await file.arrayBuffer());
        files.push({
          buffer,
          originalName: file.name,
          mimeType: file.type,
          size: file.size,
        });
      }
    }

    if (files.length === 0) {
      return NextResponse.json(
        { success: false, error: 'At least one file is required' },
        { status: 400 }
      );
    }

    const result = await EvidenceService.submit(
      {
        milestoneId,
        qtyOrPercent,
        remarks: remarks || undefined,
        files,
      },
      auth.userId,
      auth.role,
      projectId
    );

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 400 }
      );
    }

    // Notify PMC that evidence was submitted (best-effort)
    try {
      const ms = await prisma.milestone.findUnique({
        where: { id: milestoneId },
        select: { title: true },
      });
      await prisma.systemEvent.create({
        data: {
          eventType: 'EVIDENCE_SUBMITTED',
          severity: 'INFO',
          actorId: auth.userId,
          projectId,
          entityType: 'Milestone',
          entityId: milestoneId,
          message: `Vendor has submitted evidence for "${ms?.title ?? 'Milestone'}". Please review and verify.`,
        },
      });
    } catch {
      // best-effort
    }

    return NextResponse.json({
      success: true,
      data: { evidenceId: result.evidenceId },
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json(
        { success: false, error: 'Unauthorized' },
        { status: 401 }
      );
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: 403 }
      );
    }
    if (error instanceof z.ZodError) {
      console.error('Validation error:', error.errors);
      return NextResponse.json(
        { success: false, error: `Invalid input: ${error.errors.map(e => e.message).join(', ')}` },
        { status: 400 }
      );
    }
    console.error('Evidence submit error:', error);
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500 }
    );
  }
}
