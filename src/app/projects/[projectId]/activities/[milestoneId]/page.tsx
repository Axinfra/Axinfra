'use client';

import { DetailPageSkeleton } from '@/components/ui/SkeletonPage';
import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import ActivityStateBadge from '@/components/ActivityStateBadge';
import { Paperclip, Send, Clock } from 'lucide-react';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import DependencyManager from '@/components/milestones/DependencyManager';
import SubmitUpdateModal from '@/components/milestones/SubmitUpdateModal';
import MilestoneTimeline from '@/components/milestones/MilestoneTimeline';
import ProgressUpdateCard from '@/components/milestones/ProgressUpdateCard';
import ScheduleVarianceCard from '@/components/milestones/ScheduleVarianceCard';

interface MilestoneData {
  id: string;
  title: string;
  description?: string;
  state: string;
  percentComplete: number | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  vendorUserId: string | null;
  permissions: Record<string, boolean>;
  priority: string;
  remarks: string | null;
  submissions: Array<{
    id: string;
    qtyOrPercent: number;
    remarks?: string;
    submittedAt: string;
    submittedBy: { name: string };
    files: Array<{ id: string; fileName: string; mimeType: string }>;
    authorRole?: string | null;
  }>;
  comments: Array<{
    id: string;
    body: string;
    role: string;
    createdAt: string;
    author: { name: string };
  }>;
  transitions: Array<{
    fromState: string | null;
    toState: string;
    createdAt: string;
    reason?: string;
    role: string;
    actor: { name: string };
  }>;
  verifications: Array<{
    id: string;
    verifiedAt: string;
    notes?: string | null;
    qtyVerified: number;
    valueEligibleComputed: number;
    verifiedBy: { name: string };
  }>;
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
  const [showSubmitModal, setShowSubmitModal] = useState(false);
  const [commentBody, setCommentBody] = useState('');
  const [postingComment, setPostingComment] = useState(false);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const myUserId = (project?.myUserId as string) ?? '';

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

  const handlePostComment = async () => {
    if (!commentBody.trim()) return;
    setPostingComment(true);
    setError('');
    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: commentBody.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setCommentBody('');
        void refetchMilestone();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to post comment');
    } finally {
      setPostingComment(false);
    }
  };

  if (loading) return <Layout><DetailPageSkeleton /></Layout>;
  if (!milestone) return <Layout><div className="alert alert-error">{error || 'Activity not found'}</div></Layout>;

  // Dependency violations — only relevant before the activity has started (0% progress);
  // once progress has begun there's nothing left to gate.
  const depViolations: Array<{ title: string; type: string; issue: string }> = [];
  if ((milestone.percentComplete ?? 0) <= 0) {
    for (const p of milestone.predecessors ?? []) {
      if (p.dependencyType === 'FS' && p.state !== 'CLOSED')
        depViolations.push({ title: p.title, type: 'FS', issue: `must be completed first (currently ${p.state.replace('_', ' ')})` });
      if (p.dependencyType === 'SS' && p.state === 'DRAFT')
        depViolations.push({ title: p.title, type: 'SS', issue: `must be started first (currently ${p.state})` });
    }
  }
  const hasDependencyWarning = depViolations.length > 0;

  const canUpdateProgress = myRole === 'PMC' || myRole === 'SITE_ENGINEER';
  const isAssignedVendor = myRole === 'VENDOR' && milestone.vendorUserId === myUserId;
  const canComment = myRole === 'PMC' || myRole === 'CLIENT';

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex justify-between items-start flex-wrap gap-3">
          <div>
            <button
              onClick={() => router.push(`/projects/${projectId}/activities`)}
              className="text-sm text-[rgba(232,228,220,0.45)] hover:text-[#e8e4dc] transition-colors"
            >
              ← Back to Activities
            </button>
            <h1 className="text-2xl font-bold text-[#e8e4dc] mt-2">{milestone.title}</h1>
            {milestone.description && (
              <p className="text-[rgba(232,228,220,0.55)] mt-1">{milestone.description}</p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.6)]">
              {milestone.priority.charAt(0) + milestone.priority.slice(1).toLowerCase()} Priority
            </span>
            <ActivityStateBadge state={milestone.state as any} />
          </div>
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
                  In real construction, this activity shouldn&apos;t start until the above work is done — proceeding out of sequence may cause schedule issues.
                </p>
              </div>
            </div>
          </div>
        )}

        {milestone.remarks && (
          <div className="card">
            <div className="card-body">
              <p className="text-xs text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Remarks</p>
              <p className="text-sm text-[#e8e4dc] mt-1.5 whitespace-pre-wrap">{milestone.remarks}</p>
            </div>
          </div>
        )}

        {/* Schedule Variance — planned vs actual dates/durations, delay, health status */}
        <ScheduleVarianceCard
          activity={{
            plannedStart: milestone.plannedStart,
            plannedEnd: milestone.plannedEnd,
            actualStart: milestone.actualStart,
            actualEnd: milestone.actualEnd,
            percentComplete: milestone.percentComplete,
            state: milestone.state,
          }}
        />

        {/* Update Progress — PMC or Site Engineer. The single place progress/status ever changes. */}
        {canUpdateProgress && (
          <ProgressUpdateCard
            projectId={projectId}
            milestoneId={milestoneId}
            currentPercent={milestone.percentComplete ?? 0}
            onSaved={() => void refetchMilestone()}
          />
        )}

        {/* Attach Documents — assigned Vendor only. Supplementary photos/files, no progress control. */}
        {isAssignedVendor && (
          <div className="card border-[rgba(var(--ax-accent-rgb),0.2)]">
            <div className="card-body flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-full bg-[rgba(var(--ax-accent-rgb),0.12)] flex items-center justify-center shrink-0">
                  <Paperclip className="w-4 h-4 text-[var(--ax-accent)]" />
                </div>
                <div>
                  <p className="text-base font-semibold text-[#e8e4dc]">Attach site photos or documents</p>
                  <p className="text-xs text-[rgba(232,228,220,0.45)]">Optional — supporting evidence only, doesn&apos;t change progress</p>
                </div>
              </div>
              <button onClick={() => setShowSubmitModal(true)} className="btn btn-primary text-sm shrink-0">
                Attach Documents
              </button>
            </div>
          </div>
        )}

        {/* Dependencies */}
        <DependencyManager
          projectId={projectId}
          milestoneId={milestoneId}
          canEdit={myRole === 'CLIENT' || myRole === 'PMC'}
        />

        {/* Activity History — complete, append-only trail: progress updates, vendor
            attachments, comments, and status changes. Never overwritten. */}
        <div className="card">
          <div className="card-header flex items-center gap-2">
            <Clock className="w-4 h-4 text-[var(--ax-accent)]" />
            <h2 className="text-base font-semibold">Activity History</h2>
          </div>
          <div className="card-body">
            <MilestoneTimeline
              submissions={milestone.submissions}
              verifications={milestone.verifications}
              comments={milestone.comments}
              transitions={milestone.transitions}
            />
            {canComment && (
              <div className="pt-4 mt-4 border-t border-[rgba(255,255,255,0.06)] flex items-end gap-2">
                <textarea
                  rows={1}
                  className="input resize-none text-sm flex-1"
                  placeholder="Add a comment…"
                  value={commentBody}
                  onChange={(e) => setCommentBody(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (commentBody.trim()) void handlePostComment();
                    }
                  }}
                />
                <button
                  onClick={handlePostComment}
                  disabled={postingComment || !commentBody.trim()}
                  className="btn btn-secondary text-sm shrink-0 disabled:opacity-50 px-3"
                  aria-label="Post comment"
                >
                  {postingComment ? '…' : <Send className="w-4 h-4" />}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Attach Documents modal — assigned Vendor */}
      {showSubmitModal && (
        <SubmitUpdateModal
          projectId={projectId}
          milestoneId={milestoneId}
          onClose={() => setShowSubmitModal(false)}
          onSuccess={() => void refetchMilestone()}
        />
      )}
    </Layout>
  );
}
