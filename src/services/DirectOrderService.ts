import { prisma } from '@/lib/db';

export const DIRECT_ORDER_DELIVERED_STATUSES = ['DELIVERED', 'QTY_VARIANCE', 'PAID'];

// Statuses a Vendor may set themselves — their own fulfillment progress only. PAID stays
// PMC-only (it's a payment confirmation, not something the vendor can attest to), and reverting
// to ORDERED isn't offered to either side once work has started.
export const VENDOR_SETTABLE_STATUSES = ['IN_PROGRESS', 'IN_DELIVERY', 'DELIVERED', 'QTY_VARIANCE'];

export interface DirectOrderSummary {
  totalOrdered: number;
  totalDeliveredValue: number;
  paid: number;
  outstanding: number;
  /** Sum of (value - billedValue) across every order with a generated bill — positive means
   * billed less than originally ordered, negative means billed more. 0 for un-billed orders. */
  totalVariance: number;
}

export class DirectOrderService {
  /** Sequential per-project label ("DO-001", "DO-002", ...). Not race-proof under concurrent
   * creates — same tradeoff BOQService's ORD-### numbering already accepts at this app's scale. */
  static async generateDoNumber(projectId: string): Promise<string> {
    const count = await prisma.directOrder.count({ where: { projectId } });
    return `DO-${String(count + 1).padStart(3, '0')}`;
  }

  /** Ordered / delivered / paid / outstanding / variance totals for the project's Direct
   * Orders — used by both the Direct Orders page (top stat cards) and AnalysisService's
   * variance totals, so the two never disagree. Once a bill is generated, `billedValue` (the
   * actual amount) is used in place of `value` (the original estimate) for delivered/paid/
   * variance math — `value` itself always stays the original ordered figure. Pass vendorUserId
   * to scope a Vendor's own cards to just their orders. */
  static async getSummary(projectId: string, vendorUserId?: string): Promise<DirectOrderSummary> {
    const orders = await prisma.directOrder.findMany({
      where: { projectId, ...(vendorUserId ? { vendorUserId } : {}) },
      select: { value: true, billedValue: true, status: true },
    });

    const totalOrdered = orders.reduce((sum, o) => sum + o.value, 0);
    const totalDeliveredValue = orders
      .filter((o) => DIRECT_ORDER_DELIVERED_STATUSES.includes(o.status))
      .reduce((sum, o) => sum + (o.billedValue ?? o.value), 0);
    const paid = orders
      .filter((o) => o.status === 'PAID')
      .reduce((sum, o) => sum + (o.billedValue ?? o.value), 0);
    const outstanding = totalDeliveredValue - paid;
    const totalVariance = orders
      .filter((o) => o.billedValue != null)
      .reduce((sum, o) => sum + (o.value - o.billedValue!), 0);

    return { totalOrdered, totalDeliveredValue, paid, outstanding, totalVariance };
  }
}
