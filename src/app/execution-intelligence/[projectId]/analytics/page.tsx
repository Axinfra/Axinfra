'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, ReferenceLine,
} from 'recharts';
import Layout from '@/components/Layout';
import EINav from '@/components/execution-intelligence/EINav';

interface ProjectInfo { name: string; myRole: string; }

interface AnalyticsData {
  kpis: {
    netScheduleDays: number; totalSavedDays: number; totalOverrunDays: number;
    onTimePct: number; avgApprovalCycleDays: number; criticalMilestoneCount: number;
    escalationsLast30Days: number; completedMilestones: number; totalMilestones: number;
  };
  vendorScorecards: Array<{
    vendorId: string; vendorName: string; totalMilestones: number;
    completedOnTime: number; completedLate: number; inProgress: number;
    onTimePct: number; avgDelayDays: number; avgApprovalCycleDays: number;
    escalationCount: number; rank: number;
  }>;
  sCurve: Array<{ date: string; plannedCumulative: number; actualCumulative: number }>;
  burndown: Array<{ date: string; plannedRemaining: number; actualRemaining: number }>;
  delayHistogram: Array<{ bucket: string; count: number }>;
  approvalHistogram: Array<{ bucket: string; count: number }>;
  escalationTrend: Array<{ week: string; count: number }>;
  paymentCycleDays: { avg: number; byVendor: Array<{ vendorId: string; vendorName: string; avgDays: number }> };
  delayCost: { overheadCost: number; penaltyCost: number; opportunityCost: number; totalEstimatedCost: number; totalOverrunDays: number; isConfigured: boolean };
  criticalityHeatmap: Array<{ milestoneId: string; title: string; isCritical: boolean; totalFloat: number; duration: number }>;
  scheduleConfig: { dailyOverheadCost: number; penaltyRatePerDay: number; opportunityCostFactor: number } | null;
}

type Tab = 'curves' | 'vendors' | 'delays' | 'payments' | 'heatmap';

export default function AnalyticsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('curves');

  const load = useCallback(async () => {
    const [projRes, analyticsRes] = await Promise.all([
      fetch(`/api/projects/${projectId}`),
      fetch(`/api/execution-intelligence/${projectId}/analytics`),
    ]);
    const [projData, analyticsData] = await Promise.all([projRes.json(), analyticsRes.json()]);
    if (projData.success) setProjectInfo({ name: projData.data.name, myRole: projData.data.myRole });
    if (analyticsData.success) setData(analyticsData.data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const role = projectInfo?.myRole ?? '';

  const TABS: { id: Tab; label: string }[] = [
    { id: 'curves', label: 'S-Curve & Burndown' },
    { id: 'vendors', label: 'Vendor Scorecard' },
    { id: 'delays', label: 'Delay Analysis' },
    { id: 'payments', label: 'Payment Cycles' },
    { id: 'heatmap', label: 'Criticality' },
  ];

  return (
    <Layout>
      <EINav projectId={projectId} projectName={projectInfo?.name ?? '...'} role={role} />

      {loading ? (
        <AnalyticsSkeleton />
      ) : !data ? (
        <div className="text-center py-16 text-surface-400 text-sm">No analytics data available.</div>
      ) : (
        <div className="space-y-5">
          {/* Tab bar */}
          <div className="flex items-center gap-1 bg-surface-100 rounded-lg p-1 w-fit">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors
                  ${tab === t.id ? 'bg-white text-surface-900 shadow-xs' : 'text-surface-500 hover:text-surface-700'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Tab content */}
          {tab === 'curves' && <SCurveTab data={data} />}
          {tab === 'vendors' && <VendorTab data={data} role={role} />}
          {tab === 'delays' && <DelayTab data={data} />}
          {tab === 'payments' && <PaymentTab data={data} />}
          {tab === 'heatmap' && <HeatmapTab data={data} />}
        </div>
      )}
    </Layout>
  );
}

// ---- Tab: S-Curve + Burndown ----
function SCurveTab({ data }: { data: AnalyticsData }) {
  // Sample to max 52 points for readability
  const sample = <T,>(arr: T[], max = 52) => {
    if (arr.length <= max) return arr;
    const step = Math.floor(arr.length / max);
    return arr.filter((_, i) => i % step === 0 || i === arr.length - 1);
  };

  const sCurve = sample(data.sCurve);
  const burndown = sample(data.burndown);

  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* S-Curve */}
      <ChartCard title="Planned vs Actual Progress" subtitle="Cumulative completion % over time">
        {sCurve.length < 2 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={sCurve} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v: number) => `${v}%`} labelFormatter={(l) => `Date: ${l}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="plannedCumulative" name="Planned" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="actualCumulative" name="Actual" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Burndown */}
      <ChartCard title="Burn-Down Chart" subtitle="Remaining work over time">
        {burndown.length < 2 ? (
          <EmptyChart />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={burndown} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" domain={[0, 100]} />
              <Tooltip formatter={(v: number) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="plannedRemaining" name="Planned" stroke="#94a3b8" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="actualRemaining" name="Actual" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Escalation trend */}
      <ChartCard title="Escalation Trend" subtitle="Weekly escalations over the last 12 weeks">
        {data.escalationTrend.every((p) => p.count === 0) ? (
          <EmptyChart message="No escalations in this period" />
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={data.escalationTrend} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: '#94a3b8' }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
              <Tooltip />
              <Bar dataKey="count" name="Escalations" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Delay cost */}
      <ChartCard title="Delay Cost Estimate" subtitle="Based on configured project parameters">
        {!data.delayCost.isConfigured ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-[13px] text-surface-400">Configure to enable</p>
            <p className="text-[12px] text-surface-300">Set daily overhead cost in Schedule Config</p>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {[
              { label: 'Overhead Cost', value: data.delayCost.overheadCost, color: 'text-warning-600' },
              { label: 'Penalty Cost', value: data.delayCost.penaltyCost, color: 'text-danger-600' },
              { label: 'Opportunity Cost', value: data.delayCost.opportunityCost, color: 'text-purple-600' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-2 border-b border-surface-100">
                <span className="text-[13px] text-surface-600">{row.label}</span>
                <span className={`text-[13px] font-semibold ${row.color}`}>{formatCurrency(row.value)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1">
              <span className="text-[14px] font-semibold text-surface-800">Total Estimate</span>
              <span className="text-[16px] font-bold text-danger-600">{formatCurrency(data.delayCost.totalEstimatedCost)}</span>
            </div>
            <p className="text-[11px] text-surface-400">Based on {data.delayCost.totalOverrunDays} overrun days. Model assumptions apply.</p>
          </div>
        )}
      </ChartCard>
    </div>
  );
}

// ---- Tab: Vendor Scorecard ----
function VendorTab({ data, role }: { data: AnalyticsData; role: string }) {
  const vendors = data.vendorScorecards;
  if (vendors.length === 0) {
    return <div className="text-center py-16 text-surface-400 text-sm">No vendor data available.</div>;
  }

  return (
    <div className="space-y-4">
      <ChartCard title="Vendor Performance Scorecard" subtitle="Ranked by on-time completion percentage">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-surface-200">
                {['Rank', 'Vendor', 'Milestones', 'On-Time %', 'Avg Delay', 'Approval Cycle', 'Escalations'].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-surface-500 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.vendorId} className="border-b border-surface-100 hover:bg-surface-50">
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold
                      ${v.rank === 1 ? 'bg-yellow-100 text-yellow-700' : v.rank === 2 ? 'bg-surface-100 text-surface-600' : 'bg-surface-50 text-surface-400'}`}>
                      {v.rank}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-surface-800">{v.vendorName}</td>
                  <td className="py-2.5 px-3 text-surface-600">{v.totalMilestones}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-surface-100 rounded-full overflow-hidden">
                        <div className="h-full bg-success-500 rounded-full" style={{ width: `${v.onTimePct}%` }} />
                      </div>
                      <span className={v.onTimePct >= 80 ? 'text-success-600' : v.onTimePct >= 60 ? 'text-warning-600' : 'text-danger-600'}>
                        {v.onTimePct}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-surface-600">{v.avgDelayDays}d</td>
                  <td className="py-2.5 px-3 text-surface-600">{v.avgApprovalCycleDays}d</td>
                  <td className="py-2.5 px-3">
                    {v.escalationCount > 0 ? (
                      <span className="text-danger-600 font-medium">{v.escalationCount}</span>
                    ) : (
                      <span className="text-surface-400">0</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </ChartCard>

      {/* On-time bar chart */}
      <ChartCard title="On-Time % by Vendor" subtitle="">
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={vendors} layout="vertical" margin={{ top: 4, right: 24, left: 80, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: '#94a3b8' }} unit="%" />
            <YAxis dataKey="vendorName" type="category" tick={{ fontSize: 11, fill: '#64748b' }} width={76} />
            <Tooltip formatter={(v: number) => `${v}%`} />
            <ReferenceLine x={80} stroke="#22c55e" strokeDasharray="3 2" label={{ value: '80%', fontSize: 9, fill: '#22c55e' }} />
            <Bar dataKey="onTimePct" name="On-Time %" radius={[0, 3, 3, 0]}>
              {vendors.map((v) => (
                <Cell key={v.vendorId} fill={v.onTimePct >= 80 ? '#22c55e' : v.onTimePct >= 60 ? '#f59e0b' : '#ef4444'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ---- Tab: Delay Analysis ----
function DelayTab({ data }: { data: AnalyticsData }) {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {/* Delay distribution histogram */}
      <ChartCard title="Milestone Delay Distribution" subtitle="Days early (negative) or late (positive)">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.delayHistogram} margin={{ top: 4, right: 12, left: -20, bottom: 20 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#94a3b8' }} angle={-30} textAnchor="end" />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip />
            <Bar dataKey="count" name="Milestones" radius={[3, 3, 0, 0]}>
              {data.delayHistogram.map((d) => {
                const isLate = d.bucket.startsWith('>') || d.bucket.startsWith('1') || d.bucket.startsWith('8');
                const isOnTime = d.bucket === '0 (on-time)';
                return <Cell key={d.bucket} fill={isLate ? '#ef4444' : isOnTime ? '#22c55e' : '#3b82f6'} />;
              })}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>

      {/* Approval time histogram */}
      <ChartCard title="Approval Time Distribution" subtitle="Days from evidence submission to PMC verification">
        <ResponsiveContainer width="100%" height={260}>
          <BarChart data={data.approvalHistogram} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: '#94a3b8' }} />
            <YAxis tick={{ fontSize: 10, fill: '#94a3b8' }} allowDecimals={false} />
            <Tooltip formatter={(v: number) => `${v} milestones`} />
            <Bar dataKey="count" name="Milestones" fill="#8b5cf6" radius={[3, 3, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </ChartCard>
    </div>
  );
}

// ---- Tab: Payment Cycles ----
function PaymentTab({ data }: { data: AnalyticsData }) {
  const { paymentCycleDays } = data;
  return (
    <div className="space-y-4">
      <div className="bg-white border border-surface-200 rounded-xl p-5">
        <h3 className="text-[14px] font-semibold text-surface-800 mb-1">Average Days to Payment Eligibility</h3>
        <p className="text-[12px] text-surface-400 mb-4">From evidence submitted to payment fully eligible</p>
        <div className="flex items-baseline gap-2 mb-6">
          <span className="text-4xl font-bold text-surface-900">{paymentCycleDays.avg}</span>
          <span className="text-[14px] text-surface-400">days avg</span>
        </div>
        {paymentCycleDays.byVendor.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-surface-400 uppercase tracking-wide mb-2">By Vendor</p>
            <div className="space-y-2">
              {paymentCycleDays.byVendor.map((v) => (
                <div key={v.vendorId} className="flex items-center justify-between py-2 border-b border-surface-100">
                  <span className="text-[13px] text-surface-700">{v.vendorName}</span>
                  <span className="text-[13px] font-semibold text-surface-800">{v.avgDays}d</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- Tab: Criticality Heatmap ----
function HeatmapTab({ data }: { data: AnalyticsData }) {
  const sorted = [...data.criticalityHeatmap].sort((a, b) => a.totalFloat - b.totalFloat);
  const maxFloat = Math.max(...sorted.map((n) => n.totalFloat), 1);

  return (
    <ChartCard title="Critical Path Heatmap" subtitle="Milestones sorted by total float (criticality). Lower float = more critical.">
      {sorted.length === 0 ? (
        <EmptyChart />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-surface-200">
                <th className="text-left py-2 px-3 text-surface-500 font-medium">Milestone</th>
                <th className="text-left py-2 px-3 text-surface-500 font-medium">Duration</th>
                <th className="text-left py-2 px-3 text-surface-500 font-medium">Float</th>
                <th className="text-left py-2 px-3 text-surface-500 font-medium">Criticality</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((n) => {
                const pct = n.isCritical ? 100 : Math.max(0, 100 - (n.totalFloat / maxFloat) * 100);
                return (
                  <tr key={n.milestoneId} className="border-b border-surface-100">
                    <td className="py-2 px-3">
                      <span className={`font-medium ${n.isCritical ? 'text-danger-600' : 'text-surface-800'}`}>
                        {n.isCritical && <span className="mr-1">●</span>}
                        {n.title}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-surface-600">{n.duration}d</td>
                    <td className="py-2 px-3 text-surface-600">{n.totalFloat}d</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 max-w-[80px] bg-surface-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: n.isCritical ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e',
                            }}
                          />
                        </div>
                        <span className={`text-[11px] ${n.isCritical ? 'text-danger-600 font-bold' : 'text-surface-400'}`}>
                          {n.isCritical ? 'Critical' : `${Math.round(pct)}%`}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

// ---- Shared sub-components ----

function ChartCard({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-surface-200 rounded-xl p-5">
      <h3 className="text-[14px] font-semibold text-surface-800">{title}</h3>
      {subtitle && <p className="text-[11px] text-surface-400 mt-0.5 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

function EmptyChart({ message = 'No data available' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-[13px] text-surface-400">{message}</div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-64 rounded-xl bg-surface-100 animate-pulse" />
      ))}
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency', currency: 'USD',
    notation: n >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
}
