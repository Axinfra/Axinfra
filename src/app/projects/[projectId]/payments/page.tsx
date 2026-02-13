'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import { formatCurrency, formatDateTime } from '@/lib/utils';
import { BlockingReasonLabels } from '@/types';

interface PaymentEligibilityItem {
  id: string;
  state: string;
  eligibleAmount: number;
  blockedAmount: number;
  dueDate: string | null;
  blockReasonCode?: string;
  blockExplanation?: string;
  blockedAt?: string;
  markedPaidAt?: string;
  paidExplanation?: string;
  milestone: {
    id: string;
    title: string;
    paymentModel: string;
    state: string;
  };
  events: Array<{
    eventType: string;
    fromState?: string;
    toState: string;
    explanation?: string;
    createdAt: string;
    actor: { name: string };
  }>;
}

export default function PaymentsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [eligibilityItems, setEligibilityItems] = useState<PaymentEligibilityItem[]>([]);
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [actionItem, setActionItem] = useState<PaymentEligibilityItem | null>(null);
  const [actionType, setActionType] = useState<'block' | 'unblock' | 'markPaid' | null>(null);
  const [reasonCode, setReasonCode] = useState('QUALITY_ISSUE');
  const [explanation, setExplanation] = useState('');
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
        setPermissions(projectData.data.permissions);

        // Extract payment eligibility items from milestones
        const items: PaymentEligibilityItem[] = [];
        for (const ms of projectData.data.milestones || []) {
          if (ms.paymentEligibility) {
            const paymentRes = await fetch(
              `/api/projects/${projectId}/milestones/${ms.id}/payment`
            );
            const paymentData = await paymentRes.json();
            if (paymentData.success) {
              items.push(paymentData.data);
            }
          }
        }
        setEligibilityItems(items);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleAction = async () => {
    if (!actionItem || !actionType) return;

    if (!explanation.trim()) {
      setError('Explanation is required');
      return;
    }

    setProcessing(true);
    setError('');

    try {
      const body: Record<string, unknown> = {
        action: actionType,
        explanation,
      };

      if (actionType === 'block') {
        body.reasonCode = reasonCode;
      }
      if (actionType === 'unblock') {
        body.reason = explanation;
      }

      const res = await fetch(
        `/api/projects/${projectId}/milestones/${actionItem.milestone.id}/payment/mark`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }
      );

      const data = await res.json();

      if (data.success) {
        setActionItem(null);
        setActionType(null);
        setExplanation('');
        loadData();
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to process action');
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

  // States that are eligible for payment
  const eligibleStates = ['PARTIALLY_ELIGIBLE', 'FULLY_ELIGIBLE'];

  const summary = {
    eligible: eligibilityItems.filter((p) => eligibleStates.includes(p.state)),
    blocked: eligibilityItems.filter((p) => p.state === 'BLOCKED'),
    paid: eligibilityItems.filter((p) => p.state === 'MARKED_PAID'),
  };

  const totalEligible = summary.eligible.reduce((s, p) => s + p.eligibleAmount, 0);
  const totalBlocked = summary.blocked.reduce((s, p) => s + p.blockedAmount, 0);
  const totalPaid = summary.paid.reduce((s, p) => s + p.eligibleAmount, 0);

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Payment Eligibility</h1>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Summary */}
        <div className="grid gap-4 md:grid-cols-3">
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-gray-500">Eligible for Payment</p>
              <p className="text-2xl font-bold text-green-600">{formatCurrency(totalEligible)}</p>
              <p className="text-xs text-gray-500">{summary.eligible.length} items</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-gray-500">Blocked</p>
              <p className="text-2xl font-bold text-red-600">{formatCurrency(totalBlocked)}</p>
              <p className="text-xs text-gray-500">{summary.blocked.length} items</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-gray-500">Marked as Paid</p>
              <p className="text-2xl font-bold text-emerald-600">{formatCurrency(totalPaid)}</p>
              <p className="text-xs text-gray-500">{summary.paid.length} items</p>
            </div>
          </div>
        </div>

        {/* Eligibility Items */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">All Payment Eligibility Items</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>State</th>
                  <th>Payment Model</th>
                  <th>Status</th>
                  <th className="text-right">Value</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {eligibilityItems.map((item) => (
                  <tr key={item.id}>
                    <td className="font-medium">{item.milestone.title}</td>
                    <td>
                      <MilestoneStateBadge state={item.milestone.state as any} />
                    </td>
                    <td className="text-gray-500">
                      {item.milestone.paymentModel.replace('_', ' ')}
                    </td>
                    <td>
                      <PaymentStatusBadge state={item.state as any} />
                    </td>
                    <td className="text-right font-medium">
                      {formatCurrency(item.state === 'BLOCKED' ? item.blockedAmount : item.eligibleAmount)}
                    </td>
                    <td>
                      <div className="flex space-x-2">
                        {permissions.canBlockPayment &&
                          !['BLOCKED', 'MARKED_PAID'].includes(item.state) &&
                          item.state !== 'NOT_DUE' &&
                          item.state !== 'VERIFIED_NOT_ELIGIBLE' && (
                            <button
                              onClick={() => {
                                setActionItem(item);
                                setActionType('block');
                              }}
                              className="btn btn-sm btn-danger"
                            >
                              Block
                            </button>
                          )}
                        {permissions.canUnblockPayment && item.state === 'BLOCKED' && (
                          <button
                            onClick={() => {
                              setActionItem(item);
                              setActionType('unblock');
                            }}
                            className="btn btn-sm btn-secondary"
                          >
                            Unblock
                          </button>
                        )}
                        {permissions.canMarkPaid &&
                          eligibleStates.includes(item.state) && (
                            <button
                              onClick={() => {
                                setActionItem(item);
                                setActionType('markPaid');
                              }}
                              className="btn btn-sm btn-success"
                            >
                              Mark Paid
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

        {/* Blocked Items Detail */}
        {summary.blocked.length > 0 && (
          <div className="card">
            <div className="card-header">
              <h2 className="text-lg font-semibold text-red-600">Blocked Payments</h2>
            </div>
            <div className="card-body space-y-4">
              {summary.blocked.map((item) => (
                <div key={item.id} className="border border-red-200 rounded-lg p-4 bg-red-50">
                  <div className="flex justify-between items-start">
                    <div>
                      <p className="font-medium">{item.milestone.title}</p>
                      <p className="text-sm text-gray-600">
                        {formatCurrency(item.blockedAmount)}
                      </p>
                    </div>
                    <span className="badge badge-blocked">
                      {item.blockReasonCode
                        ? BlockingReasonLabels[item.blockReasonCode as keyof typeof BlockingReasonLabels]
                        : 'Blocked'}
                    </span>
                  </div>
                  {item.blockExplanation && (
                    <div className="mt-2 text-sm text-gray-600">
                      <p>{item.blockExplanation}</p>
                      {item.blockedAt && (
                        <p className="text-xs text-gray-500 mt-1">
                          Blocked on {formatDateTime(item.blockedAt)}
                        </p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Action Modal */}
      {actionItem && actionType && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-4">
                {actionType === 'block'
                  ? 'Block Payment'
                  : actionType === 'unblock'
                  ? 'Unblock Payment'
                  : 'Mark as Paid'}
              </h2>

              <p className="text-sm text-gray-600 mb-4">
                {actionItem.milestone.title} - {formatCurrency(actionItem.eligibleAmount)}
              </p>

              <div className="space-y-4">
                {actionType === 'block' && (
                  <div>
                    <label className="label">Reason *</label>
                    <select
                      className="input"
                      value={reasonCode}
                      onChange={(e) => setReasonCode(e.target.value)}
                    >
                      {Object.entries(BlockingReasonLabels).map(([code, label]) => (
                        <option key={code} value={code}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label className="label">
                    {actionType === 'block' ? 'Explanation' : 'Reason'} *
                  </label>
                  <textarea
                    className="input"
                    rows={3}
                    value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder={
                      actionType === 'block'
                        ? 'Provide details about why this payment is being blocked...'
                        : actionType === 'unblock'
                        ? 'Provide reason for unblocking...'
                        : 'Provide payment reference or details...'
                    }
                  />
                </div>

                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    onClick={() => {
                      setActionItem(null);
                      setActionType(null);
                      setExplanation('');
                    }}
                    className="btn btn-secondary"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleAction}
                    disabled={processing}
                    className={`btn ${
                      actionType === 'block'
                        ? 'btn-danger'
                        : actionType === 'markPaid'
                        ? 'btn-success'
                        : 'btn-primary'
                    }`}
                  >
                    {processing ? 'Processing...' : 'Confirm'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
