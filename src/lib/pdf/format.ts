export const qtyFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const inrFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

/** The standard 14 PDF fonts (Helvetica) only cover WinAnsiEncoding — the ₹ glyph (U+20B9)
 * falls outside that and renders as a garbled character. "INR " avoids the symbol entirely
 * instead of embedding a custom Unicode font just for one character. */
export function formatCurrencyForPdf(amount: number): string {
  return `INR ${inrFormatter.format(Math.round(amount))}`;
}

/** Comma-joined display name for every (non-pending-invite) user holding `role` on a project —
 * shared by the Work Order and RA Bill PDFs for Client/Consultant/PMC name lookups. */
export function namesByRole(roles: Array<{ role: string; user: { name: string } }>, role: string): string {
  const names = roles.filter((r) => r.role === role).map((r) => r.user.name);
  return names.length > 0 ? names.join(', ') : '—';
}
