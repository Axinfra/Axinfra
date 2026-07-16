'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Package } from 'lucide-react';
import useSWR from 'swr';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency } from '@/lib/utils';
import ImportBOQModal from '@/components/orders/ImportBOQModal';

interface BOQItem {
  id: string;
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
  plannedValue: number;
}

interface BOQ {
  id: string;
  boqNumber: string | null;
  name: string | null;
  status: string;
  orderId: string | null;
  workOrderStatus: string | null;
  order: { id: string; name: string; sortOrder: number } | null;
  items: BOQItem[];
}

interface Order {
  id: string;
  name: string;
}

const PAGE_SIZE = 25;

function StatusBadge({ status }: { status: string }) {
  if (status === 'APPROVED') return <span className="badge badge-verified text-xs">Approved</span>;
  if (status === 'PENDING_APPROVAL') return <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,179,8,0.15)] text-[#eab308] font-medium">Pending Approval</span>;
  if (status === 'REVISED') return <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,88,12,0.12)] text-[#f97316] font-medium">Needs Revision</span>;
  return <span className="badge badge-draft text-xs">Draft</span>;
}

/** Project-wide BOQs list — every BOQ across every Purchase Order, filterable by Purchase
 * Order and paginated (server-side, same convention as Milestones/Audit Log — not every BOQ
 * loads at once), viewable by CLIENT/PMC/CONSULTANT/VENDOR/VIEWER. Clicking a row opens the
 * full BOQ detail page; the Purchase Order name is its own link to the Purchase Order page. */
export default function BOQsListPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const canImport = myRole === 'PMC';

  const [orderFilter, setOrderFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [showImport, setShowImport] = useState(false);

  const boqsUrl = useMemo(() => {
    if (!projectId) return null;
    return (
      `/api/projects/${projectId}/boq?` +
      new URLSearchParams({
        ...(orderFilter && { orderId: orderFilter }),
        limit: PAGE_SIZE.toString(),
        offset: offset.toString(),
      })
    );
  }, [projectId, orderFilter, offset]);

  const { data: boqsPayload, isLoading: boqsLoading, mutate: refetchBoqs } = useSWR<{ boqs: BOQ[]; total: number }>(
    boqsUrl,
    jsonFetcher,
  );
  const boqs = boqsPayload?.boqs ?? [];
  const total = boqsPayload?.total ?? 0;

  const { data: orders = [], isLoading: ordersLoading, mutate: refetchOrders } = useSWR<Order[]>(
    projectId ? `/api/projects/${projectId}/phases` : null,
    jsonFetcher,
  );

  const loading = projectLoading || ordersLoading;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  if (loading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  const goToPage = (p: number) => setOffset((p - 1) * PAGE_SIZE);

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-[#e8e4dc]">BOQs</h1>
          {canImport && (
            <button onClick={() => setShowImport(true)} className="btn btn-sm btn-secondary">
              ↑ Import Excel
            </button>
          )}
        </div>

        <div className="card">
          <div className="card-body flex items-center gap-3 flex-wrap">
            <label className="text-xs text-[rgba(232,228,220,0.45)] font-medium uppercase tracking-wider shrink-0">
              Purchase Order
            </label>
            <select
              className="input text-sm max-w-xs"
              value={orderFilter}
              onChange={(e) => { setOrderFilter(e.target.value); setOffset(0); }}
            >
              <option value="">All Purchase Orders</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            {orderFilter && (
              <button onClick={() => { setOrderFilter(''); setOffset(0); }} className="text-xs text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">{total} BOQ{total === 1 ? '' : 's'}</h2>
          </div>
          <div className="card-body">
            {boqsLoading ? (
              <p className="text-sm text-[rgba(232,228,220,0.45)] py-6 text-center">Loading…</p>
            ) : boqs.length === 0 ? (
              <p className="text-sm text-[rgba(232,228,220,0.55)] py-6 text-center">
                No BOQs {orderFilter ? 'for this purchase order' : 'yet'}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table text-sm">
                  <thead>
                    <tr>
                      <th>BOQ No.</th>
                      <th>Description</th>
                      <th>Purchase Order</th>
                      <th>Unit</th>
                      <th className="text-right">Qty</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Value</th>
                      <th>Status</th>
                      <th>Work Order</th>
                    </tr>
                  </thead>
                  <tbody>
                    {boqs.map((b) => {
                      const item = b.items[0];
                      const totalValue = b.items.reduce((sum, i) => sum + i.plannedValue, 0);
                      return (
                        <tr
                          key={b.id}
                          onClick={() => router.push(`/projects/${projectId}/boq/${b.id}`)}
                          className="cursor-pointer hover:bg-[rgba(var(--ax-accent-rgb),0.03)]"
                        >
                          <td className="text-xs text-[rgba(232,228,220,0.45)] font-mono whitespace-nowrap">{b.boqNumber ?? '—'}</td>
                          <td className="text-[#e8e4dc]">{item?.description || b.name || 'Untitled'}</td>
                          <td>
                            {/* A pill with an icon reads unambiguously as "click me to go to
                                the Purchase Order" — a plain accent-colored text link blends
                                into a dense 9-column row and is easy to miss. */}
                            {b.order ? (
                              <button
                                onClick={(e) => { e.stopPropagation(); router.push(`/projects/${projectId}/orders/${b.order!.id}`); }}
                                className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(var(--ax-accent-rgb),0.08)] text-[var(--ax-accent)] hover:bg-[rgba(var(--ax-accent-rgb),0.16)] transition-colors"
                                title="View Purchase Order"
                              >
                                <Package className="w-3 h-3" />
                                {b.order.name}
                              </button>
                            ) : (
                              <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(255,255,255,0.04)] text-[rgba(232,228,220,0.35)]">Unassigned</span>
                            )}
                          </td>
                          <td>{item?.unit ?? '—'}</td>
                          <td className="text-right">{item?.plannedQty ?? '—'}</td>
                          <td className="text-right">{item ? formatCurrency(item.rate) : '—'}</td>
                          <td className="text-right font-medium">{formatCurrency(totalValue)}</td>
                          <td><StatusBadge status={b.status} /></td>
                          <td>
                            {b.order && b.workOrderStatus ? (
                              <div className="flex items-center gap-2">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${b.workOrderStatus === 'ACCEPTED' ? 'bg-[rgba(92,186,128,0.15)] text-[#5cba80]' : 'bg-[rgba(234,179,8,0.15)] text-[#eab308]'}`}>
                                  {b.workOrderStatus === 'ACCEPTED' ? 'Accepted' : 'Pending'}
                                </span>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    router.push(`/projects/${projectId}/boq/${b.id}?tab=workorder`);
                                  }}
                                  className="text-[10px] font-semibold px-1.5 py-0.5 rounded whitespace-nowrap hover:underline"
                                  style={{ color: 'var(--ax-accent)' }}
                                >
                                  View →
                                </button>
                              </div>
                            ) : (
                              <span className="text-xs" style={{ color: 'rgba(232,228,220,0.35)' }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        {/* Pagination */}
        {total > PAGE_SIZE && (() => {
          const pages = Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter((p) => p === 1 || p === totalPages || Math.abs(p - currentPage) <= 1)
            .reduce<(number | '…')[]>((acc, p, idx, arr) => {
              if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
              acc.push(p);
              return acc;
            }, []);
          return (
            <div className="flex items-center justify-between py-2">
              <p className="text-sm text-[rgba(232,228,220,0.45)]">
                Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={currentPage === 1}
                  onClick={() => goToPage(currentPage - 1)}
                  className="btn btn-sm btn-secondary disabled:opacity-40"
                >
                  ← Prev
                </button>
                {pages.map((p, i) =>
                  p === '…' ? (
                    <span key={`e-${i}`} className="px-2 text-[rgba(232,228,220,0.3)] text-sm">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => goToPage(p as number)}
                      className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {p}
                    </button>
                  )
                )}
                <button
                  disabled={currentPage === totalPages}
                  onClick={() => goToPage(currentPage + 1)}
                  className="btn btn-sm btn-secondary disabled:opacity-40"
                >
                  Next →
                </button>
              </div>
            </div>
          );
        })()}
      </div>

      {showImport && (
        <ImportBOQModal
          projectId={projectId}
          orders={orders.map((o) => ({ id: o.id, name: o.name }))}
          onClose={() => setShowImport(false)}
          onImported={() => { void refetchBoqs(); void refetchOrders(); }}
        />
      )}
    </Layout>
  );
}
