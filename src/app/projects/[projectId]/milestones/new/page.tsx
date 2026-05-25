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

export default function CreateMilestonePage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const prefilledPhaseId = searchParams.get('phaseId') ?? '';
  const projectId = params.projectId as string;

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    title: '',
    description: '',
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
  const isOwner = myRole === 'OWNER';
  const isOwnerOrPMC = myRole === 'OWNER' || myRole === 'PMC';

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
          plannedEnd: form.plannedEnd || undefined,
          value: form.value ? parseFloat(form.value) : 0,
          advancePercent: form.advancePercent ? parseFloat(form.advancePercent) : 0,
          isExtra: effectiveIsExtra,
          vendorUserId: form.vendorUserId || null,
          phaseId: effectiveIsExtra ? null : form.phaseId || null,
          boqLinks,
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

              <div>
                <label className="label">Due Date</label>
                <input
                  type="date"
                  className="input"
                  value={form.plannedEnd}
                  onChange={(e) => updateForm({ plannedEnd: e.target.value })}
                />
              </div>

              {isOwner ? (
                <div>
                  <label className="label">Phase</label>
                  <div className="input bg-[rgba(196,163,90,0.08)] border-[rgba(196,163,90,0.18)] text-[#c4a35a] cursor-not-allowed">
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
                    className="h-4 w-4 rounded border-[rgba(255,255,255,0.1)] text-[#c4a35a] focus:ring-[rgba(196,163,90,0.3)]"
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
                  <span className="text-sm font-medium text-[#c4a35a]">
                    {isOwner ? 'Owner-created milestones are Extras' : 'Mark as Extra (Outside BOQ)'}
                  </span>
                </label>

                {(isOwner || form.isExtra) && (
                  <div className="mt-3 bg-[rgba(196,163,90,0.08)] border border-[rgba(196,163,90,0.15)] rounded-lg p-3">
                    <p className="text-sm text-[#c4a35a]">
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
                  ? 'bg-[#c4a35a] hover:bg-[#b3943f] text-white'
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
