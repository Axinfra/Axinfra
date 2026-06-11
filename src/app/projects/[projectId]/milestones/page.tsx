'use client';

import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import MilestoneSearch from '@/components/milestones/MilestoneSearch';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface Milestone {
  id: string;
  title: string;
  description?: string;
  state: string;
  paymentModel: string;
  advancePercent: number;
  value: number;
  isExtra: boolean;
  extraApprovedAt: string | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  vendorUserId?: string | null;
  vendorUser?: { id: string; name: string; email: string } | null;
  boqLinks?: Array<{
    id: string;
    plannedQty: number;
    boqItem: {
      id: string;
      description: string;
      unit: string;
      rate: number;
    };
  }>;
  phaseId?: string | null;
  paymentEligibility?: {
    state: string;
    eligibleAmount: number;
    advanceAmount: number;
    remainingAmount: number;
  };
}

interface Phase {
  id: string;
  name: string;
}

export default function MilestonesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const urlPhaseId = searchParams.get('phaseId') ?? '';
  const projectId = params.projectId as string;
  const PAGE_SIZE = 25;
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [phaseFilter, setPhaseFilter] = useState(urlPhaseId);
  const [page, setPage] = useState(1);
  const [transitioning, setTransitioning] = useState<string | null>(null);

  const { project, isLoading: projectLoading } = useProject();

  const milestonesKey = projectId ? `/api/projects/${projectId}/milestones?all=true` : null;
  const {
    data: milestones = [],
    isLoading: milestonesLoading,
    mutate: refetchMilestones,
  } = useSWR<Milestone[]>(milestonesKey, jsonFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });

  const { data: phases = [] } = useSWR<Phase[]>(
    projectId ? `/api/projects/${projectId}/phases` : null,
    jsonFetcher,
    { dedupingInterval: 5_000 },
  );

  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const permissions = (project?.permissions ?? {}) as Record<string, boolean>;
  const loading = projectLoading || milestonesLoading;

  const visibleMilestones = !phaseFilter
    ? milestones
    : phaseFilter === 'none'
    ? milestones.filter((m) => !m.phaseId)
    : milestones.filter((m) => m.phaseId === phaseFilter);

  const totalPages = Math.max(1, Math.ceil(visibleMilestones.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedMilestones = visibleMilestones.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  // Milestones awaiting evidence review (alert for OWNER/PMC — uses all, not paged)
  const awaitingReview = milestones.filter((m) => m.state === 'SUBMITTED');

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleStartWork = async (milestoneId: string) => {
    setTransitioning(milestoneId);
    setError('');
    // Optimistic update — show IN_PROGRESS immediately
    void refetchMilestones(
      (current = []) =>
        current.map((m) => m.id === milestoneId ? { ...m, state: 'IN_PROGRESS' } : m),
      { revalidate: false },
    );
    try {
      const res = await fetch(
        `/api/projects/${projectId}/milestones/${milestoneId}/transition`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ toState: 'IN_PROGRESS' }),
        },
      );
      const data = await res.json();
      if (!data.success) {
        // Revert optimistic update
        void refetchMilestones();
        setError(data.error ?? 'Failed to start work');
      } else {
        void refetchMilestones();
      }
    } catch {
      void refetchMilestones();
      setError('An error occurred');
    } finally {
      setTransitioning(null);
    }
  };

  const handleDelete = async (milestoneId: string) => {
    const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (data.success) {
      setDeleteConfirm(null);
      // Optimistic removal
      void refetchMilestones(
        (current = []) => current.filter((m) => m.id !== milestoneId),
        { revalidate: true },
      );
    } else {
      setError(data.error);
      setDeleteConfirm(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Milestones</h1>
          {/* Create button — OWNER and PMC only */}
          {permissions.canEditMilestones && (
            <Link href={`/projects/${projectId}/milestones/new`} className="btn btn-primary">
              Create Milestone
            </Link>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Evidence-submitted alert for OWNER / PMC */}
        {(myRole === 'CLIENT' || myRole === 'PMC') && awaitingReview.length > 0 && (
          <div className="flex items-center gap-3 p-3 rounded-lg bg-[rgba(196,163,90,0.08)] border border-[rgba(196,163,90,0.25)]">
            <span className="text-[#c4a35a] text-lg leading-none">⚠</span>
            <p className="text-sm text-[#c4a35a] font-medium">
              {awaitingReview.length} milestone{awaitingReview.length > 1 ? 's have' : ' has'} evidence submitted and{' '}
              {awaitingReview.length > 1 ? 'are' : 'is'} awaiting your review.
            </p>
          </div>
        )}

        <MilestoneSearch projectId={projectId} onSearchActive={setSearchActive} />

        {phases.length > 0 && (
          <div className="flex items-center gap-3">
            <label className="text-sm text-[rgba(232,228,220,0.55)] shrink-0">Filter by Phase:</label>
            <select
              className="input py-1.5 text-sm max-w-xs"
              value={phaseFilter}
              onChange={(e) => { setPhaseFilter(e.target.value); setPage(1); }}
            >
              <option value="">All Phases</option>
              <option value="none">No phase (Extras)</option>
              {phases.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            {phaseFilter && (
              <button
                onClick={() => { setPhaseFilter(''); setPage(1); }}
                className="text-xs text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        )}

        {searchActive ? null : visibleMilestones.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-[rgba(232,228,220,0.55)]">No milestones created yet</p>
              {permissions.canEditMilestones && (
                <Link
                  href={`/projects/${projectId}/milestones/new`}
                  className="btn btn-primary mt-4 inline-flex"
                >
                  Create First Milestone
                </Link>
              )}
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    {(myRole === 'CLIENT' || myRole === 'PMC') && <th>Vendor</th>}
                    <th>State</th>
                    <th>Due Date</th>
                    <th>Payment Status</th>
                    <th>Total Value</th>
                    <th>Eligible</th>
                    <th>Advance</th>
                    <th>Remaining</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {pagedMilestones.map((milestone) => (
                    <tr key={milestone.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/projects/${projectId}/milestones/${milestone.id}`}
                            className="text-[#c4a35a] hover:underline font-medium"
                          >
                            {milestone.title}
                          </Link>
                          {milestone.isExtra && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              milestone.extraApprovedAt
                                ? 'bg-[rgba(50,200,120,0.1)] text-[#5cba80]'
                                : 'bg-[rgba(196,163,90,0.08)] text-[#c4a35a]'
                            }`}>
                              {milestone.extraApprovedAt ? 'Extra ✓' : 'Extra (Pending)'}
                            </span>
                          )}
                        </div>
                        {milestone.description && (
                          <p className="text-xs text-[rgba(232,228,220,0.55)] mt-1 truncate max-w-xs">
                            {milestone.description}
                          </p>
                        )}
                      </td>

                      {(myRole === 'CLIENT' || myRole === 'PMC') && (
                        <td>
                          {milestone.vendorUser ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(50,200,120,0.1)] text-[#5cba80] text-xs font-medium">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              {milestone.vendorUser.name}
                            </span>
                          ) : (
                            <span className="text-xs text-[rgba(232,228,220,0.35)]">&mdash;</span>
                          )}
                        </td>
                      )}

                      <td>
                        <MilestoneStateBadge state={milestone.state as any} />
                      </td>
                      <td className="text-[rgba(232,228,220,0.55)]">{formatDate(milestone.plannedEnd)}</td>
                      <td>
                        {milestone.paymentEligibility ? (
                          <PaymentStatusBadge state={milestone.paymentEligibility.state as any} />
                        ) : '-'}
                      </td>
                      <td className="font-medium">{formatCurrency(milestone.value || 0)}</td>
                      <td className={`font-medium ${
                        (milestone.paymentEligibility?.eligibleAmount ?? 0) > 0
                          ? 'text-[#5cba80]'
                          : 'text-[rgba(232,228,220,0.35)]'
                      }`}>
                        {milestone.paymentEligibility
                          ? formatCurrency(milestone.paymentEligibility.eligibleAmount)
                          : '-'}
                      </td>
                      <td className="text-[rgba(232,228,220,0.55)]">
                        {milestone.paymentEligibility?.advanceAmount
                          ? formatCurrency(milestone.paymentEligibility.advanceAmount)
                          : '-'}
                        {milestone.advancePercent > 0 && (
                          <span className="text-xs text-[rgba(232,228,220,0.35)] ml-1">({milestone.advancePercent}%)</span>
                        )}
                      </td>
                      <td className="font-medium text-[#c4a35a]">
                        {milestone.paymentEligibility?.remainingAmount
                          ? formatCurrency(milestone.paymentEligibility.remainingAmount)
                          : '-'}
                      </td>

                      {/* Actions column */}
                      <td className="whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          {/* VENDOR: Start Work on DRAFT milestones */}
                          {myRole === 'VENDOR' && milestone.state === 'DRAFT' && (
                            <button
                              onClick={() => void handleStartWork(milestone.id)}
                              disabled={transitioning === milestone.id}
                              className="btn btn-sm btn-primary text-xs"
                            >
                              {transitioning === milestone.id ? '…' : 'Start Work'}
                            </button>
                          )}

                          {/* VENDOR: Go to evidence when IN_PROGRESS */}
                          {myRole === 'VENDOR' && milestone.state === 'IN_PROGRESS' && (
                            <Link
                              href={`/projects/${projectId}/milestones/${milestone.id}/evidence`}
                              className="btn btn-sm btn-secondary text-xs"
                            >
                              Submit Evidence
                            </Link>
                          )}

                          {/* PMC only: Review & verify submitted evidence */}
                          {myRole === 'PMC' && milestone.state === 'SUBMITTED' && (
                            <Link
                              href={`/projects/${projectId}/milestones/${milestone.id}/verify`}
                              className="btn btn-sm bg-[rgba(196,163,90,0.15)] text-[#c4a35a] hover:bg-[rgba(196,163,90,0.25)] text-xs"
                            >
                              Review
                            </Link>
                          )}
                          {/* CLIENT: view detail when evidence submitted */}
                          {myRole === 'CLIENT' && milestone.state === 'SUBMITTED' && (
                            <Link
                              href={`/projects/${projectId}/milestones/${milestone.id}`}
                              className="btn btn-sm btn-secondary text-xs"
                            >
                              View Evidence
                            </Link>
                          )}

                          {/* CLIENT: Delete */}
                          {myRole === 'CLIENT' && (
                            <button
                              onClick={() => setDeleteConfirm(milestone.id)}
                              className="text-[rgba(232,228,220,0.35)] hover:text-[#e06050] text-xs transition-colors"
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Pagination */}
        {!searchActive && totalPages > 1 && (
          <div className="flex items-center justify-between py-2">
            <p className="text-sm text-[rgba(232,228,220,0.45)]">
              Showing {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, visibleMilestones.length)} of {visibleMilestones.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                disabled={safePage === 1}
                onClick={() => setPage(safePage - 1)}
                className="btn btn-sm btn-secondary disabled:opacity-40"
              >
                ← Prev
              </button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter((p) => p === 1 || p === totalPages || Math.abs(p - safePage) <= 1)
                .reduce<(number | '…')[]>((acc, p, idx, arr) => {
                  if (idx > 0 && p - (arr[idx - 1] as number) > 1) acc.push('…');
                  acc.push(p);
                  return acc;
                }, [])
                .map((p, i) =>
                  p === '…' ? (
                    <span key={`ellipsis-${i}`} className="px-2 text-[rgba(232,228,220,0.3)] text-sm">…</span>
                  ) : (
                    <button
                      key={p}
                      onClick={() => setPage(p as number)}
                      className={`btn btn-sm ${safePage === p ? 'btn-primary' : 'btn-secondary'}`}
                    >
                      {p}
                    </button>
                  )
                )}
              <button
                disabled={safePage === totalPages}
                onClick={() => setPage(safePage + 1)}
                className="btn btn-sm btn-secondary disabled:opacity-40"
              >
                Next →
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-[#e06050]">Delete Milestone</h2>
              <p className="text-[rgba(232,228,220,0.55)] mb-4">
                Are you sure you want to delete this milestone? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setDeleteConfirm(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={() => void handleDelete(deleteConfirm)}
                  className="btn bg-[#e06050] text-white hover:bg-[#c8503f]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
