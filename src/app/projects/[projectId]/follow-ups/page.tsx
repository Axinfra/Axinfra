'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatDateTime } from '@/lib/utils';

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
  PENDING_EVIDENCE_REVIEW: 'bg-yellow-100 text-yellow-800',
  PENDING_VERIFICATION: 'bg-blue-100 text-blue-800',
  PAYMENT_DUE_SOON: 'bg-orange-100 text-orange-800',
  PAYMENT_BLOCKED_TOO_LONG: 'bg-red-100 text-red-800',
  HIGH_VENDOR_EXPOSURE: 'bg-purple-100 text-purple-800',
  BOQ_OVERRUN: 'bg-pink-100 text-pink-800',
};

export default function FollowUpsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [followUps, setFollowUps] = useState<FollowUp[]>([]);
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolutionNote, setResolutionNote] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const [projectRes, followUpsRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/follow-ups`),
      ]);

      const [projectData, followUpsData] = await Promise.all([
        projectRes.json(),
        followUpsRes.json(),
      ]);

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);
      }

      if (followUpsData.success) {
        setFollowUps(followUpsData.data);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

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
        loadData();
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
        <div className="text-center py-12">Loading...</div>
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
          <h1 className="text-2xl font-bold text-gray-900">Follow-ups</h1>
          <span className="text-gray-500">
            {followUps.length} open item{followUps.length !== 1 ? 's' : ''}
          </span>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {followUps.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-gray-500">No open follow-ups</p>
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
                  <span className="text-sm text-gray-500">({items.length})</span>
                </div>
              </div>
              <div className="card-body space-y-4">
                {items.map((fu) => (
                  <div
                    key={fu.id}
                    className="border border-gray-200 rounded-lg p-4"
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <p className="text-gray-900">{fu.description}</p>
                        <p className="text-xs text-gray-500 mt-1">
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
