import { generateAiJson } from '@/lib/ai/claude';
import type { WorkOrderPdfDetails } from '@/lib/pdf/types';

/** The subset of WorkOrderPdfDetails that's reasonable to auto-draft — signatories and tax
 * are identity/financial fields, not narrative content, so they stay user-entered. */
export type AIWorkOrderDraft = Pick<
  WorkOrderPdfDetails,
  'workDescription' | 'scopeOfWork' | 'completionTimeline' | 'paymentTerms' | 'deliveryTerms' | 'generalNotes' | 'specialInstructions' | 'termsAndConditions'
>;

const DRAFT_SCHEMA = {
  type: 'object',
  properties: {
    workDescription: { type: 'string' },
    scopeOfWork: { type: 'string' },
    completionTimeline: { type: 'string' },
    paymentTerms: { type: 'string' },
    deliveryTerms: { type: 'string' },
    generalNotes: { type: 'string' },
    specialInstructions: { type: 'string' },
    termsAndConditions: {
      type: 'object',
      properties: {
        payment: { type: 'string' },
        quality: { type: 'string' },
        safety: { type: 'string' },
        delayPenalty: { type: 'string' },
        warranty: { type: 'string' },
        other: { type: 'string' },
      },
      required: ['payment', 'quality', 'safety', 'delayPenalty', 'warranty', 'other'],
      additionalProperties: false,
    },
  },
  required: [
    'workDescription', 'scopeOfWork', 'completionTimeline', 'paymentTerms', 'deliveryTerms',
    'generalNotes', 'specialInstructions', 'termsAndConditions',
  ],
  additionalProperties: false,
} as const;

const SYSTEM_PROMPT =
  'You draft the narrative and terms-and-conditions fields of a construction Work Order for a ' +
  'PMC to review and edit before issuing. Use plain, contractual language appropriate for India-based ' +
  'construction contracts. Base the draft only on the scope/BOQ information given — do not invent ' +
  'quantities, dates, or amounts not present in the input. Every field must be filled with a short, ' +
  'usable draft (1-3 sentences each, except completionTimeline which is one short phrase).';

export const AIWorkOrderDraftService = {
  /** Drafts the narrative Work Order fields from project/vendor/BOQ context plus an optional
   * short user-supplied hint. Returns null if AI isn't configured or the call fails — the modal
   * falls back to the normal blank/manual-entry flow. */
  async draftWorkOrderDetails(input: {
    projectName: string;
    orderName: string;
    vendorName: string | null;
    boqItems: Array<{ description: string; unit: string; quantity: number }>;
    briefDescription?: string;
  }): Promise<AIWorkOrderDraft | null> {
    const context = {
      project: input.projectName,
      purchaseOrder: input.orderName,
      vendor: input.vendorName ?? 'Not yet assigned',
      // Cap BOQ items sent to the model — a compact sample is enough context, and keeps the
      // request small even for purchase orders with hundreds of line items.
      boqItems: input.boqItems.slice(0, 25).map((i) => ({ description: i.description, unit: i.unit, quantity: i.quantity })),
      userHint: input.briefDescription?.trim() || undefined,
    };

    return generateAiJson<AIWorkOrderDraft>({
      system: SYSTEM_PROMPT,
      prompt: JSON.stringify(context),
      schema: DRAFT_SCHEMA,
      // 7 narrative fields incl. a 6-field terms-and-conditions object — 700 truncated the JSON
      // mid-string in testing (SyntaxError on parse). 1400 leaves comfortable headroom.
      maxTokens: 1400,
    });
  },
};
