import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { isAiEnabled } from '@/lib/ai/claude';
import { aiGenerationRateLimiter } from '@/lib/rate-limiter';
import { BOQDocumentExtractionService } from '@/services/BOQDocumentExtractionService';
import { isRaBillAiModeEnabled } from '@/lib/ra-bill-ai-mode';

export const dynamic = 'force-dynamic';
// Mirrors the BOQ AI-import route's budget — a dense multi-page document has measured at
// ~90-100s end to end. Files run in parallel below, so this only needs to cover the single
// slowest file.
export const maxDuration = 280;

const MAX_FILES = 3;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
const MAX_SPREADSHEET_ROWS = 400;

const PDF_TYPE = 'application/pdf';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const SPREADSHEET_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);
const SPREADSHEET_EXTENSIONS = /\.(xlsx|xls|csv)$/i;

/** Same cell-to-text flattening as the BOQ AI-import route — reads a sheet whose columns don't
 * match a fixed template into a compact table Claude can parse positionally. */
function sheetToText(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '', blankrows: false }) as (string | number)[][];
  return raw.slice(0, MAX_SPREADSHEET_ROWS).map((row) => row.map((cell) => String(cell ?? '').trim()).join(' | ')).join('\n');
}

interface FileResult {
  fileName: string;
  itemsExtracted?: number;
  error?: string;
}

export interface RaBillAiExtractedItem {
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  sourceFile: string;
}

// POST /api/projects/[projectId]/orders/[orderId]/ra-bills/ai-extract
// Vendor "AI mode" for drafting an RA Bill: reads a batch of photos, scans, PDFs, or
// spreadsheets (a measurement sheet, a supplier bill, anything with item/qty/rate rows) with
// Claude and returns raw extracted rows. Matching those rows to this order's APPROVED BOQs and
// filling in quantities is done client-side by VendorCreateRABillModal, reusing the exact same
// fuzzy matcher already used for its Excel-import path — this route only does extraction.
//
// Gated to a project allowlist (see ra-bill-ai-mode.ts) — not a general-availability feature yet.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string; orderId: string }> }
) {
  try {
    const { projectId, orderId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['VENDOR']);

    if (!isRaBillAiModeEnabled(projectId)) {
      return NextResponse.json({ success: false, error: 'AI mode is not available for this project' }, { status: 501 });
    }
    if (!isAiEnabled()) {
      return NextResponse.json({ success: false, error: 'AI document extraction is not configured' }, { status: 501 });
    }

    // Ownership check — only the vendor actually assigned to this order may draft against it,
    // same rule RABillService.createDraft enforces.
    const order = await prisma.phase.findFirst({ where: { id: orderId, projectId } });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Purchase order not found in this project' }, { status: 404 });
    }
    if (order.vendorUserId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'You are not the vendor assigned to this purchase order' }, { status: 403 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ success: false, error: `Upload at most ${MAX_FILES} files at a time` }, { status: 400 });
    }

    const perFile = await Promise.all(files.map(async (file): Promise<{ fileResult: FileResult; rows: RaBillAiExtractedItem[] }> => {
      const isPdf = file.type === PDF_TYPE;
      const isImage = IMAGE_TYPES.has(file.type);
      const isSpreadsheet = SPREADSHEET_TYPES.has(file.type) || SPREADSHEET_EXTENSIONS.test(file.name);

      if (!isPdf && !isImage && !isSpreadsheet) {
        return { fileResult: { fileName: file.name, error: 'Unsupported file type — use a photo, PDF, XLSX, XLS, or CSV' }, rows: [] };
      }
      const maxBytes = isPdf ? MAX_PDF_BYTES : isSpreadsheet ? MAX_SPREADSHEET_BYTES : MAX_IMAGE_BYTES;
      if (file.size > maxBytes) {
        return { fileResult: { fileName: file.name, error: `File too large — max ${Math.round(maxBytes / (1024 * 1024))}MB` }, rows: [] };
      }

      // Every file here is a real, billed Claude call — same shared cap as the other AI-generation
      // endpoints (work order draft, BOQ import).
      const rateCheck = await aiGenerationRateLimiter.check(auth.userId);
      if (!rateCheck.allowed) {
        return { fileResult: { fileName: file.name, error: 'Too many AI requests — please try again later' }, rows: [] };
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());

        let extracted;
        if (isSpreadsheet) {
          const sheetText = sheetToText(buffer);
          extracted = sheetText.trim() ? await BOQDocumentExtractionService.extractFromText(sheetText) : null;
        } else {
          const base64 = buffer.toString('base64');
          extracted = isPdf
            ? await BOQDocumentExtractionService.extractFromFile({ kind: 'document', mediaType: 'application/pdf', base64 })
            : await BOQDocumentExtractionService.extractFromFile({ kind: 'image', mediaType: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', base64 });
        }

        if (!extracted) {
          return { fileResult: { fileName: file.name, error: 'Could not read any line items from this file' }, rows: [] };
        }

        const rows: RaBillAiExtractedItem[] = extracted.items
          .filter((item) => item.description.trim() && item.quantity > 0)
          .map((item) => ({
            description: item.description.trim(),
            unit: item.unit.trim(),
            quantity: item.quantity,
            rate: item.rate,
            sourceFile: file.name,
          }));

        return { fileResult: { fileName: file.name, itemsExtracted: rows.length }, rows };
      } catch (err) {
        console.error('RA Bill AI extraction failed for file', file.name, err);
        return { fileResult: { fileName: file.name, error: 'Extraction failed' }, rows: [] };
      }
    }));

    const items = perFile.flatMap((r) => r.rows);
    const fileResults = perFile.map((r) => r.fileResult);

    return NextResponse.json({ success: true, data: { items, fileResults } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('RA Bill AI extract error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
