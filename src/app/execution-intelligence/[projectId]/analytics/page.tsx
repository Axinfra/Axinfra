'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend, ReferenceLine,
} from 'recharts';
import Layout from '@/components/Layout';
import EINav from '@/components/execution-intelligence/EINav';
import { DARK_TOOLTIP } from '@/lib/chartConfig';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

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
  const [tab, setTab] = useState<Tab>('curves');

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '...';
  const role = project?.myRole ?? '';

  const { data, isLoading: dataLoading } = useSWR<AnalyticsData>(
    projectId ? `/api/execution-intelligence/${projectId}/analytics` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 120_000 },
  );
  const loading = projectLoading || dataLoading;

  const TABS: { id: Tab; label: string }[] = [
    { id: 'curves', label: 'S-Curve & Burndown' },
    { id: 'vendors', label: 'Vendor Scorecard' },
    { id: 'delays', label: 'Delay Analysis' },
    { id: 'payments', label: 'Payment Cycles' },
    { id: 'heatmap', label: 'Criticality' },
  ];

  return (
    <Layout>
      <EINav projectId={projectId} projectName={projectName} role={role} />

      {loading ? (
        <AnalyticsSkeleton />
      ) : !data ? (
        <div className="text-center py-16 text-[rgba(232,228,220,0.35)] text-sm">No analytics data available.</div>
      ) : (
        <div className="space-y-5">
          {/* Tab bar */}
          <div className="flex items-center gap-1 bg-[rgba(255,255,255,0.05)] rounded-lg p-1 w-fit">
            {TABS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-1.5 rounded-md text-[12px] font-medium transition-colors
                  ${tab === t.id ? 'bg-[rgba(255,255,255,0.03)] text-[#e8e4dc] shadow-xs' : 'text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc]'}`}
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
        {sCurve.length === 0 ? (
          <EmptyChart message="No milestones have planned end dates set. Add planned dates to see the S-curve." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={sCurve} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} unit="%" domain={[0, 100]} />
              <Tooltip {...DARK_TOOLTIP} formatter={(v: number) => `${v}%`} labelFormatter={(l) => `Date: ${l}`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="plannedCumulative" name="Planned" stroke="rgba(232,228,220,0.3)" strokeWidth={1.5} dot={false} />
              <Line type="monotone" dataKey="actualCumulative" name="Actual" stroke="#3b82f6" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Burndown */}
      <ChartCard title="Burn-Down Chart" subtitle="Remaining work over time">
        {burndown.length === 0 ? (
          <EmptyChart message="No milestones have planned end dates set. Add planned dates to see the burn-down." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={burndown} margin={{ top: 4, right: 12, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="date" tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} unit="%" domain={[0, 100]} />
              <Tooltip {...DARK_TOOLTIP} formatter={(v: number) => `${v}%`} />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Line type="monotone" dataKey="plannedRemaining" name="Planned" stroke="rgba(232,228,220,0.3)" strokeWidth={1.5} dot={false} />
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
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="week" tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} tickFormatter={(v) => v.slice(5)} />
              <YAxis tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} allowDecimals={false} />
              <Tooltip {...DARK_TOOLTIP} />
              <Bar dataKey="count" name="Escalations" fill="#ef4444" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartCard>

      {/* Delay cost */}
      <ChartCard title="Delay Cost Estimate" subtitle="Based on configured project parameters">
        {!data.delayCost.isConfigured ? (
          <div className="flex flex-col items-center justify-center h-40 gap-2">
            <p className="text-[13px] text-[rgba(232,228,220,0.35)]">Configure to enable</p>
            <p className="text-[12px] text-surface-300">Set daily overhead cost in Schedule Config</p>
          </div>
        ) : (
          <div className="space-y-3 py-4">
            {[
              { label: 'Overhead Cost', value: data.delayCost.overheadCost, color: 'text-warning-600' },
              { label: 'Penalty Cost', value: data.delayCost.penaltyCost, color: 'text-[#e06050]' },
              { label: 'Opportunity Cost', value: data.delayCost.opportunityCost, color: 'text-[rgba(232,228,220,0.55)]' },
            ].map((row) => (
              <div key={row.label} className="flex justify-between items-center py-2 border-b border-[rgba(255,255,255,0.07)]">
                <span className="text-[13px] text-[rgba(232,228,220,0.55)]">{row.label}</span>
                <span className={`text-[13px] font-semibold ${row.color}`}>{formatCurrency(row.value)}</span>
              </div>
            ))}
            <div className="flex justify-between items-center pt-1">
              <span className="text-[14px] font-semibold text-[#e8e4dc]">Total Estimate</span>
              <span className="text-[16px] font-bold text-[#e06050]">{formatCurrency(data.delayCost.totalEstimatedCost)}</span>
            </div>
            <p className="text-[11px] text-[rgba(232,228,220,0.35)]">Based on {data.delayCost.totalOverrunDays} overrun days. Model assumptions apply.</p>
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
    return <div className="text-center py-16 text-[rgba(232,228,220,0.35)] text-sm">No vendor data available.</div>;
  }

  return (
    <div className="space-y-4">
      <ChartCard title="Vendor Performance Scorecard" subtitle="Ranked by on-time completion percentage">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="border-b border-[rgba(255,255,255,0.07)]">
                {['Rank', 'Vendor', 'Milestones', 'On-Time %', 'Avg Delay', 'Approval Cycle', 'Escalations'].map((h) => (
                  <th key={h} className="text-left py-2 px-3 text-[rgba(232,228,220,0.55)] font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {vendors.map((v) => (
                <tr key={v.vendorId} className="border-b border-[rgba(255,255,255,0.07)] hover:bg-[rgba(255,255,255,0.05)]">
                  <td className="py-2.5 px-3">
                    <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-[11px] font-bold
                      ${v.rank === 1 ? 'bg-[rgba(var(--ax-accent-rgb),0.08)] text-[var(--ax-accent)]' : v.rank === 2 ? 'bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)]' : 'bg-[rgba(255,255,255,0.03)] text-[rgba(232,228,220,0.35)]'}`}>
                      {v.rank}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-medium text-[#e8e4dc]">{v.vendorName}</td>
                  <td className="py-2.5 px-3 text-[rgba(232,228,220,0.55)]">{v.totalMilestones}</td>
                  <td className="py-2.5 px-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                        <div className="h-full bg-[rgba(50,200,120,0.1)]0 rounded-full" style={{ width: `${v.onTimePct}%` }} />
                      </div>
                      <span className={v.onTimePct >= 80 ? 'text-success-600' : v.onTimePct >= 60 ? 'text-warning-600' : 'text-[#e06050]'}>
                        {v.onTimePct}%
                      </span>
                    </div>
                  </td>
                  <td className="py-2.5 px-3 text-[rgba(232,228,220,0.55)]">{v.avgDelayDays}d</td>
                  <td className="py-2.5 px-3 text-[rgba(232,228,220,0.55)]">{v.avgApprovalCycleDays}d</td>
                  <td className="py-2.5 px-3">
                    {v.escalationCount > 0 ? (
                      <span className="text-[#e06050] font-medium">{v.escalationCount}</span>
                    ) : (
                      <span className="text-[rgba(232,228,220,0.35)]">0</span>
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
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" horizontal={false} />
            <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} unit="%" />
            <YAxis dataKey="vendorName" type="category" tick={{ fontSize: 11, fill: 'rgba(var(--ax-text-rgb),0.55)' }} width={76} />
            <Tooltip {...DARK_TOOLTIP} formatter={(v: number) => `${v}%`} />
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
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} angle={-30} textAnchor="end" />
            <YAxis tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} allowDecimals={false} />
            <Tooltip {...DARK_TOOLTIP} formatter={(v: number) => `${v} milestone${v !== 1 ? 's' : ''}`} />
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
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
            <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} />
            <YAxis tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} allowDecimals={false} />
            <Tooltip {...DARK_TOOLTIP} formatter={(v: number) => `${v} milestones`} />
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
      <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
        <h3 className="text-[14px] font-semibold text-[#e8e4dc] mb-1">Average Days to Payment Eligibility</h3>
        <p className="text-[12px] text-[rgba(232,228,220,0.35)] mb-4">From evidence submitted to payment fully eligible</p>
        <div className="flex items-baseline gap-2 mb-6">
          <span className="text-4xl font-bold text-[#e8e4dc]">{paymentCycleDays.avg}</span>
          <span className="text-[14px] text-[rgba(232,228,220,0.35)]">days avg</span>
        </div>
        {paymentCycleDays.byVendor.length > 0 && (
          <div>
            <p className="text-[11px] font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wide mb-2">By Vendor</p>
            <div className="space-y-2">
              {paymentCycleDays.byVendor.map((v) => (
                <div key={v.vendorId} className="flex items-center justify-between py-2 border-b border-[rgba(255,255,255,0.07)]">
                  <span className="text-[13px] text-[#e8e4dc]">{v.vendorName}</span>
                  <span className="text-[13px] font-semibold text-[#e8e4dc]">{v.avgDays}d</span>
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
              <tr className="border-b border-[rgba(255,255,255,0.07)]">
                <th className="text-left py-2 px-3 text-[rgba(232,228,220,0.55)] font-medium">Milestone</th>
                <th className="text-left py-2 px-3 text-[rgba(232,228,220,0.55)] font-medium">Duration</th>
                <th className="text-left py-2 px-3 text-[rgba(232,228,220,0.55)] font-medium">Float</th>
                <th className="text-left py-2 px-3 text-[rgba(232,228,220,0.55)] font-medium">Criticality</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((n) => {
                const pct = n.isCritical ? 100 : Math.max(0, 100 - (n.totalFloat / maxFloat) * 100);
                return (
                  <tr key={n.milestoneId} className="border-b border-[rgba(255,255,255,0.07)]">
                    <td className="py-2 px-3">
                      <span className={`font-medium ${n.isCritical ? 'text-[#e06050]' : 'text-[#e8e4dc]'}`}>
                        {n.isCritical && <span className="mr-1">●</span>}
                        {n.title}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-[rgba(232,228,220,0.55)]">{n.duration}d</td>
                    <td className="py-2 px-3 text-[rgba(232,228,220,0.55)]">{n.totalFloat}d</td>
                    <td className="py-2 px-3">
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 flex-1 max-w-[80px] bg-[rgba(255,255,255,0.05)] rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              background: n.isCritical ? '#ef4444' : pct > 70 ? '#f59e0b' : '#22c55e',
                            }}
                          />
                        </div>
                        <span className={`text-[11px] ${n.isCritical ? 'text-[#e06050] font-bold' : 'text-[rgba(232,228,220,0.35)]'}`}>
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
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
      <h3 className="text-[14px] font-semibold text-[#e8e4dc]">{title}</h3>
      {subtitle && <p className="text-[11px] text-[rgba(232,228,220,0.35)] mt-0.5 mb-4">{subtitle}</p>}
      {!subtitle && <div className="mb-4" />}
      {children}
    </div>
  );
}

function EmptyChart({ message = 'No data available' }: { message?: string }) {
  return (
    <div className="flex items-center justify-center h-40 text-[13px] text-[rgba(232,228,220,0.35)]">{message}</div>
  );
}

function AnalyticsSkeleton() {
  return (
    <div className="grid md:grid-cols-2 gap-4">
      {[1, 2, 3, 4].map((i) => (
        <div key={i} className="h-64 rounded-xl bg-[rgba(255,255,255,0.05)] animate-pulse" />
      ))}
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency', currency: 'INR',
    notation: n >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
}
