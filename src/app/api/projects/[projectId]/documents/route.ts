import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { fileStorage } from '@/lib/file-storage';
import { generateStorageKey } from '@/lib/utils';
import { AuditActionTypes } from '@/types';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE_MB = parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10);
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif',
  'application/pdf',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
]);

// GET /api/projects/[projectId]/documents?category=SPEC|OTHER - list, everyone with project
// access can view (including Vendor).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);

    const category = request.nextUrl.searchParams.get('category');
    if (category && !['SPEC', 'OTHER'].includes(category)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }

    const documents = await prisma.projectDocument.findMany({
      where: { projectId, deletedAt: null, ...(category ? { category } : {}) },
      include: {
        uploadedBy: { select: { name: true } },
        files: { select: { id: true, fileName: true, size: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({
      success: true,
      data: documents.map((d) => ({
        id: d.id, title: d.title, description: d.description, category: d.category,
        createdAt: d.createdAt, uploadedByName: d.uploadedBy.name, files: d.files,
      })),
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Document list error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/documents - PMC/Consultant upload a Spec or Other Doc.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC', 'CONSULTANT']);

    const formData = await request.formData();
    const category = formData.get('category') as string | null;
    const title = (formData.get('title') as string | null)?.trim();
    const description = (formData.get('description') as string | null)?.trim() || null;
    const file = formData.get('file');

    if (!category || !['SPEC', 'OTHER'].includes(category)) {
      return NextResponse.json({ success: false, error: 'Invalid category' }, { status: 400 });
    }
    if (!title) {
      return NextResponse.json({ success: false, error: 'Title is required' }, { status: 400 });
    }
    if (!(file instanceof File) || file.size === 0) {
      return NextResponse.json({ success: false, error: 'A file is required' }, { status: 400 });
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json({ success: false, error: `File exceeds maximum size of ${MAX_FILE_SIZE_MB}MB` }, { status: 400 });
    }
    if (!ALLOWED_MIME_TYPES.has(file.type)) {
      return NextResponse.json({ success: false, error: `File type ${file.type} is not allowed` }, { status: 400 });
    }

    const storageKey = generateStorageKey(file.name);
    const buffer = Buffer.from(await file.arrayBuffer());
    const filePath = await fileStorage.save(storageKey, buffer, file.type);

    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.projectDocument.create({
        data: {
          projectId, category, title, description, uploadedById: auth.userId,
          files: {
            create: [{ storageKey, filePath, fileName: file.name, mimeType: file.type, size: file.size }],
          },
        },
        include: { files: true },
      });
      await tx.auditLog.create({
        data: {
          projectId, actorId: auth.userId, role: auth.role,
          actionType: AuditActionTypes.DOCUMENT_UPLOAD,
          entityType: 'ProjectDocument', entityId: created.id,
          afterJson: JSON.stringify({ category, title, fileName: file.name }),
        },
      });
      return created;
    });

    return NextResponse.json({ success: true, data: document });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: 'Access denied.' }, { status: 403 });
    }
    console.error('Document upload error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
