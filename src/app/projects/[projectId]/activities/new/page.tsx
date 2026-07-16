'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import HierarchicalSelect from '@/components/ui/HierarchicalSelect';
import { buildPhaseOptions, isPurchaseOrderPhase, type SchedulePhaseOption } from '@/lib/phaseHierarchy';

interface VendorUser {
  userId: string;
  name: string;
  email: string;
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
    vendorUserId: '',
    phaseId: prefilledPhaseId,
    priority: 'NORMAL',
    remarks: '',
  });

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const canEdit =
    ((project?.permissions ?? {}) as Record<string, boolean>).canEditMilestones === true;
  const isOwnerOrPMC = myRole === 'CLIENT' || myRole === 'PMC';

  const { data: vendorsPayload, isLoading: vendorsLoading } = useSWR<VendorUser[]>(
    projectId && isOwnerOrPMC ? `/api/admin/vendors?projectId=${projectId}` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );

  // Only schedule-imported Execution/WBS phases are offered here — Purchase Order phases are
  // a separate concept tracked via BOQ/Purchase Orders, not through this picker.
  const { data: scheduleForPhases } = useSWR<{ phases: SchedulePhaseOption[] }>(
    projectId ? `/api/projects/${projectId}/schedule` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );
  const phases = scheduleForPhases?.phases ?? [];
  const executionPhases = phases.filter((p) => !isPurchaseOrderPhase(p));
  const phaseOptions = buildPhaseOptions(executionPhases);

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

  const vendors: VendorUser[] = vendorsPayload ?? [];
  const loading = projectLoading || (isOwnerOrPMC && vendorsLoading);

  // Surface permission error once project loads.
  useEffect(() => {
    if (!projectLoading && project && !canEdit) {
      setError('You do not have permission to create activities.');
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

    try {
      const res = await fetch(`/api/projects/${projectId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: form.title,
          description: form.description || undefined,
          plannedStart: form.plannedStart || undefined,
          plannedEnd: form.plannedEnd || undefined,
          vendorUserId: form.vendorUserId || null,
          phaseId: form.phaseId || null,
          priority: form.priority,
          remarks: form.remarks || undefined,
          predecessorLinks: predecessors.length > 0
            ? predecessors.map(p => ({ predecessorId: p.milestoneId, dependencyType: p.dependencyType, lagDays: p.lagDays }))
            : undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        router.push(`/projects/${projectId}/activities`);
      } else {
        setError(data.error || 'Failed to create activity');
      }
    } catch {
      setError('An error occurred while creating the activity');
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
            href={`/projects/${projectId}/activities`}
            className="inline-flex items-center gap-1.5 text-sm text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18" />
            </svg>
            Back to Activities
          </Link>
          <h1 className="text-2xl font-bold text-[#e8e4dc] mt-3">Create Activity</h1>
          <p className="text-[rgba(232,228,220,0.55)] mt-1">
            Add a new activity to track project progress and schedule.
          </p>
        </div>

        {error && <div className="alert alert-error mb-6">{error}</div>}

        <div className="space-y-6">
          {/* ── Section 1: Activity Details ── */}
          <div className="card">
            <div className="card-header">
              <h2 className="font-semibold">Activity Details</h2>
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
                  placeholder="Describe the scope and deliverables for this activity..."
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

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="label">Priority</label>
                  <select
                    className="input"
                    value={form.priority}
                    onChange={(e) => updateForm({ priority: e.target.value })}
                  >
                    <option value="LOW">Low</option>
                    <option value="NORMAL">Normal</option>
                    <option value="HIGH">High</option>
                    <option value="URGENT">Urgent</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="label">Remarks</label>
                <textarea
                  className="input"
                  rows={2}
                  placeholder="e.g. Waiting on client sign-off before starting…"
                  value={form.remarks}
                  onChange={(e) => updateForm({ remarks: e.target.value })}
                />
              </div>

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
                  <HierarchicalSelect
                    value={form.phaseId}
                    onChange={(v) => updateForm({ phaseId: v })}
                    fixedOptions={[{ value: '', label: '-- No phase --', depth: 0 }]}
                    treeOptions={phaseOptions.map((p) => ({ value: p.id, label: p.name, depth: p.depth }))}
                  />
                )}
              </div>
            </div>
          </div>

          {/* ── Section 2: Vendor Assignment (conditional) ── */}
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
                    Assign a vendor responsible for delivering this activity.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* ── Section 3: Predecessor Dependencies ── */}
          <div className="card">
            <div className="card-header flex items-center justify-between">
              <div>
                <h2 className="font-semibold">Predecessor Dependencies</h2>
                <p className="text-xs text-[rgba(232,228,220,0.4)] mt-0.5">
                  Activities that must be completed before this one can start
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
                    <label className="label">Predecessor Activity</label>
                    <select
                      className="input"
                      value={newPredId}
                      onChange={e => setNewPredId(e.target.value)}
                    >
                      <option value="">— Select activity —</option>
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
                      No other activities in this project yet. Create more activities to set up dependencies.
                    </p>
                  ) : (
                    <p className="text-sm text-[rgba(232,228,220,0.3)]">
                      No predecessors — this activity can start independently.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* ── Action bar ── */}
          <div className="flex items-center justify-end gap-3 pt-2 pb-10">
            <Link
              href={`/projects/${projectId}/activities`}
              className="btn btn-secondary"
            >
              Cancel
            </Link>
            <button
              onClick={handleSubmit}
              disabled={submitting || !form.title.trim()}
              className="btn btn-primary disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Activity'}
            </button>
          </div>
        </div>
      </div>
    </Layout>
  );
}
