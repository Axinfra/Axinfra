'use client';

import dynamic from 'next/dynamic';
import { DashboardSkeleton } from '@/components/ui/SkeletonPage';
import { Skeleton } from '@/components/ui/Skeleton';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
const ActivityFeed = dynamic(() => import('@/components/dashboard/ActivityFeed'), { loading: () => <Skeleton className='h-48 w-full rounded-lg' /> });
const MilestoneCompletionChart = dynamic(() => import('@/components/dashboard/MilestoneCompletionChart'), { loading: () => <Skeleton className='h-48 w-full rounded-lg' /> });
const BudgetVsActualChart = dynamic(() => import('@/components/dashboard/BudgetVsActualChart'), { loading: () => <Skeleton className='h-48 w-full rounded-lg' /> });
const PaymentStatusChart = dynamic(() => import('@/components/dashboard/PaymentStatusChart'), { loading: () => <Skeleton className='h-48 w-full rounded-lg' /> });

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
        <h1 className="text-2xl font-bold" style={{ color: '#f5f1e8' }}>
          {myRole} Dashboard
        </h1>

        {myRole === 'OWNER' && <OwnerDashboard data={dashboard} projectId={projectId} />}
        {myRole === 'PMC' && <PMCDashboard data={dashboard} />}
        {myRole === 'VENDOR' && <VendorDashboard data={dashboard} />}
        {myRole === 'VIEWER' && <ViewerDashboard data={dashboard} />}
      </div>
    </Layout>
  );
}

function OwnerDashboard({ data, projectId }: { data: any; projectId: string }) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>Verified Value</p>
            <p className="text-xl font-bold" style={{ color: '#f5f1e8' }}>
              {formatCurrency(data.summary.totalVerifiedValue)}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>Paid Value</p>
            <p className="text-xl font-bold text-green-400">
              {formatCurrency(data.summary.totalPaidValue)}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>Unpaid Value</p>
            <p className="text-xl font-bold text-orange-400">
              {formatCurrency(data.summary.totalUnpaidValue)}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>Blocked Value</p>
            <p className="text-xl font-bold text-red-400">
              {formatCurrency(data.summary.totalBlockedValue)}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>Advance Exposure</p>
            <p className="text-xl font-bold text-purple-400">
              {formatCurrency(data.summary.advanceExposure)}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm" style={{ color: 'rgba(232, 228, 220, 0.6)' }}>BOQ Overruns</p>
            <p className="text-xl font-bold text-pink-400">
              {data.summary.boqOverrunCount}
            </p>
          </div>
        </div>
      </div>

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
          <BudgetVsActualChart />
          <PaymentStatusChart />
        </div>
      </section>

      {/* ── Recent Activity Feed ── */}
      <ActivityFeed projectId={projectId} />

      {/* Vendor Exposures */}
      {data.vendorExposures?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-red-400">High Risk Vendors</h2>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              {data.vendorExposures.map((v: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-3 bg-[rgba(239,68,68,0.1)] rounded-lg">
                  <div>
                    <p className="font-medium">{v.vendorName}</p>
                    <p className="text-sm text-[rgba(232,228,220,0.7)]">
                      Advance: {formatCurrency(v.advancePaid)} | Verified: {formatCurrency(v.verifiedWork)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-red-400 font-bold">{formatCurrency(v.exposure)}</p>
                    <p className="text-xs text-[rgba(232,228,220,0.6)]">Exposure</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Blocked Payments */}
      {data.blockedPayments?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold">Blocked Payments</h2>
          </div>
          <div className="card-body">
            <div className="space-y-2">
              {data.blockedPayments.map((b: any, i: number) => (
                <div key={i} className="flex justify-between items-center">
                  <span>{b.milestoneTitle}</span>
                  <span className="font-medium">{formatCurrency(b.amount)}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

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

function PMCDashboard({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* Pending Reviews */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">
            Pending Evidence Reviews ({data.pendingReviews?.length || 0})
          </h2>
        </div>
        <div className="card-body">
          {data.pendingReviews?.length > 0 ? (
            <div className="space-y-3">
              {data.pendingReviews.map((r: any) => (
                <div key={r.evidenceId} className="flex justify-between items-center p-3 bg-[rgba(234,179,8,0.1)] rounded-lg">
                  <div>
                    <p className="font-medium">{r.milestoneTitle}</p>
                    <p className="text-sm text-[rgba(232,228,220,0.7)]">
                      By {r.vendorName} - {r.daysPending} days pending
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[rgba(232,228,220,0.6)] text-center py-4">No pending reviews</p>
          )}
        </div>
      </div>

      {/* Due Payments */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">
            Due Payments ({data.duePayments?.length || 0})
          </h2>
        </div>
        <div className="card-body">
          {data.duePayments?.length > 0 ? (
            <div className="space-y-2">
              {data.duePayments.map((p: any) => (
                <div key={p.milestoneId} className="flex justify-between items-center">
                  <div>
                    <p className="font-medium">{p.milestoneTitle}</p>
                    <p className="text-sm text-[rgba(232,228,220,0.6)]">Due: {formatDate(p.dueDate)}</p>
                  </div>
                  <span className="font-medium">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[rgba(232,228,220,0.6)] text-center py-4">No payments due</p>
          )}
        </div>
      </div>

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

function VendorDashboard({ data }: { data: any }) {
  return (
    <div className="space-y-6">
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

      {/* Pending Approvals */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">Pending Approvals</h2>
        </div>
        <div className="card-body">
          {data.pendingApprovals?.length > 0 ? (
            <div className="space-y-2">
              {data.pendingApprovals.map((p: any) => (
                <div key={p.milestoneId} className="flex justify-between items-center">
                  <span>{p.milestoneTitle}</span>
                  <span className="text-sm text-[rgba(232,228,220,0.6)]">{p.daysPending} days</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[rgba(232,228,220,0.6)] text-center py-4">No pending approvals</p>
          )}
        </div>
      </div>

      {/* Rejections */}
      {data.rejections?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-red-400">Recent Rejections</h2>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              {data.rejections.map((r: any, i: number) => (
                <div key={i} className="p-3 bg-[rgba(239,68,68,0.1)] rounded-lg">
                  <p className="font-medium">{r.milestoneTitle}</p>
                  <p className="text-sm text-red-400">{r.reason}</p>
                  <p className="text-xs text-[rgba(232,228,220,0.6)]">{formatDateTime(r.rejectedAt)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Payment Status */}
      <div className="card">
        <div className="card-header">
          <h2 className="text-lg font-semibold">Payment Status (Read-only)</h2>
        </div>
        <div className="card-body">
          {data.paymentStatus?.length > 0 ? (
            <div className="space-y-2">
              {data.paymentStatus.map((p: any, i: number) => (
                <div key={i} className="flex justify-between items-center">
                  <div>
                    <span>{p.milestoneTitle}</span>
                    <span className={`ml-2 badge ${
                      p.status === 'PAID_MARKED' ? 'badge-paid' :
                      p.status === 'ELIGIBLE' ? 'badge-eligible' :
                      p.status === 'BLOCKED' ? 'badge-blocked' :
                      'badge-draft'
                    }`}>{p.status}</span>
                  </div>
                  <span className="font-medium">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-[rgba(232,228,220,0.6)] text-center py-4">No payment data</p>
          )}
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
