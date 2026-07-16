'use client';

import { useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Wallet } from 'lucide-react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import VendorWorkOrderCard from '@/components/vendor/VendorWorkOrderCard';
import VendorCreateRABillModal from '@/components/vendor/VendorCreateRABillModal';
import { cardShadow } from '@/components/vendor/vendorTheme';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency } from '@/lib/utils';

interface VendorOrder {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
}

interface BOQRow {
  id: string;
  boqNumber: string | null;
  name: string | null;
  status: string;
  rollup: { totalValue: number; summary: string };
}

const PAGE_SIZE = 10;

export default function VendorOrderDetailPage() {
  const params = useParams();
  const orderId = params.orderId as string;

  const { data: orders } = useSWR<VendorOrder[]>('/api/vendor/orders', jsonFetcher);
  const order = orders?.find((o) => o.id === orderId) ?? null;
  const projectId = order?.projectId ?? '';

  const [offset, setOffset] = useState(0);
  const boqsUrl = useMemo(
    () =>
      projectId
        ? `/api/projects/${projectId}/orders/${orderId}/boqs?` +
          new URLSearchParams({ limit: PAGE_SIZE.toString(), offset: offset.toString() })
        : null,
    [projectId, orderId, offset],
  );
  const { data: boqsPayload, isLoading: boqsLoading } = useSWR<{ boqs: BOQRow[]; total: number }>(
    boqsUrl,
    jsonFetcher,
  );
  const boqs = boqsPayload?.boqs ?? [];
  const boqsTotal = boqsPayload?.total ?? 0;
  const boqsPage = Math.floor(offset / PAGE_SIZE) + 1;
  const boqsTotalPages = Math.max(1, Math.ceil(boqsTotal / PAGE_SIZE));

  const [showCreateBill, setShowCreateBill] = useState(false);

  if (!orders) {
    return (
      <Layout>
        <p className="text-base" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</p>
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <div className="max-w-lg mx-auto">
          <VendorNav title="Not Found" backHref="/vendor/orders" />
          <p className="text-base text-center py-10" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>This order isn&apos;t assigned to you</p>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5">
        <VendorNav title={order.name} backHref="/vendor/orders" projectName={order.projectName} />

        <div className="rounded-[28px] p-6" style={{ background: 'var(--ax-card)', ...cardShadow }}>
          <h2 className="text-xl font-bold mb-4" style={{ color: 'var(--ax-text)' }}>Items ({boqsTotal})</h2>
          {boqsLoading ? (
            <p className="text-base" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</p>
          ) : boqs.length === 0 ? (
            <p className="text-base text-center py-6" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>No items yet</p>
          ) : (
            <div className="space-y-2.5">
              {boqs.map((b) => (
                <div key={b.id} className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3.5" style={{ background: 'var(--ax-overlay)' }}>
                  <span className="font-semibold text-base" style={{ color: 'var(--ax-text)' }}>{b.name || 'Untitled'}</span>
                  <span className="font-bold text-lg shrink-0" style={{ color: 'var(--ax-text)' }}>{formatCurrency(b.rollup.totalValue)}</span>
                </div>
              ))}
            </div>
          )}

          {boqsTotal > PAGE_SIZE && (
            <div className="flex items-center justify-center gap-3 pt-5 mt-4 border-t" style={{ borderColor: 'var(--ax-border-subtle)' }}>
              <button
                disabled={boqsPage === 1}
                onClick={() => setOffset(offset - PAGE_SIZE)}
                className="px-4 py-2.5 rounded-xl font-bold text-base disabled:opacity-30"
                style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)' }}
              >
                ← Prev
              </button>
              <span className="text-base font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>{boqsPage} / {boqsTotalPages}</span>
              <button
                disabled={boqsPage === boqsTotalPages}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="px-4 py-2.5 rounded-xl font-bold text-base disabled:opacity-30"
                style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)' }}
              >
                Next →
              </button>
            </div>
          )}
        </div>

        <VendorWorkOrderCard projectId={projectId} orderId={orderId} />

        {boqsTotal > 0 && (
          <button
            onClick={() => setShowCreateBill(true)}
            className="w-full flex items-center justify-center gap-2.5 rounded-2xl py-4 min-h-[60px] font-bold text-lg"
            style={{ background: 'var(--ax-card)', color: 'var(--ax-accent)', ...cardShadow }}
          >
            <Wallet className="w-6 h-6" strokeWidth={2.25} /> New Bill
          </button>
        )}
      </div>

      {showCreateBill && (
        <VendorCreateRABillModal projectId={projectId} orderId={orderId} onClose={() => setShowCreateBill(false)} />
      )}
    </Layout>
  );
}
