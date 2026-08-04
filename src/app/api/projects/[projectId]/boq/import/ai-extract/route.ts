import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { isAiEnabled } from '@/lib/ai/claude';
import { aiGenerationRateLimiter } from '@/lib/rate-limiter';
import { BOQDocumentExtractionService } from '@/services/BOQDocumentExtractionService';

export const dynamic = 'force-dynamic';

const MAX_FILES = 5;
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_SPREADSHEET_BYTES = 10 * 1024 * 1024;
// Bounds the text sent to the model on an unusually large sheet — well past any real BOQ.
const MAX_SPREADSHEET_ROWS = 400;

const PDF_TYPE = 'application/pdf';
const IMAGE_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const SPREADSHEET_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.ms-excel',
  'text/csv',
]);
const SPREADSHEET_EXTENSIONS = /\.(xlsx|xls|csv)$/i;

/** Reads a sheet's cells into a compact text table for the model — this is the fallback path
 * for a spreadsheet whose columns don't match the standard template (client-side positional
 * parsing already failed, or the client sent it straight here because it wasn't .xlsx/.xls/.csv
 * shaped the expected way). Embedded images have no cell value, so an "image" column just comes
 * through blank — the prompt is told to expect and ignore that. */
function sheetToText(buffer: Buffer): string {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<(string | number)[]>(ws, { header: 1, defval: '', blankrows: false }) as (string | number)[][];
  return raw.slice(0, MAX_SPREADSHEET_ROWS).map((row) => row.map((cell) => String(cell ?? '').trim()).join(' | ')).join('\n');
}

interface FileResult {
  fileName: string;
  orderName?: string;
  itemsExtracted?: number;
  error?: string;
}

// POST /api/projects/[projectId]/boq/import/ai-extract
// Reads a batch of PDFs, images (including scanned or handwritten Purchase Orders/BOQs), and/or
// spreadsheets whose columns don't match the standard template, with Claude, and returns line
// items in the same shape the existing Excel importer already produces — feeds straight into
// ImportBOQModal's preview step, which still commits through
// /api/projects/[projectId]/boq/import unchanged. One Claude call per file, so one unreadable
// file in a batch never sinks the rest.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    if (!isAiEnabled()) {
      return NextResponse.json({ success: false, error: 'AI document import is not configured' }, { status: 501 });
    }

    const formData = await request.formData();
    const files = formData.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);

    if (files.length === 0) {
      return NextResponse.json({ success: false, error: 'No files provided' }, { status: 400 });
    }
    if (files.length > MAX_FILES) {
      return NextResponse.json({ success: false, error: `Upload at most ${MAX_FILES} files at a time` }, { status: 400 });
    }

    const items: Array<{ orderName: string; description: string; unit: string; plannedQty: number; rate: number; sourceFile: string }> = [];
    const fileResults: FileResult[] = [];

    for (const file of files) {
      const isPdf = file.type === PDF_TYPE;
      const isImage = IMAGE_TYPES.has(file.type);
      const isSpreadsheet = SPREADSHEET_TYPES.has(file.type) || SPREADSHEET_EXTENSIONS.test(file.name);

      if (!isPdf && !isImage && !isSpreadsheet) {
        fileResults.push({ fileName: file.name, error: 'Unsupported file type — use PDF, JPG, PNG, GIF, WEBP, XLSX, XLS, or CSV' });
        continue;
      }
      const maxBytes = isPdf ? MAX_PDF_BYTES : isSpreadsheet ? MAX_SPREADSHEET_BYTES : MAX_IMAGE_BYTES;
      if (file.size > maxBytes) {
        fileResults.push({ fileName: file.name, error: `File too large — max ${Math.round(maxBytes / (1024 * 1024))}MB` });
        continue;
      }

      // Every file here is a real, billed Claude call — cap per-user usage the same way the
      // Work Order AI draft endpoint does, shared across every AI-generation feature.
      const rateCheck = await aiGenerationRateLimiter.check(auth.userId);
      if (!rateCheck.allowed) {
        fileResults.push({ fileName: file.name, error: 'Too many AI import requests — please try again later' });
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());

        let extracted;
        if (isSpreadsheet) {
          const sheetText = sheetToText(buffer);
          extracted = sheetText.trim()
            ? await BOQDocumentExtractionService.extractFromText(sheetText)
            : null;
        } else {
          const base64 = buffer.toString('base64');
          extracted = isPdf
            ? await BOQDocumentExtractionService.extractFromFile({ kind: 'document', mediaType: 'application/pdf', base64 })
            : await BOQDocumentExtractionService.extractFromFile({ kind: 'image', mediaType: file.type as 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp', base64 });
        }

        if (!extracted) {
          fileResults.push({ fileName: file.name, error: 'Could not read any line items from this file' });
          continue;
        }

        // The prompt instructs the model to always invent a title when the document has no
        // project/client name of its own — the filename is only a fallback for the rare case
        // it still comes back empty.
        const orderName = extracted.orderName.trim() || file.name.replace(/\.[^.]+$/, '');
        for (const item of extracted.items) {
          if (!item.description.trim() || !item.unit.trim() || !(item.quantity > 0) || !(item.rate > 0)) continue;
          items.push({
            orderName,
            description: item.description.trim(),
            unit: item.unit.trim(),
            plannedQty: item.quantity,
            rate: item.rate,
            sourceFile: file.name,
          });
        }
        fileResults.push({ fileName: file.name, orderName, itemsExtracted: extracted.items.length });
      } catch (err) {
        console.error('AI BOQ extraction failed for file', file.name, err);
        fileResults.push({ fileName: file.name, error: 'Extraction failed' });
      }
    }

    return NextResponse.json({ success: true, data: { items, fileResults } });
  } catch (error) {
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('BOQ AI import error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
