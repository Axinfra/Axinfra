'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Wallet, ChevronRight, ChevronDown, Plus, X, Package } from 'lucide-react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import VendorStatusPill from '@/components/vendor/VendorStatusPill';
import VendorCreateRABillModal from '@/components/vendor/VendorCreateRABillModal';
import { cardShadow, iconBadge } from '@/components/vendor/vendorTheme';
import { useVendorPortal } from '@/lib/contexts/VendorPortalContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency, formatDate } from '@/lib/utils';

interface VendorRABill {
  id: string;
  billNumber: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  projectId: string;
  orderName: string;
  draftValue: number;
  submittedValue: number | null;
  releasedValue: number | null;
}

interface VendorOrder {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
}

/** Vendor's RA Bills — by default, only bills needing the vendor's action (DRAFT / needs
 * resend); a big 2-way switch reveals the full history. "+ New Bill" picks which Purchase
 * Order to bill against (a vendor can have several), then opens the same create form used on
 * the order detail page. */
const PAGE_SIZE = 8;

export default function VendorRABillsPage() {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [showOrderPicker, setShowOrderPicker] = useState(false);
  const [createFor, setCreateFor] = useState<VendorOrder | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  const { data: allRaBills = [], isLoading: billsLoading } = useSWR<VendorRABill[]>(
    `/api/vendor/ra-bills${showAll ? '?all=true' : ''}`,
    jsonFetcher,
  );
  const { data: allOrders = [] } = useSWR<VendorOrder[]>('/api/vendor/orders', jsonFetcher);
  const { data: portal, loading: portalLoading, reload } = useVendorPortal();
  const isLoading = billsLoading || portalLoading;

  // Scoped to whichever project is currently selected (via the switcher) — a vendor working
  // across several projects shouldn't see every bill/order mixed together.
  const raBills = portal ? allRaBills.filter((b) => b.projectId === portal.projectId) : [];
  const orders = portal ? allOrders.filter((o) => o.projectId === portal.projectId) : [];

  const handleNewBill = () => {
    if (orders.length === 1) {
      setCreateFor(orders[0]);
    } else {
      setShowOrderPicker(true);
    }
  };

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5">
        <div className="flex items-center justify-between gap-3">
          <VendorNav
            title="Bills"
            projectName={portal?.projectName}
            allProjects={portal?.allProjects}
            currentProjectId={portal?.projectId}
            onProjectChange={reload}
          />
        </div>

        {orders.length > 0 && (
          <button
            onClick={handleNewBill}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 min-h-[60px] font-bold text-lg"
            style={{ background: 'var(--ax-card)', color: 'var(--ax-accent)', ...cardShadow }}
          >
            <Plus className="w-6 h-6" strokeWidth={2.5} /> New Bill
          </button>
        )}

        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl" style={{ background: 'var(--ax-card)', ...cardShadow }}>
          <button
            onClick={() => { setShowAll(false); setVisibleCount(PAGE_SIZE); }}
            className="py-3.5 rounded-xl font-bold text-base transition-colors"
            style={!showAll ? { background: 'var(--ax-accent)', color: '#08150c' } : { color: 'rgba(var(--ax-text-rgb),0.55)' }}
          >
            Pending
          </button>
          <button
            onClick={() => { setShowAll(true); setVisibleCount(PAGE_SIZE); }}
            className="py-3.5 rounded-xl font-bold text-base transition-colors"
            style={showAll ? { background: 'var(--ax-accent)', color: '#08150c' } : { color: 'rgba(var(--ax-text-rgb),0.55)' }}
          >
            All
          </button>
        </div>

        {isLoading ? (
          <p className="text-base" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</p>
        ) : raBills.length === 0 ? (
          <div className="rounded-[28px] py-16 text-center" style={{ background: 'var(--ax-card)', ...cardShadow }}>
            <Wallet className="w-11 h-11 mx-auto mb-3" style={{ color: 'rgba(var(--ax-text-rgb),0.25)' }} />
            <p className="text-lg font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>
              {showAll ? 'No bills yet' : 'Nothing pending'}
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {raBills.slice(0, visibleCount).map((b) => (
              <button
                key={b.id}
                onClick={() => router.push(`/vendor/ra-bills/${b.id}`)}
                className="w-full flex items-center gap-4 text-left p-4 rounded-[24px] min-h-[88px] active:scale-[0.98] transition-transform"
                style={{ background: 'var(--ax-card)', ...cardShadow }}
              >
                <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={iconBadge('#22c55e')}>
                  <Wallet className="w-6 h-6" style={{ color: '#22c55e' }} strokeWidth={2.25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-lg truncate" style={{ color: 'var(--ax-text)' }}>
                    RA-{b.billNumber} · {formatCurrency(b.submittedValue ?? b.draftValue)}
                  </p>
                  <p className="text-sm font-medium mt-0.5 truncate" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
                    {b.orderName} · {formatDate(b.periodStart)}–{formatDate(b.periodEnd)}
                  </p>
                  <div className="mt-2">
                    <VendorStatusPill kind="raBill" status={b.status} size="sm" />
                  </div>
                </div>
                <ChevronRight className="w-6 h-6 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
              </button>
            ))}
            {visibleCount < raBills.length && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-base min-h-[52px]"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-accent)', ...cardShadow }}
              >
                Load More ({raBills.length - visibleCount} more) <ChevronDown className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}
      </div>

      {showOrderPicker && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4" onClick={() => setShowOrderPicker(false)}>
          <div
            className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] flex flex-col max-h-[85vh]"
            style={{ background: 'var(--ax-base)', ...cardShadow }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-5 shrink-0">
              <h2 className="text-xl font-bold flex-1" style={{ color: 'var(--ax-text)' }}>Which Order?</h2>
              <button
                onClick={() => setShowOrderPicker(false)}
                aria-label="Close"
                className="flex items-center justify-center w-11 h-11 rounded-full shrink-0"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-text)' }}
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-3">
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setShowOrderPicker(false); setCreateFor(o); }}
                  className="w-full flex items-center gap-4 text-left p-4 rounded-[24px] min-h-[76px] active:scale-[0.98] transition-transform"
                  style={{ background: 'var(--ax-card)' }}
                >
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={iconBadge('#3b82f6')}>
                    <Package className="w-5 h-5" style={{ color: '#3b82f6' }} strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-lg truncate" style={{ color: 'var(--ax-text)' }}>{o.name}</p>
                    <p className="text-sm font-medium truncate" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>{o.projectName}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {createFor && (
        <VendorCreateRABillModal projectId={createFor.projectId} orderId={createFor.id} onClose={() => setCreateFor(null)} />
      )}
    </Layout>
  );
}
