/**
 * ra-bill-ai-mode.ts — allowlist for the "AI mode" RA Bill upload feature (vendor uploads a
 * photo/scan/PDF of a measurement sheet or bill and Claude extracts + matches line items,
 * see VendorCreateRABillModal and the ai-extract route it calls).
 *
 * Rolled out to a single project by explicit request rather than globally — kept as a small,
 * named allowlist (not a single hardcoded check inline) so extending it later, or removing the
 * gate once it's proven out, is a one-line change in one place. Safe to import from client
 * components: this file holds only a project id, nothing sensitive.
 */
const RA_BILL_AI_MODE_PROJECT_IDS = new Set<string>([
  'b917645a-db74-4661-891b-6a77c2707309', // Residence at Rajpur Road, Civil Lines
]);

export function isRaBillAiModeEnabled(projectId: string): boolean {
  return RA_BILL_AI_MODE_PROJECT_IDS.has(projectId);
}
