'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { Download } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency, formatDate } from '@/lib/utils';

const PAGE_SIZE = 10;

interface RABillRow {
  id: string;
  billNumber: number;
  periodStart: string;
  periodEnd: string;
  status: string;
  submittedValue: number | null;
  certifiedAt: string | null;
  approvedValue: number | null;
  releasedValue: number | null;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    DRAFT: 'bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.55)]',
    PENDING_VENDOR_REVIEW: 'bg-[rgba(234,179,8,0.15)] text-[#eab308]',
    REVISION_REQUESTED: 'bg-[rgba(234,88,12,0.12)] text-[#f97316]',
    CERTIFIED: 'bg-[rgba(56,189,248,0.15)] text-[#38bdf8]',
    APPROVED: 'bg-[rgba(92,186,128,0.15)] text-[#5cba80]',
    PAID: 'badge-verified',
  };
  const label: Record<string, string> = {
    DRAFT: 'Draft',
    PENDING_VENDOR_REVIEW: 'Pending Certification',
    REVISION_REQUESTED: 'Needs Revision',
    CERTIFIED: 'Certified',
    APPROVED: 'Approved',
    PAID: 'Paid',
  };
  if (status === 'PAID') return <span className="badge badge-verified text-xs">Paid</span>;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${map[status] ?? map.DRAFT}`}>{label[status] ?? status}</span>;
}

/** RA (Running Account) Bills for a Purchase Order — periodic, cumulative contractor bills
 * against its APPROVED BOQs, showing the four headline figures (Submitted / Finished When /
 * Approved / Released) as dedicated columns. Read-only here: the assigned vendor drafts and
 * submits their own bill from the vendor portal — this is PMC/Owner's review-and-track view,
 * click a row to open it and certify/approve/release. */
export default function RABillList({
  projectId,
  orderId,
}: {
  projectId: string;
  orderId: string;
}) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);

  const raBillsUrl = useMemo(
    () =>
      `/api/projects/${projectId}/orders/${orderId}/ra-bills?` +
      new URLSearchParams({ limit: PAGE_SIZE.toString(), offset: offset.toString() }),
    [projectId, orderId, offset],
  );

  const { data: payload, isLoading } = useSWR<{
    raBills: RABillRow[];
    total: number;
    totals: { submitted: number; approved: number; released: number };
  }>(raBillsUrl, jsonFetcher);

  const raBills = payload?.raBills ?? [];
  const total = payload?.total ?? 0;
  const totals = payload?.totals ?? { submitted: 0, approved: 0, released: 0 };
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="card">
      <div className="card-header flex justify-between items-center">
        <h2 className="text-lg font-semibold">RA Bills ({total})</h2>
      </div>
      <div className="card-body">
        {isLoading ? (
          <p className="text-sm text-[rgba(232,228,220,0.45)]">Loading…</p>
        ) : raBills.length === 0 ? (
          <p className="text-sm text-[rgba(232,228,220,0.55)] py-6 text-center">
            No RA Bills yet — the assigned vendor drafts these from their portal
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>RA No.</th>
                  <th>Period</th>
                  <th>Status</th>
                  <th className="text-right">Submitted Value</th>
                  <th>Finished When</th>
                  <th className="text-right">Approved Value</th>
                  <th className="text-right">Released Value</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {raBills.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => router.push(`/projects/${projectId}/orders/${orderId}/ra-bills/${b.id}`)}
                    className="cursor-pointer hover:bg-[rgba(var(--ax-accent-rgb),0.03)]"
                  >
                    <td className="font-medium text-[#e8e4dc] whitespace-nowrap">RA-{b.billNumber}</td>
                    <td className="whitespace-nowrap text-[rgba(232,228,220,0.65)]">
                      {formatDate(b.periodStart)} – {formatDate(b.periodEnd)}
                    </td>
                    <td><StatusBadge status={b.status} /></td>
                    <td className="text-right">{b.submittedValue !== null ? formatCurrency(b.submittedValue) : '—'}</td>
                    <td className="whitespace-nowrap">{b.certifiedAt ? formatDate(b.certifiedAt) : '—'}</td>
                    <td className="text-right">{b.approvedValue !== null ? formatCurrency(b.approvedValue) : '—'}</td>
                    <td className="text-right">{b.releasedValue !== null ? formatCurrency(b.releasedValue) : '—'}</td>
                    <td className="text-right">
                      <a
                        href={`/api/projects/${projectId}/orders/${orderId}/ra-bills/${b.id}/pdf`}
                        onClick={(e) => e.stopPropagation()}
                        title="Download RA Bill"
                        className="inline-flex items-center justify-center w-7 h-7 rounded-md text-[rgba(232,228,220,0.5)] hover:text-[var(--ax-accent)] hover:bg-[rgba(var(--ax-accent-rgb),0.08)] transition-colors"
                      >
                        <Download className="w-4 h-4" />
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[rgba(255,255,255,0.03)] font-semibold">
                  <td colSpan={3} className="text-right">Totals</td>
                  <td className="text-right">{formatCurrency(totals.submitted)}</td>
                  <td />
                  <td className="text-right">{formatCurrency(totals.approved)}</td>
                  <td className="text-right">{formatCurrency(totals.released)}</td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {total > PAGE_SIZE && (
          <div className="flex items-center justify-between pt-4 mt-2 border-t border-[rgba(255,255,255,0.06)]">
            <p className="text-xs text-[rgba(232,228,220,0.4)]">
              Showing {offset + 1}–{Math.min(offset + PAGE_SIZE, total)} of {total}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={currentPage === 1}
                onClick={() => setOffset(offset - PAGE_SIZE)}
                className="btn btn-sm btn-secondary disabled:opacity-40"
              >
                ← Prev
              </button>
              <span className="text-xs text-[rgba(232,228,220,0.45)] px-2">{currentPage} / {totalPages}</span>
              <button
                disabled={currentPage === totalPages}
                onClick={() => setOffset(offset + PAGE_SIZE)}
                className="btn btn-sm btn-secondary disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
