'use client';

import { useState, useEffect } from 'react';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { useParams } from 'next/navigation';

interface ProjectData {
  id: string;
  name: string;
  description?: string;
  isExampleProject?: boolean;
  myRole: string;
  permissions: Record<string, boolean>;
  boqs: Array<{
    id: string;
    status: string;
    items: Array<{
      id: string;
      plannedValue: number;
    }>;
  }>;
  milestones: Array<{
    id: string;
    title: string;
    state: string;
    paymentModel: string;
    plannedEnd: string | null;
    paymentEligibility?: {
      state: string;
      eligibleAmount: number;
    };
  }>;
}

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [project, setProject] = useState<ProjectData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch(`/api/projects/${projectId}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setProject(data.data);
        } else {
          setError(data.error);
        }
      })
      .catch(() => setError('Failed to load project'))
      .finally(() => setLoading(false));
  }, [projectId]);

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  if (error || !project) {
    return (
      <Layout>
        <div className="alert alert-error">{error || 'Project not found'}</div>
      </Layout>
    );
  }

  const totalBOQValue = project.boqs.reduce(
    (sum, boq) => sum + boq.items.reduce((s, i) => s + i.plannedValue, 0),
    0
  );

  const milestoneStats = {
    total: project.milestones.length,
    draft: project.milestones.filter((m) => m.state === 'DRAFT').length,
    inProgress: project.milestones.filter((m) => m.state === 'IN_PROGRESS').length,
    submitted: project.milestones.filter((m) => m.state === 'SUBMITTED').length,
    verified: project.milestones.filter((m) => m.state === 'VERIFIED').length,
    closed: project.milestones.filter((m) => m.state === 'CLOSED').length,
  };

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={project.name} role={project.myRole} />

      {project.isExampleProject && (
        <div className="mb-6 p-4 bg-purple-50 border border-purple-200 rounded-lg">
          <p className="text-sm text-purple-700">
            <span className="font-medium">Example Project:</span> This project was created as an example for demonstration and testing.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-gray-500">Total BOQ Value</p>
              <p className="text-2xl font-bold text-gray-900">{formatCurrency(totalBOQValue)}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-gray-500">Total Milestones</p>
              <p className="text-2xl font-bold text-gray-900">{milestoneStats.total}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-gray-500">Verified</p>
              <p className="text-2xl font-bold text-green-600">{milestoneStats.verified}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm text-gray-500">In Progress</p>
              <p className="text-2xl font-bold text-orange-600">{milestoneStats.inProgress}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Quick Actions</h2>
          </div>
          <div className="card-body flex flex-wrap gap-3">
            {project.permissions.canEditBOQ && (
              <Link href={`/projects/${projectId}/boq`} className="btn btn-secondary">
                Manage BOQ
              </Link>
            )}
            {project.permissions.canEditMilestones && (
              <Link href={`/projects/${projectId}/milestones`} className="btn btn-secondary">
                Manage Milestones
              </Link>
            )}
            {project.permissions.canReviewEvidence && (
              <Link href={`/projects/${projectId}/evidence-review`} className="btn btn-secondary">
                Review Evidence
              </Link>
            )}
            <Link href={`/projects/${projectId}/dashboard`} className="btn btn-primary">
              View Dashboard
            </Link>
          </div>
        </div>

        {/* Recent Milestones */}
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h2 className="text-lg font-semibold">Recent Milestones</h2>
            <Link href={`/projects/${projectId}/milestones`} className="text-sm text-primary-600 hover:underline">
              View all
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>State</th>
                  <th>Payment Model</th>
                  <th>Due Date</th>
                  <th>Payment Status</th>
                </tr>
              </thead>
              <tbody>
                {project.milestones.slice(0, 5).map((milestone) => (
                  <tr key={milestone.id}>
                    <td>
                      <Link
                        href={`/projects/${projectId}/milestones/${milestone.id}`}
                        className="text-primary-600 hover:underline"
                      >
                        {milestone.title}
                      </Link>
                    </td>
                    <td>
                      <MilestoneStateBadge state={milestone.state as any} />
                    </td>
                    <td className="text-gray-500">{milestone.paymentModel}</td>
                    <td className="text-gray-500">{formatDate(milestone.plannedEnd)}</td>
                    <td>
                      {milestone.paymentEligibility ? (
                        <div className="flex items-center space-x-2">
                          <PaymentStatusBadge state={milestone.paymentEligibility.state as any} />
                          <span className="text-sm text-gray-500">
                            {formatCurrency(milestone.paymentEligibility.eligibleAmount)}
                          </span>
                        </div>
                      ) : (
                        <span className="text-gray-400">-</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Milestone State Distribution */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Milestone Progress</h2>
          </div>
          <div className="card-body">
            <div className="flex items-center space-x-4">
              <div className="flex-1 bg-gray-200 rounded-full h-4 overflow-hidden flex">
                {milestoneStats.total > 0 && (
                  <>
                    <div
                      className="bg-gray-400"
                      style={{ width: `${(milestoneStats.draft / milestoneStats.total) * 100}%` }}
                      title={`Draft: ${milestoneStats.draft}`}
                    />
                    <div
                      className="bg-blue-500"
                      style={{ width: `${(milestoneStats.inProgress / milestoneStats.total) * 100}%` }}
                      title={`In Progress: ${milestoneStats.inProgress}`}
                    />
                    <div
                      className="bg-yellow-500"
                      style={{ width: `${(milestoneStats.submitted / milestoneStats.total) * 100}%` }}
                      title={`Submitted: ${milestoneStats.submitted}`}
                    />
                    <div
                      className="bg-green-500"
                      style={{ width: `${(milestoneStats.verified / milestoneStats.total) * 100}%` }}
                      title={`Verified: ${milestoneStats.verified}`}
                    />
                    <div
                      className="bg-purple-500"
                      style={{ width: `${(milestoneStats.closed / milestoneStats.total) * 100}%` }}
                      title={`Closed: ${milestoneStats.closed}`}
                    />
                  </>
                )}
              </div>
            </div>
            <div className="flex justify-between mt-2 text-xs text-gray-500">
              <span>Draft: {milestoneStats.draft}</span>
              <span>In Progress: {milestoneStats.inProgress}</span>
              <span>Submitted: {milestoneStats.submitted}</span>
              <span>Verified: {milestoneStats.verified}</span>
              <span>Closed: {milestoneStats.closed}</span>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
}
