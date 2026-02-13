'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatDateTime } from '@/lib/utils';

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
  const [pendingEvidence, setPendingEvidence] = useState<PendingEvidence[]>([]);
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const projectRes = await fetch(`/api/projects/${projectId}`);
      const projectData = await projectRes.json();

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);

        // Get pending evidence from milestones
        const milestones = projectData.data.milestones || [];
        const pending: PendingEvidence[] = [];

        for (const ms of milestones) {
          const evidenceRes = await fetch(
            `/api/projects/${projectId}/milestones/${ms.id}/evidence`
          );
          const evidenceData = await evidenceRes.json();

          if (evidenceData.success) {
            const submitted = evidenceData.data.filter(
              (e: { status: string }) => e.status === 'SUBMITTED'
            );
            submitted.forEach((e: PendingEvidence) => {
              pending.push({
                ...e,
                milestone: { id: ms.id, title: ms.title },
              });
            });
          }
        }

        setPendingEvidence(pending);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

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
        loadData();
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
        <h1 className="text-2xl font-bold text-gray-900">Evidence Review Queue</h1>

        {error && <div className="alert alert-error">{error}</div>}

        {pendingEvidence.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-gray-500">No evidence pending review</p>
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
                        className="text-lg font-semibold text-primary-600 hover:underline"
                      >
                        {evidence.milestone.title}
                      </Link>
                      <p className="text-sm text-gray-600 mt-1">
                        Submitted by {evidence.submittedBy.name} on{' '}
                        {formatDateTime(evidence.submittedAt)}
                      </p>
                      <p className="text-sm mt-2">
                        Completion: <span className="font-medium">{evidence.qtyOrPercent}%</span>
                      </p>
                      {evidence.remarks && (
                        <p className="text-sm text-gray-500 mt-1">{evidence.remarks}</p>
                      )}
                      <p className="text-sm text-gray-500 mt-2">
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
