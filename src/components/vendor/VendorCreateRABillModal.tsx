'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { X, Wallet } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency } from '@/lib/utils';
import { cardShadow, iconBadge } from './vendorTheme';
import VendorActionButton from './VendorActionButton';

interface BOQOption {
  id: string;
  name: string | null;
  status: string;
  items: Array<{ description: string; unit: string; rate: number }>;
}

/** Vendor drafts a new RA Bill: pick a period, then enter how much of each approved item they
 * executed this period. Mirrors real running-account billing — the contractor claims the
 * quantity, PMC/Consultant measures and certifies it afterwards. */
export default function VendorCreateRABillModal({
  projectId,
  orderId,
  onClose,
}: {
  projectId: string;
  orderId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { data: boqsPayload } = useSWR<{ boqs: BOQOption[] }>(
    `/api/projects/${projectId}/orders/${orderId}/boqs`,
    jsonFetcher,
  );
  // The BOQ list API already restricts a vendor to APPROVED items only (see
  // RoleGuard.visibleBOQStatuses) — no client-side status filter needed here.
  const approvedBoqs = boqsPayload?.boqs ?? [];

  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [qtyByBoq, setQtyByBoq] = useState<Record<string, string>>({});
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const total = approvedBoqs.reduce((sum, b) => {
    const item = b.items[0];
    const qty = parseFloat(qtyByBoq[b.id] || '0') || 0;
    return sum + qty * (item?.rate ?? 0);
  }, 0);

  const handleCreate = async () => {
    const lineItems = Object.entries(qtyByBoq)
      .filter(([, qty]) => qty && parseFloat(qty) > 0)
      .map(([boqId, qty]) => ({ boqId, thisBillQty: parseFloat(qty) }));

    if (!periodStart || !periodEnd) {
      setError('Pick a start and end date');
      return;
    }
    if (lineItems.length === 0) {
      setError('Enter how much you completed for at least one item');
      return;
    }

    setCreating(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ periodStart, periodEnd, lineItems }),
      });
      const data = await res.json();
      if (data.success) {
        router.push(`/vendor/ra-bills/${data.data.raBillId}`);
      } else {
        setError(data.error ?? 'Could not create. Try again.');
      }
    } catch {
      setError('Could not create. Try again.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div className="w-full sm:max-w-lg rounded-t-[28px] sm:rounded-[28px] flex flex-col max-h-[90vh]" style={{ background: 'var(--ax-base)', ...cardShadow }}>
        <div className="flex items-center gap-3 p-5 shrink-0">
          <div className="w-11 h-11 rounded-full flex items-center justify-center shrink-0" style={iconBadge('#22c55e')}>
            <Wallet className="w-5 h-5" style={{ color: '#22c55e' }} strokeWidth={2.25} />
          </div>
          <h2 className="text-xl font-bold flex-1" style={{ color: 'var(--ax-text)' }}>New Bill</h2>
          <button onClick={onClose} aria-label="Close" className="flex items-center justify-center w-11 h-11 rounded-full shrink-0" style={{ background: 'var(--ax-card)', color: 'var(--ax-text)' }}>
            <X className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-4">
          {error && (
            <p className="text-base font-semibold rounded-2xl px-4 py-3" style={{ color: '#ef4444', background: 'rgba(239,68,68,0.1)' }}>{error}</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-bold uppercase tracking-wide block mb-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>From</label>
              <input
                type="date"
                value={periodStart}
                onChange={(e) => setPeriodStart(e.target.value)}
                className="w-full rounded-2xl p-3.5 text-base font-semibold"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-text)' }}
              />
            </div>
            <div>
              <label className="text-sm font-bold uppercase tracking-wide block mb-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>To</label>
              <input
                type="date"
                value={periodEnd}
                min={periodStart || undefined}
                onChange={(e) => setPeriodEnd(e.target.value)}
                className="w-full rounded-2xl p-3.5 text-base font-semibold"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-text)' }}
              />
            </div>
          </div>

          <div>
            <p className="text-sm font-bold uppercase tracking-wide mb-2" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>How Much You Completed</p>
            {approvedBoqs.length === 0 ? (
              <p className="text-base text-center py-6" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>No approved items on this order yet</p>
            ) : (
              <div className="space-y-2.5">
                {approvedBoqs.map((b) => {
                  const item = b.items[0];
                  const qty = parseFloat(qtyByBoq[b.id] || '0') || 0;
                  const amount = qty * (item?.rate ?? 0);
                  return (
                    <div key={b.id} className="rounded-2xl p-4 space-y-2.5" style={{ background: 'var(--ax-card)' }}>
                      <p className="font-semibold text-base" style={{ color: 'var(--ax-text)' }}>{item?.description || b.name || 'Untitled'}</p>
                      <div className="flex items-center gap-3">
                        <input
                          type="number"
                          placeholder={`Qty (${item?.unit ?? ''})`}
                          value={qtyByBoq[b.id] ?? ''}
                          onChange={(e) => setQtyByBoq({ ...qtyByBoq, [b.id]: e.target.value })}
                          className="flex-1 rounded-xl p-3 text-base font-bold text-right"
                          style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)' }}
                        />
                        <span className="font-bold text-base w-28 text-right shrink-0" style={{ color: 'var(--ax-accent)' }}>{formatCurrency(amount)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {total > 0 && (
            <div className="flex items-center justify-between px-1">
              <span className="font-bold text-lg" style={{ color: 'var(--ax-text)' }}>Total</span>
              <span className="font-bold text-2xl" style={{ color: 'var(--ax-accent)' }}>{formatCurrency(total)}</span>
            </div>
          )}

          <VendorActionButton
            label="Create"
            loadingLabel="Creating…"
            loading={creating}
            onClick={() => void handleCreate()}
            variant="primary"
          />
        </div>
      </div>
    </div>
  );
}
