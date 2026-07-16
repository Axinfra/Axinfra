'use client';

import { useState } from 'react';
import { X, Upload } from 'lucide-react';

/** Upload modal for issuing a Work Order (R0) or adding a new revision (R1, R2...) to an
 * existing one. `isRevision` toggles the reason field, which is required for revisions. */
export default function WorkOrderUploadModal({
  title,
  isRevision,
  submitUrl,
  onClose,
  onSaved,
}: {
  title: string;
  isRevision: boolean;
  submitUrl: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [issueDate, setIssueDate] = useState(new Date().toISOString().slice(0, 10));
  const [plannedStart, setPlannedStart] = useState('');
  const [plannedEnd, setPlannedEnd] = useState('');
  const [remarks, setRemarks] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = !!file && !!issueDate && (!isRevision || reason.trim().length > 0);

  const handleSubmit = async () => {
    if (!canSubmit || !file) return;
    setSaving(true);
    setError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('issueDate', issueDate);
      if (plannedStart) formData.append('plannedStart', plannedStart);
      if (plannedEnd) formData.append('plannedEnd', plannedEnd);
      if (remarks.trim()) formData.append('remarks', remarks.trim());
      if (isRevision) formData.append('reason', reason.trim());

      const res = await fetch(submitUrl, { method: 'POST', body: formData });
      const data = await res.json();
      if (data.success) {
        onSaved();
        onClose();
      } else {
        setError(data.error ?? 'Failed to upload');
      }
    } catch {
      setError('Failed to upload. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#e8e4dc]">{title}</h2>
            <button onClick={onClose} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && <div className="alert alert-error text-sm">{error}</div>}

          <div>
            <label className="label text-xs">Work Order File</label>
            <input
              type="file"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.webp"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="input text-sm"
            />
          </div>

          {isRevision && (
            <div>
              <label className="label text-xs">Reason for Revision</label>
              <textarea
                autoFocus
                rows={3}
                className="input text-sm resize-none"
                placeholder="e.g. Updated rates per client's request…"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          )}

          <div>
            <label className="label text-xs">Issue Date</label>
            <input type="date" className="input text-sm" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Planned Start</label>
              <input type="date" className="input text-sm" value={plannedStart} onChange={(e) => setPlannedStart(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Planned End</label>
              <input type="date" className="input text-sm" value={plannedEnd} onChange={(e) => setPlannedEnd(e.target.value)} />
            </div>
          </div>

          <div>
            <label className="label text-xs">Remarks (optional)</label>
            <textarea
              rows={2}
              className="input text-sm resize-none"
              placeholder="e.g. Site handover pending client NOC…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-[rgba(255,255,255,0.07)]">
            <button onClick={onClose} className="btn btn-secondary text-sm">Cancel</button>
            <button
              onClick={() => void handleSubmit()}
              disabled={!canSubmit || saving}
              className="btn btn-primary text-sm disabled:opacity-50 inline-flex items-center gap-1.5"
            >
              <Upload className="w-4 h-4" /> {saving ? 'Uploading…' : 'Upload'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
