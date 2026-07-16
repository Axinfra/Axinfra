'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { X } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';

interface RevisionSnapshot {
  revisionNumber: number;
  issueDate: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  remarks: string | null;
  fileName: string;
  reason: string | null;
  createdAt: string;
  createdBy: { name: string };
}

interface CompareResult {
  a: RevisionSnapshot;
  b: RevisionSnapshot;
}

const FIELDS: Array<{ key: keyof RevisionSnapshot; label: string; format?: (v: unknown) => string }> = [
  { key: 'issueDate', label: 'Issue Date', format: (v) => (v ? formatDate(v as string) : '—') },
  { key: 'plannedStart', label: 'Planned Start', format: (v) => (v ? formatDate(v as string) : '—') },
  { key: 'plannedEnd', label: 'Planned End', format: (v) => (v ? formatDate(v as string) : '—') },
  { key: 'fileName', label: 'Uploaded File' },
  { key: 'remarks', label: 'Remarks', format: (v) => (v as string) || '—' },
  { key: 'reason', label: 'Reason', format: (v) => (v as string) || '—' },
  { key: 'createdBy', label: 'Created By', format: (v) => (v as { name: string })?.name ?? '—' },
];

/** Two-revision selector + field-by-field diff table, with changed values highlighted. */
export default function WorkOrderRevisionCompare({
  projectId,
  workOrderId,
  revisions,
  onClose,
}: {
  projectId: string;
  workOrderId: string;
  revisions: Array<{ revisionNumber: number }>;
  onClose: () => void;
}) {
  const sorted = [...revisions].sort((r1, r2) => r2.revisionNumber - r1.revisionNumber);
  const [revA, setRevA] = useState(sorted[1]?.revisionNumber ?? sorted[0]?.revisionNumber ?? 0);
  const [revB, setRevB] = useState(sorted[0]?.revisionNumber ?? 0);

  const { data, isLoading } = useSWR<CompareResult>(
    `/api/projects/${projectId}/work-orders/${workOrderId}/revisions/compare?a=${revA}&b=${revB}`,
    jsonFetcher,
  );

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-[#e8e4dc]">Compare Revisions</h2>
            <button onClick={onClose} className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label text-xs">Revision A</label>
              <select className="input text-sm" value={revA} onChange={(e) => setRevA(Number(e.target.value))}>
                {sorted.map((r) => (
                  <option key={r.revisionNumber} value={r.revisionNumber}>R{r.revisionNumber}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label text-xs">Revision B</label>
              <select className="input text-sm" value={revB} onChange={(e) => setRevB(Number(e.target.value))}>
                {sorted.map((r) => (
                  <option key={r.revisionNumber} value={r.revisionNumber}>R{r.revisionNumber}</option>
                ))}
              </select>
            </div>
          </div>

          {isLoading ? (
            <p className="text-sm text-[rgba(232,228,220,0.45)] py-6 text-center">Loading…</p>
          ) : !data ? (
            <p className="text-sm text-[#e06050] py-6 text-center">Could not load revisions</p>
          ) : (
            <div className="rounded-lg border border-[rgba(255,255,255,0.07)] overflow-hidden">
              <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[rgba(255,255,255,0.03)] border-b border-[rgba(255,255,255,0.06)]">
                    <th className="text-left px-3 py-2 text-xs text-[rgba(232,228,220,0.45)] font-medium">Field</th>
                    <th className="text-left px-3 py-2 text-xs text-[rgba(232,228,220,0.45)] font-medium">R{data.a.revisionNumber}</th>
                    <th className="text-left px-3 py-2 text-xs text-[rgba(232,228,220,0.45)] font-medium">R{data.b.revisionNumber}</th>
                  </tr>
                </thead>
                <tbody>
                  {FIELDS.map(({ key, label, format }) => {
                    const rawA = data.a[key];
                    const rawB = data.b[key];
                    const valA = format ? format(rawA) : String(rawA ?? '—');
                    const valB = format ? format(rawB) : String(rawB ?? '—');
                    const changed = valA !== valB;
                    return (
                      <tr key={key} className="border-b border-[rgba(255,255,255,0.04)] last:border-0">
                        <td className="px-3 py-2 text-[rgba(232,228,220,0.55)]">{label}</td>
                        <td className={`px-3 py-2 ${changed ? 'bg-[rgba(234,179,8,0.12)] text-[#eab308] font-medium' : 'text-[#e8e4dc]'}`}>{valA}</td>
                        <td className={`px-3 py-2 ${changed ? 'bg-[rgba(234,179,8,0.12)] text-[#eab308] font-medium' : 'text-[#e8e4dc]'}`}>{valB}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2 border-t border-[rgba(255,255,255,0.07)]">
            <button onClick={onClose} className="btn btn-secondary text-sm">Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
