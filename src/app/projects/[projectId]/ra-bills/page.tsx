'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency, formatDate } from '@/lib/utils';

interface RABillRow {
  id: string;
  billNumber: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  submittedValue: number | null;
  certifiedAt: string | null;
  approvedValue: number | null;
  releasedValue: number | null;
  order: { id: string; name: string };
  lineItems: Array<{ thisBillAmount: number }>;
}

interface Summary {
  totalSubmittedValue: number;
  totalApprovedValue: number;
  totalReleasedValue: number;
  pendingSiteEngineerReviewCount: number;
  pendingCertificationCount: number;
  pendingApprovalCount: number;
}

interface Order {
  id: string;
  name: string;
}

const PAGE_SIZE = 25;

const STATUS_OPTIONS = [
  ['', 'All Statuses'],
  ['DRAFT', 'Draft'],
  ['PENDING_SITE_ENGINEER_REVIEW', 'Pending Site Engineer'],
  ['PENDING_VENDOR_REVIEW', 'Pending Certification'],
  ['REVISION_REQUESTED', 'Needs Revision'],
  ['CERTIFIED', 'Certified'],
  ['APPROVED', 'Approved'],
  ['PAID', 'Paid'],
] as const;

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.55)]',
    PENDING_SITE_ENGINEER_REVIEW: 'bg-[rgba(168,85,247,0.15)] text-[#a855f7]',
    PENDING_VENDOR_REVIEW: 'bg-[rgba(234,179,8,0.15)] text-[#eab308]',
    REVISION_REQUESTED: 'bg-[rgba(234,88,12,0.12)] text-[#f97316]',
    CERTIFIED: 'bg-[rgba(56,189,248,0.15)] text-[#38bdf8]',
    APPROVED: 'bg-[rgba(92,186,128,0.15)] text-[#5cba80]',
    PAID: 'badge-verified',
  };
  const label: Record<string, string> = {
    DRAFT: 'Draft', PENDING_SITE_ENGINEER_REVIEW: 'Pending Site Engineer', PENDING_VENDOR_REVIEW: 'Pending Certification', REVISION_REQUESTED: 'Needs Revision',
    CERTIFIED: 'Certified', APPROVED: 'Approved', PAID: 'Paid',
  };
  if (status === 'PAID') return <span className="badge badge-verified text-xs">Paid</span>;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? map.DRAFT}`}>{label[status] ?? status}</span>;
}

function KPITile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">{label}</p>
      <p className="text-xl font-semibold text-[#e8e4dc] mt-1">{value}</p>
    </div>
  );
}

/** Project-wide RA Bills — every Running Account Bill across every Purchase Order, filterable
 * by Purchase Order and status, server-paginated (same convention as Milestones/Audit
 * Log/BOQs), with a summary KPI row up top for at-a-glance analysis. */
export default function RABillsListPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const [orderFilter, setOrderFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [offset, setOffset] = useState(0);
  const [defaultFilterApplied, setDefaultFilterApplied] = useState(false);

  // Site Engineer's queue is their reason for visiting this page — default the filter to their
  // pending reviews so it reads as a dedicated section, while still letting them clear it.
  useEffect(() => {
    if (!defaultFilterApplied && myRole === 'SITE_ENGINEER') {
      setStatusFilter('PENDING_SITE_ENGINEER_REVIEW');
      setDefaultFilterApplied(true);
    }
  }, [myRole, defaultFilterApplied]);

  const raBillsUrl = useMemo(() => {
    if (!projectId) return null;
    return (
      `/api/projects/${projectId}/ra-bills?` +
      new URLSearchParams({
        ...(orderFilter && { orderId: orderFilter }),
        ...(statusFilter && { status: statusFilter }),
        limit: PAGE_SIZE.toString(),
        offset: offset.toString(),
      })
    );
  }, [projectId, orderFilter, statusFilter, offset]);

  const { data: payload, isLoading: billsLoading } = useSWR<{ raBills: RABillRow[]; total: number; summary: Summary }>(
    raBillsUrl,
    jsonFetcher,
  );
  const raBills = payload?.raBills ?? [];
  const total = payload?.total ?? 0;
  const summary = payload?.summary;

  const { data: orders = [], isLoading: ordersLoading } = useSWR<Order[]>(
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
        <h1 className="text-2xl font-bold text-[#e8e4dc]">
          {myRole === 'SITE_ENGINEER' ? 'RA Bills — Your Reviews' : 'RA Bills'}
        </h1>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-6 gap-4">
            <KPITile label="Total Submitted" value={formatCurrency(summary.totalSubmittedValue)} />
            <KPITile label="Total Approved" value={formatCurrency(summary.totalApprovedValue)} />
            <KPITile label="Total Released" value={formatCurrency(summary.totalReleasedValue)} />
            <KPITile label="Pending Site Engineer" value={String(summary.pendingSiteEngineerReviewCount)} />
            <KPITile label="Pending Certification" value={String(summary.pendingCertificationCount)} />
            <KPITile label="Pending Approval" value={String(summary.pendingApprovalCount)} />
          </div>
        )}

        <div className="card">
          <div className="card-body flex items-center gap-3 flex-wrap">
            <label className="text-xs text-[rgba(232,228,220,0.45)] font-medium uppercase tracking-wider shrink-0">Purchase Order</label>
            <select className="input text-sm max-w-xs" value={orderFilter} onChange={(e) => { setOrderFilter(e.target.value); setOffset(0); }}>
              <option value="">All Purchase Orders</option>
              {orders.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
            <label className="text-xs text-[rgba(232,228,220,0.45)] font-medium uppercase tracking-wider shrink-0">Status</label>
            <select className="input text-sm max-w-xs" value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value); setOffset(0); }}>
              {STATUS_OPTIONS.map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
            {(orderFilter || statusFilter) && (
              <button onClick={() => { setOrderFilter(''); setStatusFilter(''); setOffset(0); }} className="text-xs text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors">
                Clear
              </button>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">{total} RA Bill{total === 1 ? '' : 's'}</h2>
          </div>
          <div className="card-body">
            {billsLoading ? (
              <p className="text-sm text-[rgba(232,228,220,0.45)] py-6 text-center">Loading…</p>
            ) : raBills.length === 0 ? (
              <p className="text-sm text-[rgba(232,228,220,0.55)] py-6 text-center">No RA Bills {orderFilter || statusFilter ? 'match this filter' : 'yet'}</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="table text-sm">
                  <thead>
                    <tr>
                      <th>RA No.</th>
                      <th>Purchase Order</th>
                      <th>Period</th>
                      <th>Status</th>
                      <th className="text-right">Submitted Value</th>
                      <th>Finished When</th>
                      <th className="text-right">Approved Value</th>
                      <th className="text-right">Released Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {raBills.map((b) => (
                      <tr
                        key={b.id}
                        onClick={() => router.push(`/projects/${projectId}/orders/${b.order.id}/ra-bills/${b.id}`)}
                        className="cursor-pointer hover:bg-[rgba(var(--ax-accent-rgb),0.03)]"
                      >
                        <td className="font-medium text-[#e8e4dc] whitespace-nowrap">RA-{b.billNumber}</td>
                        <td>
                          <button
                            onClick={(e) => { e.stopPropagation(); router.push(`/projects/${projectId}/orders/${b.order.id}`); }}
                            className="text-[var(--ax-accent)] hover:underline"
                          >
                            {b.order.name}
                          </button>
                        </td>
                        <td className="whitespace-nowrap text-[rgba(232,228,220,0.65)]">{formatDate(b.periodStart)} – {formatDate(b.periodEnd)}</td>
                        <td><StatusBadge status={b.status} /></td>
                        <td className="text-right">{b.submittedValue !== null ? formatCurrency(b.submittedValue) : '—'}</td>
                        <td className="whitespace-nowrap">{b.certifiedAt ? formatDate(b.certifiedAt) : '—'}</td>
                        <td className="text-right">{b.approvedValue !== null ? formatCurrency(b.approvedValue) : '—'}</td>
                        <td className="text-right">{b.releasedValue !== null ? formatCurrency(b.releasedValue) : '—'}</td>
                      </tr>
                    ))}
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
                <button disabled={currentPage === 1} onClick={() => goToPage(currentPage - 1)} className="btn btn-sm btn-secondary disabled:opacity-40">← Prev</button>
                {pages.map((p, i) =>
                  p === '…' ? (
                    <span key={`e-${i}`} className="px-2 text-[rgba(232,228,220,0.3)] text-sm">…</span>
                  ) : (
                    <button key={p} onClick={() => goToPage(p as number)} className={`btn btn-sm ${currentPage === p ? 'btn-primary' : 'btn-secondary'}`}>{p}</button>
                  )
                )}
                <button disabled={currentPage === totalPages} onClick={() => goToPage(currentPage + 1)} className="btn btn-sm btn-secondary disabled:opacity-40">Next →</button>
              </div>
            </div>
          );
        })()}
      </div>
    </Layout>
  );
}
