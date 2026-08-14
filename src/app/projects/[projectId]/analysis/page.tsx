'use client';

import { AnalysisSkeleton } from '@/components/ui/SkeletonPage';
import { Skeleton } from '@/components/ui/Skeleton';
import { Suspense, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { HEALTH_LABEL, HEALTH_COLOR } from '@/lib/scheduleVariance';
import { LIFECYCLE_LABEL, LIFECYCLE_COLOR } from '@/lib/activityStatus';
import OnTimeStatusSection from '@/components/activities/OnTimeStatusSection';

// recharts is a heavy dependency — only load it when a schedule-imported project actually
// renders this chart, not on every visit to the Analysis tab.
const ScheduleProgressChart = dynamic(() => import('@/components/analysis/ScheduleProgressChart'), {
  loading: () => <Skeleton className="h-64 w-full rounded-lg" />,
});

/**
 * Project Analysis Panel - READ-ONLY intelligence dashboard.
 *
 * CRITICAL SAFETY CONSTRAINTS:
 * - This page is READ-ONLY
 * - NO mutation operations
 * - NO editable fields
 * - All data derived from existing Axinfra truth
 * - Accessible to OWNER and PMC only
 */

type TabId = 'execution' | 'variance' | 'schedule-risk' | 'cost' | 'vendor' | 'delay-risk' | 'compliance';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'execution', label: 'Execution Analysis' },
  { id: 'variance', label: 'Time & Money Variance' },
  // Schedule Risk — the "time" deep-dive: which activities are quietly falling behind pace
  // *before* they're overdue, not just a which-are-overdue list.
  { id: 'schedule-risk', label: 'Schedule Risk' },
  // Cost Overview — was its own top-level nav item, now lives here right after
  // Time & Money Variance since it's the natural "so what does that add up to" follow-on.
  { id: 'cost', label: 'Cost Overview' },
  { id: 'vendor', label: 'Vendor Analysis' },
  { id: 'delay-risk', label: 'Delay & Risk' },
  { id: 'compliance', label: 'Compliance & Audit' },
];

const TAB_IDS = TABS.map((t) => t.id);

function AnalysisContent() {
  const params = useParams();
  const projectId = params.projectId as string;
  const searchParams = useSearchParams();

  const [error, setError] = useState('');
  // Cost Overview's old standalone route redirects here with ?tab=cost so
  // existing bookmarks/links land on the right tab instead of always execution.
  const initialTab = searchParams.get('tab');
  const [activeTab, setActiveTab] = useState<TabId>(
    (TAB_IDS as string[]).includes(initialTab ?? '') ? (initialTab as TabId) : 'execution'
  );

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const hasAccess = ['CLIENT', 'PMC'].includes(myRole);

  // SWR per-tab — each tab data is keyed by tab id, so flipping tabs is
  // instant after first load. dedupingInterval matches the route's 120s
  // server cache to avoid double work.
  // 'cost' is excluded — Cost Overview fetches its own data straight from
  // /api/projects/[projectId]/cost-overview (see CostOverviewTab below), not
  // through this generic analysis endpoint, which has no 'cost' case.
  const tabKey =
    projectId && hasAccess && activeTab !== 'cost'
      ? `/api/projects/${projectId}/analysis?tab=${activeTab}`
      : null;
  const {
    data: tabPayload,
    isLoading: tabLoading,
  } = useSWR<Record<string, unknown>>(tabKey, jsonFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
    keepPreviousData: false,
  });
  const tabData: Record<string, any> = (tabPayload ?? {}) as Record<string, any>;

  const loading = projectLoading;

  if (loading) {
    return (
      <Layout>
        <AnalysisSkeleton />
      </Layout>
    );
  }

  if (myRole && !hasAccess) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="alert alert-error">
          Access denied. Analysis is available to Owner and PMC only.
        </div>
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
            <h1 className="text-2xl font-bold text-[#f5f1e8]">Project Analysis</h1>
            <p className="text-sm text-[rgba(232,228,220,0.6)] mt-1">
              Decision-grade insights derived from Axinfra data
            </p>
          </div>
          <div className="text-xs text-[rgba(232,228,220,0.4)] bg-[rgba(255,255,255,0.06)] px-3 py-1 rounded">
            READ-ONLY • No editable fields
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Tabs */}
        <div className="border-b" style={{ borderColor: 'var(--ax-border)' }}>
          <div className="flex flex-wrap gap-x-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'ax-tab-active'
                    : 'ax-tab-inactive'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab Content */}
        <div className="min-h-[500px]">
          {tabLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[var(--ax-accent)] mx-auto"></div>
              <p className="mt-2 text-[rgba(232,228,220,0.6)]">Loading analysis...</p>
            </div>
          ) : (
            <>
              {activeTab === 'execution' && <ExecutionTab data={tabData.execution} />}
              {activeTab === 'variance' && <VarianceTab data={tabData.variance} projectId={projectId} currency={project?.currency} />}
              {activeTab === 'schedule-risk' && <ScheduleRiskTab data={tabData.variance} projectId={projectId} currency={project?.currency} />}
              {activeTab === 'cost' && <CostOverviewTab projectId={projectId} currency={project?.currency} />}
              {activeTab === 'vendor' && <VendorTab data={tabData.vendor} currency={project?.currency} />}
              {activeTab === 'delay-risk' && <DelayRiskTab data={tabData.delayRisk} currency={project?.currency} />}
              {activeTab === 'compliance' && <ComplianceTab data={tabData.compliance} />}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

export default function AnalysisPage() {
  return (
    <Suspense>
      <AnalysisContent />
    </Suspense>
  );
}

// ============================================
// TAB COMPONENTS
// ============================================

function ExecutionTab({ data }: { data: any }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const { overview, stateBreakdown, slaBreaches, byTrade, scheduleProgress } = data;
  const total = overview.totalMilestones || 1;
  const doneCount     = overview.doneCount ?? 0;
  const submittedCount = overview.submittedCount ?? 0;
  const inProgressCount = overview.inProgressCount ?? 0;
  const approachingCount = overview.approachingCount ?? 0;
  const draftCount    = overview.draftCount ?? 0;
  const donePct      = Math.round((doneCount / total) * 100);
  const submPct      = Math.round((submittedCount / total) * 100);
  const inProgPct    = Math.round((inProgressCount / total) * 100);
  const approachPct  = Math.round((approachingCount / total) * 100);
  const draftPct     = Math.max(0, 100 - donePct - submPct - inProgPct - approachPct);

  return (
    <div className="space-y-6">
      {/* ── Project Progress Overview ── */}
      <div className="rounded-xl border border-[rgba(255,255,255,0.07)] overflow-hidden"
        style={{ background: 'rgba(255,255,255,0.02)' }}>
        <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.06)] flex items-center justify-between">
          <h3 className="font-semibold text-[#e8e4dc] text-sm">Project Progress</h3>
          <span className="text-xs text-[rgba(232,228,220,0.4)]">{overview.totalMilestones} milestones total</span>
        </div>
        <div className="px-5 py-5 space-y-4">
          {/* Segmented bar */}
          <div className="flex h-5 w-full rounded-lg overflow-hidden gap-px bg-[rgba(255,255,255,0.04)]">
            {donePct > 0 && (
              <div className="bg-green-500 transition-all" style={{ width: `${donePct}%` }}
                title={`Done: ${overview.doneCount}`} />
            )}
            {submPct > 0 && (
              <div className="bg-yellow-400 transition-all" style={{ width: `${submPct}%` }}
                title={`Submitted: ${overview.submittedCount}`} />
            )}
            {inProgPct > 0 && (
              <div className="bg-blue-500 transition-all" style={{ width: `${inProgPct}%` }}
                title={`In Progress: ${overview.inProgressCount}`} />
            )}
            {approachPct > 0 && (
              <div className="bg-[#fb923c] transition-all" style={{ width: `${approachPct}%` }}
                title={`Due soon: ${overview.approachingCount}`} />
            )}
            {draftPct > 0 && (
              <div className="bg-[rgba(255,255,255,0.12)] transition-all" style={{ width: `${draftPct}%` }}
                title={`Draft: ${overview.draftCount}`} />
            )}
          </div>

          {/* Stat chips */}
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(34,197,94,0.08)] border border-[rgba(34,197,94,0.2)]">
              <span className="w-2.5 h-2.5 rounded-full bg-green-500 shrink-0" />
              <div>
                <p className="text-lg font-bold text-green-400 leading-none">{doneCount}</p>
                <p className="text-[10px] text-[rgba(232,228,220,0.5)] mt-0.5">Done ({donePct}%)</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(251,146,60,0.08)] border border-[rgba(251,146,60,0.2)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[#fb923c] shrink-0 animate-pulse" />
              <div>
                <p className="text-lg font-bold text-[#fb923c] leading-none">{approachingCount}</p>
                <p className="text-[10px] text-[rgba(232,228,220,0.5)] mt-0.5">Due in 30 days</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(59,130,246,0.08)] border border-[rgba(59,130,246,0.2)]">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500 shrink-0" />
              <div>
                <p className="text-lg font-bold text-blue-400 leading-none">{inProgressCount}</p>
                <p className="text-[10px] text-[rgba(232,228,220,0.5)] mt-0.5">In Progress</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(234,179,8,0.08)] border border-[rgba(234,179,8,0.2)]">
              <span className="w-2.5 h-2.5 rounded-full bg-yellow-400 shrink-0" />
              <div>
                <p className="text-lg font-bold text-yellow-300 leading-none">{submittedCount}</p>
                <p className="text-[10px] text-[rgba(232,228,220,0.5)] mt-0.5">Pending Review</p>
              </div>
            </div>
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.08)]">
              <span className="w-2.5 h-2.5 rounded-full bg-[rgba(255,255,255,0.25)] shrink-0" />
              <div>
                <p className="text-lg font-bold text-[rgba(232,228,220,0.55)] leading-none">{draftCount}</p>
                <p className="text-[10px] text-[rgba(232,228,220,0.35)] mt-0.5">Not Started</p>
              </div>
            </div>
          </div>

          {/* Completion bar label */}
          <div className="flex justify-between text-xs text-[rgba(232,228,220,0.4)]">
            <span className="font-medium text-green-400">{donePct}% complete</span>
            <span>{overview.totalMilestones - doneCount} remaining</span>
          </div>
        </div>
      </div>

      {/* ── Velocity & Quality Metrics ── */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <MetricCard
          label="Avg Days In Progress"
          value={overview.avgDaysInProgress}
          subtext="days"
          color={overview.avgDaysInProgress > 30 ? 'red' : 'gray'}
        />
        <MetricCard
          label="Avg Days Awaiting Review"
          value={overview.avgDaysInSubmitted}
          subtext="days"
          color={overview.avgDaysInSubmitted > 7 ? 'red' : 'gray'}
        />
        <MetricCard
          label="SLA Breaches"
          value={slaBreaches.length}
          subtext="active"
          color={slaBreaches.length > 0 ? 'red' : 'green'}
        />
      </div>

      {/* State Breakdown */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">State Distribution</h3>
        </div>
        <div className="card-body">
          <div className="space-y-3">
            {stateBreakdown.map((state: any) => (
              <div key={state.state} className="flex items-center">
                <div className="w-28 text-sm text-[rgba(232,228,220,0.7)]">{LIFECYCLE_LABEL[state.state as keyof typeof LIFECYCLE_LABEL] ?? state.state}</div>
                <div className="flex-1 mx-4">
                  <div className="h-6 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${LIFECYCLE_COLOR[state.state as keyof typeof LIFECYCLE_COLOR] ?? 'bg-gray-400'}`}
                      style={{ width: `${state.percent}%` }}
                    />
                  </div>
                </div>
                <div className="w-20 text-right text-sm">
                  <span className="font-medium">{state.count}</span>
                  <span className="text-[rgba(232,228,220,0.4)] ml-1">({Math.round(state.percent)}%)</span>
                </div>
                <div className="w-24 text-right text-xs text-[rgba(232,228,220,0.6)]">
                  {state.avgDaysInState}d avg
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Schedule Progress — separate signal from workflow state above, only shown when the
          project has schedule-imported milestones */}
      {scheduleProgress?.hasImportedTasks && <ScheduleProgressChart data={scheduleProgress} />}

      {/* SLA Breaches */}
      {slaBreaches.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="card-header" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
            <h3 className="font-semibold text-red-300">SLA Breaches ({slaBreaches.length})</h3>
          </div>
          <div className="card-body">
            <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>State</th>
                  <th className="text-right">Days in State</th>
                  <th className="text-right">Threshold</th>
                </tr>
              </thead>
              <tbody>
                {slaBreaches.map((breach: any) => (
                  <tr key={breach.milestoneId}>
                    <td className="font-medium">{breach.title}</td>
                    <td><span className="badge badge-draft">{breach.state}</span></td>
                    <td className="text-right text-red-400 font-medium">{breach.daysInState}</td>
                    <td className="text-right text-[rgba(232,228,220,0.6)]">{breach.threshold}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* By Trade */}
      {byTrade.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Performance by Trade</h3>
          </div>
          <div className="card-body">
            <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Trade</th>
                  <th className="text-right">Total</th>
                  <th className="text-right">Verified</th>
                  <th className="text-right">Avg Days to Verify</th>
                </tr>
              </thead>
              <tbody>
                {byTrade.map((trade: any) => (
                  <tr key={trade.trade}>
                    <td className="font-medium">{trade.trade}</td>
                    <td className="text-right">{trade.total}</td>
                    <td className="text-right">{trade.verified}</td>
                    <td className="text-right">{trade.avgDaysToVerify || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* Insight */}
      <InsightBox
        text={generateExecutionInsight(overview, byTrade)}
      />
    </div>
  );
}

function VarianceTab({ data, projectId, currency }: { data: any; projectId: string; currency?: string }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const router = useRouter();
  const { schedule, bills, overdueBills, overallVarianceScore } = data;
  const rowLinkClass = 'cursor-pointer hover:bg-[rgba(var(--ax-accent-rgb),0.05)] transition-colors';

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-[rgba(59,130,246,0.1)] border-l-4 border-blue-500 p-4">
        <p className="text-blue-300 font-medium">
          "Is the schedule slipping, is the money moving on time, and is anything missing?"
        </p>
      </div>

      {/* Overall Variance Score */}
      <div className="card">
        <div className="card-body flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Overall Variance Score</h3>
            <p className="text-sm text-[rgba(232,228,220,0.6)]">Combines schedule delay, bill variance, and stuck-bill count</p>
          </div>
          <div className={`text-5xl font-bold ${
            overallVarianceScore > 50 ? 'text-red-400' :
            overallVarianceScore > 25 ? 'text-yellow-300' :
            'text-green-300'
          }`}>
            {overallVarianceScore}
          </div>
        </div>
        <div className="card-body pt-0 flex flex-wrap gap-2">
          {(Object.keys(HEALTH_LABEL) as Array<keyof typeof HEALTH_LABEL>).map((h) => {
            const c = HEALTH_COLOR[h];
            const count = schedule.healthBreakdown?.[h] ?? 0;
            return (
              <span key={h} className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ color: c.color, background: c.bg }}>
                {HEALTH_LABEL[h]}: {count}
              </span>
            );
          })}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Activities On-Time"
          value={`${schedule.onTimePercent}%`}
          subtext={`${schedule.overdueCount} of ${schedule.totalActivities} overdue`}
          color={schedule.overdueCount > 0 ? 'orange' : 'green'}
        />
        <MetricCard
          label="Order Planned Value"
          value={formatCurrency(bills.totals.totalPlannedValue, currency)}
          color="gray"
        />
        <MetricCard
          label="Released (Paid) Value"
          value={formatCurrency(bills.totals.totalReleasedValue, currency)}
          color="emerald"
        />
        <MetricCard
          label="Bill Variance"
          value={formatCurrency(bills.totals.totalVariance, currency)}
          subtext={`${bills.totals.totalVariancePercent > 0 ? '+' : ''}${bills.totals.totalVariancePercent}% of planned`}
          color={Math.abs(bills.totals.totalVariancePercent) > 20 ? 'red' : Math.abs(bills.totals.totalVariancePercent) > 10 ? 'yellow' : 'green'}
        />
      </div>

      {/* ── Schedule (Time) Variance ── */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">Schedule Variance — Overdue Activities ({schedule.overdueActivities.length})</h3>
        </div>
        <div className="card-body">
          {schedule.overdueActivities.length === 0 ? (
            <p className="text-sm text-[rgba(232,228,220,0.5)] text-center py-4">Nothing overdue — schedule is on track.</p>
          ) : (
            <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>State</th>
                  <th>Due Date</th>
                  <th className="text-right">Days Overdue</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {schedule.overdueActivities.slice(0, 10).map((a: any) => (
                  <tr key={a.id} className={rowLinkClass} onClick={() => router.push(`/projects/${projectId}/activities/${a.id}`)}>
                    <td className="font-medium">{a.title}</td>
                    <td><span className="badge badge-draft">{a.state}</span></td>
                    <td>{formatDate(a.dueDate)}</td>
                    <td className="text-right text-red-400 font-medium">{a.daysOverdue}</td>
                    <td>
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        a.severity === 'CRITICAL' ? 'bg-[rgba(239,68,68,0.15)] text-red-300' :
                        a.severity === 'MAJOR' ? 'bg-[rgba(249,115,22,0.15)] text-orange-300' :
                        'bg-[rgba(234,179,8,0.15)] text-yellow-300'
                      }`}>
                        {a.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          )}
        </div>
      </div>

      {schedule.upcomingAtRisk.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(234,179,8,0.25)' }}>
          <div className="card-header" style={{ backgroundColor: 'rgba(234,179,8,0.08)' }}>
            <h3 className="font-semibold text-yellow-300">Due Soon — Not Yet Overdue ({schedule.upcomingAtRisk.length})</h3>
          </div>
          <div className="card-body">
            <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Activity</th>
                  <th>Due Date</th>
                  <th className="text-right">Days Remaining</th>
                </tr>
              </thead>
              <tbody>
                {schedule.upcomingAtRisk.slice(0, 10).map((a: any) => (
                  <tr key={a.id} className={rowLinkClass} onClick={() => router.push(`/projects/${projectId}/activities/${a.id}`)}>
                    <td className="font-medium">{a.title}</td>
                    <td>{formatDate(a.dueDate)}</td>
                    <td className="text-right text-yellow-300 font-medium">{a.daysRemaining}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* ── Bill (Money) Variance, per Purchase Order ── */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">Bill Variance by Purchase Order</h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.4)' }}>
            Order planned value vs submitted / approved / released RA Bill amounts
          </p>
        </div>
        <div className="card-body">
          {bills.byOrder.length === 0 ? (
            <p className="text-sm text-[rgba(232,228,220,0.5)] text-center py-4">No Purchase Orders with Order or RA Bill data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table text-sm min-w-[800px]">
                <thead>
                  <tr>
                    <th>Purchase Order</th>
                    <th className="text-right">Order Planned</th>
                    <th className="text-right">Submitted</th>
                    <th className="text-right">Approved</th>
                    <th className="text-right">Released</th>
                    <th className="text-right">Variance</th>
                    <th className="text-right">Bills</th>
                  </tr>
                </thead>
                <tbody>
                  {bills.byOrder.map((o: any) => (
                    <tr key={o.orderId} className={rowLinkClass} onClick={() => router.push(`/projects/${projectId}/orders/${o.orderId}`)}>
                      <td className="font-medium">{o.orderName}</td>
                      <td className="text-right">{formatCurrency(o.boqPlannedValue, currency)}</td>
                      <td className="text-right text-[rgba(232,228,220,0.6)]">{formatCurrency(o.submittedValue, currency)}</td>
                      <td className="text-right">{formatCurrency(o.approvedValue, currency)}</td>
                      <td className="text-right text-green-400">{formatCurrency(o.releasedValue, currency)}</td>
                      <td className={`text-right font-medium ${Math.abs(o.variancePercent) > 20 ? 'text-red-400' : Math.abs(o.variancePercent) > 10 ? 'text-orange-300' : 'text-[rgba(232,228,220,0.6)]'}`}>
                        {formatCurrency(o.variance, currency)}
                        <span className="text-xs ml-1">({o.variancePercent > 0 ? '+' : ''}{o.variancePercent}%)</span>
                      </td>
                      <td className="text-right">{o.billCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Direct Orders — one-off vendor purchases outside the BOQ flow. Their ordered value is
          already folded into "Order Planned Value" above and paid value into "Released (Paid)
          Value", so the headline cards stay accurate; this breaks that contribution out. */}
      {data.directOrders && data.directOrders.totalOrdered > 0 && (
        <div className="card">
          <div className="card-header flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Direct Orders</h3>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.4)' }}>
                One-off vendor purchases outside the BOQ flow — included in the totals above
              </p>
            </div>
            <button
              onClick={() => router.push(`/projects/${projectId}/direct-orders`)}
              className="text-xs font-medium text-[var(--ax-accent)] hover:opacity-80"
            >
              View Direct Orders →
            </button>
          </div>
          <div className="card-body grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard label="Total Ordered" value={formatCurrency(data.directOrders.totalOrdered, currency)} color="gray" />
            <MetricCard label="Delivered Value" value={formatCurrency(data.directOrders.totalDeliveredValue, currency)} color="emerald" />
            <MetricCard label="Paid" value={formatCurrency(data.directOrders.paid, currency)} color="emerald" />
            <MetricCard label="Outstanding" value={formatCurrency(data.directOrders.outstanding, currency)} color={data.directOrders.outstanding > 0 ? 'orange' : 'green'} />
          </div>
        </div>
      )}

      {/* Overdue Bills — stuck in a lifecycle stage too long */}
      {overdueBills.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="card-header" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
            <h3 className="font-semibold text-red-300">Overdue Bills ({overdueBills.length})</h3>
            <p className="text-xs mt-0.5 text-[rgba(232,228,220,0.5)]">RA Bills sitting in the same stage longer than expected</p>
          </div>
          <div className="card-body">
            <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Bill</th>
                  <th>Purchase Order</th>
                  <th>Stuck At</th>
                  <th className="text-right">Days</th>
                  <th className="text-right">Amount</th>
                </tr>
              </thead>
              <tbody>
                {overdueBills.map((b: any) => (
                  <tr key={b.raBillId} className={rowLinkClass} onClick={() => router.push(`/projects/${projectId}/orders/${b.orderId}/ra-bills/${b.raBillId}`)}>
                    <td className="font-medium">RA-{b.billNumber}</td>
                    <td>{b.orderName}</td>
                    <td>{b.stage}</td>
                    <td className="text-right text-red-400 font-medium">{b.daysInStage}</td>
                    <td className="text-right">{formatCurrency(b.amount, currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// "Which activities are quietly falling behind, before they become the reason the project is
// late?" — Time & Money Variance already shows onTimePercent and an overdue-activities table,
// but nothing surfaced the AT_RISK bucket itself (activities not yet overdue but running behind
// the linear pace from plannedStart to plannedEnd — see computeScheduleVariance). That's the
// predictive signal: by the time an activity shows up in "overdue," it's already too late to
// get ahead of it. This tab is the schedule-side equivalent of Cost Overview — one clear,
// professional place for "is the schedule actually healthy," not just a percentage.
function ScheduleRiskTab({ data, projectId, currency }: { data: any; projectId: string; currency?: string }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const router = useRouter();
  const { schedule } = data;
  const { onTimePercent, healthBreakdown, atRiskActivities, overdueActivities, upcomingAtRisk, totalActivities, onTimeActivities, notOnTimeActivities } = schedule;
  const rowLinkClass = 'cursor-pointer hover:bg-[rgba(var(--ax-accent-rgb),0.05)] transition-colors';
  const healthTotal = (Object.values(healthBreakdown) as number[]).reduce((s, n) => s + n, 0) || 1;

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-[rgba(59,130,246,0.1)] border-l-4 border-blue-500 p-4">
        <p className="text-blue-300 font-medium">
          "Which activities are quietly falling behind — before they become the reason the project is late?"
        </p>
      </div>

      {/* Headline */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="On Time"
          value={`${onTimePercent}%`}
          subtext={`${totalActivities} activities total`}
          color={onTimePercent >= 80 ? 'green' : onTimePercent >= 60 ? 'yellow' : 'red'}
        />
        <MetricCard
          label="At Risk"
          value={atRiskActivities.length}
          subtext="Falling behind pace"
          color={atRiskActivities.length > 0 ? 'orange' : 'green'}
        />
        <MetricCard
          label="Already Overdue"
          value={overdueActivities.length}
          subtext="Past due date"
          color={overdueActivities.length > 0 ? 'red' : 'green'}
        />
        <MetricCard
          label="Due Soon"
          value={upcomingAtRisk.length}
          subtext="Within 7 days"
          color={upcomingAtRisk.length > 0 ? 'yellow' : 'green'}
        />
      </div>

      {/* Schedule Health — every activity, classified */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">Schedule Health</h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.4)' }}>
            Every activity, classified by pace against its planned dates
          </p>
        </div>
        <div className="card-body">
          <div className="flex h-5 w-full rounded-lg overflow-hidden gap-px bg-[rgba(255,255,255,0.04)]">
            {(Object.keys(HEALTH_LABEL) as Array<keyof typeof HEALTH_LABEL>).map((h) => {
              const count = healthBreakdown[h] ?? 0;
              if (count === 0) return null;
              const pct = (count / healthTotal) * 100;
              return (
                <div key={h} className="transition-all" style={{ width: `${pct}%`, background: HEALTH_COLOR[h].color }}
                  title={`${HEALTH_LABEL[h]}: ${count}`} />
              );
            })}
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            {(Object.keys(HEALTH_LABEL) as Array<keyof typeof HEALTH_LABEL>).map((h) => {
              const count = healthBreakdown[h] ?? 0;
              const c = HEALTH_COLOR[h];
              return (
                <span key={h} className="text-xs font-semibold px-2.5 py-1 rounded-full whitespace-nowrap" style={{ color: c.color, background: c.bg }}>
                  {HEALTH_LABEL[h]}: {count}
                </span>
              );
            })}
          </div>
        </div>
      </div>

      {/* On-Time Status — which activities make up the {onTimePercent}% above, and which don't.
          Same component/data shape as the Activities page's On-Time Status tab, so this and
          that tab are always showing the same two groups, never a second disagreeing split. */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">On-Time Status ({onTimePercent}%)</h3>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(232,228,220,0.4)' }}>
            Every activity, split into the two groups the {onTimePercent}% above is built from
          </p>
        </div>
        <div className="card-body pt-0">
          <OnTimeStatusSection
            onTime={onTimeActivities}
            notOnTime={notOnTimeActivities}
            onTimePercent={onTimePercent}
            projectId={projectId}
          />
        </div>
      </div>

      {/* At Risk — the predictive list this tab exists for */}
      <div className="card" style={{ borderColor: 'rgba(234,179,8,0.25)' }}>
        <div className="card-header" style={{ backgroundColor: 'rgba(234,179,8,0.08)' }}>
          <h3 className="font-semibold text-yellow-300">At Risk — May Cause Delay ({atRiskActivities.length})</h3>
          <p className="text-xs mt-0.5 text-[rgba(232,228,220,0.5)]">
            Not overdue yet, but running behind the pace needed to finish on time
          </p>
        </div>
        <div className="card-body">
          {atRiskActivities.length === 0 ? (
            <p className="text-sm text-[rgba(232,228,220,0.5)] text-center py-4">No activities quietly falling behind right now.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>Vendor</th>
                    <th className="text-right">Expected</th>
                    <th className="text-right">Actual</th>
                    <th className="text-right">Behind By</th>
                    <th>Due Date</th>
                    <th className="text-right">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {atRiskActivities.map((a: any) => (
                    <tr key={a.id} className={rowLinkClass} onClick={() => router.push(`/projects/${projectId}/activities/${a.id}`)}>
                      <td className="font-medium">{a.title}</td>
                      <td className="text-[rgba(232,228,220,0.6)]">{a.vendorName ?? '—'}</td>
                      <td className="text-right">{a.expectedPercent}%</td>
                      <td className="text-right">{a.actualPercent}%</td>
                      <td className="text-right text-yellow-300 font-medium">{a.progressGapPoints} pts</td>
                      <td>{formatDate(a.dueDate)}</td>
                      <td className="text-right">{formatCurrency(a.value, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Already overdue — same data as Time & Money Variance's table, kept here too so this
          tab is a complete "is the schedule healthy" picture on its own. */}
      <div className="card" style={overdueActivities.length ? { borderColor: 'rgba(239,68,68,0.25)' } : undefined}>
        <div className="card-header" style={overdueActivities.length ? { backgroundColor: 'rgba(239,68,68,0.08)' } : undefined}>
          <h3 className={`font-semibold ${overdueActivities.length ? 'text-red-300' : ''}`}>Already Overdue ({overdueActivities.length})</h3>
        </div>
        <div className="card-body">
          {overdueActivities.length === 0 ? (
            <p className="text-sm text-[rgba(232,228,220,0.5)] text-center py-4">Nothing overdue — schedule is on track.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table text-sm">
                <thead>
                  <tr>
                    <th>Activity</th>
                    <th>State</th>
                    <th>Due Date</th>
                    <th className="text-right">Days Overdue</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {overdueActivities.slice(0, 10).map((a: any) => (
                    <tr key={a.id} className={rowLinkClass} onClick={() => router.push(`/projects/${projectId}/activities/${a.id}`)}>
                      <td className="font-medium">{a.title}</td>
                      <td><span className="badge badge-draft">{a.state}</span></td>
                      <td>{formatDate(a.dueDate)}</td>
                      <td className="text-right text-red-400 font-medium">{a.daysOverdue}</td>
                      <td>
                        <span className={`px-2 py-0.5 text-xs rounded ${
                          a.severity === 'CRITICAL' ? 'bg-[rgba(239,68,68,0.15)] text-red-300' :
                          a.severity === 'MAJOR' ? 'bg-[rgba(249,115,22,0.15)] text-orange-300' :
                          'bg-[rgba(234,179,8,0.15)] text-yellow-300'
                        }`}>
                          {a.severity}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <InsightBox
        text={generateScheduleRiskInsight(onTimePercent, atRiskActivities, overdueActivities)}
        type={atRiskActivities.length > 0 || overdueActivities.length > 0 ? 'warning' : 'info'}
      />
    </div>
  );
}

function generateScheduleRiskInsight(onTimePercent: number, atRisk: any[], overdue: any[]): string {
  if (atRisk.length === 0 && overdue.length === 0) {
    return `${onTimePercent}% of activities are on time and nothing is currently falling behind pace — schedule is healthy.`;
  }
  const parts: string[] = [];
  if (atRisk.length > 0) {
    parts.push(`${atRisk.length} activit${atRisk.length === 1 ? 'y is' : 'ies are'} falling behind pace and may cause delay if not addressed soon`);
  }
  if (overdue.length > 0) {
    parts.push(`${overdue.length} activit${overdue.length === 1 ? 'y is' : 'ies are'} already overdue`);
  }
  return `${parts.join('; ')}. Overall on-time performance is ${onTimePercent}%.`;
}

// Was its own page at /projects/[projectId]/cost-overview — moved here as a tab, right after
// Time & Money Variance. Fetches its own data straight from the dedicated cost-overview route
// (not through the generic /analysis?tab= endpoint above, which has no 'cost' case) since that
// route already reuses AnalysisService/DirectOrderService/scheduleMetrics itself — routing it
// through a second endpoint here would just be an extra hop for the same data.
const COST_STATUS_COLOR: Record<string, string> = {
  ORDERED: '#94a3b8', IN_PROGRESS: '#3b82f6', IN_DELIVERY: '#f5a623',
  DELIVERED: '#22c55e', QTY_VARIANCE: '#f97316', PAID: '#22c55e',
};

interface CostOverviewData {
  currency: string;
  totals: { committed: number; paidToDate: number; outstanding: number };
  boq: { planned: number; submitted: number; approved: number; released: number; variance: number; variancePercent: number; orderCount: number };
  directOrders: {
    ordered: number; delivered: number; paid: number; outstanding: number; variance: number;
    orders: Array<{ id: string; doNumber: string; description: string; ordered: number; billed: number | null; status: string }>;
  };
  boqAndDirectOrders: { planned: number; released: number; variance: number; variancePercent: number };
  consultantFees: { total: number; byPerson: Array<{ userId: string; name: string; fee: number }> };
  architectureFees: { total: number; paid: number; due: number; setCount: number };
  delayCost: { overheadCost: number; penaltyCost: number; opportunityCost: number; totalEstimatedCost: number; totalOverrunDays: number; isConfigured: boolean };
}

function CostOverviewTab({ projectId }: { projectId: string; currency?: string }) {
  const { data, isLoading, error } = useSWR<CostOverviewData>(
    projectId ? `/api/projects/${projectId}/cost-overview` : null,
    jsonFetcher,
  );
  const currency = data?.currency ?? 'INR';

  if (isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-3">
        {[1, 2, 3].map((i) => <div key={i} className="h-28 rounded-xl animate-pulse" style={{ background: 'var(--ax-card)' }} />)}
      </div>
    );
  }
  if (error || !data) {
    return <div className="alert alert-error">Could not load cost overview.</div>;
  }

  return (
    <div className="space-y-6 max-w-5xl">
      {/* Headline totals */}
      <div className="grid gap-4 md:grid-cols-3">
        <StatCard label="Total Committed Cost" value={formatCurrency(data.totals.committed, currency)}
          subtext="BOQ + Direct Orders (planned) + Consultant fees + Architecture fees" />
        <StatCard label="Paid to Date" value={formatCurrency(data.totals.paidToDate, currency)} color="green"
          subtext="RA Bills released + Direct Orders paid + Architecture fees paid" />
        <StatCard label="Outstanding" value={formatCurrency(data.totals.outstanding, currency)}
          color={data.totals.outstanding > 0 ? 'orange' : 'green'}
          subtext="Committed minus paid to date" />
      </div>

      {/* BOQ (Purchase Orders) */}
      <Section title="BOQ (Purchase Orders)" subtitle={`${data.boq.orderCount} purchase order(s) with BOQ items`}>
        <ProgressBar planned={data.boq.planned} released={data.boq.released} currency={currency} />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-5 mt-4">
          <MiniStat label="Planned" value={formatCurrency(data.boq.planned, currency)} />
          <MiniStat label="Submitted" value={formatCurrency(data.boq.submitted, currency)} />
          <MiniStat label="Approved" value={formatCurrency(data.boq.approved, currency)} />
          <MiniStat label="Released" value={formatCurrency(data.boq.released, currency)} color="green" />
          <MiniStat
            label="Variance"
            value={`${formatCurrency(data.boq.variance, currency)} (${data.boq.variancePercent > 0 ? '+' : ''}${data.boq.variancePercent}%)`}
            color={data.boq.variance < 0 ? 'orange' : 'gray'}
          />
        </div>
      </Section>

      {/* Direct Orders */}
      <Section title="Direct Orders" subtitle="One-off vendor purchases outside the BOQ flow (e.g. HVAC, Electrical, Civil)">
        <ProgressBar planned={data.directOrders.ordered} released={data.directOrders.paid} currency={currency} />
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 mt-4 mb-4">
          <MiniStat label="Ordered" value={formatCurrency(data.directOrders.ordered, currency)} />
          <MiniStat label="Delivered" value={formatCurrency(data.directOrders.delivered, currency)} />
          <MiniStat label="Paid" value={formatCurrency(data.directOrders.paid, currency)} color="green" />
          <MiniStat
            label="Variance"
            value={formatCurrency(data.directOrders.variance, currency)}
            color={data.directOrders.variance < 0 ? 'orange' : 'gray'}
          />
        </div>

        {data.directOrders.orders.length === 0 ? (
          <EmptyRow message="No Direct Orders on this project." />
        ) : (
          <div className="overflow-x-auto -mx-1">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
                  <th className="font-medium px-1 py-1.5">Order</th>
                  <th className="font-medium px-1 py-1.5">Description</th>
                  <th className="font-medium px-1 py-1.5 text-right">Ordered</th>
                  <th className="font-medium px-1 py-1.5 text-right">Billed</th>
                  <th className="font-medium px-1 py-1.5 text-right">Variance</th>
                  <th className="font-medium px-1 py-1.5 text-right">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.directOrders.orders.map((o) => {
                  const variance = o.billed != null ? o.ordered - o.billed : null;
                  return (
                    <tr key={o.id} style={{ borderTop: '1px solid rgba(var(--ax-text-rgb),0.07)' }}>
                      <td className="px-1 py-2 font-medium" style={{ color: 'var(--ax-text)' }}>{o.doNumber}</td>
                      <td className="px-1 py-2" style={{ color: 'rgba(var(--ax-text-rgb),0.7)', maxWidth: 320 }}>
                        <span className="line-clamp-1">{o.description}</span>
                      </td>
                      <td className="px-1 py-2 text-right" style={{ color: 'var(--ax-text)' }}>{formatCurrency(o.ordered, currency)}</td>
                      <td className="px-1 py-2 text-right" style={{ color: 'var(--ax-text)' }}>{o.billed != null ? formatCurrency(o.billed, currency) : '—'}</td>
                      <td className="px-1 py-2 text-right" style={{ color: variance != null && variance < 0 ? '#f97316' : 'rgba(var(--ax-text-rgb),0.6)' }}>
                        {variance != null ? formatCurrency(variance, currency) : '—'}
                      </td>
                      <td className="px-1 py-2 text-right">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full whitespace-nowrap"
                          style={{ color: COST_STATUS_COLOR[o.status] ?? '#94a3b8', background: `${COST_STATUS_COLOR[o.status] ?? '#94a3b8'}20` }}>
                          {o.status.replace(/_/g, ' ')}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Consultant Fees" subtitle="Engagement fees set on the Roles page — not tracked for payment status yet">
        {data.consultantFees.byPerson.length === 0 ? (
          <EmptyRow message="No consultant fees set. Set them on the Roles page." />
        ) : (
          <div className="space-y-1.5">
            {data.consultantFees.byPerson.map((c) => (
              <Row key={c.userId} label={c.name} value={formatCurrency(c.fee, currency)} />
            ))}
            <Row label="Total" value={formatCurrency(data.consultantFees.total, currency)} bold />
          </div>
        )}
      </Section>

      <Section title="Architecture Fees" subtitle={`${data.architectureFees.setCount} drawing set(s)`}>
        <div className="grid gap-4 sm:grid-cols-3">
          <MiniStat label="Total" value={formatCurrency(data.architectureFees.total, currency)} />
          <MiniStat label="Paid" value={formatCurrency(data.architectureFees.paid, currency)} color="green" />
          <MiniStat label="Due" value={formatCurrency(data.architectureFees.due, currency)} color={data.architectureFees.due > 0 ? 'orange' : 'green'} />
        </div>
      </Section>

      <Section title="Delay Cost Estimate" subtitle="A risk/exposure projection — not a committed cost, shown separately from the total above">
        {!data.delayCost.isConfigured ? (
          <EmptyRow message="Not configured — set rates on the Execution Intelligence Analytics tab." />
        ) : (
          <div className="space-y-1.5">
            <Row label="Overhead Cost" value={formatCurrency(data.delayCost.overheadCost, currency)} />
            <Row label="Penalty Cost" value={formatCurrency(data.delayCost.penaltyCost, currency)} />
            <Row label="Opportunity Cost" value={formatCurrency(data.delayCost.opportunityCost, currency)} />
            <Row label={`Total Estimate (${data.delayCost.totalOverrunDays} overrun days)`} value={formatCurrency(data.delayCost.totalEstimatedCost, currency)} bold />
          </div>
        )}
      </Section>
    </div>
  );
}

function StatCard({ label, value, subtext, color = 'gray' }: { label: string; value: string; subtext?: string; color?: 'gray' | 'green' | 'orange' }) {
  const colors = { gray: 'var(--ax-text)', green: '#22c55e', orange: '#f5a623' };
  return (
    <div className="card"><div className="card-body">
      <p className="text-sm font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>{label}</p>
      <p className="text-2xl font-bold mt-1" style={{ color: colors[color] }}>{value}</p>
      {subtext && <p className="text-xs mt-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>{subtext}</p>}
    </div></div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card"><div className="card-body">
      <h3 className="text-base font-semibold" style={{ color: 'var(--ax-text)' }}>{title}</h3>
      {subtitle && <p className="text-xs mb-3 mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>{subtitle}</p>}
      <div className="mt-3">{children}</div>
    </div></div>
  );
}

/** Horizontal "released as a % of planned" bar — the same released/planned pair each section
 * already shows as numbers, just made scannable at a glance without reading digits. */
function ProgressBar({ planned, released, currency }: { planned: number; released: number; currency: string }) {
  const pct = planned > 0 ? Math.min(100, Math.round((released / planned) * 100)) : 0;
  const overPct = planned > 0 && released > planned ? Math.min(100, Math.round((planned / released) * 100)) : null;
  return (
    <div>
      <div className="flex justify-between items-baseline mb-1.5">
        <span className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>
          {overPct != null
            ? `Released ${formatCurrency(released, currency)} — over the planned ${formatCurrency(planned, currency)}`
            : `${pct}% released`}
        </span>
      </div>
      <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(var(--ax-text-rgb),0.08)' }}>
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${overPct != null ? 100 : pct}%`, background: overPct != null ? '#f97316' : '#22c55e' }}
        />
      </div>
    </div>
  );
}

function MiniStat({ label, value, color = 'gray' }: { label: string; value: string; color?: 'gray' | 'green' | 'orange' }) {
  const colors = { gray: 'var(--ax-text)', green: '#22c55e', orange: '#f5a623' };
  return (
    <div>
      <p className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>{label}</p>
      <p className="text-lg font-semibold" style={{ color: colors[color] }}>{value}</p>
    </div>
  );
}

function Row({ label, value, bold = false }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className="flex justify-between items-center py-1.5" style={{ borderTop: bold ? '1px solid rgba(var(--ax-text-rgb),0.1)' : undefined }}>
      <span className={`text-sm ${bold ? 'font-semibold' : ''}`} style={{ color: bold ? 'var(--ax-text)' : 'rgba(var(--ax-text-rgb),0.65)' }}>{label}</span>
      <span className={`text-sm ${bold ? 'font-bold' : 'font-medium'}`} style={{ color: 'var(--ax-text)' }}>{value}</span>
    </div>
  );
}

function EmptyRow({ message }: { message: string }) {
  return <p className="text-sm py-4 text-center" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>{message}</p>;
}

function VendorTab({ data, currency }: { data: any; currency?: string }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const { vendors, totals } = data;

  const sortedVendors = [...vendors].sort((a, b) => b.avgVerificationDays - a.avgVerificationDays);

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-[rgba(59,130,246,0.1)] border-l-4 border-blue-500 p-4">
        <p className="text-blue-300 font-medium">
          "Which vendors are risky, slow, or over-exposed?"
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        <MetricCard
          label="Total Vendors"
          value={totals.totalVendors}
          color="gray"
        />
        <MetricCard
          label="High Risk Vendors"
          value={totals.highRiskCount}
          color={totals.highRiskCount > 0 ? 'red' : 'green'}
        />
        <MetricCard
          label="Original Order Value"
          value={formatCurrency(totals.totalBoqValue || 0, currency)}
          color="gray"
        />
        <MetricCard
          label="Order Overrun"
          value={formatCurrency(totals.totalOverrunValue || 0, currency)}
          subtext={totals.totalOverrunValue > 0 ? `+${totals.totalOverrunPercent || 0}%` : '0%'}
          color={totals.totalOverrunValue > 0 ? 'orange' : 'green'}
        />
        <MetricCard
          label="Overrun %"
          value={`${totals.totalOverrunPercent || 0}%`}
          subtext="vs original Order"
          color={totals.totalOverrunPercent > 10 ? 'red' : totals.totalOverrunPercent > 0 ? 'orange' : 'green'}
        />
      </div>

      {/* Vendor Table */}
      <div className="card">
        <div className="overflow-x-auto card-body p-0">
          <table className="table text-sm min-w-[900px]">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Risk</th>
                <th className="text-right">Order Value</th>
                <th className="text-right">Contract</th>
                <th className="text-right">Overrun</th>
                <th className="text-right">Milestones</th>
              </tr>
            </thead>
            <tbody>
              {sortedVendors.map((vendor: any) => (
                <tr key={vendor.vendorId} className={vendor.riskLevel === 'HIGH' ? 'bg-[rgba(239,68,68,0.1)]' : ''}>
                  <td className="font-medium">
                    {vendor.vendorName}
                    {vendor.hasExtras && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-[rgba(249,115,22,0.15)] text-orange-300 rounded">
                        {vendor.extrasCount} Extra{vendor.extrasCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      vendor.riskLevel === 'HIGH' ? 'bg-[rgba(239,68,68,0.15)] text-red-300' :
                      vendor.riskLevel === 'MEDIUM' ? 'bg-[rgba(234,179,8,0.15)] text-yellow-300' :
                      'bg-[rgba(34,197,94,0.15)] text-green-300'
                    }`}>
                      {vendor.riskLevel}
                      {vendor.hasExtras && ' ⚠️'}
                    </span>
                  </td>
                  <td className="text-right text-[rgba(232,228,220,0.6)]">{formatCurrency(vendor.boqValue || 0, currency)}</td>
                  <td className="text-right font-medium">{formatCurrency(vendor.contractValue, currency)}</td>
                  <td className="text-right">
                    {vendor.overrunValue > 0 ? (
                      <span className={vendor.overrunPercent > 10 ? 'text-red-400 font-medium' : 'text-orange-300'}>
                        +{formatCurrency(vendor.overrunValue, currency)}
                        <span className="text-xs ml-1">({vendor.overrunPercent > 0 ? '+' : ''}{vendor.overrunPercent}%)</span>
                      </span>
                    ) : vendor.overrunValue < 0 ? (
                      <span className="text-green-300">
                        {formatCurrency(vendor.overrunValue, currency)}
                        <span className="text-xs ml-1">({vendor.overrunPercent}%)</span>
                      </span>
                    ) : (
                      <span className="text-[rgba(232,228,220,0.4)]">-</span>
                    )}
                  </td>
                  <td className="text-right">{vendor.milestonesVerified}/{vendor.milestonesTotal}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Action Insight */}
      {(totals.highRiskCount > 0 || totals.totalOverrunPercent > 10) && (
        <InsightBox
          text={`${totals.highRiskCount > 0 ? `${totals.highRiskCount} vendor(s) flagged as high risk. ` : ''}${
            totals.totalOverrunPercent > 10
              ? `Total Order overrun of ${totals.totalOverrunPercent}% (${formatCurrency(totals.totalOverrunValue, currency)}) - review contract variations. `
              : ''
          }${
            sortedVendors.some((v: any) => v.hasExtras)
              ? 'Includes vendors with Extras (outside Order) - review these claims carefully.'
              : 'Review exposure and payment schedules.'
          }`}
          type="warning"
        />
      )}
    </div>
  );
}

function DelayRiskTab({ data, currency }: { data: any; currency?: string }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const { delayedMilestones, riskBuckets, boqOverruns, overallRiskScore } = data;

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-[rgba(59,130,246,0.1)] border-l-4 border-blue-500 p-4">
        <p className="text-blue-300 font-medium">
          "Where will this project blow up if I don't act?"
        </p>
      </div>

      {/* Overall Risk Score */}
      <div className="card">
        <div className="card-body flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Overall Risk Score</h3>
            <p className="text-sm text-[rgba(232,228,220,0.6)]">Based on delays, blocks, and overruns</p>
          </div>
          <div className={`text-5xl font-bold ${
            overallRiskScore > 50 ? 'text-red-400' :
            overallRiskScore > 25 ? 'text-yellow-300' :
            'text-green-300'
          }`}>
            {overallRiskScore}
          </div>
        </div>
      </div>

      {/* Risk Buckets */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card border-[rgba(34,197,94,0.25)]" style={{ backgroundColor: 'rgba(34,197,94,0.06)' }}>
          <div className="card-body">
            <div className="flex items-center justify-between">
              <span className="w-3 h-3 rounded-full bg-green-500"></span>
              <span className="text-2xl font-bold text-green-300">{riskBuckets.safe.count}</span>
            </div>
            <p className="text-sm font-medium text-green-300 mt-2">Safe</p>
            <p className="text-xs text-[rgba(232,228,220,0.55)]">{formatCurrency(riskBuckets.safe.value, currency)}</p>
          </div>
        </div>
        <div className="card border-[rgba(234,179,8,0.25)]" style={{ backgroundColor: 'rgba(234,179,8,0.06)' }}>
          <div className="card-body">
            <div className="flex items-center justify-between">
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
              <span className="text-2xl font-bold text-yellow-300">{riskBuckets.attention.count}</span>
            </div>
            <p className="text-sm font-medium text-yellow-300 mt-2">Needs Attention</p>
            <p className="text-xs text-[rgba(232,228,220,0.55)]">{formatCurrency(riskBuckets.attention.value, currency)}</p>
          </div>
        </div>
        <div className="card border-[rgba(239,68,68,0.25)]" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
          <div className="card-body">
            <div className="flex items-center justify-between">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="text-2xl font-bold text-red-300">{riskBuckets.immediate.count}</span>
            </div>
            <p className="text-sm font-medium text-red-300 mt-2">Immediate Action</p>
            <p className="text-xs text-[rgba(232,228,220,0.55)]">{formatCurrency(riskBuckets.immediate.value, currency)}</p>
          </div>
        </div>
      </div>

      {/* Delayed Milestones */}
      {delayedMilestones.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(249,115,22,0.25)' }}>
          <div className="card-header" style={{ backgroundColor: 'rgba(249,115,22,0.08)' }}>
            <h3 className="font-semibold text-orange-300">Delayed Milestones ({delayedMilestones.length})</h3>
          </div>
          <div className="card-body">
            <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>State</th>
                  <th>Due Date</th>
                  <th className="text-right">Days Overdue</th>
                  <th>Severity</th>
                </tr>
              </thead>
              <tbody>
                {delayedMilestones.slice(0, 10).map((m: any) => (
                  <tr key={m.id}>
                    <td className="font-medium">{m.title}</td>
                    <td><span className="badge badge-draft">{m.state}</span></td>
                    <td>{formatDate(m.dueDate)}</td>
                    <td className="text-right text-red-400 font-medium">{m.daysOverdue}</td>
                    <td>
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        m.severity === 'CRITICAL' ? 'bg-[rgba(239,68,68,0.15)] text-red-300' :
                        m.severity === 'MAJOR' ? 'bg-[rgba(249,115,22,0.15)] text-orange-300' :
                        'bg-[rgba(234,179,8,0.15)] text-yellow-300'
                      }`}>
                        {m.severity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}

      {/* BOQ Overruns */}
      {boqOverruns.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(168,85,247,0.25)' }}>
          <div className="card-header" style={{ backgroundColor: 'rgba(168,85,247,0.08)' }}>
            <h3 className="font-semibold text-purple-300">Order Overruns ({boqOverruns.length})</h3>
          </div>
          <div className="card-body">
            <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Item</th>
                  <th className="text-right">Planned</th>
                  <th className="text-right">Actual</th>
                  <th className="text-right">Overrun</th>
                </tr>
              </thead>
              <tbody>
                {boqOverruns.map((o: any, i: number) => (
                  <tr key={i}>
                    <td className="font-medium">{o.itemDescription}</td>
                    <td className="text-right">{formatCurrency(o.plannedValue, currency)}</td>
                    <td className="text-right">{formatCurrency(o.actualValue, currency)}</td>
                    <td className="text-right text-red-400">+{o.overrunPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ComplianceTab({ data }: { data: any }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const { auditCompleteness, recentAuditActivity } = data;

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-[rgba(59,130,246,0.1)] border-l-4 border-blue-500 p-4">
        <p className="text-blue-300 font-medium">
          "Are procedures being followed, and by whom?"
        </p>
      </div>

      {/* Audit Completeness */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">Audit Completeness Score</h3>
        </div>
        <div className="card-body">
          <div className="flex items-center space-x-6">
            <div className={`text-5xl font-bold ${
              auditCompleteness.score >= 90 ? 'text-green-300' :
              auditCompleteness.score >= 70 ? 'text-yellow-300' :
              'text-red-400'
            }`}>
              {auditCompleteness.score}%
            </div>
            <div className="flex-1">
              <div className="h-4 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    auditCompleteness.score >= 90 ? 'bg-green-500' :
                    auditCompleteness.score >= 70 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${auditCompleteness.score}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-[rgba(232,228,220,0.6)]">
                <span>{auditCompleteness.loggedActions} actions logged</span>
                <span>{auditCompleteness.missingReasons} missing reasons</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      {recentAuditActivity.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Recent Audit Activity (7 days)</h3>
          </div>
          <div className="card-body">
            <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Date</th>
                  <th className="text-right">Actions</th>
                  <th>By Role</th>
                </tr>
              </thead>
              <tbody>
                {recentAuditActivity.map((a: any) => (
                  <tr key={a.date}>
                    <td>{a.date}</td>
                    <td className="text-right">{a.actionCount}</td>
                    <td>
                      {Object.entries(a.byRole).map(([role, count]) => (
                        <span key={role} className="mr-2 text-xs">
                          {role}: {count as number}
                        </span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// HELPER COMPONENTS
// ============================================

function MetricCard({
  label,
  value,
  subtext,
  color = 'gray',
}: {
  label: string;
  value: string | number;
  subtext?: string;
  color?: 'gray' | 'green' | 'yellow' | 'red' | 'emerald' | 'purple' | 'orange';
}) {
  const colorClasses = {
    gray: 'text-[#f5f1e8]',
    green: 'text-green-300',
    yellow: 'text-yellow-300',
    red: 'text-red-400',
    emerald: 'text-emerald-300',
    purple: 'text-purple-300',
    orange: 'text-orange-300',
  };

  return (
    <div className="card">
      <div className="card-body">
        <p className="text-sm text-[rgba(232,228,220,0.6)]">{label}</p>
        <p className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</p>
        {subtext && <p className="text-xs text-[rgba(232,228,220,0.4)]">{subtext}</p>}
      </div>
    </div>
  );
}

function InsightBox({ text, type = 'info' }: { text: string; type?: 'info' | 'warning' }) {
  return (
    <div
      className="p-4 rounded-lg border"
      style={
        type === 'warning'
          ? { backgroundColor: 'rgba(234,179,8,0.08)', borderColor: 'rgba(234,179,8,0.25)' }
          : { backgroundColor: 'rgba(255,255,255,0.04)', borderColor: 'rgba(255,255,255,0.08)' }
      }
    >
      <p className={`text-sm ${type === 'warning' ? 'text-yellow-200' : 'text-[rgba(232,228,220,0.8)]'}`}>{text}</p>
    </div>
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateExecutionInsight(overview: any, byTrade: any[]): string {
  if (overview.avgDaysInSubmitted > 7) {
    return `Milestones are spending ${overview.avgDaysInSubmitted} days awaiting review on average. Consider expediting the review process.`;
  }
  if (byTrade.length >= 2) {
    const sorted = [...byTrade].sort((a, b) => b.avgDaysToVerify - a.avgDaysToVerify);
    if (sorted[0].avgDaysToVerify > sorted[1].avgDaysToVerify * 1.5) {
      return `${sorted[0].trade} milestones take significantly longer to verify than ${sorted[1].trade}.`;
    }
  }
  return `Project execution is progressing with ${overview.verifiedPercent}% milestones verified.`;
}
