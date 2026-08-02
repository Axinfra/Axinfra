'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Truck, Receipt, Download, X } from 'lucide-react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import VendorStatusPill from '@/components/vendor/VendorStatusPill';
import { cardShadow, iconBadge } from '@/components/vendor/vendorTheme';
import { useVendorPortal } from '@/lib/contexts/VendorPortalContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate, formatCurrency } from '@/lib/utils';

interface VendorDirectOrder {
  id: string;
  doNumber: string;
  projectId: string;
  projectName: string;
  itemDescription: string;
  value: number;
  billedValue: number | null;
  status: string;
  remarks: string | null;
  createdAt: string;
}

// A Vendor can only move an order through their own fulfillment progress — never back to
// ORDERED, never straight to PAID (that's PMC's payment confirmation).
const VENDOR_STATUS_OPTIONS = [
  ['IN_PROGRESS', 'In Progress'],
  ['IN_DELIVERY', 'In Delivery'],
  ['DELIVERED', 'Delivered (Awaiting Payment)'],
  ['QTY_VARIANCE', 'Qty Variance'],
] as const;

const BILLABLE_STATUSES = ['IN_DELIVERY', 'DELIVERED', 'QTY_VARIANCE'];

export default function VendorDirectOrdersPage() {
  const { data: allOrders = [], isLoading: ordersLoading, mutate: refetch } = useSWR<VendorDirectOrder[]>('/api/vendor/direct-orders', jsonFetcher);
  const { data: portal, loading: portalLoading, reload } = useVendorPortal();
  const isLoading = ordersLoading || portalLoading;

  const [statusUpdating, setStatusUpdating] = useState<string | null>(null);
  const [billModal, setBillModal] = useState<VendorDirectOrder | null>(null);
  const [billValue, setBillValue] = useState('');
  const [billError, setBillError] = useState('');
  const [billSaving, setBillSaving] = useState(false);

  // Scoped to whichever project is currently selected (via the switcher), same as Orders.
  const orders = portal ? allOrders.filter((o) => o.projectId === portal.projectId) : [];

  const handleStatusChange = async (order: VendorDirectOrder, status: string) => {
    setStatusUpdating(order.id);
    try {
      const res = await fetch(`/api/projects/${order.projectId}/direct-orders/${order.id}`, {
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

  const openBillModal = (order: VendorDirectOrder) => {
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
      const res = await fetch(`/api/projects/${billModal.projectId}/direct-orders/${billModal.id}/bill`, {
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

  return (
    <Layout>
      <div className="max-w-lg mx-auto">
        <VendorNav
          title="Direct Orders"
          projectName={portal?.projectName}
          allProjects={portal?.allProjects}
          currentProjectId={portal?.projectId}
          onProjectChange={reload}
        />

        {isLoading ? (
          <p className="text-base" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</p>
        ) : orders.length === 0 ? (
          <div className="rounded-[28px] py-16 text-center" style={{ background: 'var(--ax-card)', ...cardShadow }}>
            <Truck className="w-11 h-11 mx-auto mb-3" style={{ color: 'rgba(var(--ax-text-rgb),0.25)' }} />
            <p className="text-lg font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>No direct orders yet</p>
          </div>
        ) : (
          <div className="space-y-3.5">
            {orders.map((o) => (
              <div
                key={o.id}
                className="w-full flex items-start gap-4 text-left p-4 rounded-[24px]"
                style={{ background: 'var(--ax-card)', ...cardShadow }}
              >
                <div className="w-14 h-14 rounded-full flex items-center justify-center shrink-0" style={iconBadge('#3b82f6')}>
                  <Truck className="w-6 h-6" style={{ color: '#3b82f6' }} strokeWidth={2.25} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-bold text-lg truncate" style={{ color: 'var(--ax-text)' }}>{o.doNumber} — {o.itemDescription}</p>
                  <p className="text-sm font-medium mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
                    {formatCurrency(o.value, portal?.currency)}
                    {o.billedValue != null && o.billedValue !== o.value && ` · Billed ${formatCurrency(o.billedValue, portal?.currency)}`}
                    {' · '}{formatDate(o.createdAt)}
                  </p>

                  {o.status === 'PAID' ? (
                    <div className="mt-2">
                      <VendorStatusPill kind="directOrder" status={o.status} size="sm" />
                    </div>
                  ) : (
                    <select
                      className="mt-2.5 text-sm font-semibold rounded-full px-3 py-1.5"
                      style={{ background: 'var(--ax-overlay)', color: 'var(--ax-text)', border: '1px solid var(--ax-border)' }}
                      value={o.status}
                      disabled={statusUpdating === o.id}
                      onChange={(e) => void handleStatusChange(o, e.target.value)}
                    >
                      {!VENDOR_STATUS_OPTIONS.some(([v]) => v === o.status) && (
                        <option value={o.status}>{o.status}</option>
                      )}
                      {VENDOR_STATUS_OPTIONS.map(([v, label]) => (
                        <option key={v} value={v}>{label}</option>
                      ))}
                    </select>
                  )}

                  {BILLABLE_STATUSES.includes(o.status) && (
                    <button
                      onClick={() => openBillModal(o)}
                      className="mt-2.5 ml-2 text-sm font-semibold inline-flex items-center gap-1.5"
                      style={{ color: '#3b82f6' }}
                    >
                      <Receipt className="w-4 h-4" />{o.billedValue != null ? 'Edit Bill' : 'Generate Bill'}
                    </button>
                  )}
                  <a
                    href={`/api/projects/${o.projectId}/direct-orders/${o.id}/bill/pdf`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2.5 ml-2 text-sm font-semibold inline-flex items-center gap-1.5"
                    style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}
                  >
                    <Download className="w-4 h-4" />Download Bill
                  </a>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Generate/Edit Bill modal */}
      {billModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={(e) => e.target === e.currentTarget && setBillModal(null)}>
          <div className="rounded-[24px] max-w-sm w-full p-6 space-y-4" style={{ background: 'var(--ax-card)', ...cardShadow }}>
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--ax-text)' }}>{billModal.billedValue != null ? 'Edit Bill' : 'Generate Bill'}</h2>
                <p className="text-xs mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>{billModal.doNumber} — {billModal.itemDescription}</p>
              </div>
              <button onClick={() => setBillModal(null)} style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}><X className="w-5 h-5" /></button>
            </div>
            {billError && <div className="alert alert-error">{billError}</div>}
            <div>
              <label htmlFor="vendorBilledValue" className="text-sm font-semibold block mb-1.5" style={{ color: 'var(--ax-text)' }}>
                Billed Value ({portal?.currency ?? 'INR'})
              </label>
              <input
                id="vendorBilledValue"
                type="number"
                min="0"
                step="0.01"
                className="input"
                value={billValue}
                onChange={(e) => setBillValue(e.target.value)}
                autoFocus
              />
              <p className="text-xs mt-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>
                Ordered value was {formatCurrency(billModal.value, portal?.currency)}. If this differs, the order is marked Qty Variance automatically.
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
    </Layout>
  );
}
