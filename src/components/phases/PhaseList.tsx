'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ChevronDown, ChevronRight, CheckCircle2, Calendar } from 'lucide-react';
import { Skeleton } from '@/components/ui/Skeleton';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';

interface PhaseBOQ {
  id: string;
  status: string;
}

interface Phase {
  id: string;
  name: string;
  sortOrder: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  createdAt: string;
  boq: PhaseBOQ | null;
  milestonesCount: number;
}

interface Props {
  projectId: string;
  userRole: 'CLIENT' | 'PMC' | 'VENDOR' | 'VIEWER' | string;
}

function BOQStatusBadge({ status }: { status: string }) {
  if (status === 'APPROVED') {
    return (
      <span className="inline-flex items-center gap-1 badge badge-verified text-xs">
        <CheckCircle2 className="w-3 h-3" />
        Approved
      </span>
    );
  }
  if (status === 'PENDING_APPROVAL') {
    return (
      <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,179,8,0.15)] text-[#eab308] font-medium">
        Pending Approval
      </span>
    );
  }
  if (status === 'REVISED') {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs px-2 py-0.5 rounded-full bg-[rgba(234,88,12,0.12)] text-[#f97316] font-medium">
          Needs Revision
        </span>
        <span className="text-xs text-[rgba(249,115,22,0.7)]">Re-approval needed</span>
      </span>
    );
  }
  return <span className="badge badge-draft text-xs">Draft</span>;
}

export default function PhaseList({ projectId, userRole }: Props) {
  const router = useRouter();

  const canEdit   = userRole === 'CLIENT' || userRole === 'PMC';
  const canDelete = userRole === 'CLIENT';

  const {
    data: phases = [],
    isLoading,
    mutate: refetch,
  } = useSWR<Phase[]>(
    projectId ? `/api/projects/${projectId}/phases` : null,
    jsonFetcher,
    { dedupingInterval: 5_000 },
  );

  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggleExpand = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const isExpanded = (id: string) => !expanded.has(id);

  // Add phase modal
  const [showAdd, setShowAdd]           = useState(false);
  const [newName, setNewName]           = useState('');
  const [newStart, setNewStart]         = useState('');
  const [newEnd, setNewEnd]             = useState('');
  const [adding, setAdding]             = useState(false);

  // Inline edit
  const [editingId, setEditingId]       = useState<string | null>(null);
  const [editName, setEditName]         = useState('');
  const [saving, setSaving]             = useState(false);

  // Delete confirm
  const [deleteId, setDeleteId]         = useState<string | null>(null);
  const [deleteError, setDeleteError]   = useState('');
  const [deleting, setDeleting]         = useState(false);

  const [apiError, setApiError]         = useState('');

  // ── Handlers ────────────────────────────────────────────────────────────────

  const handleAddPhase = async () => {
    const name = newName.trim();
    if (!name) return;
    if (newStart && newEnd && newStart >= newEnd) {
      setApiError('Start date must be before end date');
      return;
    }
    setAdding(true);
    setApiError('');

    const tempId = `temp-${Date.now()}`;
    void refetch(
      (current = []) => [
        ...current,
        {
          id: tempId,
          name,
          sortOrder: (current[current.length - 1]?.sortOrder ?? 0) + 1,
          plannedStart: newStart || null,
          plannedEnd: newEnd || null,
          createdAt: new Date().toISOString(),
          boq: null,
          milestonesCount: 0,
        },
      ],
      { revalidate: false },
    );

    setShowAdd(false);
    setNewName('');
    setNewStart('');
    setNewEnd('');

    try {
      const res = await fetch(`/api/projects/${projectId}/phases`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          plannedStart: newStart || undefined,
          plannedEnd:   newEnd   || undefined,
        }),
      });
      const json = await res.json();
      if (json.success) {
        void refetch();
      } else {
        void refetch();
        setApiError(json.error ?? 'Failed to create phase');
        setShowAdd(true);
        setNewName(name);
      }
    } catch {
      void refetch();
      setApiError('An error occurred');
      setShowAdd(true);
      setNewName(name);
    } finally {
      setAdding(false);
    }
  };

  const handleRename = async (phaseId: string) => {
    const name = editName.trim();
    if (!name) return;
    setSaving(true);
    setApiError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/phases/${phaseId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
      const json = await res.json();
      if (json.success) {
        setEditingId(null);
        void refetch();
      } else {
        setApiError(json.error ?? 'Failed to update phase');
      }
    } catch {
      setApiError('An error occurred');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (phaseId: string) => {
    setDeleting(true);
    setDeleteError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/phases/${phaseId}`, {
        method: 'DELETE',
      });
      const json = await res.json();
      if (json.success) {
        setDeleteId(null);
        void refetch();
      } else {
        setDeleteError(json.error ?? 'Failed to delete phase');
      }
    } catch {
      setDeleteError('An error occurred');
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateBOQ = (phaseId: string) => {
    router.push(`/projects/${projectId}/boq?phaseId=${phaseId}`);
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-3">
        <div className="flex justify-between items-center">
          <Skeleton className="h-7 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex justify-between items-center">
        <h2 className="text-lg font-semibold text-[#e8e4dc]">Phases</h2>
        {canEdit && (
          <button
            onClick={() => { setShowAdd(true); setApiError(''); }}
            className="btn btn-sm btn-primary"
          >
            + Add Phase
          </button>
        )}
      </div>

      {apiError && <div className="alert alert-error">{apiError}</div>}

      {/* Empty state */}
      {phases.length === 0 && (
        <div className="card">
          <div className="card-body text-center py-10">
            <p className="text-[rgba(232,228,220,0.55)]">
              No phases yet. Add your first phase to get started.
            </p>
          </div>
        </div>
      )}

      {/* Phase rows */}
      {phases.map((phase) => {
        const open = isExpanded(phase.id);
        const isEditing = editingId === phase.id;

        return (
          <div
            key={phase.id}
            className="card border border-[rgba(255,255,255,0.07)]"
          >
            {/* Phase header row */}
            <div className="card-body py-3 px-4">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => toggleExpand(phase.id)}
                  className="text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors shrink-0"
                  aria-label={open ? 'Collapse' : 'Expand'}
                >
                  {open
                    ? <ChevronDown className="w-4 h-4" />
                    : <ChevronRight className="w-4 h-4" />}
                </button>

                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      autoFocus
                      type="text"
                      className="input py-1 text-sm flex-1"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') void handleRename(phase.id);
                        if (e.key === 'Escape') setEditingId(null);
                      }}
                    />
                    <button
                      onClick={() => void handleRename(phase.id)}
                      disabled={saving}
                      className="btn btn-sm btn-primary"
                    >
                      {saving ? '…' : 'Save'}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      className="btn btn-sm btn-secondary"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-[#e8e4dc] truncate block">
                      {phase.name}
                    </span>
                    {(phase.plannedStart || phase.plannedEnd) && (
                      <span className="flex items-center gap-1 text-[11px] text-[rgba(232,228,220,0.38)] mt-0.5">
                        <Calendar className="w-3 h-3 shrink-0" />
                        {phase.plannedStart ? formatDate(phase.plannedStart) : '—'}
                        {' → '}
                        {phase.plannedEnd ? formatDate(phase.plannedEnd) : '—'}
                      </span>
                    )}
                  </div>
                )}

                {!isEditing && canEdit && (
                  <button
                    onClick={() => { setEditingId(phase.id); setEditName(phase.name); setApiError(''); }}
                    className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[var(--ax-accent)] transition-colors"
                  >
                    Edit
                  </button>
                )}
                {!isEditing && canDelete && (
                  <button
                    onClick={() => { setDeleteId(phase.id); setDeleteError(''); }}
                    className="text-xs text-[rgba(232,228,220,0.45)] hover:text-[#e06050] transition-colors"
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>

            {/* Expanded detail */}
            {open && (
              <div className="border-t border-[rgba(255,255,255,0.06)] px-4 py-3 space-y-2">
                {/* Dates row */}
                {(phase.plannedStart || phase.plannedEnd) && (
                  <div className="flex items-center gap-2 text-sm text-[rgba(232,228,220,0.65)]">
                    <span className="w-1 h-1 rounded-full bg-[rgba(232,228,220,0.3)]" />
                    <Calendar className="w-3.5 h-3.5 shrink-0 text-[var(--ax-accent)]" />
                    <span>
                      {phase.plannedStart ? formatDate(phase.plannedStart) : '—'}
                      {' → '}
                      {phase.plannedEnd ? formatDate(phase.plannedEnd) : '—'}
                    </span>
                    <button
                      onClick={() => router.push(`/projects/${projectId}/schedule`)}
                      className="text-xs text-[var(--ax-accent)] hover:underline ml-1"
                    >
                      Edit in Schedule
                    </button>
                  </div>
                )}

                {/* BOQ row */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-[rgba(232,228,220,0.65)]">
                    <span className="w-1 h-1 rounded-full bg-[rgba(232,228,220,0.3)]" />
                    {phase.boq ? (
                      <>
                        <span>BOQ:</span>
                        <BOQStatusBadge status={phase.boq.status} />
                      </>
                    ) : (
                      <span>No BOQ yet</span>
                    )}
                  </div>
                  <div>
                    {phase.boq ? (
                      <button
                        onClick={() => router.push(`/projects/${projectId}/boq?phaseId=${phase.id}`)}
                        className="btn btn-sm btn-secondary text-xs"
                      >
                        View BOQ
                      </button>
                    ) : userRole === 'PMC' ? (
                      <button
                        onClick={() => handleCreateBOQ(phase.id)}
                        className="btn btn-sm btn-primary text-xs"
                      >
                        + Create BOQ
                      </button>
                    ) : null}
                  </div>
                </div>

                {/* Milestones row */}
                <div className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2 text-[rgba(232,228,220,0.65)]">
                    <span className="w-1 h-1 rounded-full bg-[rgba(232,228,220,0.3)]" />
                    <span>
                      Milestones:{' '}
                      <span className="text-[#e8e4dc] font-medium">
                        {phase.milestonesCount}
                      </span>
                    </span>
                  </div>
                  <button
                    onClick={() =>
                      router.push(`/projects/${projectId}/milestones?phaseId=${phase.id}`)
                    }
                    className="btn btn-sm btn-secondary text-xs"
                  >
                    View Milestones
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {/* Add Phase modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4 text-[#e8e4dc]">Add Phase</h2>
              <div className="space-y-4">
                <div>
                  <label className="label">Phase Name <span className="text-[#e06050]">*</span></label>
                  <input
                    autoFocus
                    type="text"
                    className="input"
                    placeholder="e.g. Phase 0 — Foundation"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleAddPhase(); }}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Start Date</label>
                    <input
                      type="date"
                      className="input text-sm"
                      value={newStart}
                      onChange={(e) => setNewStart(e.target.value)}
                    />
                  </div>
                  <div>
                    <label className="label">End Date</label>
                    <input
                      type="date"
                      className="input text-sm"
                      value={newEnd}
                      min={newStart || undefined}
                      onChange={(e) => setNewEnd(e.target.value)}
                    />
                  </div>
                </div>
                <p className="text-xs text-[rgba(232,228,220,0.35)]">
                  Dates are optional. All team members will be notified when the phase is created.
                </p>
                {apiError && (
                  <p className="text-sm text-[#e06050]">{apiError}</p>
                )}
                <div className="flex justify-end gap-3 pt-1">
                  <button
                    onClick={() => { setShowAdd(false); setNewName(''); setNewStart(''); setNewEnd(''); setApiError(''); }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => void handleAddPhase()}
                    disabled={adding || !newName.trim()}
                    className="btn btn-primary disabled:opacity-50"
                  >
                    {adding ? 'Creating…' : 'Create Phase'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation modal */}
      {deleteId && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-[#e06050]">Delete Phase</h2>
              <p className="text-[rgba(232,228,220,0.55)] mb-4">
                Are you sure? This cannot be undone.
                {phases.find((p) => p.id === deleteId)?.boq && (
                  <span className="block mt-1 text-[rgba(var(--ax-accent-rgb),0.8)] text-sm">
                    The BOQ linked to this phase will also be deleted.
                  </span>
                )}
              </p>
              {deleteError && (
                <div className="alert alert-error mb-4 text-sm">{deleteError}</div>
              )}
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => { setDeleteId(null); setDeleteError(''); }}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleDelete(deleteId)}
                  disabled={deleting}
                  className="btn bg-[#e06050] text-white hover:bg-[#c8503f] disabled:opacity-50"
                >
                  {deleting ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
