'use client';

import { useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { CheckCircle2, Package } from 'lucide-react';
import useSWR from 'swr';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import WorkOrderCard from '@/components/orders/WorkOrderCard';
import RABillList from '@/components/orders/RABillList';

interface BOQItem {
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

interface BOQDetail {
  id: string;
  boqNumber: string | null;
  name: string | null;
  description: string | null;
  category: string | null;
  scope: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  status: string;
  items: BOQItem[];
  revisions: Array<{ revisionNumber: number; reason: string; createdAt: string }>;
  order: { id: string; name: string; vendorUserId: string | null } | null;
  rollup: BOQRollup;
}

const TABS = ['overview', 'workorder', 'rabills'] as const;
type Tab = (typeof TABS)[number];
const TAB_LABELS: Record<Tab, string> = { overview: 'Overview', workorder: 'Work Order', rabills: 'RA Bills' };

function toDateInput(v: string | null): string {
  return v ? v.slice(0, 10) : '';
}

export default function BOQDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const projectId = params.projectId as string;
  const boqId = params.boqId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const permissions = (project?.permissions ?? {}) as Record<string, boolean>;

  const { data: boq, isLoading: boqLoading, mutate: refetchBoq } = useSWR<BOQDetail>(
    projectId && boqId ? `/api/projects/${projectId}/boq/${boqId}` : null,
    jsonFetcher,
  );

  const requestedTab = searchParams.get('tab');
  const [tab, setTab] = useState<Tab>(
    TABS.includes(requestedTab as Tab) ? (requestedTab as Tab) : 'overview'
  );
  const [error, setError] = useState('');

  // Edit header details
  const [showEditDetails, setShowEditDetails] = useState(false);
  const [detailsDraft, setDetailsDraft] = useState({ name: '', description: '', category: '', scope: '', plannedStart: '', plannedEnd: '' });
  const [savingDetails, setSavingDetails] = useState(false);

  // A BOQ is a single scope/measurement line — its one item is edited as part of the BOQ
  // itself, not as rows in a sub-table.
  const [showEditItem, setShowEditItem] = useState(false);
  const [itemDraft, setItemDraft] = useState({ description: '', unit: '', plannedQty: '', rate: '' });
  const [itemSaving, setItemSaving] = useState(false);
  const [confirmRemoveItem, setConfirmRemoveItem] = useState(false);

  // Approve / revision
  const [confirmApprove, setConfirmApprove] = useState(false);
  const [revisionModal, setRevisionModal] = useState(false);
  const [revisionReason, setRevisionReason] = useState('');
  const [revisionSubmitting, setRevisionSubmitting] = useState(false);

  const loading = projectLoading || boqLoading;

  if (loading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  if (!boq) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="card">
          <div className="card-body py-10 text-center">
            <p className="text-[rgba(232,228,220,0.55)]">BOQ not found</p>
          </div>
        </div>
      </Layout>
    );
  }

  const canEdit = permissions.canEditBOQ && (boq.status === 'DRAFT' || boq.status === 'REVISED');
  const canSendForApproval = canEdit && boq.items.length > 0;
  const canOwnerReview = permissions.canApproveBOQ && boq.status === 'PENDING_APPROVAL' && boq.items.length > 0;

  const openEditDetails = () => {
    setDetailsDraft({
      name: boq.name ?? '',
      description: boq.description ?? '',
      category: boq.category ?? '',
      scope: boq.scope ?? '',
      plannedStart: toDateInput(boq.plannedStart),
      plannedEnd: toDateInput(boq.plannedEnd),
    });
    setShowEditDetails(true);
  };

  const handleSaveDetails = async () => {
    setSavingDetails(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/boq/${boqId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(detailsDraft),
      });
      const data = await res.json();
      if (data.success) {
        setShowEditDetails(false);
        void refetchBoq();
      } else {
        setError(data.error ?? 'Failed to save');
      }
    } catch {
      setError('Failed to save');
    } finally {
      setSavingDetails(false);
    }
  };

  const openEditItem = () => {
    const item = boq.items[0];
    setItemDraft(
      item
        ? { description: item.description, unit: item.unit, plannedQty: String(item.plannedQty), rate: String(item.rate) }
        : { description: boq.name ?? '', unit: '', plannedQty: '', rate: '' }
    );
    setShowEditItem(true);
  };

  const handleSaveItem = async () => {
    setItemSaving(true);
    setError('');
    const payload = {
      description: itemDraft.description,
      unit: itemDraft.unit,
      plannedQty: parseFloat(itemDraft.plannedQty),
      rate: parseFloat(itemDraft.rate),
    };
    try {
      const existing = boq.items[0];
      const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/items`, {
        method: existing ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(existing ? { itemId: existing.id, updates: payload } : payload),
      });
      const data = await res.json();
      if (data.success) {
        setShowEditItem(false);
        void refetchBoq();
      } else {
        setError(data.error ?? 'Failed to save item');
      }
    } catch {
      setError('An error occurred');
    } finally {
      setItemSaving(false);
    }
  };

  const handleRemoveItem = async () => {
    const item = boq.items[0];
    if (!item) return;
    setConfirmRemoveItem(false);
    setShowEditItem(false);
    const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/items`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ itemId: item.id }),
    });
    const data = await res.json();
    if (data.success) {
      void refetchBoq();
    } else {
      setError(data.error ?? 'Failed to remove item');
    }
  };

  const handleSubmitForApproval = async () => {
    const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/submit`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      void refetchBoq();
    } else {
      setError(data.error ?? 'Failed to submit for approval');
    }
  };

  const handleApprove = async () => {
    setConfirmApprove(false);
    const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/approve`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      void refetchBoq();
    } else {
      setError(data.error);
    }
  };

  const handleSubmitRevision = async () => {
    if (!revisionReason.trim()) return;
    setRevisionSubmitting(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/boq/${boqId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: revisionReason.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setRevisionModal(false);
        setRevisionReason('');
        void refetchBoq();
      } else {
        setError(data.error);
      }
    } catch {
      setError('An error occurred');
    } finally {
      setRevisionSubmitting(false);
    }
  };

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <button
              onClick={() => (boq.order ? router.push(`/projects/${projectId}/orders/${boq.order.id}`) : router.back())}
              className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[var(--ax-accent)] transition-colors mb-1"
            >
              ← Back to {boq.order?.name ?? 'Purchase Order'}
            </button>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-[#e8e4dc]">{boq.name || boq.boqNumber || 'BOQ'}</h1>
              {boq.status === 'APPROVED' ? (
                <span className="badge badge-verified flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Approved
                </span>
              ) : boq.status === 'PENDING_APPROVAL' ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,179,8,0.15)] text-[#eab308] font-medium">Pending Approval</span>
              ) : boq.status === 'REVISED' ? (
                <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,88,12,0.12)] text-[#f97316] font-medium">Needs Revision</span>
              ) : (
                <span className="badge badge-draft">Draft</span>
              )}
              {/* Prominent, persistent (visible on every tab) link back to the parent Purchase
                  Order — a pill with an icon reads unambiguously as "this is a link to another
                  page," unlike the small muted breadcrumb above, so the relationship is visible
                  at a glance without anyone having to point it out. */}
              {boq.order ? (
                <button
                  onClick={() => router.push(`/projects/${projectId}/orders/${boq.order!.id}`)}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[rgba(var(--ax-accent-rgb),0.1)] text-[var(--ax-accent)] hover:bg-[rgba(var(--ax-accent-rgb),0.18)] transition-colors"
                  title="View Purchase Order"
                >
                  <Package className="w-3.5 h-3.5" />
                  {boq.order.name}
                </button>
              ) : (
                <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.4)]">
                  <Package className="w-3.5 h-3.5" />
                  No Purchase Order
                </span>
              )}
            </div>
          </div>
          {permissions.canEditBOQ && (
            <button onClick={openEditDetails} className="btn btn-sm btn-secondary">Edit Details</button>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Tabs */}
        <div className="flex gap-1 border-b border-[rgba(255,255,255,0.08)]">
          {TABS.map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? 'border-[var(--ax-accent)] text-[var(--ax-accent)]'
                  : 'border-transparent text-[rgba(232,228,220,0.5)] hover:text-[#e8e4dc]'
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          ))}
        </div>

        {tab === 'overview' && (
          <>
            {/* Overview fields — a BOQ IS its item: qty/unit/rate below are the item's own
                fields, editable as one unit via "Edit Item" rather than a separate sub-table. */}
            <div className="card">
              <div className="card-header flex justify-between items-center">
                <h2 className="text-lg font-semibold">Overview</h2>
                {canEdit && (
                  <button onClick={openEditItem} className="btn btn-sm btn-primary text-xs">
                    {boq.items.length > 0 ? 'Edit Item' : '+ Add Item'}
                  </button>
                )}
              </div>
              <div className="card-body grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3">
                <div>
                  <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">Purchase Order</p>
                  {boq.order ? (
                    <button
                      onClick={() => router.push(`/projects/${projectId}/orders/${boq.order!.id}`)}
                      className="inline-flex items-center gap-1.5 mt-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[rgba(var(--ax-accent-rgb),0.08)] text-[var(--ax-accent)] hover:bg-[rgba(var(--ax-accent-rgb),0.16)] transition-colors"
                    >
                      <Package className="w-3 h-3" />
                      {boq.order.name}
                    </button>
                  ) : (
                    <p className="text-sm text-[#e8e4dc] mt-0.5">—</p>
                  )}
                </div>
                {[
                  ['BOQ Number', boq.boqNumber || '—'],
                  ['BOQ Name', boq.name || '—'],
                  ['Category', boq.category || '—'],
                  ['Quantity', boq.rollup.quantity ?? boq.rollup.summary],
                  ['Unit', boq.rollup.unit ?? '—'],
                  ['Rate', boq.rollup.rate ? formatCurrency(boq.rollup.rate, project?.currency) : '—'],
                  ['Total Value', formatCurrency(boq.rollup.totalValue, project?.currency)],
                  ['Planned Start Date', boq.plannedStart ? formatDate(boq.plannedStart) : '—'],
                  ['Planned End Date', boq.plannedEnd ? formatDate(boq.plannedEnd) : '—'],
                  ['Current Status', boq.status],
                ].map(([label, value]) => (
                  <div key={label as string}>
                    <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">{label}</p>
                    <p className="text-sm text-[#e8e4dc] mt-0.5">{value}</p>
                  </div>
                ))}
                <div className="col-span-2 sm:col-span-4">
                  <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">Item Description</p>
                  <p className="text-sm text-[#e8e4dc] mt-0.5">{boq.items[0]?.description || boq.description || '—'}</p>
                </div>
                <div className="col-span-2 sm:col-span-4">
                  <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">Scope</p>
                  <p className="text-sm text-[#e8e4dc] mt-0.5">{boq.scope || '—'}</p>
                </div>
              </div>
            </div>

            {/* Status banners */}
            {boq.status === 'REVISED' && permissions.canEditBOQ && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(234,88,12,0.08)] border border-[rgba(249,115,22,0.25)]">
                <span className="text-[#f97316] text-lg leading-none mt-0.5">⚠</span>
                <div>
                  <p className="text-sm font-medium text-[#f97316]">Revision Required</p>
                  {boq.revisions[0]?.reason && (
                    <p className="text-sm text-[#f97316] mt-1 font-medium">&quot;{boq.revisions[0].reason}&quot;</p>
                  )}
                  <p className="text-xs text-[rgba(249,115,22,0.7)] mt-1.5">Edit the item above, then send for approval again.</p>
                </div>
              </div>
            )}
            {boq.status === 'PENDING_APPROVAL' && permissions.canApproveBOQ && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-[rgba(234,179,8,0.07)] border border-[rgba(234,179,8,0.25)]">
                <span className="text-[#eab308] text-lg leading-none mt-0.5">👁</span>
                <div>
                  <p className="text-sm font-medium text-[#eab308]">BOQ Submitted for Your Approval</p>
                  <p className="text-xs text-[rgba(234,179,8,0.7)] mt-0.5">Review the item above, then approve or request revisions.</p>
                </div>
              </div>
            )}

            {/* Actions */}
            {boq.status === 'APPROVED' ? (
              <div className="flex items-center gap-3 p-4 rounded-lg bg-[rgba(92,186,128,0.08)] border border-[rgba(92,186,128,0.2)]">
                <CheckCircle2 className="w-5 h-5 text-[#5cba80] shrink-0" />
                <div>
                  <p className="text-sm font-medium text-[#5cba80]">BOQ Approved</p>
                  <p className="text-xs text-[rgba(92,186,128,0.7)] mt-0.5">This BOQ is locked.</p>
                </div>
                {permissions.canApproveBOQ && (
                  <button onClick={() => setRevisionModal(true)} className="btn btn-secondary ml-auto">Request Revision</button>
                )}
              </div>
            ) : canOwnerReview ? (
              <div className="flex justify-end gap-3">
                <button onClick={() => setRevisionModal(true)} className="btn btn-secondary">Request Revision</button>
                <button onClick={() => setConfirmApprove(true)} className="btn btn-success">Approve BOQ</button>
              </div>
            ) : canSendForApproval ? (
              <div className="flex justify-end">
                <button onClick={() => void handleSubmitForApproval()} className="btn btn-primary">Send for Approval</button>
              </div>
            ) : null}

            {/* BOQ Revisions (approval revisions, distinct from Work Order revisions) */}
            {boq.revisions.length > 0 && (
              <div className="card">
                <div className="card-header"><h2 className="text-lg font-semibold">BOQ Revision History</h2></div>
                <div className="card-body">
                  <ul className="space-y-2">
                    {boq.revisions.map((rev) => (
                      <li key={rev.revisionNumber} className="text-sm">
                        <span className="font-medium">Revision {rev.revisionNumber}:</span>{' '}
                        <span className="text-[rgba(232,228,220,0.55)]">{rev.reason}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'workorder' && boq.order && (
          <>
            <p className="text-xs text-[rgba(232,228,220,0.4)]">
              Work Orders are issued once per Purchase Order and shared by every BOQ under it.
            </p>
            <WorkOrderCard
              projectId={projectId}
              orderId={boq.order.id}
              vendorName={null}
              vendorAssigned={!!boq.order.vendorUserId}
              canManage={permissions.canEditBOQ || permissions.canApproveBOQ}
              isAssignedVendor={false}
              isPMC={myRole === 'PMC'}
            />
          </>
        )}

        {tab === 'rabills' && boq.order && (
          <>
            <p className="text-xs text-[rgba(232,228,220,0.4)]">
              RA Bills are drafted per Purchase Order and shared by every BOQ under it.
            </p>
            <RABillList projectId={projectId} orderId={boq.order.id} />
          </>
        )}

      </div>

      {/* Edit Details modal */}
      {showEditDetails && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6 space-y-4">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">Edit BOQ Details</h2>
              <div>
                <label className="label text-xs">BOQ Name</label>
                <input type="text" className="input text-sm" value={detailsDraft.name} onChange={(e) => setDetailsDraft({ ...detailsDraft, name: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">Description</label>
                <textarea rows={2} className="input text-sm resize-none" value={detailsDraft.description} onChange={(e) => setDetailsDraft({ ...detailsDraft, description: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">Category</label>
                  <input type="text" className="input text-sm" value={detailsDraft.category} onChange={(e) => setDetailsDraft({ ...detailsDraft, category: e.target.value })} />
                </div>
                <div>
                  <label className="label text-xs">Scope</label>
                  <input type="text" className="input text-sm" value={detailsDraft.scope} onChange={(e) => setDetailsDraft({ ...detailsDraft, scope: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label text-xs">Planned Start</label>
                  <input type="date" className="input text-sm" value={detailsDraft.plannedStart} onChange={(e) => setDetailsDraft({ ...detailsDraft, plannedStart: e.target.value })} />
                </div>
                <div>
                  <label className="label text-xs">Planned End</label>
                  <input type="date" className="input text-sm" value={detailsDraft.plannedEnd} onChange={(e) => setDetailsDraft({ ...detailsDraft, plannedEnd: e.target.value })} />
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2 border-t border-[rgba(255,255,255,0.07)]">
                <button onClick={() => setShowEditDetails(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={() => void handleSaveDetails()} disabled={savingDetails} className="btn btn-primary disabled:opacity-50">
                  {savingDetails ? 'Saving…' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Item modal — the BOQ's single scope/measurement line */}
      {showEditItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">{boq.items.length > 0 ? 'Edit Item' : 'Add Item'}</h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Description</label>
                  <input autoFocus type="text" className="input" value={itemDraft.description} onChange={(e) => setItemDraft({ ...itemDraft, description: e.target.value })} />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <input type="text" className="input" value={itemDraft.unit} onChange={(e) => setItemDraft({ ...itemDraft, unit: e.target.value })} placeholder="e.g., sqm, nos, rmt" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="label">Quantity</label>
                    <input type="number" className="input" value={itemDraft.plannedQty} onChange={(e) => setItemDraft({ ...itemDraft, plannedQty: e.target.value })} />
                  </div>
                  <div>
                    <label className="label">Rate</label>
                    <input type="number" className="input" value={itemDraft.rate} onChange={(e) => setItemDraft({ ...itemDraft, rate: e.target.value })} />
                  </div>
                </div>
                <div className="flex justify-between items-center pt-4">
                  {boq.items.length > 0 ? (
                    <button onClick={() => setConfirmRemoveItem(true)} className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[#e06050] transition-colors">
                      Remove Item
                    </button>
                  ) : <span />}
                  <div className="flex space-x-3">
                    <button onClick={() => setShowEditItem(false)} className="btn btn-secondary">Cancel</button>
                    <button
                      onClick={() => void handleSaveItem()}
                      disabled={itemSaving || !itemDraft.description || !itemDraft.unit || !itemDraft.plannedQty || !itemDraft.rate}
                      className="btn btn-primary disabled:opacity-50"
                    >
                      {itemSaving ? 'Saving…' : 'Save'}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Revision Reason modal */}
      {revisionModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-1 text-[#f97316]">Request Revision</h2>
              <p className="text-sm text-[rgba(232,228,220,0.55)] mb-4">Describe what needs to be changed. The PMC will see this message.</p>
              <textarea autoFocus rows={4} className="input resize-none w-full" placeholder="e.g. Quantities for earthwork items are incorrect…" value={revisionReason} onChange={(e) => setRevisionReason(e.target.value)} />
              <div className="flex justify-end gap-3 mt-4">
                <button onClick={() => setRevisionModal(false)} className="btn btn-secondary">Cancel</button>
                <button onClick={() => void handleSubmitRevision()} disabled={revisionSubmitting || !revisionReason.trim()} className="btn bg-[#f97316] text-white hover:bg-[#ea7011] disabled:opacity-50">
                  {revisionSubmitting ? 'Sending…' : 'Send for Revision'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Confirm approve */}
      {confirmApprove && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#e8e4dc]">Approve BOQ?</h2>
            <p className="text-sm text-[rgba(232,228,220,0.55)]">The BOQ will be locked and PMC will no longer be able to edit it.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmApprove(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => void handleApprove()} className="btn btn-success">Approve</button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm remove item */}
      {confirmRemoveItem && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full shadow-2xl p-6 space-y-4">
            <h2 className="text-base font-semibold text-[#e8e4dc]">Remove this item?</h2>
            <p className="text-sm text-[rgba(232,228,220,0.55)]">This cannot be undone.</p>
            <div className="flex justify-end gap-3">
              <button onClick={() => setConfirmRemoveItem(false)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => void handleRemoveItem()} className="btn bg-[rgba(224,96,80,0.15)] text-[#e06050] border border-[rgba(224,96,80,0.3)] hover:bg-[rgba(224,96,80,0.25)]">
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
