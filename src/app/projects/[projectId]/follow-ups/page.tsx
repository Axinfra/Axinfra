'use client';

import { ListPageSkeleton } from '@/components/ui/SkeletonPage';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatDateTime } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface FollowUp {
  id: string;
  type: string;
  description: string;
  status: string;
  createdAt: string;
  targetEntity: string;
  targetEntityId: string;
}

const typeLabels: Record<string, string> = {
  PENDING_EVIDENCE_REVIEW: 'Pending Evidence Review',
  PENDING_VERIFICATION: 'Pending Verification',
  PAYMENT_DUE_SOON: 'Payment Due Soon',
  PAYMENT_BLOCKED_TOO_LONG: 'Payment Blocked Too Long',
  HIGH_VENDOR_EXPOSURE: 'High Vendor Exposure',
  BOQ_OVERRUN: 'BOQ Overrun',
};

const typeColors: Record<string, string> = {
  PENDING_EVIDENCE_REVIEW: 'bg-[rgba(var(--ax-accent-rgb),0.08)] text-[var(--ax-accent)]',
  PENDING_VERIFICATION: 'bg-[rgba(59,130,246,0.1)] text-blue-300',
  PAYMENT_DUE_SOON: 'bg-[rgba(249,115,22,0.1)] text-orange-300',
  PAYMENT_BLOCKED_TOO_LONG: 'bg-[rgba(220,80,60,0.1)] text-[#e06050]',
  HIGH_VENDOR_EXPOSURE: 'bg-[rgba(var(--ax-accent-rgb),0.08)] text-[var(--ax-accent)]',
  BOQ_OVERRUN: 'bg-[rgba(236,72,153,0.1)] text-pink-300',
};

export default function FollowUpsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [error, setError] = useState('');

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [processing, setProcessing] = useState(false);

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const {
    data: followUps = [],
    isLoading: followUpsLoading,
    mutate: refetchFollowUps,
  } = useSWR<FollowUp[]>(
    projectId ? `/api/projects/${projectId}/follow-ups` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );
  const loading = projectLoading || followUpsLoading;

  const handleResolve = async (followUpId: string) => {
    if (!resolutionNote.trim()) {
      setError('Resolution note is required');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/follow-ups`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          followUpId,
          resolutionNote,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setResolvingId(null);
        setResolutionNote('');
        void refetchFollowUps();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to resolve follow-up');
    } finally {
      setProcessing(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <ListPageSkeleton />
      </Layout>
    );
  }

  // Group by type
  const groupedFollowUps = followUps.reduce((acc, fu) => {
    if (!acc[fu.type]) acc[fu.type] = [];
    acc[fu.type].push(fu);
    return acc;
  }, {} as Record<string, FollowUp[]>);

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Follow-ups</h1>
          <span className="text-[rgba(232,228,220,0.55)]">
            {followUps.length} open item{followUps.length !== 1 ? 's' : ''}
          </span>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {followUps.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-[rgba(232,228,220,0.55)]">No open follow-ups</p>
            </div>
          </div>
        ) : (
          Object.entries(groupedFollowUps).map(([type, items]) => (
            <div key={type} className="card">
              <div className="card-header">
                <div className="flex items-center space-x-2">
                  <span className={`badge ${typeColors[type] || 'badge-draft'}`}>
                    {typeLabels[type] || type}
                  </span>
                  <span className="text-sm text-[rgba(232,228,220,0.55)]">({items.length})</span>
                </div>
              </div>
              <div className="card-body space-y-4">
                {items.map((fu) => (
                  <div
                    key={fu.id}
                    className="border border-[rgba(255,255,255,0.07)] rounded-lg p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-[#e8e4dc]">{fu.description}</p>
                        <p className="text-xs text-[rgba(232,228,220,0.55)] mt-1">
                          Created {formatDateTime(fu.createdAt)}
                        </p>
                      </div>
                    </div>

                    {resolvingId === fu.id ? (
                      <div className="mt-4 space-y-3">
                        <div>
                          <label className="label">Resolution Note *</label>
                          <textarea
                            className="input"
                            rows={2}
                            value={resolutionNote}
                            onChange={(e) => setResolutionNote(e.target.value)}
                            placeholder="Describe how this was resolved..."
                          />
                        </div>
                        <div className="flex space-x-3">
                          <button
                            onClick={() => handleResolve(fu.id)}
                            disabled={processing}
                            className="btn btn-success"
                          >
                            {processing ? 'Resolving...' : 'Resolve'}
                          </button>
                          <button
                            onClick={() => {
                              setResolvingId(null);
                              setResolutionNote('');
                            }}
                            className="btn btn-secondary"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3">
                        <button
                          onClick={() => setResolvingId(fu.id)}
                          className="btn btn-sm btn-primary"
                        >
                          Resolve
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </Layout>
  );
}
