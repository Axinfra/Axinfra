'use client';

import { DetailPageSkeleton } from '@/components/ui/SkeletonPage';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import DependencyManager from '@/components/milestones/DependencyManager';

interface MilestoneData {
  id: string;
  title: string;
  description?: string;
  state: string;
  paymentModel: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualSubmission: string | null;
  actualVerification: string | null;
  plannedValue: number;
  value: number;
  advancePercent: number;
  isExtra: boolean;
  extraApprovedAt: string | null;
  extraApprovedById: string | null;
  validNextStates: string[];
  permissions: Record<string, boolean>;
  evidence: Array<{
    id: string;
    status: string;
    qtyOrPercent: number;
    remarks?: string;
    submittedAt: string;
    reviewNote?: string;
    submittedBy: { name: string };
    files: Array<{ id: string; fileName: string; mimeType: string }>;
  }>;
  transitions: Array<{
    fromState: string | null;
    toState: string;
    createdAt: string;
    reason?: string;
    actor: { name: string };
  }>;
  paymentEligibility?: {
    id: string;
    state: string;
    eligibleAmount: number;
    advanceAmount: number;
    remainingAmount: number;
    blockExplanation?: string | null;
    blockReasonCode?: string | null;
    blockedAt?: string | null;
  };
  predecessors?: Array<{
    id: string;
    title: string;
    state: string;
    dependencyType: string;
    lagDays: number;
  }>;
}

export default function MilestoneDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const milestoneId = params.milestoneId as string;
  const router = useRouter();
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);
  const [approvingExtra, setApprovingExtra] = useState(false);
  const [confirmApproveExtra, setConfirmApproveExtra] = useState(false);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const milestoneKey =
    projectId && milestoneId
      ? `/api/projects/${projectId}/milestones/${milestoneId}`
      : null;
  const {
    data: milestone,
    isLoading: msLoading,
    mutate: refetchMilestone,
  } = useSWR<MilestoneData>(milestoneKey, jsonFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
  });

  const loading = projectLoading || msLoading;

  const handleStartWork = async () => {
    setStarting(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ toState: 'IN_PROGRESS' }),
      });
      const data = await res.json();
      if (data.success) {
        void refetchMilestone();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to start work');
    } finally {
      setStarting(false);
    }
  };

  const handleApproveExtra = async () => {
    setConfirmApproveExtra(false);
    setApprovingExtra(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/approve-extra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.success) {
        void refetchMilestone();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to approve extra');
    } finally {
      setApprovingExtra(false);
    }
  };

  if (loading) return <Layout><DetailPageSkeleton /></Layout>;
  if (!milestone) return <Layout><div className="alert alert-error">{error || 'Milestone not found'}</div></Layout>;

  const stateLabel: Record<string, string> = {
    DRAFT: 'Draft',
    IN_PROGRESS: 'In Progress',
    SUBMITTED: 'Evidence Submitted',
    VERIFIED: 'Verified',
    CLOSED: 'Closed',
  };

  // Dependency violations — computed once, used in both banner and action gating
  const depViolations: Array<{ title: string; type: string; issue: string }> = [];
  for (const p of milestone.predecessors ?? []) {
    const isStarting = milestone.state === 'DRAFT';
    const isClosing  = milestone.state === 'VERIFIED';
    if (isStarting) {
      if (p.dependencyType === 'FS' && p.state !== 'CLOSED')
        depViolations.push({ title: p.title, type: 'FS', issue: `must be completed first (currently ${p.state.replace('_', ' ')})` });
      if (p.dependencyType === 'SS' && p.state === 'DRAFT')
        depViolations.push({ title: p.title, type: 'SS', issue: `must be started first (currently ${p.state})` });
    }
    if (isClosing) {
      if (p.dependencyType === 'FF' && p.state !== 'CLOSED')
        depViolations.push({ title: p.title, type: 'FF', issue: `must be completed before this can close (currently ${p.state.replace('_', ' ')})` });
      if (p.dependencyType === 'SF' && p.state === 'DRAFT')
        depViolations.push({ title: p.title, type: 'SF', issue: `must be started before this can close (currently ${p.state})` });
    }
  }
  const hasDependencyWarning = depViolations.length > 0;

  // Determine what action card to show
  const showStartWork = myRole === 'VENDOR' && milestone.state === 'DRAFT';
  const showSubmitEvidence = milestone.permissions.canSubmitEvidence && milestone.state === 'IN_PROGRESS';
  const showReviewEvidence = milestone.permissions.canVerify && milestone.state === 'SUBMITTED';
  const showPaymentLink = (myRole === 'CLIENT' || myRole === 'PMC') && milestone.paymentEligibility && milestone.state === 'VERIFIED';

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <button
              onClick={() => router.push(`/projects/${projectId}/milestones`)}
              className="text-sm text-[rgba(232,228,220,0.45)] hover:text-[#e8e4dc] transition-colors"
            >
              ← Back to Milestones
            </button>
            <h1 className="text-2xl font-bold text-[#e8e4dc] mt-2">{milestone.title}</h1>
            {milestone.description && (
              <p className="text-[rgba(232,228,220,0.55)] mt-1">{milestone.description}</p>
            )}
          </div>
          <MilestoneStateBadge state={milestone.state as any} />
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Dependency Warning Banner */}
        {hasDependencyWarning && (
          <div className="rounded-xl border border-[rgba(224,160,48,0.35)] bg-[rgba(224,160,48,0.07)] p-4">
            <div className="flex items-start gap-3">
              <svg className="w-5 h-5 text-[#e0a030] shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
              <div className="flex-1">
                <p className="text-sm font-semibold text-[#e0a030] mb-2">
                  Predecessor dependencies not met
                </p>
                <ul className="space-y-1">
                  {depViolations.map((v, i) => (
                    <li key={i} className="text-sm text-[rgba(224,160,48,0.85)] flex items-start gap-2">
                      <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-bold bg-[rgba(224,160,48,0.15)] text-[#e0a030] border border-[rgba(224,160,48,0.2)] shrink-0 mt-0.5">
                        {v.type}
                      </span>
                      <span><strong className="text-[#e0a030]">{v.title}</strong> — {v.issue}</span>
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-[rgba(224,160,48,0.6)] mt-2">
                  In real construction, this milestone should not {milestone.state === 'DRAFT' ? 'start' : 'close'} until the above work is done. Proceeding out of sequence may cause schedule and payment issues.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Extra Approval Banner */}
        {milestone.isExtra && (
          <div className={`border rounded-lg p-4 ${
            milestone.extraApprovedAt
              ? 'bg-[rgba(92,186,128,0.07)] border-[rgba(92,186,128,0.2)]'
              : 'bg-[rgba(196,163,90,0.06)] border-[rgba(196,163,90,0.2)]'
          }`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <p className={`font-medium text-sm ${milestone.extraApprovedAt ? 'text-[#5cba80]' : 'text-[#c4a35a]'}`}>
                  {milestone.extraApprovedAt ? '✓ Extra Work Approved' : '⚠ Extra Work — Pending Owner Approval'}
                </p>
                <p className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5">
                  {milestone.extraApprovedAt
                    ? `Approved on ${formatDateTime(milestone.extraApprovedAt)}`
                    : 'This milestone is outside the approved BOQ.'}
                </p>
              </div>
              {!milestone.extraApprovedAt && myRole === 'CLIENT' && (
                <button
                  onClick={() => setConfirmApproveExtra(true)}
                  disabled={approvingExtra}
                  className="btn btn-primary text-sm disabled:opacity-50"
                >
                  {approvingExtra ? 'Approving…' : 'Approve Extra'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Key Info */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="card">
            <div className="card-body">
              <p className="text-xs text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Payment Model</p>
              <p className="text-base font-semibold text-[#e8e4dc] mt-1">{milestone.paymentModel.replace('_', ' ')}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-xs text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Milestone Value</p>
              <p className="text-base font-semibold text-[#c4a35a] mt-1">{formatCurrency(milestone.plannedValue || milestone.value)}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-xs text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Due Date</p>
              <p className="text-base font-semibold text-[#e8e4dc] mt-1">{formatDate(milestone.plannedEnd) || '—'}</p>
            </div>
          </div>
        </div>

        {/* Action Card — role + state aware */}
        {(showStartWork || showSubmitEvidence || showReviewEvidence || showPaymentLink) && (
          <div className="card">
            <div className="card-body">
              {showStartWork && (
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-base font-semibold text-[#e8e4dc]">Ready to begin?</p>
                    <p className="text-sm text-[rgba(232,228,220,0.5)] mt-0.5">
                      Click Start Work to mark this milestone as In Progress and notify the PMC.
                    </p>
                  </div>
                  <button
                    onClick={handleStartWork}
                    disabled={starting}
                    className="btn btn-primary shrink-0 disabled:opacity-50"
                  >
                    {starting ? 'Starting…' : 'Start Work'}
                  </button>
                </div>
              )}

              {showSubmitEvidence && (
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-base font-semibold text-[#e8e4dc]">Work complete?</p>
                    <p className="text-sm text-[rgba(232,228,220,0.5)] mt-0.5">
                      Upload photos or PDFs as proof of work. The PMC will review and verify.
                    </p>
                  </div>
                  <Link
                    href={`/projects/${projectId}/milestones/${milestoneId}/evidence`}
                    className="btn btn-primary shrink-0"
                  >
                    Submit Evidence
                  </Link>
                </div>
              )}

              {showReviewEvidence && (
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-base font-semibold text-[#e8e4dc]">Evidence submitted for review</p>
                    <p className="text-sm text-[rgba(232,228,220,0.5)] mt-0.5">
                      The vendor has submitted evidence. Review attachments, then verify or request revision.
                    </p>
                  </div>
                  <Link
                    href={`/projects/${projectId}/milestones/${milestoneId}/verify`}
                    className="btn btn-success shrink-0"
                  >
                    Review Evidence
                  </Link>
                </div>
              )}

              {showPaymentLink && !showReviewEvidence && (
                <div className="flex items-center justify-between gap-4 flex-wrap">
                  <div>
                    <p className="text-base font-semibold text-[#e8e4dc]">Milestone Verified</p>
                    <p className="text-sm text-[rgba(232,228,220,0.5)] mt-0.5">
                      Payment of {formatCurrency(milestone.paymentEligibility!.eligibleAmount)} is eligible for release.
                    </p>
                  </div>
                  <Link
                    href={`/projects/${projectId}/payments`}
                    className="btn btn-primary shrink-0"
                  >
                    Manage Payment
                  </Link>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Payment Not Released — prominent banner for all roles */}
        {milestone.paymentEligibility?.state === 'BLOCKED' && (
          <div className="border border-[rgba(224,96,80,0.3)] rounded-xl p-4 bg-[rgba(224,96,80,0.06)]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[rgba(224,96,80,0.15)] flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[#e06050] text-base">✕</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-[#e06050]">Payment Not Released</p>
                <p className="text-xs text-[rgba(232,228,220,0.5)] mt-0.5">
                  The Owner has reviewed the milestone and deferred payment.
                </p>
                {milestone.paymentEligibility.blockExplanation && (
                  <div className="mt-2 p-3 rounded-lg bg-[rgba(0,0,0,0.2)] border border-[rgba(224,96,80,0.15)]">
                    <p className="text-xs text-[rgba(232,228,220,0.45)] mb-1">Reason given by Owner</p>
                    <p className="text-sm text-[#e8e4dc]">"{milestone.paymentEligibility.blockExplanation}"</p>
                  </div>
                )}
                {milestone.paymentEligibility.blockedAt && (
                  <p className="text-xs text-[rgba(232,228,220,0.35)] mt-2">{formatDateTime(milestone.paymentEligibility.blockedAt)}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Payment Status */}
        {milestone.paymentEligibility && (
          <div className="card">
            <div className="card-header">
              <h2 className="text-base font-semibold">Payment Status</h2>
            </div>
            <div className="card-body">
              <div className="flex items-center justify-between flex-wrap gap-3">
                <div className="flex items-center gap-4">
                  <PaymentStatusBadge state={milestone.paymentEligibility.state as any} />
                  <span className="text-xl font-bold text-[#e8e4dc]">
                    {formatCurrency(milestone.paymentEligibility.eligibleAmount)}
                  </span>
                </div>
                {(myRole === 'CLIENT' || myRole === 'PMC') && (
                  <Link href={`/projects/${projectId}/payments`} className="btn btn-secondary text-sm">
                    View Payments
                  </Link>
                )}
              </div>
              {milestone.paymentEligibility.advanceAmount > 0 && (
                <p className="text-xs text-[rgba(232,228,220,0.4)] mt-2">
                  Advance: {formatCurrency(milestone.paymentEligibility.advanceAmount)} · Remaining: {formatCurrency(milestone.paymentEligibility.remainingAmount)}
                </p>
              )}
            </div>
          </div>
        )}

        {/* Evidence */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-base font-semibold">Evidence ({milestone.evidence.length})</h2>
          </div>
          <div className="card-body">
            {milestone.evidence.length === 0 ? (
              <p className="text-sm text-[rgba(232,228,220,0.4)] text-center py-6">No evidence submitted yet</p>
            ) : (
              <div className="space-y-4">
                {milestone.evidence.map((ev) => (
                  <div key={ev.id} className="border border-[rgba(255,255,255,0.07)] rounded-lg p-4 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                          ev.status === 'APPROVED'
                            ? 'bg-[rgba(92,186,128,0.12)] text-[#5cba80]'
                            : ev.status === 'REJECTED'
                            ? 'bg-[rgba(224,96,80,0.12)] text-[#e06050]'
                            : 'bg-[rgba(196,163,90,0.12)] text-[#c4a35a]'
                        }`}>
                          {ev.status}
                        </span>
                        <p className="text-xs text-[rgba(232,228,220,0.45)] mt-1.5">
                          {ev.submittedBy.name} · {formatDateTime(ev.submittedAt)}
                        </p>
                      </div>
                      <span className="text-lg font-bold text-[#c4a35a] shrink-0">{ev.qtyOrPercent}%</span>
                    </div>
                    {ev.remarks && (
                      <p className="text-sm text-[rgba(232,228,220,0.65)]">{ev.remarks}</p>
                    )}
                    {ev.reviewNote && (
                      <p className="text-xs text-[#e06050]">Note: {ev.reviewNote}</p>
                    )}
                    {ev.files.length > 0 && (
                      <div className="pt-2 border-t border-[rgba(255,255,255,0.06)]">
                        <div className="flex flex-wrap gap-2">
                          {ev.files.map((file) => (
                            <a
                              key={file.id}
                              href={`/api/files/${file.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-md bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(196,163,90,0.1)] text-[#c4a35a] border border-[rgba(255,255,255,0.07)] transition-colors"
                            >
                              {file.mimeType === 'application/pdf' ? '📄' : '🖼'} {file.fileName}
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Dependencies */}
        <DependencyManager
          projectId={projectId}
          milestoneId={milestoneId}
          canEdit={myRole === 'CLIENT' || myRole === 'PMC'}
        />

        {/* State History */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-base font-semibold">History</h2>
          </div>
          <div className="card-body">
            {milestone.transitions.length === 0 ? (
              <p className="text-sm text-[rgba(232,228,220,0.4)] text-center py-4">No transitions yet</p>
            ) : (
              <div className="space-y-3">
                {[...milestone.transitions].reverse().map((t, i) => (
                  <div key={i} className="flex items-start gap-3 text-sm">
                    <div className="w-2 h-2 rounded-full bg-[#c4a35a] mt-1.5 shrink-0" />
                    <div className="flex-1 min-w-0">
                      <span className="font-medium text-[#e8e4dc]">{t.actor.name}</span>
                      <span className="text-[rgba(232,228,220,0.45)]"> → </span>
                      <span className="font-medium text-[#c4a35a]">{stateLabel[t.toState] ?? t.toState}</span>
                      {t.reason && (
                        <p className="text-xs text-[rgba(232,228,220,0.45)] mt-0.5 italic">"{t.reason}"</p>
                      )}
                      <p className="text-xs text-[rgba(232,228,220,0.3)] mt-0.5">{formatDateTime(t.createdAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Approve Extra confirmation modal */}
      {confirmApproveExtra && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-[#e8e4dc]">Approve Extra Milestone</h2>
              <p className="text-[rgba(232,228,220,0.55)] mb-4 text-sm">
                This milestone is outside the approved BOQ. Approving it confirms the extra scope is authorised.
              </p>
              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setConfirmApproveExtra(false)}
                  className="btn btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={() => void handleApproveExtra()}
                  disabled={approvingExtra}
                  className="btn btn-primary disabled:opacity-50"
                >
                  {approvingExtra ? 'Approving…' : 'Approve Extra'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
