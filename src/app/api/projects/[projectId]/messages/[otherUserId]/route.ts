import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireProjectAuth } from '@/lib/auth';
import { MessageService } from '@/services/MessageService';
import { fileStorage } from '@/lib/file-storage';
import { sanitizeFileExt } from '@/lib/utils';

export const dynamic = 'force-dynamic';

const ALLOWED_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream',
];
const ALLOWED_EXTS = ['pdf', 'jpg', 'jpeg', 'png', 'webp', 'doc', 'docx', 'xls', 'xlsx'];
const MAX_SIZE = 20 * 1024 * 1024;

// GET /api/projects/[projectId]/messages/[otherUserId] - full thread with one person, oldest
// first. Marks every message from them as read as a side effect of opening the thread (the
// returned data reflects the state as of just before that mark, so unread badges computed from
// this same response are still accurate).
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; otherUserId: string }> },
) {
  try {
    const { projectId, otherUserId } = await params;
    const auth = await requireProjectAuth(projectId);

    const thread = await MessageService.getThread(projectId, auth.userId, otherUserId);
    await MessageService.markRead(projectId, auth.userId, otherUserId);

    return NextResponse.json({ success: true, data: thread });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Message thread error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/messages/[otherUserId] - send a message, optionally with a
// file attachment (multipart). Text-only messages use a plain JSON body.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; otherUserId: string }> },
) {
  try {
    const { projectId, otherUserId } = await params;
    const auth = await requireProjectAuth(projectId);

    const contentType = request.headers.get('content-type') ?? '';
    let body = '';
    const files: Array<{ storageKey: string; fileName: string; mimeType: string; fileSize: number }> = [];

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      body = formData.get('body') ? String(formData.get('body')) : '';
      const uploaded = formData.get('file') as File | null;
      if (uploaded) {
        const fileExt = (uploaded.name.split('.').pop() ?? '').toLowerCase();
        if (!ALLOWED_TYPES.includes(uploaded.type) && !ALLOWED_EXTS.includes(fileExt)) {
          return NextResponse.json({ success: false, error: 'File type not allowed' }, { status: 400 });
        }
        if (uploaded.size > MAX_SIZE) {
          return NextResponse.json({ success: false, error: 'File too large (max 20 MB)' }, { status: 400 });
        }
        const buffer = Buffer.from(await uploaded.arrayBuffer());
        const ext = sanitizeFileExt(uploaded.name);
        const mimeType = uploaded.type || 'application/octet-stream';
        const key = `messages/${projectId}/${auth.userId}-${randomUUID()}.${ext}`;
        const storageKey = await fileStorage.save(key, buffer, mimeType);
        files.push({ storageKey, fileName: uploaded.name, mimeType, fileSize: uploaded.size });
      }
    } else {
      const json = await request.json().catch(() => ({}));
      body = typeof json.body === 'string' ? json.body : '';
    }

    const result = await MessageService.send(projectId, auth.userId, otherUserId, body, files);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, data: result.message });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    console.error('Send message error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
