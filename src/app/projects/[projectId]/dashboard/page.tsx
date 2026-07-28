'use client';

import dynamic from 'next/dynamic';
import Link from 'next/link';
import { DashboardSkeleton } from '@/components/ui/SkeletonPage';
import { Skeleton } from '@/components/ui/Skeleton';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
const ActivityFeed = dynamic(() => import('@/components/dashboard/ActivityFeed'), { loading: () => <Skeleton className='h-48 w-full rounded-lg' /> });
const MilestoneCompletionChart = dynamic(() => import('@/components/dashboard/MilestoneCompletionChart'), { loading: () => <Skeleton className='h-48 w-full rounded-lg' /> });
const ProjectTimelineSection = dynamic(() => import('@/components/dashboard/ProjectTimelineSection'), { loading: () => <Skeleton className='h-48 w-full rounded-lg' /> });
const CostScheduleVarianceCard = dynamic(() => import('@/components/dashboard/CostScheduleVarianceCard'), { loading: () => <Skeleton className='h-48 w-full rounded-lg' /> });

export default function DashboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  // Project metadata is hoisted to the workspace layout; one fetch per session.
  const { project, isLoading: projectLoading } = useProject();

  // Dashboard payload — high-change data, 30s dedupe.
  const {
    data: dashboard,
    error,
    isLoading: dashboardLoading,
  } = useSWR<any>(
    projectId ? `/api/projects/${projectId}/dashboard` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 5_000 },
  );

  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const roleLabel = myRole === 'CONSULTANT' ? 'CONSULTANTS' : myRole;
  const loading = projectLoading || dashboardLoading;

  if (loading) {
    return (
      <Layout>
        <DashboardSkeleton />
      </Layout>
    );
  }

  if (!dashboard) {
    return (
      <Layout>
        <div className="alert alert-error">{error?.message || 'Dashboard not available'}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>
          {roleLabel} Dashboard
        </h1>

        {/* Combined milestone/phase (Execution) + purchase-order (Procurement) timeline — same
            components as the EI Gantt page, visible here for every role. */}
        <ProjectTimelineSection projectId={projectId} />

        {myRole === 'CLIENT' && <OwnerDashboard data={dashboard} projectId={projectId} currency={project?.currency} />}
        {myRole === 'PMC' && <PMCDashboard data={dashboard} projectId={projectId} currency={project?.currency} />}
        {myRole === 'VENDOR' && <VendorDashboard data={dashboard} projectId={projectId} currency={project?.currency} />}
        {myRole === 'VIEWER' && <ViewerDashboard data={dashboard} />}
        {myRole === 'CONSULTANT' && <ArtifactsDashboard data={dashboard} />}
      </div>
    </Layout>
  );
}

/** RA Bills KPI row — Submitted/Approved/Released totals plus pending-action counts, shared
 * across Owner/PMC dashboards. Links out to the project-wide RA Bills page for full detail. */
function RABillsSection({
  projectId,
  submitted,
  approved,
  released,
  pendingCertification,
  pendingApproval,
  currency,
}: {
  projectId: string;
  submitted: number;
  approved: number;
  released: number;
  pendingCertification: number;
  pendingApproval: number;
  currency?: string;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h2 className="text-lg font-semibold text-[#f5f1e8]">RA Bills</h2>
        <Link href={`/projects/${projectId}/ra-bills`} className="text-xs text-[var(--ax-accent)] hover:underline">
          View all →
        </Link>
      </div>
      <div className="grid gap-4 grid-cols-2 md:grid-cols-5">
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.6)' }}>Submitted Value</p>
            <p className="text-xl font-bold" style={{ color: 'var(--ax-text)' }}>{formatCurrency(submitted, currency)}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.6)' }}>Approved Value</p>
            <p className="text-xl font-bold text-green-400">{formatCurrency(approved, currency)}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.6)' }}>Released Value</p>
            <p className="text-xl font-bold text-blue-400">{formatCurrency(released, currency)}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.6)' }}>Pending Certification</p>
            <p className="text-xl font-bold text-orange-400">{pendingCertification}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.6)' }}>Pending Approval</p>
            <p className="text-xl font-bold text-purple-400">{pendingApproval}</p>
          </div>
        </div>
      </div>
    </section>
  );
}

function OwnerDashboard({ data, projectId, currency }: { data: any; projectId: string; currency?: string }) {
  return (
    <div className="space-y-6">
      <RABillsSection
        projectId={projectId}
        submitted={data.summary.totalRABillSubmittedValue ?? 0}
        approved={data.summary.totalRABillApprovedValue ?? 0}
        released={data.summary.totalRABillReleasedValue ?? 0}
        pendingCertification={data.summary.raBillsPendingCertification ?? 0}
        pendingApproval={data.summary.raBillsPendingApproval ?? 0}
        currency={currency}
      />

      {/* ── Cost & Schedule Variance summary — how the project is tracking vs plan ── */}
      <CostScheduleVarianceCard projectId={projectId} currency={currency} />

      {/* ── Project Overview Charts ── */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-[#f5f1e8]">Project Overview</h2>
          <span className="text-xs text-[rgba(232,228,220,0.45)]">
            Across all your owned projects
          </span>
        </div>
        <div className="grid gap-4 grid-cols-1 lg:grid-cols-2 xl:grid-cols-3">
          <MilestoneCompletionChart />
        </div>
      </section>

      {/* ── Recent Activity Feed ── */}
      <ActivityFeed projectId={projectId} />

      {/* Architecture / Artifacts Snapshot */}
      <ArchitectureSection architecture={data.architecture} />

      {/* Follow-ups */}
      {data.followUps?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">
              Open Follow-ups ({data.openFollowUps})
            </h2>
          </div>
          <div className="card-body">
            <div className="space-y-2">
              {data.followUps.slice(0, 5).map((f: any) => (
                <div key={f.id} className="text-sm p-2 bg-[rgba(255,255,255,0.04)] rounded">
                  {f.description}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ArchitectureSection({ architecture }: { architecture: any }) {
  if (!architecture) return null;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">Architecture Overview</h2>
        </div>
        <div className="card-body space-y-4">
          <div className="grid gap-4 md:grid-cols-4 lg:grid-cols-6">
            <div className="p-3 bg-[rgba(255,255,255,0.04)] rounded-lg">
              <p className="text-xs text-[rgba(232,228,220,0.6)]">Sets</p>
              <p className="text-xl font-bold">{architecture.sets?.total ?? 0}</p>
            </div>
            <div className="p-3 bg-[rgba(251,146,60,0.08)] rounded-lg">
              <p className="text-xs text-[rgba(232,228,220,0.6)]">Requested</p>
              <p className="text-xl font-bold text-orange-400">{architecture.sets?.requested ?? 0}</p>
            </div>
            <div className="p-3 bg-[rgba(56,189,248,0.08)] rounded-lg">
              <p className="text-xs text-[rgba(232,228,220,0.6)]">In Progress</p>
              <p className="text-xl font-bold text-sky-400">{architecture.sets?.inProgress ?? 0}</p>
            </div>
            <div className="p-3 bg-[rgba(110,231,183,0.08)] rounded-lg">
              <p className="text-xs text-[rgba(232,228,220,0.6)]">Approved Sets</p>
              <p className="text-xl font-bold text-green-400">{architecture.sets?.approved ?? 0}</p>
            </div>
            <div className="p-3 bg-[rgba(167,139,250,0.08)] rounded-lg">
              <p className="text-xs text-[rgba(232,228,220,0.6)]">Paid Sets</p>
              <p className="text-xl font-bold text-purple-400">{architecture.sets?.paid ?? 0}</p>
            </div>
            <div className="p-3 bg-[rgba(245,158,11,0.1)] rounded-lg">
              <p className="text-xs text-[rgba(232,228,220,0.6)]">Pending Review</p>
              <p className="text-xl font-bold text-amber-400">{architecture.pendingReview ?? 0}</p>
            </div>
          </div>

          {architecture.dueDates?.length > 0 && (
            <div>
              <h3 className="text-sm font-semibold text-[rgba(232,228,220,0.8)] mb-2">Upcoming Set Due Dates</h3>
              <div className="space-y-2">
                {architecture.dueDates.map((d: any) => (
                  <div key={d.id} className="flex justify-between items-center p-2 rounded bg-[rgba(255,255,255,0.04)]">
                    <div>
                      <p className="font-medium">{d.name}</p>
                      <p className="text-xs text-[rgba(232,228,220,0.55)]">{d.status}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm">{formatDate(d.dueDate)}</p>
                      <p className={`text-xs ${d.daysRemaining !== null && d.daysRemaining <= 3 ? 'text-red-400' : 'text-[rgba(232,228,220,0.55)]'}`}>
                        {d.daysRemaining !== null ? `${d.daysRemaining} days` : '-'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ArtifactsDashboard({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <ArchitectureSection architecture={data.architecture} />

      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">My Requested Sets</h2>
        </div>
        <div className="card-body">
          {data.myRequestedSets?.length > 0 ? (
            <div className="space-y-2">
              {data.myRequestedSets.map((set: any) => (
                <div key={set.id} className="flex justify-between items-center p-2 bg-[rgba(255,255,255,0.04)] rounded">
                  <div>
                    <p className="font-medium">{set.name}</p>
                    <p className="text-xs text-[rgba(232,228,220,0.55)]">{set.status}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-[rgba(232,228,220,0.6)]">Due</p>
                    <p className="text-sm">{formatDate(set.dueDate)}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[rgba(232,228,220,0.6)] text-center py-4">No requested sets right now</p>
          )}
        </div>
      </div>
    </div>
  );
}

function PMCDashboard({ data, projectId, currency }: { data: any; projectId: string; currency?: string }) {
  return (
    <div className="space-y-6">
      <RABillsSection
        projectId={projectId}
        submitted={data.raBills?.totalRABillSubmittedValue ?? 0}
        approved={data.raBills?.totalRABillApprovedValue ?? 0}
        released={data.raBills?.totalRABillReleasedValue ?? 0}
        pendingCertification={data.raBills?.raBillsPendingCertification ?? 0}
        pendingApproval={data.raBills?.raBillsPendingApproval ?? 0}
        currency={currency}
      />

      <ArchitectureSection architecture={data.architecture} />

      {/* Upcoming Deadlines */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">Upcoming Deadlines</h2>
        </div>
        <div className="card-body">
          {data.upcomingDeadlines?.length > 0 ? (
            <div className="space-y-2">
              {data.upcomingDeadlines.map((d: any) => (
                <div key={d.milestoneId} className="flex justify-between items-center">
                  <span>{d.title}</span>
                  <span className={`text-sm ${d.daysRemaining <= 3 ? 'text-red-400' : 'text-[rgba(232,228,220,0.6)]'}`}>
                    {d.daysRemaining} days
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[rgba(232,228,220,0.6)] text-center py-4">No upcoming deadlines</p>
          )}
        </div>
      </div>
    </div>
  );
}

function VendorDashboard({ data, projectId, currency }: { data: any; projectId: string; currency?: string }) {
  return (
    <div className="space-y-6">
      {/* RA Bills */}
      <section className="space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-lg font-semibold text-[#f5f1e8]">My RA Bills</h2>
          <Link href="/vendor/ra-bills" className="text-xs text-[var(--ax-accent)] hover:underline">View all →</Link>
        </div>
        <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
          <div className="card">
            <div className="card-body">
              <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.6)' }}>Awaiting Submission</p>
              <p className="text-2xl font-bold text-orange-400">{data.raBills?.awaitingSubmission ?? 0}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.6)' }}>Submitted Value</p>
              <p className="text-xl font-bold" style={{ color: 'var(--ax-text)' }}>{formatCurrency(data.raBills?.totalSubmittedValue ?? 0, currency)}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.6)' }}>Approved Value</p>
              <p className="text-xl font-bold text-green-400">{formatCurrency(data.raBills?.totalApprovedValue ?? 0, currency)}</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body">
              <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.6)' }}>Released Value</p>
              <p className="text-xl font-bold text-blue-400">{formatCurrency(data.raBills?.totalReleasedValue ?? 0, currency)}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Milestone Summary */}
      <div className="grid gap-4 md:grid-cols-5">
        <div className="card">
          <div className="card-body text-center">
            <p className="text-2xl font-bold">{data.milestonesSummary?.total || 0}</p>
            <p className="text-sm text-[rgba(232,228,220,0.6)]">Total</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <p className="text-2xl font-bold text-blue-400">{data.milestonesSummary?.inProgress || 0}</p>
            <p className="text-sm text-[rgba(232,228,220,0.6)]">In Progress</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <p className="text-2xl font-bold text-yellow-400">{data.milestonesSummary?.submitted || 0}</p>
            <p className="text-sm text-[rgba(232,228,220,0.6)]">Submitted</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <p className="text-2xl font-bold text-green-400">{data.milestonesSummary?.verified || 0}</p>
            <p className="text-sm text-[rgba(232,228,220,0.6)]">Verified</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <p className="text-2xl font-bold text-purple-400">{data.milestonesSummary?.closed || 0}</p>
            <p className="text-sm text-[rgba(232,228,220,0.6)]">Closed</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function ViewerDashboard({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">{data.projectName}</h2>
        </div>
        <div className="card-body">
          <div className="grid gap-4 md:grid-cols-5">
            <div className="text-center">
              <p className="text-2xl font-bold">{data.milestoneCounts?.total || 0}</p>
              <p className="text-sm text-[rgba(232,228,220,0.6)]">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-400">{data.milestoneCounts?.inProgress || 0}</p>
              <p className="text-sm text-[rgba(232,228,220,0.6)]">In Progress</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-400">{data.milestoneCounts?.submitted || 0}</p>
              <p className="text-sm text-[rgba(232,228,220,0.6)]">Submitted</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-400">{data.milestoneCounts?.verified || 0}</p>
              <p className="text-sm text-[rgba(232,228,220,0.6)]">Verified</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-400">{data.milestoneCounts?.closed || 0}</p>
              <p className="text-sm text-[rgba(232,228,220,0.6)]">Closed</p>
            </div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">Milestones</h2>
        </div>
        <div className="card-body">
          {data.milestones?.length > 0 ? (
            <div className="space-y-2">
              {data.milestones.map((m: any) => (
                <div key={m.id} className="flex justify-between items-center">
                  <span>{m.title}</span>
                  <span className="badge badge-draft">{m.state}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[rgba(232,228,220,0.6)] text-center py-4">No milestones</p>
          )}
        </div>
      </div>
    </div>
  );
}
