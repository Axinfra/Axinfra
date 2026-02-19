'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import EINav from '@/components/execution-intelligence/EINav';

interface ProjectInfo {
  name: string;
  myRole: string;
}

interface AnalyticsData {
  kpis: {
    netScheduleDays: number;
    totalSavedDays: number;
    totalOverrunDays: number;
    onTimePct: number;
    avgApprovalCycleDays: number;
    criticalMilestoneCount: number;
    escalationsLast30Days: number;
    completedMilestones: number;
    totalMilestones: number;
  };
  delayCost: {
    totalEstimatedCost: number;
    isConfigured: boolean;
    totalOverrunDays: number;
  };
  cpm: {
    criticalPath: string[];
    projectDuration: number;
    hasCycle: boolean;
  };
}

export default function EIOverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [projRes, analyticsRes] = await Promise.all([
      fetch(`/api/projects/${projectId}`),
      fetch(`/api/execution-intelligence/${projectId}/analytics`),
    ]);
    const [projData, analyticsData] = await Promise.all([
      projRes.json(),
      analyticsRes.json(),
    ]);
    if (projData.success) {
      setProjectInfo({ name: projData.data.name, myRole: projData.data.myRole });
    }
    if (analyticsData.success) {
      setAnalytics(analyticsData.data);
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const kpis = analytics?.kpis;
  const role = projectInfo?.myRole ?? '';

  return (
    <Layout>
      <EINav
        projectId={projectId}
        projectName={projectInfo?.name ?? '...'}
        role={role}
      />

      {loading ? (
        <KPISkeleton />
      ) : kpis ? (
        <div className="space-y-6">
          {/* KPI Row */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
            <KpiCard
              label="Net Schedule"
              value={
                kpis.netScheduleDays >= 0
                  ? `+${kpis.netScheduleDays}d`
                  : `${kpis.netScheduleDays}d`
              }
              sub={
                kpis.netScheduleDays >= 0
                  ? 'Ahead of plan'
                  : 'Behind plan'
              }
              accent={kpis.netScheduleDays >= 0 ? 'green' : 'red'}
            />
            <KpiCard
              label="On-Time %"
              value={`${kpis.onTimePct}%`}
              sub={`${kpis.completedMilestones} completed`}
              accent="blue"
            />
            <KpiCard
              label="Avg Approval"
              value={`${kpis.avgApprovalCycleDays}d`}
              sub="Evidence → verified"
              accent="purple"
            />
            <KpiCard
              label="Critical Path"
              value={String(kpis.criticalMilestoneCount)}
              sub="milestones on CP"
              accent={kpis.criticalMilestoneCount > 0 ? 'orange' : 'gray'}
            />
            <KpiCard
              label="Escalations"
              value={String(kpis.escalationsLast30Days)}
              sub="Last 30 days"
              accent={kpis.escalationsLast30Days > 0 ? 'red' : 'gray'}
            />
          </div>

          {/* Progress bar */}
          <div className="bg-white border border-surface-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-surface-800">
                Overall Progress
              </h3>
              <span className="text-[13px] text-surface-500">
                {kpis.completedMilestones} / {kpis.totalMilestones} milestones
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-surface-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-primary-600 transition-all duration-500"
                style={{
                  width: `${kpis.totalMilestones > 0 ? (kpis.completedMilestones / kpis.totalMilestones) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="mt-2 flex gap-6 text-[12px] text-surface-400">
              <span>
                <span className="text-success-600 font-medium">{kpis.totalSavedDays}d</span> saved
              </span>
              <span>
                <span className="text-danger-600 font-medium">{kpis.totalOverrunDays}d</span> overrun
              </span>
            </div>
          </div>

          {/* Delay cost + CPM summary row */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Delay cost */}
            <div className="bg-white border border-surface-200 rounded-xl p-5">
              <h3 className="text-[14px] font-semibold text-surface-800 mb-3">
                Delay Cost Estimate
              </h3>
              {analytics?.delayCost.isConfigured ? (
                <div>
                  <p className="text-2xl font-bold text-surface-900">
                    {formatCurrency(analytics.delayCost.totalEstimatedCost)}
                  </p>
                  <p className="text-[12px] text-surface-400 mt-1">
                    Based on {analytics.delayCost.totalOverrunDays} overrun days
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[13px] text-surface-400">
                  <InfoIcon className="w-4 h-4 shrink-0" />
                  <span>Configure cost parameters in Schedule Config to enable delay cost estimation.</span>
                </div>
              )}
            </div>

            {/* CPM summary */}
            <div className="bg-white border border-surface-200 rounded-xl p-5">
              <h3 className="text-[14px] font-semibold text-surface-800 mb-3">
                Critical Path
              </h3>
              {analytics?.cpm.hasCycle ? (
                <div className="flex items-center gap-2 text-[13px] text-danger-600">
                  <AlertIcon className="w-4 h-4 shrink-0" />
                  <span>Dependency cycle detected. Resolve in Gantt → Level 3.</span>
                </div>
              ) : (
                <div>
                  <p className="text-2xl font-bold text-surface-900">
                    {analytics?.cpm.projectDuration ?? 0}d
                  </p>
                  <p className="text-[12px] text-surface-400 mt-1">
                    Estimated total project duration
                  </p>
                  <p className="text-[12px] text-surface-500 mt-2">
                    {analytics?.cpm.criticalPath.length ?? 0} milestones on critical path
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Quick nav cards */}
          <div className="grid md:grid-cols-2 gap-4">
            <QuickNavCard
              href={`/execution-intelligence/${projectId}/gantt`}
              title="Gantt Chart"
              description="View planned vs actual timeline, dependencies, and critical path."
              icon={<GanttIcon />}
            />
            <QuickNavCard
              href={`/execution-intelligence/${projectId}/analytics`}
              title="Analytics"
              description="S-curves, burn-down, vendor scorecards, approval histograms and more."
              icon={<AnalyticsIcon />}
            />
          </div>
        </div>
      ) : (
        <div className="text-center py-16 text-surface-400 text-sm">
          No data available.
        </div>
      )}
    </Layout>
  );
}

// ---- Sub-components ----

function KpiCard({
  label,
  value,
  sub,
  accent,
}: {
  label: string;
  value: string;
  sub: string;
  accent: 'green' | 'red' | 'blue' | 'orange' | 'purple' | 'gray';
}) {
  const accentClass = {
    green: 'text-success-600',
    red: 'text-danger-600',
    blue: 'text-primary-600',
    orange: 'text-warning-600',
    purple: 'text-purple-600',
    gray: 'text-surface-500',
  }[accent];

  return (
    <div className="bg-white border border-surface-200 rounded-xl p-4">
      <p className="text-[11px] font-medium text-surface-400 uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold ${accentClass}`}>{value}</p>
      <p className="text-[11px] text-surface-400 mt-1">{sub}</p>
    </div>
  );
}

function KPISkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-surface-100 animate-pulse" />
        ))}
      </div>
      <div className="h-20 rounded-xl bg-surface-100 animate-pulse" />
    </div>
  );
}

function QuickNavCard({
  href,
  title,
  description,
  icon,
}: {
  href: string;
  title: string;
  description: string;
  icon: React.ReactNode;
}) {
  return (
    <a
      href={href}
      className="flex items-start gap-4 bg-white border border-surface-200 rounded-xl p-5 hover:border-primary-300 hover:shadow-sm transition-all group"
    >
      <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center shrink-0 group-hover:bg-primary-100 transition-colors">
        {icon}
      </div>
      <div>
        <p className="text-[14px] font-semibold text-surface-800 group-hover:text-primary-700 transition-colors">
          {title}
        </p>
        <p className="text-[12px] text-surface-400 mt-1 leading-relaxed">{description}</p>
      </div>
    </a>
  );
}

function formatCurrency(n: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    notation: n >= 1_000_000 ? 'compact' : 'standard',
    maximumFractionDigits: n >= 1_000_000 ? 1 : 0,
  }).format(n);
}

function InfoIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
    </svg>
  );
}

function AlertIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function GanttIcon() {
  return (
    <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg className="w-5 h-5 text-primary-600" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}
