'use client';

import { FormPageSkeleton } from '@/components/ui/SkeletonPage';
import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface VendorUser {
  userId: string;
  name: string;
  email: string;
}

interface BOQItem {
  id: string;
  description: string;
  unit: string;
  plannedQty: number;
  rate: number;
  plannedValue: number;
}

interface BOQ {
  id: string;
  phaseId: string | null;
  status: string;
  items: BOQItem[];
}

interface Phase {
  id: string;
  name: string;
}

interface ExistingMilestone {
  id: string;
  title: string;
  state: string;
  phaseName: string | null;
}

interface PredecessorEntry {
  milestoneId: string;
  title: string;
  dependencyType: string;
  lagDays: number;
}

export default function CreateMilestonePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledPhaseId = searchParams.get('phaseId') ?? '';
  const projectId = params.projectId as string;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [predecessors, setPredecessors] = useState<PredecessorEntry[]>([]);
  const [addingPred, setAddingPred] = useState(false);
  const [newPredId, setNewPredId] = useState('');
  const [newPredType, setNewPredType] = useState('FS');
  const [newPredLag, setNewPredLag] = useState(0);

  const [form, setForm] = useState({
    title: '',
    description: '',
    plannedStart: '',
    plannedEnd: '',
    value: '',
    advancePercent: '',
    isExtra: false,
    selectedBoqItemId: '',
    boqQty: '',
    vendorUserId: '',
    phaseId: prefilledPhaseId,
  });

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const canEdit =
    ((project?.permissions ?? {}) as Record<string, boolean>).canEditMilestones === true;
  const isOwner = myRole === 'CLIENT';
  const isOwnerOrPMC = myRole === 'CLIENT' || myRole === 'PMC';

  const { data: boqs, isLoading: boqLoading } = useSWR<BOQ[]>(
    projectId ? `/api/projects/${projectId}/boq` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );

  const { data: vendorsPayload, isLoading: vendorsLoading } = useSWR<VendorUser[]>(
    projectId && isOwnerOrPMC ? `/api/admin/vendors?projectId=${projectId}` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );

  const { data: phases = [] } = useSWR<Phase[]>(
    projectId ? `/api/projects/${projectId}/phases` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );

  // Fetch existing milestones so the user can pick predecessors
  // jsonFetcher already unwraps body.data, so the result is the array directly
  const { data: existingMsRaw } = useSWR<ExistingMilestone[]>(
    projectId ? `/api/projects/${projectId}/milestones?all=true` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );
  const existingMilestones: ExistingMilestone[] = (existingMsRaw ?? []).map((m: { id: string; title: string; state: string; phaseId?: string | null }) => ({
    id: m.id, title: m.title, state: m.state,
    phaseName: phases.find((p) => p.id === m.phaseId)?.name ?? null,
  }));

  const boqItems: BOQItem[] = (() => {
    if (!form.phaseId) return [];
    const phaseBoq = (boqs ?? []).find(
      (b) => b.phaseId === form.phaseId && b.status === 'APPROVED'
    );
    return phaseBoq ? phaseBoq.items ?? [] : [];
  })();
  const vendors: VendorUser[] = vendorsPayload ?? [];
  const loading = projectLoading || boqLoading || (isOwnerOrPMC && vendorsLoading);

  // Surface permission error once project loads.
  useEffect(() => {
    if (!projectLoading && project && !canEdit) {
      setError('You do not have permission to create milestones.');
    }
  }, [projectLoading, project, canEdit]);

  const updateForm = (updates: Partial<typeof form>) => {
    setForm((prev) => ({ ...prev, ...updates }));
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) {
      setError('Title is required');
      return;
    }
    if (form.plannedStart && form.plannedEnd && new Date(form.plannedEnd) < new Date(form.plannedStart)) {
      setError('Planned end date must be after planned start date.');
      return;
    }

    setSubmitting(true);
    setError('');

    const effectiveIsExtra = isOwner || form.isExtra || !form.phaseId;
    const boqLinks =
      !effectiveIsExtra && form.selectedBoqItemId && form.boqQty
        ? [{ boqItemId: form.selectedBoqItemId, plannedQty: parseFloat(form.boqQty) }]
        : undefined;

    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          plannedStart: form.plannedStart || undefined,
          plannedEnd: form.plannedEnd || undefined,
          value: form.value ? parseFloat(form.value) : 0,
          advancePercent: form.advancePercent ? parseFloat(form.advancePercent) : 0,
          isExtra: effectiveIsExtra,
          vendorUserId: form.vendorUserId || null,
          phaseId: effectiveIsExtra ? null : form.phaseId || null,
          boqLinks,
          predecessorLinks: predecessors.length > 0
            ? predecessors.map(p => ({ predecessorId: p.milestoneId, dependencyType: p.dependencyType, lagDays: p.lagDays }))
            : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/projects/${projectId}/milestones`);
      } else {
        setError(data.error || 'Failed to create milestone');
      }
    } catch {
      setError('An error occurred while creating the milestone');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12 text-[rgba(232,228,220,0.35)]">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="max-w-3xl mx-auto">
        {/* Page header */}
        <div className="mb-8">
          <Link
            href={`/projects/${projectId}/milestones`}
            className="inline-flex items-center gap-1.5 text-sm text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Milestones
          </Link>
          <h1 className="text-2xl font-bold text-[#e8e4dc] mt-3">Create Milestone</h1>
          <p className="text-[rgba(232,228,220,0.55)] mt-1">
            Add a new milestone to track project progress and payments.
          </p>
        </div>

        {error && <div className="alert alert-error mb-6">{error}</div>}

        <div className="space-y-6">
          {/* ── Section 1: Milestone Details ── */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold">Milestone Details</h2>
            </div>
            <div className="card-body space-y-5">
              <div>
                <label className="label">Title *</label>
                <input
                  type="text"
                  className="input"
                  placeholder="e.g. Foundation Work Complete"
                  value={form.title}
                  onChange={(e) => updateForm({ title: e.target.value })}
                />
              </div>

              <div>
                <label className="label">Description</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="Describe the scope and deliverables for this milestone..."
                  value={form.description}
                  onChange={(e) => updateForm({ description: e.target.value })}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Planned Start</label>
                  <input
                    type="date"
                    className="input"
                    value={form.plannedStart}
                    onChange={(e) => updateForm({ plannedStart: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Planned End</label>
                  <input
                    type="date"
                    className="input"
                    value={form.plannedEnd}
                    min={form.plannedStart || undefined}
                    onChange={(e) => updateForm({ plannedEnd: e.target.value })}
                  />
                </div>
              </div>
              {form.plannedStart && form.plannedEnd && new Date(form.plannedEnd) < new Date(form.plannedStart) && (
                <p className="text-xs text-[#e06050]">Planned end must be after planned start.</p>
              )}

              {isOwner ? (
                <div>
                  <label className="label">Phase</label>
                  <div className="input bg-[rgba(var(--ax-accent-rgb),0.08)] border-[rgba(var(--ax-accent-rgb),0.18)] text-[var(--ax-accent)] cursor-not-allowed">
                    Extra milestones
                  </div>
                </div>
              ) : (phases.length > 0 || prefilledPhaseId) && (
                <div>
                  <label className="label">Phase (optional)</label>
                  {prefilledPhaseId ? (
                    <div className="input bg-[rgba(255,255,255,0.03)] text-[rgba(232,228,220,0.55)] cursor-not-allowed">
                      Phase:{' '}
                      <span className="text-[#e8e4dc] font-medium">
                        {phases.find((p) => p.id === prefilledPhaseId)?.name ?? prefilledPhaseId}
                      </span>
                    </div>
                  ) : (
                    <>
                      <select
                        className="input"
                        value={form.phaseId}
                        onChange={(e) => updateForm({ phaseId: e.target.value })}
                      >
                        <option value="">-- No phase --</option>
                        {phases.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.name}
                          </option>
                        ))}
                      </select>
                      {!form.phaseId && (
                        <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                          Milestones without a phase will be marked as Extra and require
                          Owner approval before work can begin.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Section 2: Pricing & BOQ ── */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold">Pricing &amp; BOQ</h2>
            </div>
            <div className="card-body space-y-5">
              {/* Extras toggle */}
              <div className="rounded-lg border border-[rgba(255,255,255,0.07)] p-4 bg-[rgba(255,255,255,0.03)]">
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-[rgba(255,255,255,0.1)] text-[var(--ax-accent)] focus:ring-[rgba(var(--ax-accent-rgb),0.3)]"
                    checked={isOwner || form.isExtra}
                    disabled={isOwner}
                    onChange={(e) =>
                      updateForm({
                        isExtra: e.target.checked,
                        selectedBoqItemId: e.target.checked ? '' : form.selectedBoqItemId,
                        boqQty: e.target.checked ? '' : form.boqQty,
                      })
                    }
                  />
                  <span className="text-sm font-medium text-[var(--ax-accent)]">
                    {isOwner ? 'Owner-created milestones are Extras' : 'Mark as Extra (Outside BOQ)'}
                  </span>
                </label>

                {(isOwner || form.isExtra) && (
                  <div className="mt-3 bg-[rgba(var(--ax-accent-rgb),0.08)] border border-[rgba(var(--ax-accent-rgb),0.15)] rounded-lg p-3">
                    <p className="text-sm text-[var(--ax-accent)]">
                      This milestone is outside the approved BOQ and will appear under Extra milestones.
                    </p>
                  </div>
                )}
              </div>

              {/* BOQ Item Link — only when not Extra */}
              {!(isOwner || form.isExtra || !form.phaseId) && (
                <div className="space-y-4">
                  <div>
                    <label className="label">Link to BOQ Item</label>
                    <select
                      className="input"
                      value={form.selectedBoqItemId}
                      onChange={(e) => {
                        const selectedItem = boqItems.find((item) => item.id === e.target.value);
                        updateForm({
                          selectedBoqItemId: e.target.value,
                          value:
                            selectedItem && form.boqQty
                              ? String(selectedItem.rate * parseFloat(form.boqQty))
                              : form.value,
                        });
                      }}
                    >
                      <option value="">-- Select BOQ Item --</option>
                      {boqItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.description} ({item.unit}) &mdash; Rate: {formatCurrency(item.rate)} | Available: {item.plannedQty}
                        </option>
                      ))}
                    </select>
                    {boqItems.length === 0 && (() => {
                      const phaseBoq = (boqs ?? []).find((b) => b.phaseId === form.phaseId);
                      return (
                        <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                          {!phaseBoq
                            ? 'No BOQ created for this phase yet. Ask PMC to create one first.'
                            : phaseBoq.status !== 'APPROVED'
                            ? `BOQ for this phase is ${phaseBoq.status.toLowerCase()} — Owner must approve it before linking.`
                            : 'No items in this phase\'s BOQ.'}
                        </p>
                      );
                    })()}
                  </div>

                  {form.selectedBoqItemId && (
                    <div>
                      <label className="label">Quantity from BOQ</label>
                      <input
                        type="number"
                        className="input"
                        placeholder="0"
                        min="0"
                        step="0.01"
                        value={form.boqQty}
                        onChange={(e) => {
                          const selectedItem = boqItems.find((item) => item.id === form.selectedBoqItemId);
                          const qty = parseFloat(e.target.value) || 0;
                          updateForm({
                            boqQty: e.target.value,
                            value: selectedItem ? String(selectedItem.rate * qty) : form.value,
                          });
                        }}
                      />
                      {form.boqQty && (
                        <p className="text-xs text-[#5cba80] mt-1.5">
                          Calculated value:{' '}
                          {formatCurrency(
                            (boqItems.find((i) => i.id === form.selectedBoqItemId)?.rate || 0) *
                              parseFloat(form.boqQty || '0')
                          )}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Value */}
              <div>
                <label className="label">Value *</label>
                <input
                  type="number"
                  className="input"
                  placeholder="0.00"
                  min="0"
                  step="0.01"
                  value={form.value}
                  onChange={(e) => updateForm({ value: e.target.value })}
                />
                <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                  {form.selectedBoqItemId
                    ? 'Auto-calculated from BOQ (editable)'
                    : 'Total milestone value'}
                </p>
              </div>

              {/* Advance Percentage */}
              <div>
                <label className="label">Advance Percentage</label>
                <input
                  type="number"
                  className="input"
                  placeholder="0"
                  min="0"
                  max="100"
                  step="1"
                  value={form.advancePercent}
                  onChange={(e) => updateForm({ advancePercent: e.target.value })}
                />
                <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                  {form.value && form.advancePercent ? (
                    <>
                      Advance:{' '}
                      {formatCurrency(
                        (parseFloat(form.value) * parseFloat(form.advancePercent)) / 100
                      )}{' '}
                      | Remaining on verification:{' '}
                      {formatCurrency(
                        (parseFloat(form.value) * (100 - parseFloat(form.advancePercent))) / 100
                      )}
                    </>
                  ) : (
                    'Optional: % paid upfront, rest due on verification'
                  )}
                </p>
              </div>
            </div>
          </div>

          {/* ── Section 3: Vendor Assignment (conditional) ── */}
          {vendors.length > 0 && (
            <div className="card">
              <div className="card-header">
                <h2 className="font-semibold">Vendor Assignment</h2>
              </div>
              <div className="card-body">
                <div>
                  <label className="label">Assign Vendor</label>
                  <select
                    className="input"
                    value={form.vendorUserId}
                    onChange={(e) => updateForm({ vendorUserId: e.target.value })}
                  >
                    <option value="">-- No vendor assigned --</option>
                    {vendors.map((v) => (
                      <option key={v.userId} value={v.userId}>
                        {v.name} ({v.email})
                      </option>
                    ))}
                  </select>
                  <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1.5">
                    Assign a vendor responsible for delivering this milestone.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Section 4: Predecessor Dependencies ── */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Predecessor Dependencies</h2>
                <p className="text-xs text-[rgba(232,228,220,0.4)] mt-0.5">
                  Milestones that must be completed before this one can start
                </p>
              </div>
              {!addingPred && existingMilestones.length > predecessors.length && (
                <button
                  type="button"
                  onClick={() => { setAddingPred(true); setNewPredId(''); setNewPredType('FS'); setNewPredLag(0); }}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12.5px] font-semibold"
                  style={{ background: 'rgba(var(--ax-accent-rgb),0.1)', color: 'var(--ax-accent)', border: '1px solid rgba(var(--ax-accent-rgb),0.2)' }}
                >
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                  </svg>
                  Add
                </button>
              )}
            </div>
            <div className="card-body space-y-3">

              {/* Add form */}
              {addingPred && (
                <div className="rounded-xl border border-[rgba(var(--ax-accent-rgb),0.2)] bg-[rgba(var(--ax-accent-rgb),0.05)] p-4 space-y-3">
                  <div>
                    <label className="label">Predecessor Milestone</label>
                    <select
                      className="input"
                      value={newPredId}
                      onChange={e => setNewPredId(e.target.value)}
                    >
                      <option value="">— Select milestone —</option>
                      {existingMilestones
                        .filter(m => !predecessors.find(p => p.milestoneId === m.id))
                        .map(m => (
                          <option key={m.id} value={m.id}>
                            {m.phaseName ? `[${m.phaseName}] ` : ''}{m.title}
                          </option>
                        ))}
                    </select>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="label">Dependency Type</label>
                      <select className="input" value={newPredType} onChange={e => setNewPredType(e.target.value)}>
                        <option value="FS">FS — Finish to Start (most common)</option>
                        <option value="SS">SS — Start to Start</option>
                        <option value="FF">FF — Finish to Finish</option>
                        <option value="SF">SF — Start to Finish</option>
                      </select>
                    </div>
                    <div className="w-32">
                      <label className="label">Lag days</label>
                      <input
                        type="number"
                        className="input"
                        value={newPredLag}
                        onChange={e => setNewPredLag(parseInt(e.target.value) || 0)}
                        placeholder="0"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={!newPredId}
                      onClick={() => {
                        const ms = existingMilestones.find(m => m.id === newPredId);
                        if (!ms) return;
                        setPredecessors(prev => [...prev, { milestoneId: ms.id, title: ms.title, dependencyType: newPredType, lagDays: newPredLag }]);
                        setAddingPred(false);
                      }}
                      className="btn btn-primary disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      Add Predecessor
                    </button>
                    <button type="button" onClick={() => setAddingPred(false)} className="btn btn-secondary">
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {/* Predecessor list */}
              {predecessors.length > 0 ? (
                predecessors.map((p, i) => (
                  <div key={i} className="flex items-center gap-3 px-3 py-3 rounded-xl border border-[rgba(255,255,255,0.06)] bg-[rgba(255,255,255,0.02)]">
                    <span className="text-[rgba(232,228,220,0.3)] text-[11px]">←</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-[13px] font-semibold text-[#e8e4dc] truncate">{p.title}</div>
                      <div className="text-[11px] text-[rgba(232,228,220,0.4)] mt-0.5">
                        {p.dependencyType === 'FS' ? 'Must finish before this starts' :
                         p.dependencyType === 'SS' ? 'Must start before this starts' :
                         p.dependencyType === 'FF' ? 'Must finish before this finishes' :
                         'Must start before this finishes'}
                      </div>
                    </div>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-[rgba(var(--ax-accent-rgb),0.1)] text-[var(--ax-accent)] border border-[rgba(var(--ax-accent-rgb),0.2)]">
                      {p.dependencyType}{p.lagDays !== 0 ? ` ${p.lagDays > 0 ? '+' : ''}${p.lagDays}d` : ''}
                    </span>
                    <button
                      type="button"
                      onClick={() => setPredecessors(prev => prev.filter((_, j) => j !== i))}
                      className="p-1.5 rounded-lg text-[rgba(232,228,220,0.3)] hover:text-[#e06050] hover:bg-[rgba(224,96,80,0.08)] transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                ))
              ) : !addingPred && (
                <div className="rounded-xl border border-dashed border-[rgba(255,255,255,0.08)] bg-[rgba(255,255,255,0.01)] px-4 py-5 text-center">
                  {existingMilestones.length === 0 ? (
                    <p className="text-sm text-[rgba(232,228,220,0.3)]">
                      No other milestones in this project yet. Create more milestones to set up dependencies.
                    </p>
                  ) : (
                    <p className="text-sm text-[rgba(232,228,220,0.3)]">
                      No predecessors — this milestone can start independently.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Action bar ── */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-10">
            <Link
              href={`/projects/${projectId}/milestones`}
              className="btn btn-secondary"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.title.trim()}
              className={`btn ${
                isOwner || form.isExtra || !form.phaseId
                  ? 'bg-[var(--ax-accent)] hover:bg-[var(--ax-accent-hover)] text-white'
                  : 'btn-primary'
              } disabled:opacity-50`}
            >
	              {submitting
	                ? 'Creating...'
	                : isOwner || form.isExtra || !form.phaseId
	                ? 'Create Extra Milestone'
	                : 'Create Milestone'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
