'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';

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
  paymentEligibility?: {
    state: string;
    eligibleAmount: number;
    advanceAmount: number;
    remainingAmount: number;
  };
}

export default function MilestonesPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [permissions, setPermissions] = useState<Record<string, boolean>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const [projectRes, milestonesRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/milestones`),
      ]);

      const [projectData, milestonesData] = await Promise.all([
        projectRes.json(),
        milestonesRes.json(),
      ]);

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);
        setPermissions(projectData.data.permissions);
      }

      if (milestonesData.success) {
        setMilestones(milestonesData.data);
      }
    } catch {
      setError('Failed to load data');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (milestoneId: string) => {
    const res = await fetch(`/api/projects/${projectId}/milestones/${milestoneId}`, {
      method: 'DELETE',
    });

    const data = await res.json();
    if (data.success) {
      setDeleteConfirm(null);
      loadData();
    } else {
      setError(data.error);
      setDeleteConfirm(null);
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
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-gray-900">Milestones</h1>
          {permissions.canEditMilestones && (
            <Link
              href={`/projects/${projectId}/milestones/new`}
              className="btn btn-primary"
            >
              Create Milestone
            </Link>
          )}
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {milestones.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-gray-500">No milestones created yet</p>
            </div>
          </div>
        ) : (
          <div className="card">
            <div className="overflow-x-auto">
              <table className="table">
                <thead>
                  <tr>
                    <th>Title</th>
                    {(myRole === 'OWNER' || myRole === 'PMC') && <th>Vendor</th>}
                    <th>State</th>
                    <th>Due Date</th>
                    <th>Payment Status</th>
                    <th>Total Value</th>
                    <th>Eligible</th>
                    <th>Advance</th>
                    <th>Remaining</th>
                    {myRole === 'OWNER' && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((milestone) => (
                    <tr key={milestone.id}>
                      <td>
                        <div className="flex items-center gap-2">
                          <Link
                            href={`/projects/${projectId}/milestones/${milestone.id}`}
                            className="text-primary-600 hover:underline font-medium"
                          >
                            {milestone.title}
                          </Link>
                          {milestone.isExtra && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              milestone.extraApprovedAt
                                ? 'bg-green-100 text-green-700'
                                : 'bg-orange-100 text-orange-700'
                            }`}>
                              {milestone.extraApprovedAt ? 'Extra \u2713' : 'Extra (Pending)'}
                            </span>
                          )}
                        </div>
                        {milestone.description && (
                          <p className="text-xs text-gray-500 mt-1 truncate max-w-xs">
                            {milestone.description}
                          </p>
                        )}
                      </td>
                      {(myRole === 'OWNER' || myRole === 'PMC') && (
                        <td>
                          {milestone.vendorUser ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-xs font-medium">
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                              </svg>
                              {milestone.vendorUser.name}
                            </span>
                          ) : (
                            <span className="text-xs text-gray-400">&mdash;</span>
                          )}
                        </td>
                      )}
                      <td>
                        <MilestoneStateBadge state={milestone.state as any} />
                      </td>
                      <td className="text-gray-500">{formatDate(milestone.plannedEnd)}</td>
                      <td>
                        {milestone.paymentEligibility ? (
                          <PaymentStatusBadge state={milestone.paymentEligibility.state as any} />
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="font-medium">
                        {formatCurrency(milestone.value || 0)}
                      </td>
                      <td className={`font-medium ${
                        (milestone.paymentEligibility?.eligibleAmount ?? 0) > 0 ? 'text-green-600' : 'text-gray-400'
                      }`}>
                        {milestone.paymentEligibility
                          ? formatCurrency(milestone.paymentEligibility.eligibleAmount)
                          : '-'}
                      </td>
                      <td className="text-gray-600">
                        {milestone.paymentEligibility?.advanceAmount
                          ? formatCurrency(milestone.paymentEligibility.advanceAmount)
                          : '-'}
                        {milestone.advancePercent > 0 && (
                          <span className="text-xs text-gray-400 ml-1">({milestone.advancePercent}%)</span>
                        )}
                      </td>
                      <td className="font-medium text-orange-600">
                        {milestone.paymentEligibility?.remainingAmount
                          ? formatCurrency(milestone.paymentEligibility.remainingAmount)
                          : '-'}
                      </td>
                      {myRole === 'OWNER' && (
                        <td>
                          <button
                            onClick={() => setDeleteConfirm(milestone.id)}
                            className="text-red-600 hover:text-red-800 text-sm font-medium"
                          >
                            Delete
                          </button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal — kept as modal (destructive action confirmation) */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-red-600">Delete Milestone</h2>
              <p className="text-gray-600 mb-4">
                Are you sure you want to delete this milestone? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setDeleteConfirm(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="btn bg-red-600 text-white hover:bg-red-700"
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
