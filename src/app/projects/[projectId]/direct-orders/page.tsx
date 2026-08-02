'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency, formatDate } from '@/lib/utils';
import { Truck, Trash2, Receipt, Download } from 'lucide-react';

interface DirectOrderRow {
  id: string;
  doNumber: string;
  vendorUserId: string;
  vendorName: string;
  itemDescription: string;
  value: number;
  billedValue: number | null;
  status: string;
  remarks: string | null;
  createdByName: string;
  createdAt: string;
}

interface Summary {
  totalOrdered: number;
  totalDeliveredValue: number;
  paid: number;
  outstanding: number;
  totalVariance: number;
}

interface RoleEntry {
  userId: string | null;
  name: string;
  email: string;
  role: string;
  isPendingInvite: boolean;
}

const STATUS_OPTIONS = ['ORDERED', 'IN_PROGRESS', 'IN_DELIVERY', 'DELIVERED', 'QTY_VARIANCE', 'PAID'] as const;

// A Vendor can only move an order through their own fulfillment progress — never back to
// ORDERED, never straight to PAID (that's PMC's payment confirmation).
const VENDOR_STATUS_OPTIONS = ['IN_PROGRESS', 'IN_DELIVERY', 'DELIVERED', 'QTY_VARIANCE'] as const;

// A bill can only be raised once delivery has actually started.
const BILLABLE_STATUSES = ['IN_DELIVERY', 'DELIVERED', 'QTY_VARIANCE'];

const STATUS_META: Record<string, { label: string; className: string }> = {
  ORDERED: { label: 'Ordered', className: 'bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.55)]' },
  IN_PROGRESS: { label: 'In Progress', className: 'bg-[rgba(234,179,8,0.15)] text-[#eab308]' },
  IN_DELIVERY: { label: 'In Delivery', className: 'bg-[rgba(56,189,248,0.15)] text-[#38bdf8]' },
  DELIVERED: { label: 'Awaiting Payment', className: 'bg-[rgba(249,115,22,0.15)] text-[#f97316]' },
  QTY_VARIANCE: { label: 'Qty Variance', className: 'bg-[rgba(224,96,80,0.15)] text-[#e06050]' },
  PAID: { label: 'Paid', className: 'badge-verified' },
};

function StatusBadge({ status }: { status: string }) {
  const meta = STATUS_META[status] ?? { label: status, className: 'bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.55)]' };
  if (status === 'PAID') return <span className="badge badge-verified text-xs">Paid</span>;
  return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${meta.className}`}>{meta.label}</span>;
}

function KPITile({ label, value, tone }: { label: string; value: string; tone?: 'accent' | 'success' | 'warning' }) {
  const toneClass = tone === 'accent' ? 'text-[var(--ax-accent)]' : tone === 'success' ? 'text-[#5cba80]' : tone === 'warning' ? 'text-[#f97316]' : 'text-[#e8e4dc]';
  return (
    <div className="rounded-lg border border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] p-4">
      <p className="text-[11px] uppercase tracking-wider text-[rgba(232,228,220,0.4)]">{label}</p>
      <p className={`text-xl font-semibold mt-1 ${toneClass}`}>{value}</p>
    </div>
  );
}

export default function DirectOrdersPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const hasAccess = myRole === 'PMC' || myRole === 'VENDOR';

  const { data: payload, isLoading: ordersLoading, mutate: refetch } = useSWR<{ directOrders: DirectOrderRow[]; summary: Summary }>(
    projectId && hasAccess ? `/api/projects/${projectId}/direct-orders` : null,
    jsonFetcher,
  );
  const directOrders = payload?.directOrders ?? [];
  const summary = payload?.summary;

  const { data: roles = [] } = useSWR<RoleEntry[]>(
    myRole === 'PMC' ? `/api/projects/${projectId}/roles` : null,
    jsonFetcher,
  );
  const vendors = roles.filter((r) => r.role === 'VENDOR' && !r.isPendingInvite);

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [form, setForm] = useState({ vendorUserId: '', itemDescription: '', value: '', remarks: '' });
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Generate/edit bill — PMC or the order's own Vendor can record the actual billed value.
  const [billModal, setBillModal] = useState<DirectOrderRow | null>(null);
  const [billValue, setBillValue] = useState('');
  const [billError, setBillError] = useState('');
  const [billSaving, setBillSaving] = useState(false);

  const loading = projectLoading || ordersLoading;

  const resetForm = () => { setForm({ vendorUserId: '', itemDescription: '', value: '', remarks: '' }); setFormError(''); };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vendorUserId) { setFormError('Select a vendor'); return; }
    if (!form.itemDescription.trim()) { setFormError('Item is required'); return; }
    const value = Number(form.value);
    if (!(value > 0)) { setFormError('Enter a valid value'); return; }

    setSaving(true);
    setFormError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/direct-orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendorUserId: form.vendorUserId,
          itemDescription: form.itemDescription.trim(),
          value,
          remarks: form.remarks.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setShowCreateModal(false);
        resetForm();
        void refetch();
      } else {
        setFormError(data.error ?? 'Failed to create order');
      }
    } catch {
      setFormError('Failed to create order');
    } finally {
      setSaving(false);
    }
  };

  const handleStatusChange = async (orderId: string, status: string) => {
    setStatusUpdating(orderId);
    try {
      const res = await fetch(`/api/projects/${projectId}/direct-orders/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) void refetch();
      else alert(data.error);
    } catch {
      alert('Failed to update status');
    } finally {
      setStatusUpdating(null);
    }
  };

  const handleDelete = async (orderId: string) => {
    setConfirmDeleteId(null);
    try {
      const res = await fetch(`/api/projects/${projectId}/direct-orders/${orderId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) void refetch();
      else alert(data.error);
    } catch {
      alert('Failed to delete order');
    }
  };

  const openBillModal = (order: DirectOrderRow) => {
    setBillModal(order);
    setBillValue(order.billedValue != null ? String(order.billedValue) : String(order.value));
    setBillError('');
  };

  const handleGenerateBill = async () => {
    if (!billModal) return;
    const billedValue = Number(billValue);
    if (!(billedValue > 0)) { setBillError('Enter a valid billed value'); return; }

    setBillSaving(true);
    setBillError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/direct-orders/${billModal.id}/bill`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billedValue }),
      });
      const data = await res.json();
      if (data.success) {
        setBillModal(null);
        void refetch();
      } else {
        setBillError(data.error ?? 'Failed to generate bill');
      }
    } catch {
      setBillError('Failed to generate bill');
    } finally {
      setBillSaving(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  if (!hasAccess) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="text-center py-16">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[rgba(224,96,80,0.1)] mb-4">
            <Truck className="w-8 h-8 text-[#e06050]" />
          </div>
          <h2 className="text-xl font-semibold text-[#e8e4dc] mb-2">Access Denied</h2>
          <p className="text-sm text-[rgba(232,228,220,0.55)] mb-6">Direct Orders is restricted to PMC and Vendor roles.</p>
          <button onClick={() => router.push(`/projects/${projectId}`)} className="btn btn-primary text-sm">
            Back to Project
          </button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Direct Orders</h1>
          {myRole === 'PMC' && (
            <button onClick={() => { resetForm(); setShowCreateModal(true); }} className="btn btn-primary">
              + New Direct Order
            </button>
          )}
        </div>

        {summary && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
            <KPITile label="Total Ordered" value={formatCurrency(summary.totalOrdered, project?.currency)} />
            <KPITile label="Total Delivered Value" value={formatCurrency(summary.totalDeliveredValue, project?.currency)} tone="accent" />
            <KPITile label="Paid" value={formatCurrency(summary.paid, project?.currency)} tone="success" />
            <KPITile label="Outstanding" value={formatCurrency(summary.outstanding, project?.currency)} tone={summary.outstanding > 0 ? 'warning' : 'success'} />
            <KPITile
              label="Variance"
              value={`${summary.totalVariance > 0 ? '+' : ''}${formatCurrency(summary.totalVariance, project?.currency)}`}
              tone={summary.totalVariance === 0 ? 'success' : 'warning'}
            />
          </div>
        )}

        <div className="card">
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>DO Number</th>
                  <th>Vendor</th>
                  <th>Item</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Billed</th>
                  <th className="text-right">Variance</th>
                  <th>Status</th>
                  <th>Remarks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {directOrders.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-8 text-[rgba(232,228,220,0.4)]">No direct orders yet</td></tr>
                )}
                {directOrders.map((o) => {
                  const canEditStatus = myRole === 'PMC' || (myRole === 'VENDOR' && o.status !== 'PAID');
                  const statusOptions = myRole === 'PMC' ? STATUS_OPTIONS : VENDOR_STATUS_OPTIONS;
                  const variance = o.billedValue != null ? o.value - o.billedValue : null;
                  const canBill = (myRole === 'PMC' || myRole === 'VENDOR') && BILLABLE_STATUSES.includes(o.status);
                  return (
                    <tr key={o.id}>
                      <td className="font-medium">{o.doNumber}</td>
                      <td>{o.vendorName}</td>
                      <td className="max-w-[220px] truncate" title={o.itemDescription}>{o.itemDescription}</td>
                      <td className="text-right">{formatCurrency(o.value, project?.currency)}</td>
                      <td className="text-right">{o.billedValue != null ? formatCurrency(o.billedValue, project?.currency) : '—'}</td>
                      <td className={`text-right font-medium ${variance == null ? 'text-[rgba(232,228,220,0.35)]' : variance === 0 ? 'text-[#5cba80]' : 'text-[#f97316]'}`}>
                        {variance != null ? `${variance > 0 ? '+' : ''}${formatCurrency(variance, project?.currency)}` : '—'}
                      </td>
                      <td>
                        {canEditStatus ? (
                          <select
                            className="input !py-1 !text-xs !w-auto"
                            value={o.status}
                            disabled={statusUpdating === o.id}
                            onChange={(e) => void handleStatusChange(o.id, e.target.value)}
                          >
                            {!(statusOptions as readonly string[]).includes(o.status) && (
                              <option value={o.status}>{STATUS_META[o.status]?.label ?? o.status}</option>
                            )}
                            {statusOptions.map((s) => (
                              <option key={s} value={s}>{STATUS_META[s].label}</option>
                            ))}
                          </select>
                        ) : (
                          <StatusBadge status={o.status} />
                        )}
                      </td>
                      <td className="text-[rgba(232,228,220,0.55)] max-w-[200px] truncate" title={o.remarks ?? ''}>{o.remarks || '—'}</td>
                      <td>
                        <div className="flex items-center gap-3">
                          {canBill && (
                            <button
                              onClick={() => openBillModal(o)}
                              className="text-[var(--ax-accent)] hover:opacity-80 text-sm inline-flex items-center gap-1"
                            >
                              <Receipt className="w-3.5 h-3.5" />{o.billedValue != null ? 'Edit Bill' : 'Generate Bill'}
                            </button>
                          )}
                          <a
                            href={`/api/projects/${projectId}/direct-orders/${o.id}/bill/pdf`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[rgba(232,228,220,0.6)] hover:text-[#e8e4dc] text-sm inline-flex items-center gap-1"
                          >
                            <Download className="w-3.5 h-3.5" />Download Bill
                          </a>
                          {myRole === 'PMC' && o.status === 'ORDERED' && (
                            <button
                              onClick={() => setConfirmDeleteId(o.id)}
                              className="text-[#e06050] hover:text-[#c8503f] text-sm inline-flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" />Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Delete confirmation */}
      {confirmDeleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-[#e06050]">Delete Direct Order</h2>
              <p className="text-[rgba(232,228,220,0.55)] mb-4 text-sm">
                Delete{' '}
                <span className="font-medium text-[#e8e4dc]">
                  {directOrders.find((o) => o.id === confirmDeleteId)?.doNumber}
                </span>
                ? This cannot be undone.
              </p>
              <div className="flex justify-end gap-3">
                <button onClick={() => setConfirmDeleteId(null)} className="btn btn-secondary">Cancel</button>
                <button onClick={() => void handleDelete(confirmDeleteId)} className="btn bg-[#e06050] text-white hover:bg-[#c8503f]">
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Generate/Edit Bill modal — PMC or the order's own Vendor */}
      {billModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setBillModal(null)}>
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full p-6 space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-[#e8e4dc]">{billModal.billedValue != null ? 'Edit Bill' : 'Generate Bill'}</h2>
              <p className="text-xs text-[rgba(232,228,220,0.4)] mt-0.5">{billModal.doNumber} — {billModal.itemDescription}</p>
            </div>
            {billError && <div className="alert alert-error">{billError}</div>}
            <div>
              <label htmlFor="billedValue" className="label">Billed Value ({project?.currency ?? 'INR'})</label>
              <input
                id="billedValue"
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={billValue}
                onChange={(e) => setBillValue(e.target.value)}
                autoFocus
              />
              <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                Ordered value was {formatCurrency(billModal.value, project?.currency)}. If this differs, the order is marked Qty Variance automatically.
              </p>
            </div>
            <div className="flex justify-end gap-3 pt-1">
              <button onClick={() => setBillModal(null)} className="btn btn-secondary">Cancel</button>
              <button onClick={() => void handleGenerateBill()} disabled={billSaving} className="btn btn-primary disabled:opacity-50">
                {billSaving ? 'Saving…' : 'Save Bill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Direct Order modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setShowCreateModal(false)}>
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full p-6 space-y-4">
            <h2 className="text-lg font-semibold text-[#e8e4dc]">New Direct Order</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              {formError && <div className="alert alert-error">{formError}</div>}

              <div>
                <label htmlFor="vendorUserId" className="label">Vendor</label>
                <select
                  id="vendorUserId"
                  className="input"
                  value={form.vendorUserId}
                  onChange={(e) => setForm({ ...form, vendorUserId: e.target.value })}
                >
                  <option value="">Select a vendor…</option>
                  {vendors.map((v) => (
                    <option key={v.userId} value={v.userId!}>{v.name}</option>
                  ))}
                </select>
                {vendors.length === 0 && (
                  <p className="text-xs text-[rgba(232,228,220,0.4)] mt-1.5">
                    No vendors on this project yet — add one from Project Roles first.
                  </p>
                )}
              </div>

              <div>
                <label htmlFor="itemDescription" className="label">Item</label>
                <input
                  id="itemDescription"
                  type="text"
                  className="input"
                  value={form.itemDescription}
                  onChange={(e) => setForm({ ...form, itemDescription: e.target.value })}
                  placeholder="e.g. TMT Steel Bars 12mm"
                  maxLength={500}
                />
              </div>

              <div>
                <label htmlFor="value" className="label">Value ({project?.currency ?? 'INR'})</label>
                <input
                  id="value"
                  type="number"
                  min="0"
                  step="0.01"
                  className="input"
                  value={form.value}
                  onChange={(e) => setForm({ ...form, value: e.target.value })}
                  placeholder="e.g. 150000"
                />
              </div>

              <div>
                <label htmlFor="remarks" className="label">Remarks <span className="text-[rgba(232,228,220,0.3)]">(optional)</span></label>
                <textarea
                  id="remarks"
                  className="input resize-none"
                  rows={2}
                  value={form.remarks}
                  onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                  placeholder="Any additional notes"
                  maxLength={2000}
                />
              </div>

              <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={() => setShowCreateModal(false)} className="btn btn-secondary">Cancel</button>
                <button type="submit" disabled={saving} className="btn btn-primary disabled:opacity-50">
                  {saving ? 'Creating…' : 'Create Direct Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
