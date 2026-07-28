'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ChevronDown, ChevronRight, GitCompare } from 'lucide-react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import { cardShadow, iconBadge } from '@/components/vendor/vendorTheme';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency } from '@/lib/utils';

interface Variance {
  id: string;
  billNumber: number;
  status: string;
  projectId: string;
  projectName: string;
  orderId: string;
  orderName: string;
  submittedValue: number;
  siteEngineerReviewedValue: number;
  delta: number;
  deltaPct: number;
  siteEngineerRemarks: string | null;
  siteEngineerReviewedByName: string | null;
  siteEngineerReviewedAt: string;
}

const PAGE_SIZE = 10;

/** Every RA Bill where the Site Engineer edited the vendor's claimed quantity before
 * forwarding to PMC — the vendor's own claim (submittedValue) next to what actually went
 * forward (siteEngineerReviewedValue), with the difference called out in red/green so it
 * reads at a glance without opening each bill. */
export default function VendorVariancePage() {
  const router = useRouter();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const { data: variances = [], isLoading } = useSWR<Variance[]>('/api/vendor/variances', jsonFetcher);

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5">
        <VendorNav title="Bill Variances" backHref="/vendor/reports" />

        {isLoading ? (
          <p className="text-base" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</p>
        ) : variances.length === 0 ? (
          <div className="rounded-[28px] py-16 text-center" style={{ background: 'var(--ax-card)', ...cardShadow }}>
            <GitCompare className="w-11 h-11 mx-auto mb-3" style={{ color: 'rgba(var(--ax-text-rgb),0.25)' }} />
            <p className="text-lg font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>No variances</p>
            <p className="text-sm mt-1 px-6" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>
              Every bill the Site Engineer has reviewed matched what you claimed
            </p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {variances.slice(0, visibleCount).map((v) => {
              const isCut = v.delta < 0;
              const deltaColor = isCut ? '#ef4444' : '#22c55e';
              return (
                <button
                  key={v.id}
                  onClick={() => router.push(`/projects/${v.projectId}/orders/${v.orderId}/ra-bills/${v.id}`)}
                  className="w-full text-left p-4 rounded-[24px] active:scale-[0.98] transition-transform"
                  style={{ background: 'var(--ax-card)', ...cardShadow }}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={iconBadge(deltaColor)}>
                      <GitCompare className="w-6 h-6" style={{ color: deltaColor }} strokeWidth={2.25} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-lg truncate" style={{ color: 'var(--ax-text)' }}>RA-{v.billNumber}</p>
                      <p className="text-sm font-medium mt-0.5 truncate" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
                        {v.orderName} · {v.projectName}
                      </p>
                    </div>
                    <ChevronRight className="w-6 h-6 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
                  </div>

                  <div className="mt-3.5 pt-3.5 border-t flex items-center justify-between gap-3" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>You claimed</p>
                      <p className="text-base font-semibold" style={{ color: 'var(--ax-text)' }}>{formatCurrency(v.submittedValue)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>Site Engineer set</p>
                      <p className="text-base font-semibold" style={{ color: 'var(--ax-text)' }}>{formatCurrency(v.siteEngineerReviewedValue)}</p>
                    </div>
                  </div>

                  <div className="mt-2.5 flex items-center justify-between gap-3">
                    <span className="text-sm font-bold" style={{ color: deltaColor }}>
                      {isCut ? '' : '+'}{formatCurrency(v.delta)} ({isCut ? '' : '+'}{v.deltaPct.toFixed(1)}%)
                    </span>
                    {v.siteEngineerReviewedByName && (
                      <span className="text-xs font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>{v.siteEngineerReviewedByName}</span>
                    )}
                  </div>

                  {v.siteEngineerRemarks && (
                    <p className="text-sm mt-2 rounded-xl px-3 py-2" style={{ background: 'var(--ax-overlay)', color: 'rgba(var(--ax-text-rgb),0.65)' }}>
                      &ldquo;{v.siteEngineerRemarks}&rdquo;
                    </p>
                  )}
                </button>
              );
            })}

            {visibleCount < variances.length && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-base min-h-[52px]"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-accent)', ...cardShadow }}
              >
                Load More ({variances.length - visibleCount} more) <ChevronDown className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
