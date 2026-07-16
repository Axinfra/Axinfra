'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';
import PhaseEditModal from '@/components/schedule/PhaseEditModal';
import VendorCard from '@/components/orders/VendorCard';
import BOQList from '@/components/orders/BOQList';
import WorkOrderCard from '@/components/orders/WorkOrderCard';
import RABillList from '@/components/orders/RABillList';

interface VendorInfo {
  id: string;
  name: string;
  email: string;
  companyName: string | null;
  contactPerson: string | null;
  mobile: string | null;
  gstNumber: string | null;
  address: string | null;
}

interface OrderDetail {
  id: string;
  name: string;
  description: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  vendorUserId: string | null;
  vendor: VendorInfo | null;
  boqs: Array<{ id: string; status: string; itemsCount: number }>;
  workOrder: { id: string; number: string; status: string; currentRevisionNumber: number } | null;
}

export default function PurchaseOrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;
  const orderId = params.orderId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const myUserId = (project?.myUserId as string) ?? '';

  const { data: order, isLoading: orderLoading, mutate } = useSWR<OrderDetail>(
    projectId && orderId ? `/api/projects/${projectId}/phases/${orderId}` : null,
    jsonFetcher,
  );

  const [showEdit, setShowEdit] = useState(false);

  const loading = projectLoading || orderLoading;
  const canManage = myRole === 'CLIENT' || myRole === 'PMC';
  const canCreateBOQ = myRole === 'PMC';
  const canApproveBOQ = myRole === 'CLIENT';
  const isAssignedVendor = myRole === 'VENDOR' && !!order?.vendorUserId && order.vendorUserId === myUserId;

  if (loading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  if (!order) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="card">
          <div className="card-body py-10 text-center">
            <p className="text-[rgba(232,228,220,0.55)]">Purchase order not found</p>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <button
              onClick={() => router.push(`/projects/${projectId}`)}
              className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[var(--ax-accent)] transition-colors mb-1"
            >
              ← Back to Purchase Orders
            </button>
            <h1 className="text-2xl font-bold text-[#e8e4dc]">{order.name}</h1>
            {order.description && <p className="text-sm text-[rgba(232,228,220,0.55)] mt-1">{order.description}</p>}
            {(order.plannedStart || order.plannedEnd) && (
              <p className="text-xs text-[rgba(232,228,220,0.4)] mt-1">
                {order.plannedStart ? formatDate(order.plannedStart) : '—'} → {order.plannedEnd ? formatDate(order.plannedEnd) : '—'}
              </p>
            )}
          </div>
          {canManage && (
            <button onClick={() => setShowEdit(true)} className="btn btn-sm btn-secondary">
              Edit
            </button>
          )}
        </div>

        <VendorCard
          projectId={projectId}
          order={order}
          vendor={order.vendor}
          canEdit={canManage}
          onChanged={() => void mutate()}
        />

        <BOQList projectId={projectId} orderId={orderId} canCreate={canCreateBOQ} canApprove={canApproveBOQ} />

        <WorkOrderCard
          projectId={projectId}
          orderId={orderId}
          vendorName={order.vendor?.name ?? null}
          vendorAssigned={!!order.vendorUserId}
          canManage={canManage}
          isAssignedVendor={isAssignedVendor}
          isPMC={myRole === 'PMC'}
        />

        <RABillList projectId={projectId} orderId={orderId} />
      </div>

      {showEdit && (
        <PhaseEditModal
          projectId={projectId}
          phase={order}
          onClose={() => setShowEdit(false)}
          onSaved={() => void mutate()}
        />
      )}
    </Layout>
  );
}
