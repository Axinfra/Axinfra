'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatDateTime } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { CheckCircle2, XCircle, FileText, Image, Clock, User, Percent, MessageSquare } from 'lucide-react';

interface EvidenceFile {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

interface PendingEvidence {
  id: string;
  qtyOrPercent: number;
  remarks?: string | null;
  status: string;
  submittedAt: string;
  submittedBy: { id: string; name: string; email: string };
  milestone: { id: string; title: string };
  files: EvidenceFile[];
}

function FileChip({ file }: { file: EvidenceFile }) {
  const isPdf = file.mimeType === 'application/pdf';
  const isImage = file.mimeType.startsWith('image/');
  const sizeKb = Math.round(file.size / 1024);

  return (
    <a
      href={`/api/files/${file.id}`}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg bg-[rgba(255,255,255,0.05)] hover:bg-[rgba(var(--ax-accent-rgb),0.1)] text-[rgba(232,228,220,0.75)] hover:text-[var(--ax-accent)] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(var(--ax-accent-rgb),0.3)] transition-all"
    >
      {isPdf ? (
        <FileText className="w-3.5 h-3.5 shrink-0 text-[#e06050]" />
      ) : isImage ? (
        <Image className="w-3.5 h-3.5 shrink-0 text-[#5cba80]" />
      ) : (
        <FileText className="w-3.5 h-3.5 shrink-0" />
      )}
      <span className="truncate max-w-[180px]">{file.fileName}</span>
      <span className="text-[rgba(232,228,220,0.3)] shrink-0">{sizeKb}KB</span>
    </a>
  );
}

function CompletionBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  const color = pct >= 90 ? '#5cba80' : pct >= 50 ? 'var(--ax-accent)' : '#f97316';
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-[rgba(255,255,255,0.07)] rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, backgroundColor: color }} />
      </div>
      <span className="text-sm font-semibold shrink-0" style={{ color }}>{pct}%</span>
    </div>
  );
}

export default function EvidenceReviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [reviewState, setReviewState] = useState<{
    id: string;
    mode: 'approve' | 'reject';
  } | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const {
    data: pendingEvidence = [],
    isLoading: evidenceLoading,
    mutate: refetchEvidence,
  } = useSWR<PendingEvidence[]>(
    projectId ? `/api/projects/${projectId}/evidence-review` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );

  const loading = projectLoading || evidenceLoading;

  const openReview = (id: string, mode: 'approve' | 'reject') => {
    setReviewState({ id, mode });
    setReviewNote('');
    setError('');
  };

  const cancelReview = () => {
    setReviewState(null);
    setReviewNote('');
    setError('');
  };

  const handleSubmitReview = async () => {
    if (!reviewState) return;
    const { id, mode } = reviewState;
    const action = mode === 'approve' ? 'APPROVE' : 'REJECT';

    if (action === 'REJECT' && !reviewNote.trim()) {
      setError('Please enter a reason for rejection.');
      return;
    }

    const evidence = pendingEvidence.find((e) => e.id === id);
    if (!evidence) return;

    setProcessing(true);
    setError('');

    try {
      const res = await fetch(
        `/api/projects/${projectId}/milestones/${evidence.milestone.id}/evidence/${id}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, note: reviewNote.trim() || undefined }),
        }
      );
      const data = await res.json();
      if (data.success) {
        cancelReview();
        void refetchEvidence();
      } else {
        setError(data.error ?? 'Review failed');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="space-y-4 animate-pulse">
          {[1, 2, 3].map((i) => (
            <div key={i} className="card h-40 bg-[rgba(255,255,255,0.03)]" />
          ))}
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 max-w-4xl">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[#e8e4dc]">Evidence Review</h1>
            <p className="text-sm text-[rgba(232,228,220,0.45)] mt-0.5">
              {pendingEvidence.length === 0
                ? 'No evidence pending review'
                : `${pendingEvidence.length} item${pendingEvidence.length > 1 ? 's' : ''} awaiting review`}
            </p>
          </div>
          {pendingEvidence.length > 0 && (
            <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-[rgba(var(--ax-accent-rgb),0.15)] text-[var(--ax-accent)] text-sm font-bold">
              {pendingEvidence.length}
            </span>
          )}
        </div>

        {/* Global error */}
        {error && !reviewState && <div className="alert alert-error">{error}</div>}

        {/* Empty state */}
        {pendingEvidence.length === 0 ? (
          <div className="card">
            <div className="card-body flex flex-col items-center justify-center py-16 text-center">
              <div className="w-12 h-12 rounded-full bg-[rgba(92,186,128,0.1)] flex items-center justify-center mb-4">
                <CheckCircle2 className="w-6 h-6 text-[#5cba80]" />
              </div>
              <h3 className="text-base font-medium text-[#e8e4dc]">All caught up</h3>
              <p className="text-sm text-[rgba(232,228,220,0.45)] mt-1">No evidence submissions waiting for review.</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingEvidence.map((ev) => {
              const isReviewing = reviewState?.id === ev.id;
              const isApproving = isReviewing && reviewState?.mode === 'approve';
              const isRejecting = isReviewing && reviewState?.mode === 'reject';
              const timeSince = formatDateTime(ev.submittedAt);

              return (
                <div
                  key={ev.id}
                  className={`card border transition-colors ${
                    isReviewing
                      ? isApproving
                        ? 'border-[rgba(92,186,128,0.3)]'
                        : 'border-[rgba(224,96,80,0.3)]'
                      : 'border-[rgba(255,255,255,0.07)]'
                  }`}
                >
                  <div className="card-body space-y-4">
                    {/* Top: Milestone + time */}
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div>
                        <Link
                          href={`/projects/${projectId}/milestones/${ev.milestone.id}`}
                          className="text-base font-semibold text-[var(--ax-accent)] hover:text-[var(--ax-accent)] transition-colors"
                        >
                          {ev.milestone.title}
                        </Link>
                        <div className="flex items-center gap-3 mt-1 text-xs text-[rgba(232,228,220,0.45)]">
                          <span className="flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {ev.submittedBy.name}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {timeSince}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs px-2 py-1 rounded-full bg-[rgba(var(--ax-accent-rgb),0.1)] text-[var(--ax-accent)] border border-[rgba(var(--ax-accent-rgb),0.2)] font-medium shrink-0">
                        Pending Review
                      </span>
                    </div>

                    {/* Completion bar */}
                    <div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Percent className="w-3.5 h-3.5 text-[rgba(232,228,220,0.35)]" />
                        <span className="text-xs text-[rgba(232,228,220,0.45)] uppercase tracking-wide">Completion</span>
                      </div>
                      <CompletionBar value={ev.qtyOrPercent} />
                    </div>

                    {/* Remarks */}
                    {ev.remarks && (
                      <div className="flex items-start gap-2 text-sm">
                        <MessageSquare className="w-3.5 h-3.5 text-[rgba(232,228,220,0.35)] mt-0.5 shrink-0" />
                        <p className="text-[rgba(232,228,220,0.65)] italic">&ldquo;{ev.remarks}&rdquo;</p>
                      </div>
                    )}

                    {/* Files */}
                    {ev.files.length > 0 && (
                      <div>
                        <p className="text-xs text-[rgba(232,228,220,0.35)] uppercase tracking-wide mb-2">
                          {ev.files.length} file{ev.files.length > 1 ? 's' : ''} attached
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {ev.files.map((f) => (
                            <FileChip key={f.id} file={f} />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Divider */}
                    <div className="border-t border-[rgba(255,255,255,0.06)]" />

                    {/* Review actions */}
                    {!isReviewing ? (
                      <div className="flex items-center gap-3">
                        <button
                          onClick={() => openReview(ev.id, 'approve')}
                          className="flex items-center gap-1.5 btn btn-sm bg-[rgba(92,186,128,0.12)] text-[#5cba80] border border-[rgba(92,186,128,0.25)] hover:bg-[rgba(92,186,128,0.2)]"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          Approve
                        </button>
                        <button
                          onClick={() => openReview(ev.id, 'reject')}
                          className="flex items-center gap-1.5 btn btn-sm bg-[rgba(224,96,80,0.1)] text-[#e06050] border border-[rgba(224,96,80,0.25)] hover:bg-[rgba(224,96,80,0.2)]"
                        >
                          <XCircle className="w-4 h-4" />
                          Reject
                        </button>
                        <Link
                          href={`/projects/${projectId}/milestones/${ev.milestone.id}`}
                          className="text-xs text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors"
                        >
                          View milestone →
                        </Link>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {/* Approve mode — note optional */}
                        {isApproving && (
                          <div className="p-3 rounded-lg bg-[rgba(92,186,128,0.06)] border border-[rgba(92,186,128,0.15)]">
                            <p className="text-sm font-medium text-[#5cba80] mb-2">Confirm Approval</p>
                            <textarea
                              rows={2}
                              className="input text-sm resize-none w-full"
                              placeholder="Optional: add a note for the vendor"
                              value={reviewNote}
                              onChange={(e) => setReviewNote(e.target.value)}
                            />
                          </div>
                        )}

                        {/* Reject mode — note required */}
                        {isRejecting && (
                          <div className="p-3 rounded-lg bg-[rgba(224,96,80,0.06)] border border-[rgba(224,96,80,0.15)]">
                            <p className="text-sm font-medium text-[#e06050] mb-2">Reason for Rejection <span className="font-normal text-xs opacity-70">(required)</span></p>
                            <textarea
                              autoFocus
                              rows={2}
                              className="input text-sm resize-none w-full"
                              placeholder="Describe what needs to be corrected or resubmitted…"
                              value={reviewNote}
                              onChange={(e) => setReviewNote(e.target.value)}
                            />
                          </div>
                        )}

                        {error && reviewState?.id === ev.id && (
                          <p className="text-xs text-[#e06050]">{error}</p>
                        )}

                        <div className="flex items-center gap-2">
                          <button
                            onClick={handleSubmitReview}
                            disabled={processing}
                            className={`btn btn-sm disabled:opacity-50 ${
                              isApproving
                                ? 'bg-[#5cba80] text-white hover:bg-[#4da870]'
                                : 'bg-[#e06050] text-white hover:bg-[#c8503f]'
                            }`}
                          >
                            {processing
                              ? '…'
                              : isApproving
                              ? 'Confirm Approve'
                              : 'Confirm Reject'}
                          </button>
                          <button
                            onClick={cancelReview}
                            disabled={processing}
                            className="btn btn-sm btn-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
