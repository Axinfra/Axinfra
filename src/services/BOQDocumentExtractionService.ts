import { generateAiJson, generateAiJsonFromFile } from '@/lib/ai/claude';

export interface ExtractedBOQItem {
  description: string;
  unit: string;
  quantity: number;
  rate: number;
}

export interface ExtractedBOQDocument {
  orderName: string;
  items: ExtractedBOQItem[];
}

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    orderName: { type: 'string' },
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
  required: ['orderName', 'items'],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  'You extract Bill of Quantities (BOQ) / Purchase Order line items from a vendor quotation, estimate, ' +
  'or BOQ document — a photo, scan, or PDF (typed, printed, or handwritten), or a spreadsheet whose ' +
  'columns do not match any fixed template — and may be for construction work OR for supplied goods/ ' +
  'fixtures/furniture (the same line-item shape applies either way: a description, a unit, a quantity, ' +
  'and a rate).\n\n' +

  'ORDER NAME — read this from context near the top of the document, in this priority: an explicit ' +
  '"Project" line, then "Subject"/"Sub."/estimate title, then "Client Ref." or the client/site name next ' +
  'to "Bill To"/"Kind Att", then a quotation reference number. Prefer a project/site descriptor ("MR. ' +
  'AMIT RESIDENCE — Second Floor", "Main Gate & Boundary Wall") over the vendor\'s own company name — ' +
  'the vendor issuing the quotation is never the order name. orderName must NEVER be empty: if truly ' +
  'nothing on the document identifies a project or client, invent a short, clear title yourself from ' +
  'what\'s actually being purchased — e.g. "LED Light Fixtures Order", "Sofa, Bed & Bench Furniture ' +
  'Order", "Main Gate & Boundary Wall Fabrication". A generated title should name the category of goods/ ' +
  'work, not restate "Purchase Order" or "Quotation" on their own.\n\n' +

  'WHICH ROWS ARE LINE ITEMS — a row is a line item only if it has all three: a description of an ' +
  'actual product/work item, a quantity, AND a rate (or a total you can divide by quantity to get a ' +
  'rate). Column headers vary a lot between vendors and are NOT reliable field names on their own — a ' +
  'quantity column might be labeled "Qty", "SF", "Area", "Approx Area", "Nos", or nothing at all; a rate ' +
  'column might be "Rate", "Unit Price", "Unit Price INR", or "Price". Match by position and by which ' +
  'column holds a plain number next to the unit, not by trusting the header text alone.\n\n' +

  'RATE — use the EFFECTIVE per-unit rate the customer actually pays, not a pre-discount list price. If ' +
  'a row shows both a list/unit price and a separate "after discount" amount or net rate, use whichever ' +
  'one, multiplied by quantity, actually equals that row\'s stated total — that is the real rate. If only ' +
  'a total/amount is given with no explicit per-unit rate, compute rate = amount ÷ quantity.\n\n' +

  'NEVER extract a line item for: subtotals, grand totals, "Total"/"Total Amount"/"Total Payable" rows; ' +
  'tax rows (GST, VAT, service tax); freight/delivery/transportation/packing/installation charges shown ' +
  'as a separate summary line; discount rows; advance/balance payment terms; bank account details; ' +
  'terms & conditions; signature blocks; or company letterhead/contact info. These describe the ' +
  'quotation as a whole, not a purchased item.\n\n' +

  'Some documents also have descriptive spec rows with NO quantity or rate of their own — e.g. a ' +
  'bulleted list of material/finish/size details grouped under one priced item above them (like ' +
  '"Outer Frame: 100x50mm Tubular section", "Hinges on ball bearings" under a "Main Gate" row that DOES ' +
  'have a qty/rate). Fold that supporting detail into the nearest priced item\'s description if it\'s ' +
  'clearly part of the same item, or omit it — never invent a fake quantity/rate to turn a spec bullet ' +
  'into its own line item.\n\n' +

  'When reading handwriting, use context — typical construction/product item names and unit conventions ' +
  '— to resolve ambiguous characters, but never invent an item that is not actually on the document. If ' +
  'a specific quantity or rate is genuinely illegible on an otherwise real line item, omit that one item ' +
  'entirely rather than guessing a number.';

const FILE_PROMPT =
  'Extract every real line item (not totals, tax, discount, freight, or spec-only rows) from the ' +
  'attached document into the given schema.';

const TEXT_PROMPT_PREFIX =
  'Extract every real line item (not totals, tax, discount, freight, or spec-only rows) from the ' +
  'spreadsheet data below into the given schema. It was read cell-by-cell from a spreadsheet, so a ' +
  'column may be entirely blank (e.g. an embedded product image column has no text value) — ignore ' +
  'blank columns, they carry no information here.\n\n';

// Defense-in-depth: even with the prompt above, a model can still slip a summary row through
// (e.g. it reads "Total" as if it were a product description). Anything whose description starts
// with one of these is almost never a real purchasable line item, so it's dropped unconditionally
// rather than trusted to the schema/prompt alone.
const NON_ITEM_DESCRIPTION_PREFIXES = [
  'total', 'sub total', 'subtotal', 'grand total', 'net amount', 'net payable', 'amount payable',
  'gst', 'vat', 'tax', 'igst', 'cgst', 'sgst',
  'freight', 'delivery charge', 'transportation charge', 'packing charge', 'installation charge',
  'discount', 'less discount', 'special discount',
  'advance', 'balance payment', 'terms & conditions', 'terms and conditions',
  'bank details', 'bank name', 'account no', 'ifsc', 'signature', 'authorised signatory', 'authorized signatory',
];

function looksLikeRealLineItem(description: string): boolean {
  const key = description.trim().toLowerCase();
  if (!key) return false;
  return !NON_ITEM_DESCRIPTION_PREFIXES.some((p) => key.startsWith(p));
}

function sanitize(result: ExtractedBOQDocument | null): ExtractedBOQDocument | null {
  if (!result) return null;
  const items = result.items.filter((item) => looksLikeRealLineItem(item.description));
  if (items.length === 0) return null;
  return { ...result, items };
}

export const BOQDocumentExtractionService = {
  /** Extracts BOQ line items from a single PDF or image (including handwritten/scanned) — one
   * Claude call per file, so callers processing a batch can let one unreadable file fail without
   * losing the rest. Returns null if AI isn't configured, the call fails, or nothing usable came
   * back (empty items list). */
  async extractFromFile(file: {
    kind: 'image';
    mediaType: 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp';
    base64: string;
  } | {
    kind: 'document';
    mediaType: 'application/pdf';
    base64: string;
  }): Promise<ExtractedBOQDocument | null> {
    const result = await generateAiJsonFromFile<ExtractedBOQDocument>({
      system: SYSTEM_PROMPT,
      prompt: FILE_PROMPT,
      file,
      schema: EXTRACT_SCHEMA,
      // A dense BOQ page can run to 60-80 line items — 4000 tokens gives comfortable headroom
      // without paying for a much larger default on every call.
      maxTokens: 4000,
    });
    return sanitize(result);
  },

  /** Extracts BOQ line items from a spreadsheet whose columns don't match the standard
   * Purchase-Order/Description/Unit/Quantity/Rate template (e.g. a vendor's own SKU-code sheet
   * with different column names, no explicit order name, or no unit column at all) — the sheet's
   * cells are read into a compact text table client-side/server-side, then the same
   * column-name-agnostic extraction logic used for PDFs/photos figures out the shape. Used as a
   * fallback only after the fast, free positional parser fails to find anything, so well-formed
   * template sheets never pay for an AI call. */
  async extractFromText(sheetText: string): Promise<ExtractedBOQDocument | null> {
    const result = await generateAiJson<ExtractedBOQDocument>({
      system: SYSTEM_PROMPT,
      prompt: TEXT_PROMPT_PREFIX + sheetText,
      schema: EXTRACT_SCHEMA,
      maxTokens: 4000,
    });
    return sanitize(result);
  },
};
