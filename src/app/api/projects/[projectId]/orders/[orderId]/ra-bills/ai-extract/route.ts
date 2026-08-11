import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import mammoth from 'mammoth';
import { get, del } from '@vercel/blob';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { isAiEnabled } from '@/lib/ai/claude';
import { aiGenerationRateLimiter } from '@/lib/rate-limiter';
import { RABillDocumentExtractionService } from '@/services/RABillDocumentExtractionService';
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
const MAX_DOCX_BYTES = 10 * 1024 * 1024;
const MAX_SPREADSHEET_ROWS = 400;
// Docx text has no row structure to bound by count, so bound by characters instead — well past
// any real RA bill / measurement sheet written in Word.
const MAX_DOCX_CHARS = 60_000;

const PDF_TYPE = 'application/pdf';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const SPREADSHEET_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);
const SPREADSHEET_EXTENSIONS = /\.(xlsx|xls|csv)$/i;
const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCX_EXTENSION = /\.docx$/i;

/** Same cell-to-text flattening as the BOQ AI-import route — reads a sheet whose columns don't
 * match a fixed template into a compact table Claude can parse positionally. */
function sheetToText(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '', blankrows: false }) as (string | number)[][];
  return raw.slice(0, MAX_SPREADSHEET_ROWS).map((row) => row.map((cell) => String(cell ?? '').trim()).join(' | ')).join('\n');
}

/** Reads a .docx's raw text (mammoth strips the OOXML markup down to plain paragraphs/table
 * cells) for a vendor's own Word-drafted running bill — same downstream text-extraction path a
 * spreadsheet uses, just a different source format. */
async function docxToText(buffer: Buffer): Promise<string> {
  const { value } = await mammoth.extractRawText({ buffer });
  return value.slice(0, MAX_DOCX_CHARS);
}

interface FileResult {
  fileName: string;
  itemsExtracted?: number;
  error?: string;
}

export interface RaBillAiExtractedItem {
  /** As literally read off the document — shown to the vendor for review. */
  description: string;
  /** One of this order's approved BOQ item descriptions, copied verbatim, or null if Claude
   * couldn't confidently match this row to exactly one of them. Matching is done inside the
   * Claude call itself (schema-constrained to this order's real item list — see
   * RABillDocumentExtractionService), not by client-side string similarity, so
   * VendorCreateRABillModal only needs an exact lookup by this value, never fuzzy matching. */
  matchedItem: string | null;
  unit: string;
  quantity: number;
  rate: number;
  sourceFile: string;
}

/** A file the client already uploaded directly to Blob storage (see the sibling `upload` route)
 * — `url` is the private blob URL to fetch and process, never raw bytes in this request body.
 * See the module doc comment below for why. */
interface UploadedFileRef {
  url: string;
  name: string;
  type: string;
}

// POST /api/projects/[projectId]/orders/[orderId]/ra-bills/ai-extract
// Vendor "AI mode" for drafting an RA Bill: reads a batch of photos, scans, PDFs, or
// spreadsheets (a measurement sheet, a supplier bill, anything with item/qty/rate rows) with
// Claude, which both extracts each row AND matches it to one of this order's APPROVED BOQ items
// in the same call (see RABillDocumentExtractionService) — construction/paint item names vary
// too much in word order, punctuation, and spelling for a client-side string matcher to be
// reliable, so matching rides on the same model call instead.
//
// Takes Blob URLs, not raw file bytes: the client uploads directly to Blob storage first (via
// the sibling `upload` route + @vercel/blob/client), because Vercel Serverless Functions cap
// inbound request bodies at ~4.5MB — well under a real scanned multi-page document or phone
// photo — so proxying raw multipart file bytes through this route 413'd in practice. Each blob
// is fetched server-side (an outbound request, not subject to that inbound cap) and deleted
// again once processed, since it's only ever a transient extraction input, never stored.
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
    // same rule RABillService.createDraft enforces. Also pulls this order's own APPROVED BOQ
    // item descriptions, so extraction can be scoped to just this order below.
    const order = await prisma.phase.findFirst({
      where: { id: orderId, projectId },
      include: { boqs: { where: { status: 'APPROVED' }, include: { items: { select: { description: true } } } } },
    });
    if (!order) {
      return NextResponse.json({ success: false, error: 'Purchase order not found in this project' }, { status: 404 });
    }
    if (order.vendorUserId !== auth.userId) {
      return NextResponse.json({ success: false, error: 'You are not the vendor assigned to this purchase order' }, { status: 403 });
    }

    const knownItems = order.boqs.flatMap((b) => b.items.map((i) => i.description));
    if (knownItems.length === 0) {
      return NextResponse.json({ success: false, error: 'This purchase order has no approved BOQ items to match against yet' }, { status: 400 });
    }
    const scopeContext = { orderName: order.name, knownItems };

    const body = (await request.json().catch(() => null)) as { files?: unknown } | null;
    const files = Array.isArray(body?.files)
      ? (body.files as UploadedFileRef[]).filter((f) => f && typeof f.url === 'string' && f.url.startsWith('https://'))
      : [];

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ success: false, error: `Upload at most ${MAX_FILES} files at a time` }, { status: 400 });
    }

    const perFile = await Promise.all(files.map(async (file): Promise<{ fileResult: FileResult; rows: RaBillAiExtractedItem[] }> => {
      const fileName = file.name || 'upload';
      const isPdf = file.type === PDF_TYPE;
      const isImage = IMAGE_TYPES.has(file.type);
      const isSpreadsheet = SPREADSHEET_TYPES.has(file.type) || SPREADSHEET_EXTENSIONS.test(fileName);
      const isDocx = file.type === DOCX_TYPE || DOCX_EXTENSION.test(fileName);

      if (!isPdf && !isImage && !isSpreadsheet && !isDocx) {
        return { fileResult: { fileName, error: 'Unsupported file type — use a photo, PDF, DOCX, XLSX, XLS, or CSV' }, rows: [] };
      }

      // Every file here is a real, billed Claude call — same shared cap as the other AI-generation
      // endpoints (work order draft, BOQ import).
      const rateCheck = await aiGenerationRateLimiter.check(auth.userId);
      if (!rateCheck.allowed) {
        return { fileResult: { fileName, error: 'Too many AI requests — please try again later' }, rows: [] };
      }

      try {
        const blob = await get(file.url, { access: 'private' });
        if (!blob || blob.statusCode !== 200) {
          return { fileResult: { fileName, error: 'Could not read the uploaded file — please try again' }, rows: [] };
        }

        const maxBytes = isPdf ? MAX_PDF_BYTES : isSpreadsheet ? MAX_SPREADSHEET_BYTES : isDocx ? MAX_DOCX_BYTES : MAX_IMAGE_BYTES;
        if (blob.blob.size > maxBytes) {
          return { fileResult: { fileName, error: `File too large — max ${Math.round(maxBytes / (1024 * 1024))}MB` }, rows: [] };
        }

        const buffer = Buffer.from(await new Response(blob.stream).arrayBuffer());

        let extracted;
        if (isSpreadsheet) {
          const sheetText = sheetToText(buffer);
          extracted = sheetText.trim() ? await RABillDocumentExtractionService.extractFromText(sheetText, scopeContext) : null;
        } else if (isDocx) {
          const docText = await docxToText(buffer);
          extracted = docText.trim() ? await RABillDocumentExtractionService.extractFromText(docText, scopeContext) : null;
        } else {
          const base64 = buffer.toString('base64');
          extracted = isPdf
            ? await RABillDocumentExtractionService.extractFromFile({ kind: 'document', mediaType: 'application/pdf', base64 }, scopeContext)
            : await RABillDocumentExtractionService.extractFromFile({ kind: 'image', mediaType: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', base64 }, scopeContext);
        }

        if (!extracted) {
          return { fileResult: { fileName, error: 'Could not read any line items from this file' }, rows: [] };
        }

        const rows: RaBillAiExtractedItem[] = extracted.items
          .filter((item): boolean => Boolean(item.description.trim()) && item.quantity > 0)
          .map((item): RaBillAiExtractedItem => ({
            description: item.description.trim(),
            matchedItem: item.matchedItem,
            unit: item.unit.trim(),
            quantity: item.quantity,
            rate: item.rate,
            sourceFile: fileName,
          }));

        return { fileResult: { fileName, itemsExtracted: rows.length }, rows };
      } catch (err) {
        console.error('RA Bill AI extraction failed for file', fileName, err);
        return { fileResult: { fileName, error: 'Extraction failed' }, rows: [] };
      } finally {
        // Purely a transient extraction input — never a stored business record — so clean it up
        // regardless of outcome instead of leaving vendor-uploaded files sitting in Blob storage.
        void del(file.url).catch((e) => console.error('RA Bill AI extract: blob cleanup failed', fileName, e));
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
