import { generateAiJson, generateAiJsonFromFile } from '@/lib/ai/claude';

const NONE = 'NONE';

export interface ExtractedRABillItem {
  /** The item description as literally read off the document — shown to the vendor for
   * review, never used for matching itself. */
  description: string;
  /** One of the order's known BOQ item descriptions, copied verbatim, or null if this row
   * doesn't clearly correspond to exactly one of them. Matching happens inside the model call
   * (constrained to a real enum of this order's actual item names) rather than via client-side
   * string similarity — construction/paint item names vary too much in word order and
   * punctuation ("P.U Colour Matt" vs "PU Matt Colour", "Jotun (Tex-Ultra)" vs "Tex-Ultra
   * (Jotun)") for a substring/token matcher to be reliable, and the model can use real
   * vocabulary knowledge (e.g. spelling drift like "Satten" for "Satin") that a string matcher
   * can't. */
  matchedItem: string | null;
  unit: string;
  quantity: number;
  rate: number;
}

export interface ExtractedRABillDocument {
  items: ExtractedRABillItem[];
}

interface RawExtractedItem {
  description: string;
  matchedItem: string;
  unit: string;
  quantity: number;
  rate: number;
}
interface RawExtractedDocument {
  items: RawExtractedItem[];
}

/** Builds a schema whose matchedItem enum is exactly this order's known BOQ item descriptions
 * plus NONE — the model is structurally unable to return anything else, so a returned
 * matchedItem is always either NONE or a string we can look up by exact equality. */
function buildSchema(knownItems: string[]) {
  return {
    type: 'object',
    properties: {
      items: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            description: { type: 'string' },
            matchedItem: { type: 'string', enum: [...knownItems, NONE] },
            unit: { type: 'string' },
            quantity: { type: 'number' },
            rate: { type: 'number' },
          },
          required: ['description', 'matchedItem', 'unit', 'quantity', 'rate'],
          additionalProperties: false,
        },
      },
    },
    required: ['items'],
    additionalProperties: false,
  } as const;
}

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
  'never invent a fake quantity/rate to turn a note into its own line item.\n\n' +

  'MATCHING — for every real line item, also set matchedItem to whichever entry in KNOWN ITEMS (given ' +
  'below) is unmistakably the same item as this row, copied EXACTLY as it appears in that list ' +
  '(character-for-character — do not paraphrase, reorder, or fix its punctuation). The document\'s own ' +
  'wording will often differ from KNOWN ITEMS — different word order ("Tex-Ultra (Jotun)" vs "Jotun ' +
  '(Tex-Ultra)"), punctuation ("PU Matt Colour" vs "P.U Colour Matt"), or minor spelling drift ("Satten ' +
  'Paint" vs "Satin Paint") — treat those as the same item, not a non-match. Set matchedItem to the ' +
  'literal string "NONE" instead when: nothing in KNOWN ITEMS is clearly the same item, OR the row\'s ' +
  'own wording is too generic/short to tell which of several similar KNOWN ITEMS entries it means (e.g. ' +
  'a bare "PU Polish" row when KNOWN ITEMS lists several different PU Polish variants) — guessing one of ' +
  'several plausible candidates is worse than admitting no confident match, since this drives what the ' +
  'contractor gets billed for.';

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
 * to just this order's rows, and is also the exact list matchedItem is constrained to (see
 * buildSchema) — this text explains the *scoping* rule; matching itself is explained in
 * SYSTEM_PROMPT. */
function scopingInstruction(context: RABillExtractionContext): string {
  const items = context.knownItems;
  const itemsList = items.length > 0 ? items.map((d) => `- ${d}`).join('\n') : '(none on file)';
  return (
    `\n\nSCOPE — this file may cover more than one purchase order, project, or vendor, or mix a ` +
    `measurement sheet in with unrelated notes/other trades on the same page or workbook. Only extract ` +
    `rows that belong to THIS purchase order: "${context.orderName}". Its KNOWN ITEMS are:\n` +
    `${itemsList}\n\n` +
    `If a section of the document is clearly a different purchase order, project, or vendor's bill, skip ` +
    `that section entirely — do not extract its rows even if they look like well-formed line items.`
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

/** Converts the raw model output (matchedItem always a real string, "NONE" included) into the
 * public shape (matchedItem: string | null), and drops rows that don't look like a real item. */
function sanitize(result: RawExtractedDocument | null): ExtractedRABillDocument | null {
  if (!result) return null;
  const items: ExtractedRABillItem[] = result.items
    .filter((item) => looksLikeRealLineItem(item.description))
    .map((item) => ({ ...item, matchedItem: item.matchedItem === NONE ? null : item.matchedItem }));
  if (items.length === 0) return null;
  return { items };
}

export interface RABillExtractionContext {
  orderName: string;
  /** This order's known BOQ item descriptions — matchedItem is hard-constrained to exactly
   * this list (plus NONE) via the schema's enum, so this must be the real, current list. */
  knownItems: string[];
}

// Bounds both the enum size and the prompt's item list to the same set — an order with an
// unusually large number of BOQ items shouldn't blow up the schema, and the two must stay in
// sync (the model reads the list in the prompt but is mechanically constrained by the enum).
const MAX_KNOWN_ITEMS = 150;

/** Dedupes and caps knownItems once, so buildSchema's enum and scopingInstruction's prompt text
 * are always built from the exact same bounded list. */
function boundContext(context: RABillExtractionContext): RABillExtractionContext {
  return { orderName: context.orderName, knownItems: [...new Set(context.knownItems)].slice(0, MAX_KNOWN_ITEMS) };
}

export const RABillDocumentExtractionService = {
  /** Extracts RA Bill / measurement-sheet line items from a single PDF or image, including
   * handwritten/scanned/photographed pages, AND matches each row to one of this order's known
   * BOQ items in the same call — one Claude call per file, so a batch caller can let one
   * unreadable file fail without losing the rest. Returns null if AI isn't configured, the call
   * fails, or nothing usable came back. */
  async extractFromFile(file: {
    kind: 'image';
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    base64: string;
  } | {
    kind: 'document';
    mediaType: 'application/pdf';
    base64: string;
  }, rawContext: RABillExtractionContext): Promise<ExtractedRABillDocument | null> {
    const context = boundContext(rawContext);
    const result = await generateAiJsonFromFile<RawExtractedDocument>({
      system: SYSTEM_PROMPT,
      prompt: FILE_PROMPT + scopingInstruction(context),
      file,
      schema: buildSchema(context.knownItems),
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
  async extractFromText(sourceText: string, rawContext: RABillExtractionContext): Promise<ExtractedRABillDocument | null> {
    const context = boundContext(rawContext);
    const result = await generateAiJson<RawExtractedDocument>({
      system: SYSTEM_PROMPT,
      prompt: TEXT_PROMPT_PREFIX + scopingInstruction(context) + '\n\n' + sourceText,
      schema: buildSchema(context.knownItems),
      maxTokens: 20000,
      timeoutMs: 150_000,
    });
    return sanitize(result);
  },
};
