'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';

/* ─── Types ──────────────────────────────────────────────────────────── */
interface DepEntry {
  depId: string;
  milestoneId: string;
  title: string;
  state: string;
  plannedEnd?: string | null;
  plannedStart?: string | null;
  dependencyType: string;
  lagDays: number;
}
interface ProjectMilestone {
  id: string;
  title: string;
  state: string;
  phaseName: string | null;
}
interface DepData {
  predecessors: DepEntry[];
  successors: DepEntry[];
  milestones: ProjectMilestone[];
}

/* ─── Helpers ────────────────────────────────────────────────────────── */
const STATE_COLOR: Record<string, string> = {
  VERIFIED: '#22c55e', CLOSED: '#22c55e',
  SUBMITTED: '#f59e0b', IN_PROGRESS: '#3b82f6',
  DRAFT: 'rgba(var(--ax-text-rgb),0.35)',
};
const STATE_LABEL: Record<string, string> = {
  VERIFIED: 'Verified', CLOSED: 'Closed',
  SUBMITTED: 'Submitted', IN_PROGRESS: 'In Progress', DRAFT: 'Draft',
};
/* ─── Component ──────────────────────────────────────────────────────── */
export default function DependencyManager({
  projectId,
  milestoneId,
  canEdit,
}: {
  projectId: string;
  milestoneId: string;
  canEdit: boolean;
}) {
  const url = `/api/projects/${projectId}/milestones/${milestoneId}/dependencies`;
  const { data, isLoading, mutate } = useSWR<DepData>(url, jsonFetcher, {
    revalidateOnFocus: false,
  });

  const [adding, setAdding]           = useState(false);
  const [predId, setPredId]           = useState('');
  const [saving, setSaving]           = useState(false);
  const [removing, setRemoving]       = useState<string | null>(null);
  const [formError, setFormError]     = useState('');

  async function addDep() {
    if (!predId) { setFormError('Please select a milestone'); return; }
    setSaving(true); setFormError('');
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ predecessorId: predId, dependencyType: 'FS', lagDays: 0 }),
    });
    const d = await res.json();
    setSaving(false);
    if (d.success) {
      setAdding(false); setPredId('');
      void mutate();
    } else {
      setFormError(d.error ?? 'Failed to add dependency');
    }
  }

  async function removeDep(depId: string) {
    setRemoving(depId);
    await fetch(`${url}?depId=${depId}`, { method: 'DELETE' });
    setRemoving(null);
    void mutate();
  }

  // Filter out milestones already in predecessors or successors from dropdown
  const alreadyLinked = new Set([
    ...(data?.predecessors.map(p => p.milestoneId) ?? []),
    ...(data?.successors.map(s => s.milestoneId) ?? []),
  ]);
  const available = (data?.milestones ?? []).filter(m => !alreadyLinked.has(m.id));

  const total = (data?.predecessors.length ?? 0) + (data?.successors.length ?? 0);

  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">

      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-[14px] font-semibold text-[#e8e4dc]">
            Dependencies
            {total > 0 && (
              <span className="ml-2 text-[11px] font-normal text-[rgba(232,228,220,0.4)]">
                {total} link{total !== 1 ? 's' : ''}
              </span>
            )}
          </h3>
          <p className="text-[12px] text-[rgba(232,228,220,0.4)] mt-0.5">
            Simple sequence links for the Gantt chart and Critical Path calculation
          </p>
        </div>
        {canEdit && !adding && (
          <button
            onClick={() => { setAdding(true); setFormError(''); }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold transition-all"
            style={{ background: 'rgba(var(--ax-accent-rgb),0.12)', color: 'var(--ax-accent)', border: '1px solid rgba(var(--ax-accent-rgb),0.25)' }}>
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add Predecessor
          </button>
        )}
      </div>

      {/* Add predecessor form */}
      {adding && (
        <div className="bg-[rgba(var(--ax-accent-rgb),0.06)] border border-[rgba(var(--ax-accent-rgb),0.18)] rounded-xl p-4 mb-4">
          <div className="text-[12.5px] font-semibold text-[var(--ax-accent)] mb-3">
            Choose the milestone that must finish before this one starts
          </div>

          {/* Milestone select */}
          <div className="mb-3">
            <label className="block text-[11.5px] text-[rgba(232,228,220,0.55)] mb-1 font-medium">
              Predecessor Milestone
            </label>
            <select
              value={predId}
              onChange={e => setPredId(e.target.value)}
              className="w-full bg-[#0d0d11] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2 text-[13px] text-[#e8e4dc] outline-none focus:border-[rgba(var(--ax-accent-rgb),0.4)]">
              <option value="">— Select milestone —</option>
              {available.map(m => (
                <option key={m.id} value={m.id}>
                  {m.phaseName ? `[${m.phaseName}] ` : ''}{m.title} · {STATE_LABEL[m.state] ?? m.state}
                </option>
              ))}
            </select>
            {available.length === 0 && (
              <p className="text-[11px] text-[rgba(232,228,220,0.35)] mt-1">
                All milestones are already linked.
              </p>
            )}
          </div>

          <div className="text-[11.5px] text-[rgba(232,228,220,0.45)] bg-[rgba(255,255,255,0.03)] rounded-lg px-3 py-2 mb-3">
            The selected milestone will be linked as: finish first → then this milestone can start.
          </div>

          {formError && (
            <p className="text-[12px] text-[#e06050] mb-3">✗ {formError}</p>
          )}

          <div className="flex gap-2">
            <button onClick={addDep} disabled={saving || !predId}
              className="px-4 py-2 rounded-lg text-[13px] font-semibold transition-all disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: 'rgba(var(--ax-accent-rgb),0.2)', color: 'var(--ax-accent)', border: '1px solid rgba(var(--ax-accent-rgb),0.35)' }}>
              {saving ? 'Adding…' : 'Add Dependency'}
            </button>
            <button onClick={() => { setAdding(false); setFormError(''); setPredId(''); }}
              className="px-4 py-2 rounded-lg text-[13px] text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors">
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">
          {[1, 2].map(i => <div key={i} className="h-14 rounded-lg bg-[rgba(255,255,255,0.04)] animate-pulse" />)}
        </div>
      ) : (
        <div className="space-y-4">

          {/* Predecessors */}
          <div>
            <div className="text-[11px] font-semibold text-[rgba(232,228,220,0.4)] uppercase tracking-wide mb-2">
              Waits for ({data?.predecessors.length ?? 0})
            </div>
            {data?.predecessors.length === 0 ? (
              <p className="text-[12.5px] text-[rgba(232,228,220,0.3)] py-2 italic">
                No predecessors — this milestone can start independently.
              </p>
            ) : (
              <div className="space-y-2">
                {data?.predecessors.map(dep => (
                  <DepRow
                    key={dep.depId}
                    dep={dep}
                    direction="predecessor"
                    canEdit={canEdit}
                    removing={removing}
                    onRemove={removeDep}
                  />
                ))}
              </div>
            )}
          </div>

          {/* Successors */}
          <div>
            <div className="text-[11px] font-semibold text-[rgba(232,228,220,0.4)] uppercase tracking-wide mb-2">
              Unblocks ({data?.successors.length ?? 0})
            </div>
            {data?.successors.length === 0 ? (
              <p className="text-[12.5px] text-[rgba(232,228,220,0.3)] py-2 italic">
                No successors — nothing is waiting on this milestone.
              </p>
            ) : (
              <div className="space-y-2">
                {data?.successors.map(dep => (
                  <DepRow
                    key={dep.depId}
                    dep={dep}
                    direction="successor"
                    canEdit={false}
                    removing={removing}
                    onRemove={removeDep}
                  />
                ))}
              </div>
            )}
          </div>

          {total === 0 && !adding && (
            <div className="text-center py-4">
              <p className="text-[12.5px] text-[rgba(232,228,220,0.35)]">
                No dependencies set. This milestone is independent.
              </p>
              {canEdit && (
                <p className="text-[11.5px] text-[rgba(232,228,220,0.25)] mt-1">
                  Add one predecessor when this milestone must wait for another one to finish.
                </p>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ─── Dep Row ─────────────────────────────────────────────────────────── */
function DepRow({
  dep, direction, canEdit, removing, onRemove,
}: {
  dep: DepEntry;
  direction: 'predecessor' | 'successor';
  canEdit: boolean;
  removing: string | null;
  onRemove: (id: string) => void;
}) {
  const stateC = STATE_COLOR[dep.state] ?? 'rgba(var(--ax-text-rgb),0.3)';
  const stateL = STATE_LABEL[dep.state] ?? dep.state;
  const date = direction === 'predecessor' ? dep.plannedEnd : dep.plannedStart;

  return (
    <div className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
      {/* Direction arrow */}
      <span className="text-[rgba(232,228,220,0.3)] text-[11px] shrink-0">
        {direction === 'predecessor' ? '←' : '→'}
      </span>

      {/* Milestone info */}
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-semibold text-[#e8e4dc] truncate">{dep.title}</div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded"
            style={{ background: `${stateC}22`, color: stateC }}>
            {stateL}
          </span>
          {date && (
            <span className="text-[10.5px] text-[rgba(232,228,220,0.4)]">
              {direction === 'predecessor' ? 'Ends' : 'Starts'}: {formatDate(date)}
            </span>
          )}
        </div>
      </div>

      {/* Dependency meaning badge */}
      <div className="flex flex-col items-center gap-0.5 shrink-0">
        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[rgba(var(--ax-accent-rgb),0.1)] text-[var(--ax-accent)] border border-[rgba(var(--ax-accent-rgb),0.2)]">
          {dep.dependencyType === 'FS' && dep.lagDays === 0 ? 'After finish' : 'Custom link'}
        </span>
        {dep.lagDays !== 0 && (
          <span className="text-[10px] text-[rgba(232,228,220,0.4)]">
            {dep.lagDays > 0 ? `+${dep.lagDays}d lag` : `${dep.lagDays}d lead`}
          </span>
        )}
      </div>

      {/* Remove button (predecessors only, OWNER/PMC) */}
      {canEdit && direction === 'predecessor' && (
        <button
          onClick={() => onRemove(dep.depId)}
          disabled={removing === dep.depId}
          className="p-1.5 rounded-lg text-[rgba(232,228,220,0.3)] hover:text-[#e06050] hover:bg-[rgba(224,96,80,0.1)] transition-all disabled:opacity-40"
          title="Remove dependency">
          {removing === dep.depId ? (
            <span className="text-[11px]">…</span>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
