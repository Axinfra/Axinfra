'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate } from '@/lib/utils';

/**
 * Project Analysis Panel - READ-ONLY intelligence dashboard.
 *
 * CRITICAL SAFETY CONSTRAINTS:
 * - This page is READ-ONLY
 * - NO mutation operations
 * - NO editable fields
 * - All data derived from existing CC-OS truth
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

  const [projectName, setProjectName] = useState('');
  const [myRole, setMyRole] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<TabId>('execution');
  const [tabData, setTabData] = useState<Record<string, any>>({});
  const [tabLoading, setTabLoading] = useState(false);

  useEffect(() => {
    loadProjectInfo();
  }, [projectId]);

  useEffect(() => {
    if (projectName) {
      loadTabData(activeTab);
    }
  }, [activeTab, projectName]);

  const loadProjectInfo = async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}`);
      const data = await res.json();
      if (data.success) {
        setProjectName(data.data.name);
        setMyRole(data.data.myRole);

        // Check access
        if (!['OWNER', 'PMC'].includes(data.data.myRole)) {
          setError('Access denied. Analysis is available to Owner and PMC only.');
        }
      }
    } catch {
      setError('Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  const loadTabData = async (tab: TabId) => {
    if (tabData[tab]) return; // Already loaded

    setTabLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/analysis?tab=${tab}`);
      const data = await res.json();
      if (data.success) {
        setTabData(prev => ({ ...prev, ...data.data }));
      } else {
        setError(data.error);
      }
    } catch {
      setError('Failed to load analysis');
    } finally {
      setTabLoading(false);
    }
  };

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">Loading...</div>
      </Layout>
    );
  }

  if (error && !['OWNER', 'PMC'].includes(myRole)) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="alert alert-error">{error}</div>
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
            <h1 className="text-2xl font-bold text-gray-900">Project Analysis</h1>
            <p className="text-sm text-gray-500 mt-1">
              Decision-grade insights derived from CC-OS data
            </p>
          </div>
          <div className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded">
            READ-ONLY • No editable fields
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <div className="flex space-x-1">
            {TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-primary-500 text-primary-600 bg-primary-50'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
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
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600 mx-auto"></div>
              <p className="mt-2 text-gray-500">Loading analysis...</p>
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
  if (!data) return <div className="text-center py-8 text-gray-500">No data available</div>;

  const { overview, stateBreakdown, slaBreaches, byTrade } = data;

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
        <p className="text-blue-800 font-medium">
          "Where is work actually moving, and where is it stuck?"
        </p>
      </div>

      {/* Overview Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <MetricCard
          label="Milestones Verified"
          value={`${overview.verifiedPercent}%`}
          subtext={`of ${overview.totalMilestones} total`}
          color={overview.verifiedPercent >= 50 ? 'green' : 'yellow'}
        />
        <MetricCard
          label="Avg Days In Progress"
          value={overview.avgDaysInProgress}
          subtext="days"
          color={overview.avgDaysInProgress > 30 ? 'red' : 'gray'}
        />
        <MetricCard
          label="Avg Days In Submitted"
          value={overview.avgDaysInSubmitted}
          subtext="days waiting review"
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
          label="Total Milestones"
          value={overview.totalMilestones}
          subtext="in project"
          color="gray"
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
                <div className="w-28 text-sm text-gray-600">{state.state.replace('_', ' ')}</div>
                <div className="flex-1 mx-4">
                  <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full ${getStateColor(state.state)}`}
                      style={{ width: `${state.percent}%` }}
                    />
                  </div>
                </div>
                <div className="w-20 text-right text-sm">
                  <span className="font-medium">{state.count}</span>
                  <span className="text-gray-400 ml-1">({Math.round(state.percent)}%)</span>
                </div>
                <div className="w-24 text-right text-xs text-gray-500">
                  {state.avgDaysInState}d avg
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* SLA Breaches */}
      {slaBreaches.length > 0 && (
        <div className="card border-red-200">
          <div className="card-header bg-red-50">
            <h3 className="font-semibold text-red-700">SLA Breaches ({slaBreaches.length})</h3>
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
                    <td className="text-right text-red-600 font-medium">{breach.daysInState}</td>
                    <td className="text-right text-gray-500">{breach.threshold}d</td>
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
  if (!data) return <div className="text-center py-8 text-gray-500">No data available</div>;

  const { summary, byStatus = [], byPaymentModel = [], cashFlowRisk } = data;

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
        <p className="text-blue-800 font-medium">
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
          <div className="h-12 flex rounded-lg overflow-hidden bg-gray-100">
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
      <div className="grid grid-cols-3 gap-4">
        <div className="card bg-yellow-50 border-yellow-200">
          <div className="card-body">
            <p className="text-sm text-yellow-700">Exposed Value</p>
            <p className="text-2xl font-bold text-yellow-800">{formatCurrency(summary.exposedValue)}</p>
            <p className="text-xs text-yellow-600">Certified but not yet paid</p>
          </div>
        </div>
        <div className="card bg-purple-50 border-purple-200">
          <div className="card-body">
            <p className="text-sm text-purple-700">Retention Held</p>
            <p className="text-2xl font-bold text-purple-800">{formatCurrency(summary.retentionHeld)}</p>
            <p className="text-xs text-purple-600">Held per contract terms</p>
          </div>
        </div>
        <div className="card bg-orange-50 border-orange-200">
          <div className="card-body">
            <p className="text-sm text-orange-700">Cash Flow at Risk</p>
            <p className="text-2xl font-bold text-orange-800">{formatCurrency(cashFlowRisk.blockedTooLong)}</p>
            <p className="text-xs text-orange-600">Blocked &gt;14 days</p>
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
                  <td className="text-right text-gray-500">{status.percent}%</td>
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
  if (!data) return <div className="text-center py-8 text-gray-500">No data available</div>;

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
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
        <p className="text-blue-800 font-medium">
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
      <div className="flex items-center space-x-2">
        <span className="text-sm text-gray-500">Sort by:</span>
        <button
          onClick={() => setSortBy('exposure')}
          className={`px-3 py-1 text-sm rounded ${sortBy === 'exposure' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'}`}
        >
          Exposure %
        </button>
        <button
          onClick={() => setSortBy('delay')}
          className={`px-3 py-1 text-sm rounded ${sortBy === 'delay' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'}`}
        >
          Delay
        </button>
        <button
          onClick={() => setSortBy('rejection')}
          className={`px-3 py-1 text-sm rounded ${sortBy === 'rejection' ? 'bg-primary-100 text-primary-700' : 'bg-gray-100'}`}
        >
          Rejection Rate
        </button>
      </div>

      {/* Vendor Table */}
      <div className="card">
        <div className="overflow-x-auto">
          <table className="table text-sm">
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
                <tr key={vendor.vendorId} className={vendor.riskLevel === 'HIGH' ? 'bg-red-50' : ''}>
                  <td className="font-medium">
                    {vendor.vendorName}
                    {vendor.hasExtras && (
                      <span className="ml-2 px-1.5 py-0.5 text-xs bg-orange-100 text-orange-700 rounded">
                        {vendor.extrasCount} Extra{vendor.extrasCount > 1 ? 's' : ''}
                      </span>
                    )}
                  </td>
                  <td>
                    <span className={`px-2 py-0.5 text-xs rounded ${
                      vendor.riskLevel === 'HIGH' ? 'bg-red-100 text-red-700' :
                      vendor.riskLevel === 'MEDIUM' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-green-100 text-green-700'
                    }`}>
                      {vendor.riskLevel}
                      {vendor.hasExtras && ' ⚠️'}
                    </span>
                  </td>
                  <td className="text-right text-gray-500">{formatCurrency(vendor.boqValue || 0)}</td>
                  <td className="text-right font-medium">{formatCurrency(vendor.contractValue)}</td>
                  <td className="text-right">
                    {vendor.overrunValue > 0 ? (
                      <span className={vendor.overrunPercent > 10 ? 'text-red-600 font-medium' : 'text-orange-600'}>
                        +{formatCurrency(vendor.overrunValue)}
                        <span className="text-xs ml-1">({vendor.overrunPercent > 0 ? '+' : ''}{vendor.overrunPercent}%)</span>
                      </span>
                    ) : vendor.overrunValue < 0 ? (
                      <span className="text-green-600">
                        {formatCurrency(vendor.overrunValue)}
                        <span className="text-xs ml-1">({vendor.overrunPercent}%)</span>
                      </span>
                    ) : (
                      <span className="text-gray-400">-</span>
                    )}
                  </td>
                  <td className="text-right">{formatCurrency(vendor.certifiedValue)}</td>
                  <td className="text-right">{formatCurrency(vendor.paidValue)}</td>
                  <td className="text-right">
                    <span className={vendor.exposurePercent > 20 ? 'text-red-600 font-medium' : ''}>
                      {vendor.exposurePercent}%
                    </span>
                  </td>
                  <td className="text-right">{vendor.milestonesVerified}/{vendor.milestonesTotal}</td>
                  <td className="text-right">
                    <span className={vendor.rejectionRate > 20 ? 'text-red-600' : ''}>
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
  if (!data) return <div className="text-center py-8 text-gray-500">No data available</div>;

  const { delayedMilestones, riskBuckets, blockedPayments, boqOverruns, overallRiskScore } = data;

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
        <p className="text-blue-800 font-medium">
          "Where will this project blow up if I don't act?"
        </p>
      </div>

      {/* Overall Risk Score */}
      <div className="card">
        <div className="card-body flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Overall Risk Score</h3>
            <p className="text-sm text-gray-500">Based on delays, blocks, and overruns</p>
          </div>
          <div className={`text-5xl font-bold ${
            overallRiskScore > 50 ? 'text-red-600' :
            overallRiskScore > 25 ? 'text-yellow-600' :
            'text-green-600'
          }`}>
            {overallRiskScore}
          </div>
        </div>
      </div>

      {/* Risk Buckets */}
      <div className="grid grid-cols-3 gap-4">
        <div className="card bg-green-50 border-green-200">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <span className="w-4 h-4 rounded-full bg-green-500"></span>
              <span className="text-2xl font-bold text-green-700">{riskBuckets.safe.count}</span>
            </div>
            <p className="text-sm font-medium text-green-700 mt-2">Safe</p>
            <p className="text-xs text-green-600">{formatCurrency(riskBuckets.safe.value)}</p>
          </div>
        </div>
        <div className="card bg-yellow-50 border-yellow-200">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <span className="w-4 h-4 rounded-full bg-yellow-500"></span>
              <span className="text-2xl font-bold text-yellow-700">{riskBuckets.attention.count}</span>
            </div>
            <p className="text-sm font-medium text-yellow-700 mt-2">Needs Attention</p>
            <p className="text-xs text-yellow-600">{formatCurrency(riskBuckets.attention.value)}</p>
          </div>
        </div>
        <div className="card bg-red-50 border-red-200">
          <div className="card-body">
            <div className="flex items-center justify-between">
              <span className="w-4 h-4 rounded-full bg-red-500"></span>
              <span className="text-2xl font-bold text-red-700">{riskBuckets.immediate.count}</span>
            </div>
            <p className="text-sm font-medium text-red-700 mt-2">Immediate Action</p>
            <p className="text-xs text-red-600">{formatCurrency(riskBuckets.immediate.value)}</p>
          </div>
        </div>
      </div>

      {/* Delayed Milestones */}
      {delayedMilestones.length > 0 && (
        <div className="card border-orange-200">
          <div className="card-header bg-orange-50">
            <h3 className="font-semibold text-orange-700">Delayed Milestones ({delayedMilestones.length})</h3>
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
                    <td className="text-right text-red-600 font-medium">{m.daysOverdue}</td>
                    <td className="text-right">{formatCurrency(m.value)}</td>
                    <td>
                      <span className={`px-2 py-0.5 text-xs rounded ${
                        m.severity === 'CRITICAL' ? 'bg-red-100 text-red-700' :
                        m.severity === 'MAJOR' ? 'bg-orange-100 text-orange-700' :
                        'bg-yellow-100 text-yellow-700'
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
        <div className="card border-red-200">
          <div className="card-header bg-red-50">
            <h3 className="font-semibold text-red-700">Blocked Payments ({blockedPayments.length})</h3>
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
                    <td className="text-right text-red-600">{p.daysBlocked}</td>
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
        <div className="card border-purple-200">
          <div className="card-header bg-purple-50">
            <h3 className="font-semibold text-purple-700">BOQ Overruns ({boqOverruns.length})</h3>
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
                    <td className="text-right text-red-600">+{o.overrunPercent}%</td>
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
  if (!data) return <div className="text-center py-8 text-gray-500">No data available</div>;

  const { evidenceSLA, rejectionsByVendor, lateApprovals, auditCompleteness, recentAuditActivity } = data;

  return (
    <div className="space-y-6">
      {/* Key Question */}
      <div className="bg-blue-50 border-l-4 border-blue-500 p-4">
        <p className="text-blue-800 font-medium">
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
              auditCompleteness.score >= 90 ? 'text-green-600' :
              auditCompleteness.score >= 70 ? 'text-yellow-600' :
              'text-red-600'
            }`}>
              {auditCompleteness.score}%
            </div>
            <div className="flex-1">
              <div className="h-4 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className={`h-full ${
                    auditCompleteness.score >= 90 ? 'bg-green-500' :
                    auditCompleteness.score >= 70 ? 'bg-yellow-500' :
                    'bg-red-500'
                  }`}
                  style={{ width: `${auditCompleteness.score}%` }}
                />
              </div>
              <div className="flex justify-between mt-1 text-xs text-gray-500">
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
                    <td className="text-right text-red-600">{v.rejectionCount}</td>
                    <td className="text-right">
                      <span className={v.rejectionRate > 20 ? 'text-red-600 font-medium' : ''}>
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
    gray: 'text-gray-900',
    green: 'text-green-600',
    yellow: 'text-yellow-600',
    red: 'text-red-600',
    emerald: 'text-emerald-600',
    purple: 'text-purple-600',
    orange: 'text-orange-600',
  };

  return (
    <div className="card">
      <div className="card-body">
        <p className="text-sm text-gray-500">{label}</p>
        <p className={`text-2xl font-bold ${colorClasses[color]}`}>{value}</p>
        {subtext && <p className="text-xs text-gray-400">{subtext}</p>}
      </div>
    </div>
  );
}

function InsightBox({ text, type = 'info' }: { text: string; type?: 'info' | 'warning' }) {
  return (
    <div className={`p-4 rounded-lg ${
      type === 'warning' ? 'bg-yellow-50 border border-yellow-200' : 'bg-gray-50 border border-gray-200'
    }`}>
      <p className={`text-sm ${type === 'warning' ? 'text-yellow-800' : 'text-gray-700'}`}>{text}</p>
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
