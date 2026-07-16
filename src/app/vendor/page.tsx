'use client';

import useSWR from 'swr';
import { Package, Wallet, HardHat, BarChart3, Loader2, AlertTriangle } from 'lucide-react';
import Layout from '@/components/Layout';
import { useVendorPortal } from '@/lib/contexts/VendorPortalContext';
import { jsonFetcher } from '@/lib/fetcher';
import VendorTile from '@/components/vendor/VendorTile';
import VendorProjectSwitcher from '@/components/vendor/VendorProjectSwitcher';

interface VendorOrder { id: string; projectId: string; pendingAcceptance: boolean }
interface VendorRABill { id: string; projectId: string }

/** Vendor Portal home — one screen, four big tiles, no reading required beyond a single word
 * per tile. Pending-count badges pull the vendor's eye straight to what needs action. */
export default function VendorHomePage() {
  const { data, loading, error, reload } = useVendorPortal();
  const { data: orders } = useSWR<VendorOrder[]>('/api/vendor/orders', jsonFetcher);
  const { data: pendingBills } = useSWR<VendorRABill[]>('/api/vendor/ra-bills', jsonFetcher);

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

  if (!data) return (
    <Layout><div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }} />
    </div></Layout>
  );

  // All three badges scoped to the currently selected project (data.projectId) — Orders/Bills
  // otherwise come back for every project the vendor's assigned to, which would make these
  // counts (and the tiles they sit on) inconsistent with "My Work", which is already scoped.
  const pendingOrdersCount = (orders ?? []).filter((o) => o.projectId === data.projectId && o.pendingAcceptance).length;
  const pendingBillsCount = (pendingBills ?? []).filter((b) => b.projectId === data.projectId).length;
  const pendingWorkCount = data.overview.milestones.filter((m) => m.state === 'IN_PROGRESS').length;

  return (
    <Layout>
      <div className="space-y-7 max-w-lg mx-auto">
        <div className="flex items-center justify-between gap-3">
          <p className="text-3xl font-bold tracking-tight" style={{ color: 'var(--ax-text)' }}>Vendor Portal</p>
          {data.allProjects.length > 1 ? (
            <VendorProjectSwitcher
              projects={data.allProjects}
              currentProjectId={data.projectId}
              currentProjectName={data.projectName}
              onChange={reload}
            />
          ) : (
            <p className="text-base font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>{data.projectName}</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-5">
          <VendorTile href="/vendor/orders" icon={Package} label="Orders" count={pendingOrdersCount} color="#3b82f6" />
          <VendorTile href="/vendor/ra-bills" icon={Wallet} label="Bills" count={pendingBillsCount} color="#22c55e" />
          <VendorTile href="/vendor/work" icon={HardHat} label="My Work" count={pendingWorkCount} color="#eab308" />
          <VendorTile href="/vendor/reports" icon={BarChart3} label="Reports" color="#a78bfa" />
        </div>
      </div>
    </Layout>
  );
}
