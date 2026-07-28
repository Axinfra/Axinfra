export const qtyFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const amountFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** The standard 14 PDF fonts (Helvetica) only cover WinAnsiEncoding — currency glyphs like
 * ₹ (U+20B9) fall outside that and render as a garbled character. Prefixing the ISO code
 * ("INR ", "AED ", ...) avoids symbols entirely instead of embedding a custom Unicode font.
 * `currency` should be the project's own `metadata.currency` — defaults to INR to match
 * pre-existing PDFs for projects that predate per-project currency. */
export function formatCurrencyForPdf(amount: number, currency: string = 'INR'): string {
  return `${currency} ${amountFormatter.format(Math.round(amount))}`;
}

/** Comma-joined display name for every (non-pending-invite) user holding `role` on a project —
 * shared by the Work Order and RA Bill PDFs for Client/Consultant/PMC name lookups. */
export function namesByRole(roles: Array<{ role: string; user: { name: string } }>, role: string): string {
  const names = roles.filter((r) => r.role === role).map((r) => r.user.name);
  return names.length > 0 ? names.join(', ') : '—';
}
