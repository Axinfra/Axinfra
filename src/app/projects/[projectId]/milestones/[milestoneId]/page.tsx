'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

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
    files: Array<{ id: string; fileName: string }>;
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
  };
}

export default function MilestoneDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const milestoneId = params.milestoneId as string;
  const [milestone, setMilestone] = useState<MilestoneData | null>(null);
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [transitioning, setTransitioning] = useState(false);
  const [transitionReason, setTransitionReason] = useState('');

  useEffect(() => {
    loadData();
  }, [projectId, milestoneId]);

  const loadData = async () => {
    try {
      const [projectRes, milestoneRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/milestones/${milestoneId}`),
      ]);

      const [projectData, milestoneData] = await Promise.all([
        projectRes.json(),
        milestoneRes.json(),
      ]);

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);
      }

      if (milestoneData.success) {
        setMilestone(milestoneData.data);
      } else {
        setError(milestoneData.error);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleTransition = async (toState: string) => {
    // Rejection requires reason
    if (milestone?.state === 'SUBMITTED' && toState === 'IN_PROGRESS') {
      if (!transitionReason.trim()) {
        setError('Rejection requires a reason');
        return;
      }
    }

    setTransitioning(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/transition`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          toState,
          reason: transitionReason || undefined,
        }),
      });

      const data = await res.json();
      if (data.success) {
        setTransitionReason('');
        loadData();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to transition');
    } finally {
      setTransitioning(false);
    }
  };

  const handleApproveExtra = async () => {
    if (!confirm('Are you sure you want to approve this Extra (outside BOQ) milestone?')) {
      return;
    }

    setTransitioning(true);
    setError('');

    try {
      const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}/approve-extra`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await res.json();
      if (data.success) {
        loadData();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to approve extra');
    } finally {
      setTransitioning(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  if (!milestone) {
    return (
      <Layout>
        <div className="alert alert-error">{error || 'Milestone not found'}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        {/* Header */}
        <div className="flex justify-between items-start">
          <div>
            <Link
              href={`/projects/${projectId}/milestones`}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Back to Milestones
            </Link>
            <h1 className="text-2xl font-bold text-gray-900 mt-2">{milestone.title}</h1>
            {milestone.description && (
              <p className="text-gray-600 mt-1">{milestone.description}</p>
            )}
          </div>
          <MilestoneStateBadge state={milestone.state as any} />
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Extra Approval Banner */}
        {milestone.isExtra && (
          <div className={`border rounded-lg p-4 ${
            milestone.extraApprovedAt
              ? 'bg-green-50 border-green-200'
              : 'bg-orange-50 border-orange-200'
          }`}>
            <div className="flex items-center justify-between">
              <div>
                <p className={`font-medium ${
                  milestone.extraApprovedAt ? 'text-green-800' : 'text-orange-800'
                }`}>
                  {milestone.extraApprovedAt
                    ? '✓ Extra Approved'
                    : '⚠️ Extra (Outside BOQ) - Pending Approval'}
                </p>
                <p className={`text-sm ${
                  milestone.extraApprovedAt ? 'text-green-600' : 'text-orange-600'
                }`}>
                  {milestone.extraApprovedAt
                    ? `Approved on ${formatDateTime(milestone.extraApprovedAt)}`
                    : 'This milestone is outside the approved BOQ and requires Owner approval.'}
                </p>
              </div>
              {!milestone.extraApprovedAt && myRole === 'OWNER' && (
                <button
                  onClick={handleApproveExtra}
                  disabled={transitioning}
                  className="btn bg-orange-600 text-white hover:bg-orange-700"
                >
                  {transitioning ? 'Approving...' : 'Approve Extra'}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Info Cards */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-gray-500">Payment Model</p>
              <p className="text-lg font-semibold">{milestone.paymentModel.replace('_', ' ')}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-gray-500">Planned Value</p>
              <p className="text-lg font-semibold">{formatCurrency(milestone.plannedValue)}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-gray-500">Due Date</p>
              <p className="text-lg font-semibold">{formatDate(milestone.plannedEnd)}</p>
            </div>
          </div>
        </div>

        {/* State Transition */}
        {milestone.validNextStates.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold">Actions</h2>
            </div>
            <div className="card-body">
              {milestone.state === 'SUBMITTED' &&
                milestone.validNextStates.includes('IN_PROGRESS') && (
                  <div className="mb-4">
                    <label className="label">Rejection Reason (required for rejection)</label>
                    <textarea
                      className="input"
                      rows={2}
                      value={transitionReason}
                      onChange={(e) => setTransitionReason(e.target.value)}
                      placeholder="Enter reason for rejection..."
                    />
                  </div>
                )}
              <div className="flex flex-wrap gap-3">
                {milestone.validNextStates.map((state) => (
                  <button
                    key={state}
                    onClick={() => handleTransition(state)}
                    disabled={transitioning}
                    className={`btn ${
                      state === 'VERIFIED' || state === 'CLOSED'
                        ? 'btn-success'
                        : state === 'IN_PROGRESS' && milestone.state === 'SUBMITTED'
                        ? 'btn-danger'
                        : 'btn-primary'
                    }`}
                  >
                    {transitioning ? 'Processing...' : `Move to ${state.replace('_', ' ')}`}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Quick Links */}
        <div className="flex flex-wrap gap-3">
          {milestone.permissions.canSubmitEvidence && milestone.state === 'IN_PROGRESS' && (
            <Link
              href={`/projects/${projectId}/milestones/${milestoneId}/evidence`}
              className="btn btn-primary"
            >
              Submit Evidence
            </Link>
          )}
          {milestone.permissions.canVerify && milestone.state === 'SUBMITTED' && (
            <Link
              href={`/projects/${projectId}/milestones/${milestoneId}/verify`}
              className="btn btn-success"
            >
              Verify Milestone
            </Link>
          )}
        </div>

        {/* Evidence */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Evidence ({milestone.evidence.length})</h2>
          </div>
          <div className="card-body">
            {milestone.evidence.length === 0 ? (
              <p className="text-gray-500 text-center py-4">No evidence submitted yet</p>
            ) : (
              <div className="space-y-4">
                {milestone.evidence.map((ev) => (
                  <div key={ev.id} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <span
                          className={`badge ${
                            ev.status === 'APPROVED'
                              ? 'badge-verified'
                              : ev.status === 'REJECTED'
                              ? 'badge-blocked'
                              : 'badge-submitted'
                          }`}
                        >
                          {ev.status}
                        </span>
                        <p className="text-sm text-gray-600 mt-2">
                          Submitted by {ev.submittedBy.name} on {formatDateTime(ev.submittedAt)}
                        </p>
                        <p className="text-sm mt-1">
                          Qty/Percent: <span className="font-medium">{ev.qtyOrPercent}%</span>
                        </p>
                        {ev.remarks && <p className="text-sm text-gray-500 mt-1">{ev.remarks}</p>}
                        {ev.reviewNote && (
                          <p className="text-sm text-red-600 mt-1">
                            Review note: {ev.reviewNote}
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="text-xs text-gray-500">{ev.files.length} file(s)</p>
                      </div>
                    </div>
                    {/* File List */}
                    {ev.files.length > 0 && (
                      <div className="mt-3 pt-3 border-t border-gray-100">
                        <p className="text-xs text-gray-500 mb-2">Attached Files:</p>
                        <div className="flex flex-wrap gap-2">
                          {ev.files.map((file) => (
                            <a
                              key={file.id}
                              href={`/api/files/${file.id}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center px-2 py-1 text-xs bg-gray-100 hover:bg-gray-200 rounded text-primary-600"
                            >
                              {file.fileName}
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

        {/* Payment Status */}
        {milestone.paymentEligibility && (
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold">Payment Status</h2>
            </div>
            <div className="card-body">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4">
                  <PaymentStatusBadge state={milestone.paymentEligibility.state as any} />
                  <span className="text-xl font-bold">
                    {formatCurrency(milestone.paymentEligibility.eligibleAmount)}
                  </span>
                </div>
                <Link
                  href={`/projects/${projectId}/payments`}
                  className="btn btn-sm btn-secondary"
                >
                  Manage Payments
                </Link>
              </div>
            </div>
          </div>
        )}

        {/* Transition History */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">State History</h2>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              {milestone.transitions.map((t, i) => (
                <div key={i} className="flex items-start space-x-3 text-sm">
                  <div className="w-32 text-gray-500">{formatDateTime(t.createdAt)}</div>
                  <div>
                    <span className="font-medium">{t.actor.name}</span>
                    <span className="text-gray-500"> moved to </span>
                    <span className="font-medium">{t.toState}</span>
                    {t.reason && <span className="text-gray-500"> - {t.reason}</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
