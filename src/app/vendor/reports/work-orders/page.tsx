'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ChevronDown, ChevronRight, HardHat } from 'lucide-react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import VendorStatusPill from '@/components/vendor/VendorStatusPill';
import { cardShadow, iconBadge } from '@/components/vendor/vendorTheme';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';

interface WorkOrderRow {
  id: string;
  number: string;
  status: string;
  projectId: string;
  projectName: string;
  orderId: string;
  orderName: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  issueDate: string | null;
  needsAcceptance: boolean;
}

const PAGE_SIZE = 10;

/** Every Work Order issued against this vendor's Purchase Orders — ones needing acceptance
 * right now surface first, then everything already accepted (the upcoming work still to be
 * completed), sorted by planned end date so the nearest deadline shows first. */
export default function VendorWorkOrdersPage() {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { data: workOrders = [], isLoading } = useSWR<WorkOrderRow[]>('/api/vendor/work-orders', jsonFetcher);

  const needsAcceptance = workOrders.filter((w) => w.needsAcceptance);
  const inProgress = workOrders.filter((w) => !w.needsAcceptance);
  const ordered = [...needsAcceptance, ...inProgress];

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5">
        <VendorNav title="Work Orders" backHref="/vendor/reports" />

        {isLoading ? (
          <p className="text-base" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</p>
        ) : ordered.length === 0 ? (
          <div className="rounded-[28px] py-16 text-center" style={{ background: 'var(--ax-card)', ...cardShadow }}>
            <HardHat className="w-11 h-11 mx-auto mb-3" style={{ color: 'rgba(var(--ax-text-rgb),0.25)' }} />
            <p className="text-lg font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>No Work Orders yet</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {needsAcceptance.length > 0 && (
              <p className="text-sm font-bold uppercase tracking-wide px-1" style={{ color: '#f0a825' }}>Needs your acceptance</p>
            )}
            {ordered.slice(0, visibleCount).map((w, i) => (
              <div key={w.id}>
                {i === needsAcceptance.length && needsAcceptance.length > 0 && (
                  <p className="text-sm font-bold uppercase tracking-wide px-1 mb-3.5 mt-1" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>Upcoming work</p>
                )}
                <button
                  onClick={() => router.push(`/projects/${w.projectId}/orders/${w.orderId}`)}
                  className="w-full flex items-center gap-4 text-left p-4 rounded-[24px] min-h-[88px] active:scale-[0.98] transition-transform"
                  style={{ background: 'var(--ax-card)', ...cardShadow }}
                >
                  <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={iconBadge('#3b82f6')}>
                    <HardHat className="w-6 h-6" style={{ color: '#3b82f6' }} strokeWidth={2.25} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-lg truncate" style={{ color: 'var(--ax-text)' }}>{w.number}</p>
                    <p className="text-sm font-medium mt-0.5 truncate" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
                      {w.orderName} · {w.projectName}
                    </p>
                    <p className="text-sm font-medium mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
                      {w.plannedEnd ? `Due ${formatDate(w.plannedEnd)}` : 'No due date set'}
                    </p>
                    <div className="mt-2">
                      <VendorStatusPill kind="workOrder" status={w.status} size="sm" />
                    </div>
                  </div>
                  <ChevronRight className="w-6 h-6 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
                </button>
              </div>
            ))}

            {visibleCount < ordered.length && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-base min-h-[52px]"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-accent)', ...cardShadow }}
              >
                Load More ({ordered.length - visibleCount} more) <ChevronDown className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
