'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate, formatDateTime } from '@/lib/utils';

export default function DashboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [dashboard, setDashboard] = useState<any>(null);
  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [projectId]);

  const loadData = async () => {
    try {
      const [projectRes, dashboardRes] = await Promise.all([
        fetch(`/api/projects/${projectId}`),
        fetch(`/api/projects/${projectId}/dashboard`),
      ]);

      const [projectData, dashboardData] = await Promise.all([
        projectRes.json(),
        dashboardRes.json(),
      ]);

      if (projectData.success) {
        setProjectName(projectData.data.name);
        setMyRole(projectData.data.myRole);
      }

      if (dashboardData.success) {
        setDashboard(dashboardData.data);
      }
    } catch {
      setError('Failed to load dashboard');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  if (!dashboard) {
    return (
      <Layout>
        <div className="alert alert-error">{error || 'Dashboard not available'}</div>
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">
          {myRole} Dashboard
        </h1>

        {myRole === 'OWNER' && <OwnerDashboard data={dashboard} />}
        {myRole === 'PMC' && <PMCDashboard data={dashboard} />}
        {myRole === 'VENDOR' && <VendorDashboard data={dashboard} />}
        {myRole === 'VIEWER' && <ViewerDashboard data={dashboard} />}
      </div>
    </Layout>
  );
}

function OwnerDashboard({ data }: { data: any }) {
  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
        <div className="card">
          <div className="card-body">
            <p className="text-sm text-gray-500">Verified Value</p>
            <p className="text-xl font-bold text-gray-900">
              {formatCurrency(data.summary.totalVerifiedValue)}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm text-gray-500">Paid Value</p>
            <p className="text-xl font-bold text-green-600">
              {formatCurrency(data.summary.totalPaidValue)}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm text-gray-500">Unpaid Value</p>
            <p className="text-xl font-bold text-orange-600">
              {formatCurrency(data.summary.totalUnpaidValue)}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm text-gray-500">Blocked Value</p>
            <p className="text-xl font-bold text-red-600">
              {formatCurrency(data.summary.totalBlockedValue)}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm text-gray-500">Advance Exposure</p>
            <p className="text-xl font-bold text-purple-600">
              {formatCurrency(data.summary.advanceExposure)}
            </p>
          </div>
        </div>
        <div className="card">
          <div className="card-body">
            <p className="text-sm text-gray-500">BOQ Overruns</p>
            <p className="text-xl font-bold text-pink-600">
              {data.summary.boqOverrunCount}
            </p>
          </div>
        </div>
      </div>

      {/* Vendor Exposures */}
      {data.vendorExposures?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-red-600">High Risk Vendors</h2>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              {data.vendorExposures.map((v: any, i: number) => (
                <div key={i} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                  <div>
                    <p className="font-medium">{v.vendorName}</p>
                    <p className="text-sm text-gray-600">
                      Advance: {formatCurrency(v.advancePaid)} | Verified: {formatCurrency(v.verifiedWork)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-red-600 font-bold">{formatCurrency(v.exposure)}</p>
                    <p className="text-xs text-gray-500">Exposure</p>
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
                <div key={f.id} className="text-sm p-2 bg-gray-50 rounded">
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
                <div key={r.evidenceId} className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                  <div>
                    <p className="font-medium">{r.milestoneTitle}</p>
                    <p className="text-sm text-gray-600">
                      By {r.vendorName} - {r.daysPending} days pending
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No pending reviews</p>
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
                    <p className="text-sm text-gray-500">Due: {formatDate(p.dueDate)}</p>
                  </div>
                  <span className="font-medium">{formatCurrency(p.amount)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No payments due</p>
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
                  <span className={`text-sm ${d.daysRemaining <= 3 ? 'text-red-600' : 'text-gray-500'}`}>
                    {d.daysRemaining} days
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No upcoming deadlines</p>
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
            <p className="text-sm text-gray-500">Total</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <p className="text-2xl font-bold text-blue-600">{data.milestonesSummary?.inProgress || 0}</p>
            <p className="text-sm text-gray-500">In Progress</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <p className="text-2xl font-bold text-yellow-600">{data.milestonesSummary?.submitted || 0}</p>
            <p className="text-sm text-gray-500">Submitted</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <p className="text-2xl font-bold text-green-600">{data.milestonesSummary?.verified || 0}</p>
            <p className="text-sm text-gray-500">Verified</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body text-center">
            <p className="text-2xl font-bold text-purple-600">{data.milestonesSummary?.closed || 0}</p>
            <p className="text-sm text-gray-500">Closed</p>
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
                  <span className="text-sm text-gray-500">{p.daysPending} days</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-500 text-center py-4">No pending approvals</p>
          )}
        </div>
      </div>

      {/* Rejections */}
      {data.rejections?.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h2 className="text-lg font-semibold text-red-600">Recent Rejections</h2>
          </div>
          <div className="card-body">
            <div className="space-y-3">
              {data.rejections.map((r: any, i: number) => (
                <div key={i} className="p-3 bg-red-50 rounded-lg">
                  <p className="font-medium">{r.milestoneTitle}</p>
                  <p className="text-sm text-red-600">{r.reason}</p>
                  <p className="text-xs text-gray-500">{formatDateTime(r.rejectedAt)}</p>
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
            <p className="text-gray-500 text-center py-4">No payment data</p>
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
              <p className="text-sm text-gray-500">Total</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-blue-600">{data.milestoneCounts?.inProgress || 0}</p>
              <p className="text-sm text-gray-500">In Progress</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-yellow-600">{data.milestoneCounts?.submitted || 0}</p>
              <p className="text-sm text-gray-500">Submitted</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-green-600">{data.milestoneCounts?.verified || 0}</p>
              <p className="text-sm text-gray-500">Verified</p>
            </div>
            <div className="text-center">
              <p className="text-2xl font-bold text-purple-600">{data.milestoneCounts?.closed || 0}</p>
              <p className="text-sm text-gray-500">Closed</p>
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
            <p className="text-gray-500 text-center py-4">No milestones</p>
          )}
        </div>
      </div>
    </div>
  );
}
