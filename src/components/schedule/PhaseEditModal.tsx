'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { X, Save } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';

interface EditablePhase {
  id: string;
  name: string;
  description?: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  sortOrder?: number;
  vendorUserId?: string | null;
}

interface VendorOption {
  userId: string | null;
  name: string;
  email: string;
  isPendingInvite: boolean;
}

function toDateInput(v: string | null): string {
  return v ? v.slice(0, 10) : '';
}

/** Edit modal for a Phase/Subphase — name, description, planned dates, display order (sortOrder),
 * and an optional assigned vendor. Same PATCH-and-refresh workflow as MilestoneEditModal, backed
 * by the existing /api/projects/[projectId]/phases/[phaseId] route. */
export default function PhaseEditModal({
  projectId,
  phase,
  onClose,
  onSaved,
}: {
  projectId: string;
  phase: EditablePhase;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState(phase.name);
  const [description, setDescription] = useState(phase.description ?? '');
  const [plannedStart, setPlannedStart] = useState(toDateInput(phase.plannedStart));
  const [plannedEnd, setPlannedEnd] = useState(toDateInput(phase.plannedEnd));
  const [sortOrder, setSortOrder] = useState(phase.sortOrder?.toString() ?? '0');
  const [vendorUserId, setVendorUserId] = useState(phase.vendorUserId ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const { data: vendorsPayload, isLoading: vendorsLoading } = useSWR<VendorOption[]>(
    projectId ? `/api/admin/vendors?projectId=${projectId}` : null,
    jsonFetcher,
  );
  const vendors = (vendorsPayload ?? []).filter((v) => !v.isPendingInvite && v.userId);

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/phases/${phase.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || null,
          plannedStart: plannedStart || null,
          plannedEnd: plannedEnd || null,
          sortOrder: sortOrder === '' ? undefined : Number(sortOrder),
          vendorUserId: vendorUserId || null,
        }),
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
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#e8e4dc]">Edit Phase</h2>
            <button onClick={onClose} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && <div className="alert alert-error text-sm">{error}</div>}

          <div>
            <label className="label text-xs">Name</label>
            <input type="text" className="input text-sm" value={name} onChange={(e) => setName(e.target.value)} autoFocus />
          </div>

          <div>
            <label className="label text-xs">Description</label>
            <textarea
              className="input text-sm resize-none" rows={3}
              placeholder="Optional notes about this phase…"
              value={description} onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Planned Start</label>
              <input type="date" className="input text-sm" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Planned Finish</label>
              <input type="date" className="input text-sm" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Display Order</label>
              <input type="number" className="input text-sm" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Assigned Vendor</label>
              <select
                className="input text-sm" value={vendorUserId}
                onChange={(e) => setVendorUserId(e.target.value)}
                disabled={vendorsLoading}
              >
                <option value="">Unassigned</option>
                {vendors.map((v) => (
                  <option key={v.userId} value={v.userId!}>{v.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-[rgba(255,255,255,0.07)]">
            <button onClick={onClose} className="btn btn-secondary text-sm">Cancel</button>
            <button onClick={() => void handleSave()} disabled={saving} className="btn btn-primary text-sm disabled:opacity-50 inline-flex items-center gap-1.5">
              <Save className="w-4 h-4" /> {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
