'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency } from '@/lib/utils';

const PAGE_SIZE = 10;

interface BOQItemRow {
  id: string;
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
  plannedValue: number;
}

interface BOQRollup {
  totalValue: number;
  itemCount: number;
  quantity: number | null;
  unit: string | null;
  rate: number | null;
  summary: string;
}

interface BOQRow {
  id: string;
  boqNumber: string | null;
  name: string | null;
  status: string;
  workOrderStatus: string | null;
  items: BOQItemRow[];
  rollup: BOQRollup;
}

function StatusBadge({ status }: { status: string }) {
  if (status === 'APPROVED') return <span className="badge badge-verified text-xs">Approved</span>;
  if (status === 'PENDING_APPROVAL') return <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,179,8,0.15)] text-[#eab308] font-medium">Pending Approval</span>;
  if (status === 'REVISED') return <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,88,12,0.12)] text-[#f97316] font-medium">Needs Revision</span>;
  return <span className="badge badge-draft text-xs">Draft</span>;
}

/** Every BOQ under a Purchase Order is a single measured scope line — its item's
 * description/unit/qty/rate shown directly as one row, so "4 items" and "4 BOQs" are the
 * same thing. Clicking a row opens the full BOQ detail page (approval, Work Order, Activity
 * Log); "+ Add Item" creates the BOQ and its one item together in a single step. "Send All for
 * Approval" / "Approve All" act on every eligible BOQ under this order in one request, instead
 * of submitting/approving each one individually. */
export default function BOQList({
  projectId,
  orderId,
  canCreate,
  canApprove,
}: {
  projectId: string;
  orderId: string;
  canCreate: boolean;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [offset, setOffset] = useState(0);

  const boqsUrl = useMemo(
    () =>
      `/api/projects/${projectId}/orders/${orderId}/boqs?` +
      new URLSearchParams({ limit: PAGE_SIZE.toString(), offset: offset.toString() }),
    [projectId, orderId, offset],
  );

  const { data: payload, isLoading, mutate } = useSWR<{
    boqs: BOQRow[];
    total: number;
    totalValue: number;
    counts: { submittable: number; approvable: number };
  }>(boqsUrl, jsonFetcher);

  const boqs = payload?.boqs ?? [];
  const total = payload?.total ?? 0;
  const submittableCount = payload?.counts.submittable ?? 0;
  const approvableCount = payload?.counts.approvable ?? 0;
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const [showAdd, setShowAdd] = useState(false);
  const [draft, setDraft] = useState({ description: '', unit: '', plannedQty: '', rate: '' });
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [submittingAll, setSubmittingAll] = useState(false);
  const [approvingAll, setApprovingAll] = useState(false);
  const [confirmApproveAll, setConfirmApproveAll] = useState(false);
  const [reviseAllModal, setReviseAllModal] = useState(false);
  const [reviseAllReason, setReviseAllReason] = useState('');
  const [revisingAll, setRevisingAll] = useState(false);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/boqs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          item: {
            description: draft.description,
            unit: draft.unit,
            plannedQty: parseFloat(draft.plannedQty),
            rate: parseFloat(draft.rate),
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowAdd(false);
        setDraft({ description: '', unit: '', plannedQty: '', rate: '' });
        void mutate();
      } else {
        setError(data.error ?? 'Failed to add item');
      }
    } catch {
      setError('Failed to add item. Please try again.');
    } finally {
      setCreating(false);
    }
  };

  const handleSubmitAll = async () => {
    setSubmittingAll(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/boqs/submit`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        void mutate();
      } else {
        setError(data.error ?? 'Failed to submit BOQs for approval');
      }
    } catch {
      setError('Failed to submit BOQs for approval. Please try again.');
    } finally {
      setSubmittingAll(false);
    }
  };

  const handleApproveAll = async () => {
    setConfirmApproveAll(false);
    setApprovingAll(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/boqs/approve`, { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        void mutate();
      } else {
        setError(data.error ?? 'Failed to approve BOQs');
      }
    } catch {
      setError('Failed to approve BOQs. Please try again.');
    } finally {
      setApprovingAll(false);
    }
  };

  const handleReviseAll = async () => {
    if (!reviseAllReason.trim()) return;
    setRevisingAll(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/orders/${orderId}/boqs/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reviseAllReason.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setReviseAllModal(false);
        setReviseAllReason('');
        void mutate();
      } else {
        setError(data.error ?? 'Failed to send BOQs back for revision');
      }
    } catch {
      setError('Failed to send BOQs back for revision. Please try again.');
    } finally {
      setRevisingAll(false);
    }
  };

  const totalValue = payload?.totalValue ?? 0;

  return (
    <div className="card">
      <div className="card-header flex justify-between items-center flex-wrap gap-2">
        <h2 className="text-lg font-semibold">BOQs ({total})</h2>
        <div className="flex items-center gap-2">
          {canCreate && submittableCount > 0 && (
            <button onClick={() => void handleSubmitAll()} disabled={submittingAll} className="btn btn-sm btn-secondary text-xs disabled:opacity-50">
              {submittingAll ? 'Sending…' : `Send All for Approval (${submittableCount})`}
            </button>
          )}
          {canApprove && approvableCount > 0 && (
            <>
              <button
                onClick={() => { setReviseAllModal(true); setError(''); }}
                disabled={revisingAll}
                className="btn btn-sm text-xs disabled:opacity-50 text-[#f97316] border border-[rgba(249,115,22,0.35)] hover:bg-[rgba(249,115,22,0.08)]"
              >
                {revisingAll ? 'Sending…' : `Revise All (${approvableCount})`}
              </button>
              <button onClick={() => setConfirmApproveAll(true)} disabled={approvingAll} className="btn btn-sm btn-success text-xs disabled:opacity-50">
                {approvingAll ? 'Approving…' : `Approve All (${approvableCount})`}
              </button>
            </>
          )}
          {canCreate && (
            <button onClick={() => { setShowAdd(true); setError(''); }} className="btn btn-sm btn-primary text-xs">
              + Add Item
            </button>
          )}
        </div>
      </div>
      <div className="card-body">
        {error && <div className="alert alert-error text-sm mb-3">{error}</div>}
        {isLoading ? (
          <p className="text-sm text-[rgba(232,228,220,0.45)]">Loading…</p>
        ) : boqs.length === 0 ? (
          <p className="text-sm text-[rgba(232,228,220,0.55)] py-6 text-center">
            No BOQs yet{canCreate ? ' — click "+ Add Item" to get started' : ''}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>BOQ No.</th>
                  <th>Description</th>
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
                  return (
                    <tr
                      key={b.id}
                      onClick={() => router.push(`/projects/${projectId}/boq/${b.id}`)}
                      className="cursor-pointer hover:bg-[rgba(var(--ax-accent-rgb),0.03)]"
                    >
                      <td className="text-xs text-[rgba(232,228,220,0.45)] font-mono whitespace-nowrap">{b.boqNumber ?? '—'}</td>
                      <td className="text-[#e8e4dc]">{item?.description || b.name || 'Untitled'}</td>
                      <td>{item?.unit ?? '—'}</td>
                      <td className="text-right">{item?.plannedQty ?? '—'}</td>
                      <td className="text-right">{item ? formatCurrency(item.rate) : '—'}</td>
                      <td className="text-right font-medium">{formatCurrency(b.rollup.totalValue)}</td>
                      <td><StatusBadge status={b.status} /></td>
                      <td>
                        {b.workOrderStatus ? (
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
              <tfoot>
                <tr className="bg-[rgba(255,255,255,0.03)] font-semibold">
                  <td colSpan={5} className="text-right">Total</td>
                  <td className="text-right">{formatCurrency(totalValue)}</td>
                  <td colSpan={2} />
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

      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">Add BOQ Item</h2>
              {error && <div className="alert alert-error text-sm mb-3">{error}</div>}
              <div className="space-y-4">
                <div>
                  <label className="label">Description</label>
                  <input autoFocus type="text" className="input" value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input type="text" className="input" value={draft.unit} onChange={(e) => setDraft({ ...draft, unit: e.target.value })} placeholder="e.g., sqm, nos, rmt" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Quantity</label>
                    <input type="number" className="input" value={draft.plannedQty} onChange={(e) => setDraft({ ...draft, plannedQty: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Rate</label>
                    <input type="number" className="input" value={draft.rate} onChange={(e) => setDraft({ ...draft, rate: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button onClick={() => setShowAdd(false)} className="btn btn-secondary">Cancel</button>
                  <button
                    onClick={() => void handleCreate()}
                    disabled={creating || !draft.description || !draft.unit || !draft.plannedQty || !draft.rate}
                    className="btn btn-primary disabled:opacity-50"
                  >
                    {creating ? 'Adding…' : 'Add Item'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {reviseAllModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full">
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">Send {approvableCount} BOQ{approvableCount === 1 ? '' : 's'} Back for Revision</h2>
              <p className="text-xs text-[rgba(232,228,220,0.5)]">One reason will be applied to every pending BOQ under this Purchase Order. PMC will need to fix and resend each one.</p>
              {error && <div className="alert alert-error text-sm">{error}</div>}
              <textarea
                autoFocus
                rows={4}
                className="input resize-none w-full"
                placeholder="e.g. Quantities for earthwork items are incorrect…"
                value={reviseAllReason}
                onChange={(e) => setReviseAllReason(e.target.value)}
              />
              <div className="flex justify-end gap-3">
                <button onClick={() => { setReviseAllModal(false); setError(''); }} className="btn btn-secondary">Cancel</button>
                <button
                  onClick={() => void handleReviseAll()}
                  disabled={revisingAll || !reviseAllReason.trim()}
                  className="btn bg-[#f97316] text-white hover:bg-[#ea7011] disabled:opacity-50"
                >
                  {revisingAll ? 'Sending…' : 'Send for Revision'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {confirmApproveAll && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#e8e4dc]">Approve {approvableCount} BOQ{approvableCount === 1 ? '' : 's'}?</h2>
            <p className="text-sm text-[rgba(232,228,220,0.55)]">Every pending BOQ under this Purchase Order will be locked and PMC will no longer be able to edit them.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmApproveAll(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => void handleApproveAll()} className="btn btn-success">Approve All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
