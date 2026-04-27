'use client';

import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import PaymentStatusBadge from '@/components/PaymentStatusBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useProject } from '@/lib/contexts/ProjectContext';

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
  const { project: ctxProject, isLoading: loading, error } = useProject();
  // Cast to the rich shape this page expects (boqs, milestones, permissions).
  const project = ctxProject as unknown as ProjectData | null;

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
        <div className="alert alert-error">{error?.message || 'Project not found'}</div>
      </Layout>
    );
  }

  // VENDOR/VIEWER responses don't include `boqs`; default to empty list.
  const boqs = project.boqs ?? [];
  const milestones = project.milestones ?? [];

  const totalBOQValue = boqs.reduce(
    (sum, boq) => sum + (boq.items ?? []).reduce((s, i) => s + i.plannedValue, 0),
    0
  );

  const milestoneStats = {
    total: milestones.length,
    draft: milestones.filter((m) => m.state === 'DRAFT').length,
    inProgress: milestones.filter((m) => m.state === 'IN_PROGRESS').length,
    submitted: milestones.filter((m) => m.state === 'SUBMITTED').length,
    verified: milestones.filter((m) => m.state === 'VERIFIED').length,
    closed: milestones.filter((m) => m.state === 'CLOSED').length,
  };

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={project.name} role={project.myRole} />

      {project.isExampleProject && (
        <div className="mb-6 p-4 rounded-lg border-l-4 border-purple-500" style={{ backgroundColor: 'rgba(139, 92, 246, 0.1)' }}>
          <p className="text-sm text-purple-300">
            <span className="font-medium">Example Project:</span> This project was created as an example for demonstration and testing.
          </p>
        </div>
      )}

      <div className="space-y-6">
        {/* Summary Cards */}
        <div className="grid gap-4 md:grid-cols-4">
          <div className="card">
            <div className="card-body">
              <p className="text-sm font-medium" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>Total BOQ Value</p>
              <p className="text-2xl font-bold" style={{ color: '#f5f1e8' }}>{formatCurrency(totalBOQValue)}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm font-medium" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>Total Milestones</p>
              <p className="text-2xl font-bold" style={{ color: '#f5f1e8' }}>{milestoneStats.total}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm font-medium" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>Verified</p>
              <p className="text-2xl font-bold text-green-400">{milestoneStats.verified}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm font-medium" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>In Progress</p>
              <p className="text-2xl font-bold text-orange-400">{milestoneStats.inProgress}</p>
            </div>
          </div>
        </div>

        {/* Quick Actions */}
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Quick Actions</h2>
          </div>
          <div className="card-body flex flex-wrap gap-3">
            {project.permissions?.canEditBOQ && (
              <Link href={`/projects/${projectId}/boq`} className="btn btn-secondary">
                Manage BOQ
              </Link>
            )}
            {project.permissions?.canEditMilestones && (
              <Link href={`/projects/${projectId}/milestones`} className="btn btn-secondary">
                Manage Milestones
              </Link>
            )}
            {project.permissions?.canReviewEvidence && (
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
            <Link href={`/projects/${projectId}/milestones`} className="text-sm hover:underline" style={{ color: '#c4a35a' }}>
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
                {milestones.slice(0, 5).map((milestone) => (
                  <tr key={milestone.id}>
                    <td>
                      <Link
                        href={`/projects/${projectId}/milestones/${milestone.id}`}
                        className="hover:underline"
                        style={{ color: '#c4a35a' }}
                      >
                        {milestone.title}
                      </Link>
                    </td>
                    <td>
                      <MilestoneStateBadge state={milestone.state as any} />
                    </td>
                    <td style={{ color: 'rgba(232, 228, 220, 0.7)' }}>{milestone.paymentModel}</td>
                    <td style={{ color: 'rgba(232, 228, 220, 0.7)' }}>{formatDate(milestone.plannedEnd)}</td>
                    <td>
                      {milestone.paymentEligibility ? (
                        <div className="flex items-center space-x-2">
                          <PaymentStatusBadge state={milestone.paymentEligibility.state as any} />
                          <span className="text-sm" style={{ color: 'rgba(232, 228, 220, 0.7)' }}>
                            {formatCurrency(milestone.paymentEligibility.eligibleAmount)}
                          </span>
                        </div>
                      ) : (
                        <span style={{ color: 'rgba(232, 228, 220, 0.4)' }}>-</span>
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
              <div className="flex-1 rounded-full h-4 overflow-hidden flex" style={{ backgroundColor: 'rgba(255, 255, 255, 0.06)' }}>
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
            <div className="flex justify-between mt-2 text-xs" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>
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
