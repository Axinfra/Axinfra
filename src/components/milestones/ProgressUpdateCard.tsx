'use client';

import { useRef, useState } from 'react';
import { Paperclip, X, FileText, Image as ImageIcon, TrendingUp } from 'lucide-react';

const QUICK_VALUES = [0, 25, 50, 75, 100];

/** PMC's single entry point for moving an activity's progress. Slider + quick-pick buttons +
 * remarks + optional photos/documents, one "Save Update" action. Every save appends a new
 * history entry server-side — it never overwrites the previous one — and status (Not
 * Started/In Progress/Completed) is derived automatically from the percentage; there is no
 * separate status control anywhere in this card. */
export default function ProgressUpdateCard({
  projectId,
  milestoneId,
  currentPercent,
  onSaved,
}: {
  projectId: string;
  milestoneId: string;
  currentPercent: number;
  onSaved: () => void;
}) {
  const [percent, setPercent] = useState(currentPercent);
  const [remarks, setRemarks] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const dirty = percent !== currentPercent || remarks.trim() !== '' || files.length > 0;

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const formData = new FormData();
      formData.set('percentComplete', String(percent));
      if (remarks.trim()) formData.set('remarks', remarks.trim());
      for (const file of files) formData.append('files', file);

      const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/progress-update`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (data.success) {
        setSaved(true);
        setRemarks('');
        setFiles([]);
        onSaved();
      } else {
        setError(data.error ?? 'Failed to save update');
      }
    } catch {
      setError('Failed to save update');
    } finally {
      setSaving(false);
    }
  };

  const statusLabel = percent <= 0 ? 'Not Started' : percent >= 100 ? 'Completed' : 'In Progress';
  const statusColor = percent <= 0 ? 'rgba(232,228,220,0.5)' : percent >= 100 ? '#5cba80' : '#38bdf8';

  return (
    <div className="card border-[rgba(var(--ax-accent-rgb),0.2)]">
      <div className="card-header flex items-center gap-2">
        <TrendingUp className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
        <h2 className="text-base font-semibold">Update Progress</h2>
      </div>
      <div className="card-body space-y-5">
        {error && <div className="alert alert-error text-sm">{error}</div>}

        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="label mb-0">Progress</label>
            <span className="text-sm font-bold" style={{ color: statusColor }}>
              {percent}% · {statusLabel}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={percent}
            onChange={(e) => { setPercent(Number(e.target.value)); setSaved(false); }}
            className="w-full accent-[var(--ax-accent)]"
          />
          <div className="flex gap-2 mt-3 flex-wrap">
            {QUICK_VALUES.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => { setPercent(v); setSaved(false); }}
                className={`px-3 py-1 text-xs font-semibold rounded-full border transition-colors ${
                  percent === v
                    ? 'bg-[var(--ax-accent)] text-white border-[var(--ax-accent)]'
                    : 'bg-[rgba(255,255,255,0.04)] text-[rgba(232,228,220,0.65)] border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.07)]'
                }`}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label">Remarks</label>
          <textarea
            rows={3}
            className="input resize-none text-sm w-full"
            placeholder="What was done in this update…"
            value={remarks}
            onChange={(e) => { setRemarks(e.target.value); setSaved(false); }}
          />
        </div>

        <div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={(e) => { setFiles((prev) => [...prev, ...Array.from(e.target.files ?? [])]); setSaved(false); }}
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.07)] text-[rgba(232,228,220,0.7)] border border-[rgba(255,255,255,0.08)] transition-colors"
          >
            <Paperclip className="w-3.5 h-3.5" /> Attach photos/documents
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
                  <button type="button" onClick={() => setFiles((prev) => prev.filter((_, idx) => idx !== i))} className="hover:text-[#e06050] transition-colors">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 pt-1 border-t border-[rgba(255,255,255,0.07)]">
          {saved && <span className="text-sm" style={{ color: '#5cba80' }}>Saved</span>}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="btn btn-primary text-sm disabled:opacity-50"
          >
            {saving ? 'Saving…' : 'Save Update'}
          </button>
        </div>
      </div>
    </div>
  );
}
