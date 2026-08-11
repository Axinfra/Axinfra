import { NextRequest, NextResponse } from 'next/server';
import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { isRaBillAiModeEnabled } from '@/lib/ra-bill-ai-mode';

export const dynamic = 'force-dynamic';

const ALLOWED_CONTENT_TYPES = [
  'application/pdf',
  'image/jpeg', 'image/png', 'image/gif', 'image/webp',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
];
const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// POST /api/projects/[projectId]/orders/[orderId]/ra-bills/ai-extract/upload
// Token-issuing endpoint for @vercel/blob/client's upload() helper (called from
// VendorCreateRABillModal). The browser PUTs file bytes directly to Blob storage using a
// short-lived client token minted here — the bytes never pass through this Next.js function's
// own request body, which is what lets a real multi-page scanned PDF or phone photo through
// (Vercel Serverless Functions cap inbound request bodies well under that). See ai-extract's
// module comment for the other half of this flow (fetching the uploaded blob server-side).
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> },
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['VENDOR']);

    if (!isRaBillAiModeEnabled(projectId)) {
      return NextResponse.json({ error: 'AI mode is not available for this project' }, { status: 501 });
    }

    // Ownership check — only the vendor actually assigned to this order may upload against it,
    // same rule RABillService.createDraft enforces. Done before minting any token so an
    // unauthorized caller can't get a valid upload token at all.
    const order = await prisma.phase.findFirst({ where: { id: orderId, projectId }, select: { vendorUserId: true } });
    if (!order) {
      return NextResponse.json({ error: 'Purchase order not found in this project' }, { status: 404 });
    }
    if (order.vendorUserId !== auth.userId) {
      return NextResponse.json({ error: 'You are not the vendor assigned to this purchase order' }, { status: 403 });
    }

    const body = (await request.json()) as HandleUploadBody;

    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => ({
        allowedContentTypes: ALLOWED_CONTENT_TYPES,
        maximumSizeInBytes: MAX_UPLOAD_BYTES,
        addRandomSuffix: true,
        // Short-lived — this token is only ever used for the upload the vendor is doing right
        // now, not stored or reused later.
        validUntil: Date.now() + 5 * 60 * 1000,
      }),
    });

    return NextResponse.json(jsonResponse);
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    console.error('RA Bill AI upload-token error:', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 400 });
  }
}
