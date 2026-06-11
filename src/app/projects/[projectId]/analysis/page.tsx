'use client';

import { AnalysisSkeleton } from '@/components/ui/SkeletonPage';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

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

type TabId = 'execution' | 'financial' | 'vendor' | 'delay-risk' | 'compliance';

const TABS: Array<{ id: TabId; label: string }> = [
  { id: 'execution', label: 'Execution Analysis' },
  { id: 'financial', label: 'Financial Analysis' },
  { id: 'vendor', label: 'Vendor Analysis' },
  { id: 'delay-risk', label: 'Delay & Risk' },
  { id: 'compliance', label: 'Compliance & Audit' },
];

export default function AnalysisPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('execution');

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';
  const hasAccess = ['CLIENT', 'PMC'].includes(myRole);

  // SWR per-tab — each tab data is keyed by tab id, so flipping tabs is
  // instant after first load. dedupingInterval matches the route's 120s
  // server cache to avoid double work.
  const tabKey =
    projectId && hasAccess
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
        <div className="border-b border-[rgba(255,255,255,0.08)]">
          <div className="flex flex-wrap gap-x-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-[#c4a35a] text-[#c4a35a] bg-[rgba(196,163,90,0.08)]'
                    : 'border-transparent text-[rgba(232,228,220,0.6)] hover:text-[rgba(232,228,220,0.85)] hover:bg-[rgba(255,255,255,0.04)]'
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#c4a35a] mx-auto"></div>
              <p className="mt-2 text-[rgba(232,228,220,0.6)]">Loading analysis...</p>
            </div>
          ) : (
            <>
              {activeTab === 'execution' && <ExecutionTab data={tabData.execution} />}
              {activeTab === 'financial' && <FinancialTab data={tabData.financial} />}
              {activeTab === 'vendor' && <VendorTab data={tabData.vendor} />}
              {activeTab === 'delay-risk' && <DelayRiskTab data={tabData.delayRisk} />}
              {activeTab === 'compliance' && <ComplianceTab data={tabData.compliance} />}
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}

// ============================================
// TAB COMPONENTS
// ============================================

function ExecutionTab({ data }: { data: any }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const { overview, stateBreakdown, slaBreaches, byTrade } = data;
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
          label="Evidence Review Time"
          value={overview.avgEvidenceReviewDays}
          subtext="days avg"
          color={overview.avgEvidenceReviewDays > 3 ? 'yellow' : 'green'}
        />
        <MetricCard
          label="Rejection Rate"
          value={`${overview.evidenceRejectionRate}%`}
          subtext="of submissions"
          color={overview.evidenceRejectionRate > 20 ? 'red' : 'gray'}
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
                <div className="w-28 text-sm text-[rgba(232,228,220,0.7)]">{state.state.replace('_', ' ')}</div>
                <div className="flex-1 mx-4">
                  <div className="h-6 bg-[rgba(255,255,255,0.06)] rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getStateColor(state.state)}`}
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

      {/* SLA Breaches */}
      {slaBreaches.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="card-header" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
            <h3 className="font-semibold text-red-300">SLA Breaches ({slaBreaches.length})</h3>
          </div>
          <div className="card-body">
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
      )}

      {/* By Trade */}
      {byTrade.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Performance by Trade</h3>
          </div>
          <div className="card-body">
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
      )}

      {/* Insight */}
      <InsightBox
        text={generateExecutionInsight(overview, byTrade)}
      />
    </div>
  );
}

function FinancialTab({ data }: { data: any }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const { summary, byStatus = [], byPaymentModel = [], cashFlowRisk } = data;

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-[rgba(59,130,246,0.1)] border-l-4 border-blue-500 p-4">
        <p className="text-blue-300 font-medium">
          "What money is safe, blocked, or exposed right now?"
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          label="Total Project Value"
          value={formatCurrency(summary.totalProjectValue)}
          color="gray"
        />
        <MetricCard
          label="Certified Value"
          value={formatCurrency(summary.certifiedValue)}
          subtext={`${Math.round((summary.certifiedValue / summary.totalProjectValue) * 100)}% of total`}
          color="green"
        />
        <MetricCard
          label="Paid Value"
          value={formatCurrency(summary.paidValue)}
          subtext={`${Math.round((summary.paidValue / summary.totalProjectValue) * 100)}% of total`}
          color="emerald"
        />
        <MetricCard
          label="Blocked Value"
          value={formatCurrency(summary.blockedValue)}
          color={summary.blockedValue > 0 ? 'red' : 'gray'}
        />
      </div>

      {/* Stacked Bar Visualization */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">Financial Position</h3>
        </div>
        <div className="card-body">
          <div className="h-12 flex rounded-lg overflow-hidden bg-[rgba(255,255,255,0.06)]">
            <div
              className="bg-emerald-500"
              style={{ width: `${(summary.paidValue / summary.totalProjectValue) * 100}%` }}
              title={`Paid: ${formatCurrency(summary.paidValue)}`}
            />
            <div
              className="bg-green-400"
              style={{ width: `${(summary.eligibleUnpaid / summary.totalProjectValue) * 100}%` }}
              title={`Eligible Unpaid: ${formatCurrency(summary.eligibleUnpaid)}`}
            />
            <div
              className="bg-red-400"
              style={{ width: `${(summary.blockedValue / summary.totalProjectValue) * 100}%` }}
              title={`Blocked: ${formatCurrency(summary.blockedValue)}`}
            />
            <div
              className="bg-yellow-400"
              style={{ width: `${(summary.exposedValue / summary.totalProjectValue) * 100}%` }}
              title={`Exposed: ${formatCurrency(summary.exposedValue)}`}
            />
          </div>
          <div className="flex justify-between mt-2 text-xs">
            <div className="flex items-center"><span className="w-3 h-3 bg-emerald-500 rounded mr-1"></span>Paid</div>
            <div className="flex items-center"><span className="w-3 h-3 bg-green-400 rounded mr-1"></span>Eligible</div>
            <div className="flex items-center"><span className="w-3 h-3 bg-red-400 rounded mr-1"></span>Blocked</div>
            <div className="flex items-center"><span className="w-3 h-3 bg-yellow-400 rounded mr-1"></span>Exposed</div>
          </div>
        </div>
      </div>

      {/* Key Financial Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="card border-[rgba(234,179,8,0.25)]" style={{ backgroundColor: 'rgba(234,179,8,0.06)' }}>
          <div className="card-body">
            <p className="text-sm text-yellow-300">Exposed Value</p>
            <p className="text-2xl font-bold text-yellow-200">{formatCurrency(summary.exposedValue)}</p>
            <p className="text-xs text-[rgba(232,228,220,0.55)] mt-1">Certified but not yet paid</p>
          </div>
        </div>
        <div className="card border-[rgba(168,85,247,0.25)]" style={{ backgroundColor: 'rgba(168,85,247,0.06)' }}>
          <div className="card-body">
            <p className="text-sm text-purple-300">Retention Held</p>
            <p className="text-2xl font-bold text-purple-200">{formatCurrency(summary.retentionHeld)}</p>
            <p className="text-xs text-[rgba(232,228,220,0.55)] mt-1">Held per contract terms</p>
          </div>
        </div>
        <div className="card border-[rgba(249,115,22,0.25)]" style={{ backgroundColor: 'rgba(249,115,22,0.06)' }}>
          <div className="card-body">
            <p className="text-sm text-orange-300">Cash Flow at Risk</p>
            <p className="text-2xl font-bold text-orange-200">{formatCurrency(cashFlowRisk.blockedTooLong)}</p>
            <p className="text-xs text-[rgba(232,228,220,0.55)] mt-1">Blocked &gt;14 days</p>
          </div>
        </div>
      </div>

      {/* By Payment Status */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">Breakdown by Payment Status</h3>
        </div>
        <div className="card-body">
          <table className="table text-sm">
            <thead>
              <tr>
                <th>Status</th>
                <th className="text-right">Count</th>
                <th className="text-right">Value</th>
                <th className="text-right">% of Total</th>
              </tr>
            </thead>
            <tbody>
              {byStatus.filter((s: any) => s.count > 0).map((status: any) => (
                <tr key={status.status}>
                  <td><span className={`badge ${getPaymentStatusBadgeClass(status.status)}`}>{status.status.replace('_', ' ')}</span></td>
                  <td className="text-right">{status.count}</td>
                  <td className="text-right font-medium">{formatCurrency(status.value)}</td>
                  <td className="text-right text-[rgba(232,228,220,0.6)]">{status.percent}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* By Payment Model */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">Breakdown by Payment Model</h3>
        </div>
        <div className="card-body">
          <table className="table text-sm">
            <thead>
              <tr>
                <th>Model</th>
                <th className="text-right">Total Value</th>
                <th className="text-right">Certified</th>
                <th className="text-right">Paid</th>
              </tr>
            </thead>
            <tbody>
              {byPaymentModel.map((model: any) => (
                <tr key={model.model}>
                  <td className="font-medium">{model.model.replace('_', ' ')}</td>
                  <td className="text-right">{formatCurrency(model.totalValue)}</td>
                  <td className="text-right">{formatCurrency(model.certifiedValue)}</td>
                  <td className="text-right">{formatCurrency(model.paidValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function VendorTab({ data }: { data: any }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const [sortBy, setSortBy] = useState<'exposure' | 'delay' | 'rejection'>('exposure');
  const { vendors, totals } = data;

  const sortedVendors = [...vendors].sort((a, b) => {
    switch (sortBy) {
      case 'exposure': return b.exposurePercent - a.exposurePercent;
      case 'delay': return b.avgVerificationDays - a.avgVerificationDays;
      case 'rejection': return b.rejectionRate - a.rejectionRate;
      default: return 0;
    }
  });

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-[rgba(59,130,246,0.1)] border-l-4 border-blue-500 p-4">
        <p className="text-blue-300 font-medium">
          "Which vendors are risky, slow, or over-exposed?"
        </p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
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
          label="Total Exposure"
          value={formatCurrency(totals.totalExposure)}
          color={totals.totalExposure > 0 ? 'yellow' : 'gray'}
        />
        <MetricCard
          label="Original BOQ Value"
          value={formatCurrency(totals.totalBoqValue || 0)}
          color="gray"
        />
        <MetricCard
          label="BOQ Overrun"
          value={formatCurrency(totals.totalOverrunValue || 0)}
          subtext={totals.totalOverrunValue > 0 ? `+${totals.totalOverrunPercent || 0}%` : '0%'}
          color={totals.totalOverrunValue > 0 ? 'orange' : 'green'}
        />
        <MetricCard
          label="Overrun %"
          value={`${totals.totalOverrunPercent || 0}%`}
          subtext="vs original BOQ"
          color={totals.totalOverrunPercent > 10 ? 'red' : totals.totalOverrunPercent > 0 ? 'orange' : 'green'}
        />
      </div>

      {/* Sort Controls */}
      <div className="flex items-center flex-wrap gap-2">
        <span className="text-sm text-[rgba(232,228,220,0.6)]">Sort by:</span>
        <button
          onClick={() => setSortBy('exposure')}
          className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
            sortBy === 'exposure'
              ? 'bg-[rgba(196,163,90,0.12)] text-[#c4a35a] border-[rgba(196,163,90,0.3)]'
              : 'bg-[rgba(255,255,255,0.04)] text-[rgba(232,228,220,0.7)] border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.06)]'
          }`}
        >
          Exposure %
        </button>
        <button
          onClick={() => setSortBy('delay')}
          className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
            sortBy === 'delay'
              ? 'bg-[rgba(196,163,90,0.12)] text-[#c4a35a] border-[rgba(196,163,90,0.3)]'
              : 'bg-[rgba(255,255,255,0.04)] text-[rgba(232,228,220,0.7)] border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.06)]'
          }`}
        >
          Delay
        </button>
        <button
          onClick={() => setSortBy('rejection')}
          className={`px-3 py-1.5 text-sm rounded-md border transition-colors ${
            sortBy === 'rejection'
              ? 'bg-[rgba(196,163,90,0.12)] text-[#c4a35a] border-[rgba(196,163,90,0.3)]'
              : 'bg-[rgba(255,255,255,0.04)] text-[rgba(232,228,220,0.7)] border-[rgba(255,255,255,0.08)] hover:bg-[rgba(255,255,255,0.06)]'
          }`}
        >
          Rejection Rate
        </button>
      </div>

      {/* Vendor Table */}
      <div className="card">
        <div className="overflow-x-auto card-body p-0">
          <table className="table text-sm min-w-[900px]">
            <thead>
              <tr>
                <th>Vendor</th>
                <th>Risk</th>
                <th className="text-right">BOQ Value</th>
                <th className="text-right">Contract</th>
                <th className="text-right">Overrun</th>
                <th className="text-right">Certified</th>
                <th className="text-right">Paid</th>
                <th className="text-right">Exposure</th>
                <th className="text-right">Milestones</th>
                <th className="text-right">Rejections</th>
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
                  <td className="text-right text-[rgba(232,228,220,0.6)]">{formatCurrency(vendor.boqValue || 0)}</td>
                  <td className="text-right font-medium">{formatCurrency(vendor.contractValue)}</td>
                  <td className="text-right">
                    {vendor.overrunValue > 0 ? (
                      <span className={vendor.overrunPercent > 10 ? 'text-red-400 font-medium' : 'text-orange-300'}>
                        +{formatCurrency(vendor.overrunValue)}
                        <span className="text-xs ml-1">({vendor.overrunPercent > 0 ? '+' : ''}{vendor.overrunPercent}%)</span>
                      </span>
                    ) : vendor.overrunValue < 0 ? (
                      <span className="text-green-300">
                        {formatCurrency(vendor.overrunValue)}
                        <span className="text-xs ml-1">({vendor.overrunPercent}%)</span>
                      </span>
                    ) : (
                      <span className="text-[rgba(232,228,220,0.4)]">-</span>
                    )}
                  </td>
                  <td className="text-right">{formatCurrency(vendor.certifiedValue)}</td>
                  <td className="text-right">{formatCurrency(vendor.paidValue)}</td>
                  <td className="text-right">
                    <span className={vendor.exposurePercent > 20 ? 'text-red-400 font-medium' : ''}>
                      {vendor.exposurePercent}%
                    </span>
                  </td>
                  <td className="text-right">{vendor.milestonesVerified}/{vendor.milestonesTotal}</td>
                  <td className="text-right">
                    <span className={vendor.rejectionRate > 20 ? 'text-red-400' : ''}>
                      {vendor.evidenceRejections} ({vendor.rejectionRate}%)
                    </span>
                  </td>
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
              ? `Total BOQ overrun of ${totals.totalOverrunPercent}% (${formatCurrency(totals.totalOverrunValue)}) - review contract variations. `
              : ''
          }${
            sortedVendors.some((v: any) => v.hasExtras)
              ? 'Includes vendors with Extras (outside BOQ) - review these claims carefully.'
              : 'Review exposure and payment schedules.'
          }`}
          type="warning"
        />
      )}
    </div>
  );
}

function DelayRiskTab({ data }: { data: any }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const { delayedMilestones, riskBuckets, blockedPayments, boqOverruns, overallRiskScore } = data;

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
            <p className="text-xs text-[rgba(232,228,220,0.55)]">{formatCurrency(riskBuckets.safe.value)}</p>
          </div>
        </div>
        <div className="card border-[rgba(234,179,8,0.25)]" style={{ backgroundColor: 'rgba(234,179,8,0.06)' }}>
          <div className="card-body">
            <div className="flex items-center justify-between">
              <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
              <span className="text-2xl font-bold text-yellow-300">{riskBuckets.attention.count}</span>
            </div>
            <p className="text-sm font-medium text-yellow-300 mt-2">Needs Attention</p>
            <p className="text-xs text-[rgba(232,228,220,0.55)]">{formatCurrency(riskBuckets.attention.value)}</p>
          </div>
        </div>
        <div className="card border-[rgba(239,68,68,0.25)]" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
          <div className="card-body">
            <div className="flex items-center justify-between">
              <span className="w-3 h-3 rounded-full bg-red-500"></span>
              <span className="text-2xl font-bold text-red-300">{riskBuckets.immediate.count}</span>
            </div>
            <p className="text-sm font-medium text-red-300 mt-2">Immediate Action</p>
            <p className="text-xs text-[rgba(232,228,220,0.55)]">{formatCurrency(riskBuckets.immediate.value)}</p>
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
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th>State</th>
                  <th>Due Date</th>
                  <th className="text-right">Days Overdue</th>
                  <th className="text-right">Value</th>
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
                    <td className="text-right">{formatCurrency(m.value)}</td>
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
      )}

      {/* Blocked Payments */}
      {blockedPayments.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(239,68,68,0.25)' }}>
          <div className="card-header" style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}>
            <h3 className="font-semibold text-red-300">Blocked Payments ({blockedPayments.length})</h3>
          </div>
          <div className="card-body">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Milestone</th>
                  <th className="text-right">Value</th>
                  <th className="text-right">Days Blocked</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {blockedPayments.map((p: any) => (
                  <tr key={p.milestoneId}>
                    <td className="font-medium">{p.title}</td>
                    <td className="text-right">{formatCurrency(p.value)}</td>
                    <td className="text-right text-red-400">{p.daysBlocked}</td>
                    <td>{p.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* BOQ Overruns */}
      {boqOverruns.length > 0 && (
        <div className="card" style={{ borderColor: 'rgba(168,85,247,0.25)' }}>
          <div className="card-header" style={{ backgroundColor: 'rgba(168,85,247,0.08)' }}>
            <h3 className="font-semibold text-purple-300">BOQ Overruns ({boqOverruns.length})</h3>
          </div>
          <div className="card-body">
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
                    <td className="text-right">{formatCurrency(o.plannedValue)}</td>
                    <td className="text-right">{formatCurrency(o.actualValue)}</td>
                    <td className="text-right text-red-400">+{o.overrunPercent}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function ComplianceTab({ data }: { data: any }) {
  if (!data) return <div className="text-center py-8 text-[rgba(232,228,220,0.6)]">No data available</div>;

  const { evidenceSLA, rejectionsByVendor, lateApprovals, auditCompleteness, recentAuditActivity } = data;

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-[rgba(59,130,246,0.1)] border-l-4 border-blue-500 p-4">
        <p className="text-blue-300 font-medium">
          "Are procedures being followed, and by whom?"
        </p>
      </div>

      {/* Evidence SLA */}
      <div className="card">
        <div className="card-header">
          <h3 className="font-semibold">Evidence Review SLA Performance</h3>
        </div>
        <div className="card-body">
          <div className="grid grid-cols-4 gap-4">
            <MetricCard
              label="Total Submissions"
              value={evidenceSLA.totalSubmissions}
              color="gray"
            />
            <MetricCard
              label="Within SLA"
              value={evidenceSLA.withinSLA}
              subtext={`≤${evidenceSLA.slaThresholdDays} days`}
              color="green"
            />
            <MetricCard
              label="Breached SLA"
              value={evidenceSLA.breachedSLA}
              color={evidenceSLA.breachedSLA > 0 ? 'red' : 'gray'}
            />
            <MetricCard
              label="Avg Review Time"
              value={`${evidenceSLA.avgReviewDays}d`}
              color={evidenceSLA.avgReviewDays > evidenceSLA.slaThresholdDays ? 'yellow' : 'green'}
            />
          </div>
        </div>
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

      {/* Rejections by Vendor */}
      {rejectionsByVendor.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Repeated Rejections by Vendor</h3>
          </div>
          <div className="card-body">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Vendor</th>
                  <th className="text-right">Submissions</th>
                  <th className="text-right">Rejections</th>
                  <th className="text-right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {rejectionsByVendor.map((v: any, i: number) => (
                  <tr key={i}>
                    <td className="font-medium">{v.vendorName}</td>
                    <td className="text-right">{v.submissionCount}</td>
                    <td className="text-right text-red-400">{v.rejectionCount}</td>
                    <td className="text-right">
                      <span className={v.rejectionRate > 20 ? 'text-red-400 font-medium' : ''}>
                        {v.rejectionRate}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Late Approvals by Role */}
      {lateApprovals.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Late Approvals by Role</h3>
          </div>
          <div className="card-body">
            <table className="table text-sm">
              <thead>
                <tr>
                  <th>Role</th>
                  <th className="text-right">Late Count</th>
                  <th className="text-right">Avg Delay</th>
                </tr>
              </thead>
              <tbody>
                {lateApprovals.map((r: any, i: number) => (
                  <tr key={i}>
                    <td><span className="badge badge-draft">{r.role}</span></td>
                    <td className="text-right">{r.lateCount}</td>
                    <td className="text-right">{r.avgDelayDays}d</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentAuditActivity.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="font-semibold">Recent Audit Activity (7 days)</h3>
          </div>
          <div className="card-body">
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

function getStateColor(state: string): string {
  const colors: Record<string, string> = {
    DRAFT: 'bg-gray-400',
    IN_PROGRESS: 'bg-blue-500',
    SUBMITTED: 'bg-yellow-500',
    VERIFIED: 'bg-green-500',
    CLOSED: 'bg-purple-500',
  };
  return colors[state] || 'bg-gray-400';
}

function getPaymentStatusBadgeClass(status: string): string {
  const classes: Record<string, string> = {
    NOT_ELIGIBLE: 'badge-draft',
    ELIGIBLE: 'badge-eligible',
    DUE_SOON: 'badge-submitted',
    BLOCKED: 'badge-blocked',
    PAID_MARKED: 'badge-paid',
  };
  return classes[status] || 'badge-draft';
}

function generateExecutionInsight(overview: any, byTrade: any[]): string {
  if (overview.avgDaysInSubmitted > 7) {
    return `Evidence is spending ${overview.avgDaysInSubmitted} days in review on average. Consider expediting the review process.`;
  }
  if (overview.evidenceRejectionRate > 20) {
    return `High rejection rate (${overview.evidenceRejectionRate}%) suggests quality issues with submissions. Consider vendor guidance.`;
  }
  if (byTrade.length >= 2) {
    const sorted = [...byTrade].sort((a, b) => b.avgDaysToVerify - a.avgDaysToVerify);
    if (sorted[0].avgDaysToVerify > sorted[1].avgDaysToVerify * 1.5) {
      return `${sorted[0].trade} milestones take significantly longer to verify than ${sorted[1].trade}.`;
    }
  }
  return `Project execution is progressing with ${overview.verifiedPercent}% milestones verified.`;
}
