'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatDateTime } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';

interface PendingEvidence {
  id: string;
  qtyOrPercent: number;
  remarks?: string;
  submittedAt: string;
  submittedBy: { name: string };
  milestone: { id: string; title: string };
  files: Array<{ id: string; fileName: string }>;
}

export default function EvidenceReviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [error, setError] = useState('');

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const projectMilestones = ((project as any)?.milestones ?? []) as Array<{
    id: string;
    title: string;
  }>;

  // Stable SWR key built from milestone IDs.
  const milestoneIds = projectMilestones.map((m) => m.id);
  const swrKey =
    projectId && milestoneIds.length > 0
      ? ['evidence-review', projectId, milestoneIds.join(',')]
      : null;

  const {
    data: pendingEvidence = [],
    isLoading: evidenceLoading,
    mutate: refetchEvidence,
  } = useSWR<PendingEvidence[]>(
    swrKey,
    async () => {
      // Parallel per-milestone evidence fetch (was sequential — N requests
      // wall-time before).
      const results = await Promise.all(
        projectMilestones.map(async (ms) => {
          try {
            const res = await fetch(
              `/api/projects/${projectId}/milestones/${ms.id}/evidence`,
            );
            const data = await res.json();
            if (!data.success) return [] as PendingEvidence[];
            return (data.data as Array<PendingEvidence & { status: string }>)
              .filter((e) => e.status === 'SUBMITTED')
              .map((e) => ({ ...e, milestone: { id: ms.id, title: ms.title } }));
          } catch {
            return [] as PendingEvidence[];
          }
        }),
      );
      return results.flat();
    },
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const loading = projectLoading || evidenceLoading;

  const handleReview = async (evidenceId: string, action: 'APPROVE' | 'REJECT') => {
    if (action === 'REJECT' && !reviewNote.trim()) {
      setError('Rejection requires a reason');
      return;
    }

    setProcessing(true);
    setError('');

    const evidence = pendingEvidence.find((e) => e.id === evidenceId);
    if (!evidence) return;

    try {
      const res = await fetch(
        `/api/projects/${projectId}/milestones/${evidence.milestone.id}/evidence/${evidenceId}/review`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action,
            note: reviewNote || undefined,
          }),
        }
      );

      const data = await res.json();

      if (data.success) {
        setReviewingId(null);
        setReviewNote('');
        void refetchEvidence();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to review evidence');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-[#e8e4dc]">Evidence Review Queue</h1>

        {error && <div className="alert alert-error">{error}</div>}

        {pendingEvidence.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-[rgba(232,228,220,0.55)]">No evidence pending review</p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingEvidence.map((evidence) => (
              <div key={evidence.id} className="card">
                <div className="card-body">
                  <div className="flex justify-between items-start">
                    <div>
                      <Link
                        href={`/projects/${projectId}/milestones/${evidence.milestone.id}`}
                        className="text-lg font-semibold text-[#c4a35a] hover:underline"
                      >
                        {evidence.milestone.title}
                      </Link>
                      <p className="text-sm text-[rgba(232,228,220,0.55)] mt-1">
                        Submitted by {evidence.submittedBy.name} on{' '}
                        {formatDateTime(evidence.submittedAt)}
                      </p>
                      <p className="text-sm mt-2">
                        Completion: <span className="font-medium">{evidence.qtyOrPercent}%</span>
                      </p>
                      {evidence.remarks && (
                        <p className="text-sm text-[rgba(232,228,220,0.55)] mt-1">{evidence.remarks}</p>
                      )}
                      <p className="text-sm text-[rgba(232,228,220,0.55)] mt-2">
                        {evidence.files.length} file(s) attached
                      </p>
                    </div>
                  </div>

                  {reviewingId === evidence.id ? (
                    <div className="mt-4 space-y-3">
                      <div>
                        <label className="label">Review Note (required for rejection)</label>
                        <textarea
                          className="input"
                          rows={2}
                          value={reviewNote}
                          onChange={(e) => setReviewNote(e.target.value)}
                          placeholder="Enter review comments..."
                        />
                      </div>
                      <div className="flex space-x-3">
                        <button
                          onClick={() => handleReview(evidence.id, 'APPROVE')}
                          disabled={processing}
                          className="btn btn-success"
                        >
                          {processing ? 'Processing...' : 'Approve'}
                        </button>
                        <button
                          onClick={() => handleReview(evidence.id, 'REJECT')}
                          disabled={processing}
                          className="btn btn-danger"
                        >
                          {processing ? 'Processing...' : 'Reject'}
                        </button>
                        <button
                          onClick={() => {
                            setReviewingId(null);
                            setReviewNote('');
                          }}
                          className="btn btn-secondary"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4">
                      <button
                        onClick={() => setReviewingId(evidence.id)}
                        className="btn btn-primary"
                      >
                        Review Evidence
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
