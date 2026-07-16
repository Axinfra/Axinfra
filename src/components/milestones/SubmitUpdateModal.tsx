'use client';

import { useRef, useState } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon } from 'lucide-react';

interface SubmitUpdateModalProps {
  projectId: string;
  milestoneId: string;
  onClose: () => void;
  onSuccess: () => void;
}

/** Vendor's "Attach Documents" modal — optional, non-blocking. Attach a note and/or site
 * photos/files. Purely supplementary evidence; PMC owns progress/status exclusively. */
export default function SubmitUpdateModal({ projectId, milestoneId, onClose, onSuccess }: SubmitUpdateModalProps) {
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canSubmit = !!remarks.trim() || files.length > 0;

  const handleSubmit = async () => {
    if (!canSubmit) {
      setError('Add a note or attach at least one file');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const formData = new FormData();
      if (remarks.trim()) formData.set('remarks', remarks.trim());
      for (const file of files) formData.append('files', file);
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/submission`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        onSuccess();
        onClose();
      } else {
        setError(data.error ?? 'Failed to submit update');
      }
    } catch {
      setError('Failed to submit update');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[rgba(var(--ax-accent-rgb),0.12)] flex items-center justify-center shrink-0">
                <Paperclip className="w-4 h-4 text-[var(--ax-accent)]" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-[#e8e4dc]">Attach Documents</h2>
                <p className="text-xs text-[rgba(232,228,220,0.45)]">Optional — site photos or documents for this activity</p>
              </div>
            </div>
            <button onClick={onClose} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          {error && <div className="alert alert-error text-sm">{error}</div>}

          <textarea
            rows={3}
            className="input resize-none text-sm w-full"
            placeholder="Progress note (optional)…"
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            autoFocus
          />

          <div>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={(e) => setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])])}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.07)] text-[rgba(232,228,220,0.7)] border border-[rgba(255,255,255,0.08)] transition-colors"
            >
              <Paperclip className="w-3.5 h-3.5" /> Attach files
            </button>

            {files.length > 0 && (
              <div className="flex flex-wrap gap-2 mt-2.5">
                {files.map((file, i) => (
                  <span
                    key={`${file.name}-${i}`}
                    className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1 text-xs rounded-md bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.75)] border border-[rgba(255,255,255,0.07)]"
                  >
                    {file.type.startsWith('image/') ? <ImageIcon className="w-3 h-3" /> : <FileText className="w-3 h-3" />}
                    <span className="max-w-[160px] truncate">{file.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))}
                      className="hover:text-[#e06050] transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2 border-t border-[rgba(255,255,255,0.07)]">
            <button onClick={onClose} className="btn btn-secondary text-sm">Cancel</button>
            <button
              onClick={handleSubmit}
              disabled={submitting || !canSubmit}
              className="btn btn-primary text-sm disabled:opacity-50"
            >
              {submitting ? 'Attaching…' : 'Attach Documents'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
