'use client';

import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Package, ChevronRight } from 'lucide-react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import VendorStatusPill from '@/components/vendor/VendorStatusPill';
import { cardShadow, iconBadge } from '@/components/vendor/vendorTheme';
import { useVendorPortal } from '@/lib/contexts/VendorPortalContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';

interface VendorOrder {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  boqsCount: number;
  workOrder: { id: string; number: string; status: string; currentRevisionNumber: number } | null;
  pendingAcceptance: boolean;
}

export default function VendorOrdersPage() {
  const router = useRouter();
  const { data: allOrders = [], isLoading: ordersLoading } = useSWR<VendorOrder[]>('/api/vendor/orders', jsonFetcher);
  const { data: portal, loading: portalLoading, reload } = useVendorPortal();
  const isLoading = ordersLoading || portalLoading;

  // Scoped to whichever project is currently selected (via the switcher) — a vendor working
  // across several projects shouldn't see every order mixed together with no indication of
  // which project each belongs to.
  const orders = portal ? allOrders.filter((o) => o.projectId === portal.projectId) : [];

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <VendorNav
          title="Orders"
          projectName={portal?.projectName}
          allProjects={portal?.allProjects}
          currentProjectId={portal?.projectId}
          onProjectChange={reload}
        />

        {isLoading ? (
          <p className="text-base" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</p>
        ) : orders.length === 0 ? (
          <div className="rounded-[28px] py-16 text-center" style={{ background: 'var(--ax-card)', ...cardShadow }}>
            <Package className="w-11 h-11 mx-auto mb-3" style={{ color: 'rgba(var(--ax-text-rgb),0.25)' }} />
            <p className="text-lg font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>No orders yet</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {orders.map((o) => (
              <button
                key={o.id}
                onClick={() => router.push(`/vendor/orders/${o.id}`)}
                className="w-full flex items-center gap-4 text-left p-4 rounded-[24px] min-h-[88px] active:scale-[0.98] transition-transform"
                style={{ background: 'var(--ax-card)', ...cardShadow }}
              >
                <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={iconBadge('#3b82f6')}>
                  <Package className="w-6 h-6" style={{ color: '#3b82f6' }} strokeWidth={2.25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-lg truncate" style={{ color: 'var(--ax-text)' }}>{o.name}</p>
                  <p className="text-sm font-medium mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
                    {o.plannedEnd ? `Ends ${formatDate(o.plannedEnd)}` : `${o.boqsCount} item${o.boqsCount === 1 ? '' : 's'}`}
                  </p>
                  {o.workOrder && (
                    <div className="mt-2">
                      <VendorStatusPill kind="workOrder" status={o.workOrder.status} size="sm" />
                    </div>
                  )}
                </div>
                <ChevronRight className="w-6 h-6 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
