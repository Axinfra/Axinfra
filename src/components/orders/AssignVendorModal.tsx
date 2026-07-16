'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { X, Save } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';

interface VendorOption {
  userId: string | null;
  name: string;
  email: string;
  isPendingInvite: boolean;
}

/** Vendor-only assignment dialog for a Purchase Order — deliberately narrower than
 * PhaseEditModal (which edits name/description/dates/sortOrder too): this only ever
 * touches `vendorUserId`, so "Assign Vendor" / "Change Vendor" doesn't open a full
 * edit-phase form. */
export default function AssignVendorModal({
  projectId,
  orderId,
  currentVendorUserId,
  onClose,
  onSaved,
}: {
  projectId: string;
  orderId: string;
  currentVendorUserId: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [vendorUserId, setVendorUserId] = useState(currentVendorUserId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: vendorsPayload, isLoading: vendorsLoading } = useSWR<VendorOption[]>(
    projectId ? `/api/admin/vendors?projectId=${projectId}` : null,
    jsonFetcher,
  );
  const vendors = (vendorsPayload ?? []).filter((v) => !v.isPendingInvite && v.userId);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/phases/${orderId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendorUserId: vendorUserId || null }),
      });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      } else {
        setError(data.error ?? 'Failed to save');
      }
    } catch {
      setError('Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#e8e4dc]">{currentVendorUserId ? 'Change Vendor' : 'Assign Vendor'}</h2>
            <button onClick={onClose} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && <div className="alert alert-error text-sm">{error}</div>}

          <div>
            <label className="label text-xs">Vendor</label>
            <select
              className="input text-sm" value={vendorUserId}
              onChange={(e) => setVendorUserId(e.target.value)}
              disabled={vendorsLoading}
              autoFocus
            >
              <option value="">Unassigned</option>
              {vendors.map((v) => (
                <option key={v.userId} value={v.userId!}>{v.name}</option>
              ))}
            </select>
            {vendors.length === 0 && !vendorsLoading && (
              <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                No vendors on this project yet — add one from the Roles page first.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-[rgba(255,255,255,0.07)]">
            <button onClick={onClose} className="btn btn-secondary text-sm">Cancel</button>
            <button onClick={() => void handleSave()} disabled={saving} className="btn btn-primary text-sm disabled:opacity-50 inline-flex items-center gap-1.5">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
