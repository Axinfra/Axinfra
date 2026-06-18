'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
} from 'recharts';
import Layout from '@/components/Layout';
import ViseronNav from '@/components/viseron/ViseronNav';
import { DARK_TOOLTIP } from '@/lib/chartConfig';
import HealthGauge from '@/components/viseron/HealthGauge';
import RiskPanel from '@/components/viseron/RiskPanel';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface DashboardData {
  healthScore: number;
  healthLabel: string;
  completionPct: number;
  totalMilestones: number;
  verifiedMilestones: number;
  overdueMilestones: number;
  blockedPayments: number;
  totalValue: number;
  verifiedValue: number;
  riskyMilestones: Array<{
    id: string;
    title: string;
    state: string;
    vendorName: string | null;
    daysRemaining: number | null;
    riskLevel: string;
    value: number;
  }>;
  vendorScores: Array<{
    vendorName: string;
    total: number;
    onTime: number;
    late: number;
    reliability: number;
    avgDelay: number;
  }>;
  stateDistribution: Array<{ state: string; count: number }>;
  recentActivity: Array<{ type: string; description: string; date: string }>;
}

const STATE_COLORS: Record<string, string> = {
  DRAFT: '#94a3b8',
  IN_PROGRESS: '#3b82f6',
  SUBMITTED: '#f59e0b',
  VERIFIED: '#22c55e',
  CLOSED: '#64748b',
};

const STATE_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted',
  VERIFIED: 'Verified',
  CLOSED: 'Closed',
};

export default function ViseronDashboardPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '...';
  const myRole = project?.myRole ?? '';

  const { data, isLoading: dashLoading } = useSWR<DashboardData>(
    projectId ? `/api/viseron-intelligence/${projectId}/dashboard` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const loading = projectLoading || dashLoading;

  return (
    <Layout>
      <ViseronNav
        projectId={projectId}
        projectName={projectName}
        role={myRole}
      />

      {loading ? (
        <DashboardSkeleton />
      ) : !data ? (
        <div className="text-center py-16 text-[rgba(var(--ax-text-rgb),0.35)] text-sm">No data available.</div>
      ) : (
        <div className="space-y-6 animate-fade-in">
          {/* Top row: Health Gauge + KPI Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
            {/* Health gauge */}
            <div className="lg:col-span-4 bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-6 flex flex-col items-center justify-center">
              <p className="text-[11px] font-medium text-[rgba(var(--ax-text-rgb),0.35)] uppercase tracking-wider mb-2">
                Project Health
              </p>
              <HealthGauge score={data.healthScore} label={data.healthLabel} size="md" />
              <p className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)] mt-3 text-center">
                {data.completionPct}% complete &middot; {data.totalMilestones} milestones
              </p>
            </div>

            {/* KPI cards */}
            <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <KpiCard
                label="Verified"
                value={data.verifiedMilestones}
                subtitle={`of ${data.totalMilestones}`}
                color="success"
              />
              <KpiCard
                label="Overdue"
                value={data.overdueMilestones}
                subtitle="milestones"
                color={data.overdueMilestones > 0 ? 'danger' : 'neutral'}
              />
              <KpiCard
                label="Blocked"
                value={data.blockedPayments}
                subtitle="payments"
                color={data.blockedPayments > 0 ? 'warning' : 'neutral'}
              />
              <KpiCard
                label="Value Certified"
                value={formatCurrency(data.verifiedValue)}
                subtitle={`of ${formatCurrency(data.totalValue)}`}
                color="primary"
                isText
              />

              {/* State distribution mini chart */}
              <div className="col-span-2 sm:col-span-4 bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-4">
                <p className="text-[11px] font-medium text-[rgba(var(--ax-text-rgb),0.35)] uppercase tracking-wider mb-3">
                  Milestone Distribution
                </p>
                <div className="flex items-center gap-6">
                  <div className="w-28 h-28 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={data.stateDistribution}
                          dataKey="count"
                          nameKey="state"
                          cx="50%"
                          cy="50%"
                          innerRadius={28}
                          outerRadius={48}
                          paddingAngle={2}
                          strokeWidth={0}
                        >
                          {data.stateDistribution.map((entry) => (
                            <Cell
                              key={entry.state}
                              fill={STATE_COLORS[entry.state] || '#94a3b8'}
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, name: string) => [value, STATE_LABELS[name] || name]}
                          contentStyle={{ borderRadius: 10, border: '1px solid var(--ax-border)', background: 'var(--ax-modal)', boxShadow: '0 4px 12px rgba(0,0,0,0.4)', fontSize: 12, color: 'var(--ax-text)' }}
                          wrapperStyle={{ outline: 'none' }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                    {data.stateDistribution.map((s) => (
                      <div key={s.state} className="flex items-center gap-1.5">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ background: STATE_COLORS[s.state] || '#94a3b8' }}
                        />
                        <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.55)]">
                          {STATE_LABELS[s.state] || s.state}
                        </span>
                        <span className="text-[12px] font-semibold text-[var(--ax-text)] tabular-nums">
                          {s.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Middle row: Risk Panel + Vendor Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <RiskPanel milestones={data.riskyMilestones} />

            {/* Quick vendor performance */}
            <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-6">
              <h3 className="text-[14px] font-semibold text-[var(--ax-text)] mb-1">
                Vendor Performance
              </h3>
              <p className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)] mb-4">Reliability at a glance</p>

              {data.vendorScores.length === 0 ? (
                <div className="flex items-center justify-center py-10 text-[13px] text-[rgba(var(--ax-text-rgb),0.35)]">
                  No vendor data
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(140, data.vendorScores.length * 44)}>
                  <BarChart
                    data={data.vendorScores.slice(0, 6)}
                    layout="vertical"
                    margin={{ top: 0, right: 24, left: 4, bottom: 0 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--ax-chart-line-faint)" horizontal={false} />
                    <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 10, fill: 'rgba(var(--ax-text-rgb),0.45)' }} unit="%" />
                    <YAxis
                      dataKey="vendorName"
                      type="category"
                      tick={{ fontSize: 11, fill: 'rgba(var(--ax-text-rgb),0.55)' }}
                      width={90}
                    />
                    <Tooltip {...DARK_TOOLTIP} formatter={(v: number) => `${v}%`} />
                    <Bar dataKey="reliability" name="Reliability" radius={[0, 4, 4, 0]} barSize={18}>
                      {data.vendorScores.slice(0, 6).map((v) => (
                        <Cell
                          key={v.vendorName}
                          fill={v.reliability >= 80 ? '#12B76A' : v.reliability >= 60 ? '#F79009' : '#F04438'}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* Bottom: Recent activity */}
          {data.recentActivity.length > 0 && (
            <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-6">
              <h3 className="text-[14px] font-semibold text-[var(--ax-text)] mb-4">Recent Activity</h3>
              <div className="space-y-0">
                {data.recentActivity.map((act, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-3 py-2.5 border-b border-[var(--ax-border)] last:border-0"
                  >
                    <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: 'var(--ax-accent)' }} />
                    <p className="text-[12px] text-[rgba(var(--ax-text-rgb),0.55)] flex-1 capitalize">{act.description}</p>
                    <span className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)] tabular-nums shrink-0">
                      {formatRelativeTime(act.date)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </Layout>
  );
}

// ---- Sub-components ----

function KpiCard({
  label,
  value,
  subtitle,
  color,
  isText = false,
}: {
  label: string;
  value: string | number;
  subtitle: string;
  color: string;
  isText?: boolean;
}) {
  const colorMap: Record<string, string> = {
    success: 'text-success-600',
    danger: 'text-[#e06050]',
    warning: 'text-warning-600',
    primary: 'text-[var(--ax-accent)]',
    neutral: 'text-[rgba(var(--ax-text-rgb),0.55)]',
  };

  return (
    <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-4">
      <p className="text-[11px] font-medium text-[rgba(var(--ax-text-rgb),0.35)] uppercase tracking-wider">{label}</p>
      <p className={`${isText ? 'text-lg' : 'text-2xl'} font-bold ${colorMap[color] || 'text-[var(--ax-text)]'} mt-1 tabular-nums`}>
        {value}
      </p>
      <p className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)] mt-0.5">{subtitle}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        <div className="lg:col-span-4 h-52 rounded-xl bg-[var(--ax-overlay-hover)] animate-pulse" />
        <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 rounded-xl bg-[var(--ax-overlay-hover)] animate-pulse" />
          ))}
        </div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[1, 2].map((i) => (
          <div key={i} className="h-64 rounded-xl bg-[var(--ax-overlay-hover)] animate-pulse" />
        ))}
      </div>
    </div>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    notation: n >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
}

function formatRelativeTime(dateStr: string) {
  const now = new Date();
  const date = new Date(dateStr);
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 60) return `${diffMins}m ago`;
  const diffHrs = Math.floor(diffMins / 60);
  if (diffHrs < 24) return `${diffHrs}h ago`;
  const diffDays = Math.floor(diffHrs / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
