import { generateAiJson, generateAiJsonFromFile } from '@/lib/ai/claude';

export interface ExtractedRABillItem {
  description: string;
  unit: string;
  quantity: number;
  rate: number;
}

export interface ExtractedRABillDocument {
  items: ExtractedRABillItem[];
}

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          unit: { type: 'string' },
          quantity: { type: 'number' },
          rate: { type: 'number' },
        },
        required: ['description', 'unit', 'quantity', 'rate'],
        additionalProperties: false,
      },
    },
  },
  required: ['items'],
  additionalProperties: false,
} as const;

// Distinct from BOQDocumentExtractionService's prompt on purpose: a BOQ/quotation document
// states a PLANNED quantity being ordered, while an RA (Running Account) Bill document states
// what the contractor is claiming they EXECUTED this billing period — same row shape
// (description, unit, quantity, rate), different meaning of "quantity", and a very different
// document population in practice (site measurement books, handwritten diaries, contractor-
// drafted running bills), so the guidance below is written for that.
const SYSTEM_PROMPT =
  'You extract line items from a contractor\'s RA (Running Account) Bill, site measurement sheet, ' +
  'measurement book (MB) page, or running bill for construction/interior work — a photo, scan, or PDF ' +
  '(typed, printed, or handwritten), a spreadsheet, or a word-processed document, whose columns will ' +
  'often not match any fixed template.\n\n' +

  'DOCUMENT NATURE — this is very often a photo of a physical, handwritten measurement register or a ' +
  'contractor\'s own running-bill note, not a clean typed invoice: ruled notebook pages, pencil or pen ' +
  'entries, numbers crossed out and corrected, uneven handwriting, entries at an angle or with glare/ ' +
  'shadow across part of the page, multiple items crammed onto one line, and abbreviations for common ' +
  'construction/site terms (e.g. "Nos", "Rmt", "Sft", "Cum", "L S"). Read it as carefully as a person ' +
  'familiar with site paperwork would — use the surrounding numbers, units, and typical construction/ ' +
  'interior item vocabulary to resolve ambiguous digits or letters (a handwritten "1" vs "7", "0" vs ' +
  '"6", "S" vs "5" are the most common confusions) rather than giving up on a row that is otherwise ' +
  'legible. If a specific quantity or rate on an otherwise real row is genuinely illegible even with that ' +
  'context, omit that one row entirely rather than guessing a number.\n\n' +

  'QUANTITY — this is the quantity being billed/claimed for THIS period/measurement, i.e. the amount of ' +
  'work actually executed or material actually supplied as recorded on this document right now — not a ' +
  'cumulative-to-date total, and not an originally ordered/contracted quantity. If a row shows both a ' +
  'prior/cumulative figure and a "this bill"/"this measurement"/current-entry figure, extract only the ' +
  'latter. If only one number is present with no cumulative context at all, treat it as this period\'s ' +
  'quantity.\n\n' +

  'WHICH ROWS ARE LINE ITEMS — a row is a line item only if it has all three: a description of an ' +
  'actual work item or material/product, a quantity, AND a rate (or a total you can divide by quantity ' +
  'to get a rate). Column headers vary a lot and are not reliable field names on their own — a quantity ' +
  'column might be labeled "Qty", "Measurement", "This Bill", "Executed", or have no header at all in a ' +
  'handwritten sheet; a rate column might be "Rate", "Unit Rate", or just a number written after the ' +
  'quantity with no label. Match by position and by which value is plainly a per-unit price next to the ' +
  'unit, not by trusting header text alone.\n\n' +

  'RATE — use the effective per-unit rate actually applied on this row. If only a total/amount is given ' +
  'with no explicit per-unit rate, compute rate = amount ÷ quantity.\n\n' +

  'NEVER extract a line item for: subtotals, grand totals, "Total"/"Total Amount"/"Total Payable" rows; ' +
  'tax rows (GST, VAT, service tax, TDS); deduction/retention/advance-recovery rows; freight/delivery/ ' +
  'transportation/mobilisation charges shown as a separate summary line; discount rows; previous/ ' +
  'cumulative-total-only rows that restate an earlier bill\'s figure with no new quantity of their own; ' +
  'bank account details; terms & conditions; signature or certification blocks; or page/date headers. ' +
  'These describe the bill as a whole, not an executed item.\n\n' +

  'Some documents also have descriptive spec rows with no quantity or rate of their own — e.g. a note ' +
  'about material/finish/location grouped under one measured item above it. Fold that supporting detail ' +
  'into the nearest measured item\'s description if it is clearly part of the same item, or omit it — ' +
  'never invent a fake quantity/rate to turn a note into its own line item.';

const FILE_PROMPT =
  'Extract every real, this-period line item (not totals, tax, deductions, or note-only rows) from the ' +
  'attached RA Bill / measurement sheet into the given schema. It may be handwritten, photographed at an ' +
  'angle, or partly unclear — read it as carefully as you can using site/construction terminology as ' +
  'context.';

const TEXT_PROMPT_PREFIX =
  'Extract every real, this-period line item (not totals, tax, deductions, or note-only rows) from the ' +
  'document text below into the given schema. It was read cell-by-cell or paragraph-by-paragraph from a ' +
  'spreadsheet or word-processed file, so formatting/columns may be irregular — ignore blank cells, they ' +
  'carry no information here.\n\n';

/** Context about the one Purchase Order this RA Bill is being drafted against — a vendor's
 * uploaded file/sheet is frequently a bundle covering several purchase orders, several
 * projects, or a measurement sheet interleaved with unrelated notes on the same page/workbook.
 * Naming this order and listing its known BOQ item descriptions lets the model scope extraction
 * to just this order's rows instead of pulling in everything on the page. */
function scopingInstruction(context?: { orderName: string; knownItems: string[] }): string {
  if (!context) return '';
  const items = context.knownItems.slice(0, 100);
  const itemsList = items.length > 0 ? items.map((d) => `- ${d}`).join('\n') : '(none on file)';
  return (
    `\n\nSCOPE — this file may cover more than one purchase order, project, or vendor, or mix a ` +
    `measurement sheet in with unrelated notes/other trades on the same page or workbook. Only extract ` +
    `rows that belong to THIS purchase order: "${context.orderName}". Its known item descriptions are:\n` +
    `${itemsList}\n\n` +
    `Use that list to recognize matching rows even when the wording on the document differs slightly ` +
    `(abbreviations, reordered words, a supplier's own phrasing). If a section of the document is clearly ` +
    `a different purchase order, project, or vendor's bill, skip that section entirely — do not extract ` +
    `its rows even if they look like well-formed line items.`
  );
}

const NON_ITEM_DESCRIPTION_PREFIXES = [
  'total', 'sub total', 'subtotal', 'sub amount', 'grand total', 'net amount', 'net payable', 'amount payable',
  'gst', 'vat', 'tax', 'tds', 'igst', 'cgst', 'sgst',
  'freight', 'delivery charge', 'transportation charge', 'mobilisation', 'mobilization', 'installation charge', 'installation charges',
  'discount', 'less discount', 'special discount', 'retention', 'deduction', 'advance recovery',
  'previous bill', 'previous cumulative', 'cumulative total', 'balance payment', 'terms & conditions', 'terms and conditions',
  'bank details', 'bank name', 'account no', 'ifsc', 'signature', 'authorised signatory', 'authorized signatory',
  'certified', 'measurement book no', 'mb no', 'page no',
];

function looksLikeRealLineItem(description: string): boolean {
  const key = description.trim().toLowerCase();
  if (!key) return false;
  return !NON_ITEM_DESCRIPTION_PREFIXES.some((p) => key.startsWith(p));
}

function sanitize(result: ExtractedRABillDocument | null): ExtractedRABillDocument | null {
  if (!result) return null;
  const items = result.items.filter((item) => looksLikeRealLineItem(item.description));
  if (items.length === 0) return null;
  return { ...result, items };
}

export const RABillDocumentExtractionService = {
  /** Extracts RA Bill / measurement-sheet line items from a single PDF or image, including
   * handwritten/scanned/photographed pages — one Claude call per file, so a batch caller can
   * let one unreadable file fail without losing the rest. Returns null if AI isn't configured,
   * the call fails, or nothing usable came back. */
  async extractFromFile(file: {
    kind: 'image';
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    base64: string;
  } | {
    kind: 'document';
    mediaType: 'application/pdf';
    base64: string;
  }, context?: { orderName: string; knownItems: string[] }): Promise<ExtractedRABillDocument | null> {
    const result = await generateAiJsonFromFile<ExtractedRABillDocument>({
      system: SYSTEM_PROMPT,
      prompt: FILE_PROMPT + scopingInstruction(context),
      file,
      schema: EXTRACT_SCHEMA,
      // Same headroom as BOQ file extraction — a multi-page measurement sheet can run long.
      maxTokens: 20000,
      timeoutMs: 150_000,
    });
    return sanitize(result);
  },

  /** Extracts line items from plain text already read out of a spreadsheet (.xlsx/.xls/.csv)
   * or a word-processed document (.docx, via mammoth). Used whenever the source isn't an
   * image/PDF, so it never pays for a vision call on a file that's already machine-readable
   * text. */
  async extractFromText(sourceText: string, context?: { orderName: string; knownItems: string[] }): Promise<ExtractedRABillDocument | null> {
    const result = await generateAiJson<ExtractedRABillDocument>({
      system: SYSTEM_PROMPT,
      prompt: TEXT_PROMPT_PREFIX + scopingInstruction(context) + '\n\n' + sourceText,
      schema: EXTRACT_SCHEMA,
      maxTokens: 20000,
      timeoutMs: 150_000,
    });
    return sanitize(result);
  },
};
