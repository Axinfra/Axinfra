'use client';

import { useState } from 'react';
import Link from 'next/link';
import { HardHat, ArrowRight, Loader2, AlertTriangle, ChevronDown } from 'lucide-react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import VendorStatusPill from '@/components/vendor/VendorStatusPill';
import { cardShadow } from '@/components/vendor/vendorTheme';
import { useVendorPortal } from '@/lib/contexts/VendorPortalContext';
import { formatDate } from '@/lib/utils';

const PAGE_SIZE = 8;

/** "My Work" — the vendor's assigned activities as big, read-only cards. Progress is owned
 * exclusively by the PMC; a vendor's only action here is opening an activity to attach
 * supporting photos/documents on its detail page. */
export default function VendorWorkPage() {
  const { data, loading, error } = useVendorPortal();
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);

  if (loading) return (
    <Layout><div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }} />
    </div></Layout>
  );

  if (error) return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <AlertTriangle className="w-8 h-8 text-[#e06050] mb-3" />
        <p className="text-[#e06050] font-semibold mb-2">Access denied</p>
        <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>{error}</p>
      </div>
    </Layout>
  );

  if (!data) return null;

  const { projectId } = data;
  const { milestones } = data.overview;

  return (
    <Layout>
      <div className="max-w-lg mx-auto space-y-5">
        <VendorNav title="My Work" projectName={data.projectName} />

        {milestones.length === 0 ? (
          <div className="rounded-[28px] py-16 text-center" style={{ background: 'var(--ax-card)', ...cardShadow }}>
            <HardHat className="w-11 h-11 mx-auto mb-3" style={{ color: 'rgba(var(--ax-text-rgb),0.25)' }} />
            <p className="text-lg font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>Nothing assigned yet</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {milestones.slice(0, visibleCount).map((m) => (
              <div key={m.id} className="rounded-[24px] p-5 space-y-3.5" style={{ background: 'var(--ax-card)', ...cardShadow }}>
                <div className="flex items-start justify-between gap-3">
                  <p className="font-bold text-lg" style={{ color: 'var(--ax-text)' }}>{m.title}</p>
                  <VendorStatusPill kind="milestone" status={m.state} size="sm" />
                </div>
                <div className="flex items-center justify-between text-base">
                  <span className="font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>
                    {m.plannedEnd ? `Due ${formatDate(m.plannedEnd)}` : 'No date'}
                  </span>
                  <span className="font-bold text-lg" style={{ color: 'var(--ax-text)' }}>{Math.round(m.percentComplete ?? 0)}%</span>
                </div>
                <Link
                  href={`/projects/${projectId}/activities/${m.id}`}
                  className="w-full flex items-center justify-center gap-2 rounded-2xl py-3 font-bold text-base min-h-[48px]"
                  style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)' }}
                >
                  View <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
                </Link>
              </div>
            ))}
            {visibleCount < milestones.length && (
              <button
                onClick={() => setVisibleCount((c) => c + PAGE_SIZE)}
                className="w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 font-bold text-base min-h-[52px]"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-accent)', ...cardShadow }}
              >
                Load More ({milestones.length - visibleCount} more) <ChevronDown className="w-4 h-4" strokeWidth={2.5} />
              </button>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}
