/**
 * claude.ts — shared Claude (Anthropic) client for AI-generated text in the app
 * (report executive summaries, work order drafting).
 *
 * Design choices, all aimed at keeping token/cost usage low since these are
 * short-form generation tasks, not open-ended reasoning:
 *  - `thinking` is intentionally omitted — on Opus 4.8 that means no extended
 *    thinking tokens are spent at all.
 *  - `output_config.effort: "low"` keeps responses terse and avoids preamble.
 *  - `maxTokens` is capped per call site to the size of the actual deliverable
 *    (a paragraph, a handful of short fields) instead of a generic large default.
 *  - Callers pass in already-aggregated/condensed data, never raw DB rows.
 *
 * AI is an enhancement, not a dependency: every helper here returns `null` on
 * missing config or any API failure instead of throwing, so report/work-order
 * generation still succeeds without an AI summary if the key is unset or the
 * API errors.
 */

import Anthropic from '@anthropic-ai/sdk';
import { logger } from '@/lib/logger';

const MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-4-8';

let client: Anthropic | null = null;
let clientInitAttempted = false;

function getClient(): Anthropic | null {
  if (clientInitAttempted) return client;
  clientInitAttempted = true;

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    // The one failure mode with no other trace — every other path (bad key, network error,
    // refusal) logs via the catch blocks below or in the callers. Without this, "AI feature
    // silently does nothing in prod" is indistinguishable from "call failed" in the logs.
    logger.warn('ANTHROPIC_API_KEY is not set — AI features (work order draft, report summary) are disabled');
    return null;
  }

  try {
    client = new Anthropic({ apiKey });
  } catch (err) {
    logger.error('Failed to initialize Anthropic client', {}, err instanceof Error ? err : undefined);
    client = null;
  }
  return client;
}

/** True when an ANTHROPIC_API_KEY is configured — callers can use this to skip
 * building AI-only UI (e.g. an "AI draft" button) when the feature isn't available. */
export function isAiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

// The SDK's default request timeout (~10 minutes) is far longer than any caller can afford to
// wait — in particular ViseronQueryEngine now calls generateAiText synchronously on the hot path
// of every chat query, so a slow/hanging Claude response must fail fast enough to still return a
// deterministic fallback answer within the serverless function's own time budget.
const REQUEST_TIMEOUT_MS = 20_000;

/** Generate a short block of plain text (e.g. a narrative summary paragraph). */
export async function generateAiText(params: {
  system: string;
  prompt: string;
  maxTokens?: number;
}): Promise<string | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: params.maxTokens ?? 400,
        system: params.system,
        output_config: { effort: 'low' },
        messages: [{ role: 'user', content: params.prompt }],
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    if (response.stop_reason === 'refusal') {
      logger.warn('Claude refused AI text generation request', { model: MODEL });
      return null;
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    return textBlock && textBlock.type === 'text' ? textBlock.text.trim() : null;
  } catch (err) {
    logger.error('Claude AI text generation failed', { model: MODEL }, err instanceof Error ? err : undefined);
    return null;
  }
}

/** Generate a JSON object matching `schema` (structured outputs — guarantees valid,
 * schema-conformant JSON so callers never need a try/catch JSON.parse fallback). */
export async function generateAiJson<T>(params: {
  system: string;
  prompt: string;
  schema: Record<string, unknown>;
  maxTokens?: number;
}): Promise<T | null> {
  const anthropic = getClient();
  if (!anthropic) return null;

  try {
    const response = await anthropic.messages.create(
      {
        model: MODEL,
        max_tokens: params.maxTokens ?? 800,
        system: params.system,
        output_config: {
          effort: 'low',
          format: { type: 'json_schema', schema: params.schema },
        },
        messages: [{ role: 'user', content: params.prompt }],
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    if (response.stop_reason === 'refusal') {
      logger.warn('Claude refused AI JSON generation request', { model: MODEL });
      return null;
    }
    if (response.stop_reason === 'max_tokens') {
      // Output was cut off mid-JSON — JSON.parse would throw on the truncated string. Surface
      // this distinctly from a real parse failure so callers know to raise maxTokens.
      logger.warn('Claude AI JSON generation hit max_tokens — output truncated', { model: MODEL, maxTokens: params.maxTokens ?? 800 });
      return null;
    }

    const textBlock = response.content.find((b) => b.type === 'text');
    if (!textBlock || textBlock.type !== 'text') return null;
    return JSON.parse(textBlock.text) as T;
  } catch (err) {
    logger.error('Claude AI JSON generation failed', { model: MODEL }, err instanceof Error ? err : undefined);
    return null;
  }
}
