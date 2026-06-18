'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Link from 'next/link';
import Layout from '@/components/Layout';
import EINav from '@/components/execution-intelligence/EINav';
import DependencyGraph, { type DepMilestone } from '@/components/execution-intelligence/DependencyGraph';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

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

interface GanttData {
  milestones: DepMilestone[];
  cpm: { criticalPath: string[]; hasCycle: boolean; cycleDescription: string | null };
}

export default function EIOverviewPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '...';
  const role = project?.myRole ?? '';

  const { data: analytics, isLoading: analyticsLoading } = useSWR<AnalyticsData>(
    projectId ? `/api/execution-intelligence/${projectId}/analytics` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 120_000 },
  );

  const { data: ganttData, isLoading: ganttLoading } = useSWR<GanttData>(
    projectId ? `/api/execution-intelligence/${projectId}/gantt` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const kpis = analytics?.kpis;
  const loading = projectLoading || analyticsLoading;

  return (
    <Layout>
      <EINav
        projectId={projectId}
        projectName={projectName}
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
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-[14px] font-semibold text-[#e8e4dc]">
                Overall Progress
              </h3>
              <span className="text-[13px] text-[rgba(232,228,220,0.55)]">
                {kpis.completedMilestones} / {kpis.totalMilestones} milestones
              </span>
            </div>
            <div className="h-2.5 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
              <div
                className="h-full rounded-full bg-[var(--ax-accent)] transition-all duration-500"
                style={{
                  width: `${kpis.totalMilestones > 0 ? (kpis.completedMilestones / kpis.totalMilestones) * 100 : 0}%`,
                }}
              />
            </div>
            <div className="mt-2 flex gap-6 text-[12px] text-[rgba(232,228,220,0.35)]">
              <span>
                <span className="text-success-600 font-medium">{kpis.totalSavedDays}d</span> saved
              </span>
              <span>
                <span className="text-[#e06050] font-medium">{kpis.totalOverrunDays}d</span> overrun
              </span>
            </div>
          </div>

          {/* Delay cost + CPM summary row */}
          <div className="grid md:grid-cols-2 gap-4">
            {/* Delay cost */}
            <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
              <h3 className="text-[14px] font-semibold text-[#e8e4dc] mb-3">
                Delay Cost Estimate
              </h3>
              {analytics?.delayCost.isConfigured ? (
                <div>
                  <p className="text-2xl font-bold text-[#e8e4dc]">
                    {formatCurrency(analytics.delayCost.totalEstimatedCost)}
                  </p>
                  <p className="text-[12px] text-[rgba(232,228,220,0.35)] mt-1">
                    Based on {analytics.delayCost.totalOverrunDays} overrun days
                  </p>
                </div>
              ) : (
                <div className="flex items-center gap-2 text-[13px] text-[rgba(232,228,220,0.35)]">
                  <InfoIcon className="w-4 h-4 shrink-0" />
                  <span>Configure cost parameters in Schedule Config to enable delay cost estimation.</span>
                </div>
              )}
            </div>

            {/* CPM summary */}
            <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
              <h3 className="text-[14px] font-semibold text-[#e8e4dc] mb-3">
                Critical Path
              </h3>
              {analytics?.cpm.hasCycle ? (
                <div className="flex items-center gap-2 text-[13px] text-[#e06050]">
                  <AlertIcon className="w-4 h-4 shrink-0" />
                  <span>Dependency loop found. Remove one circular link so each milestone flows forward.</span>
                </div>
              ) : (
                <div>
                  <p className="text-2xl font-bold text-[#e8e4dc]">
                    {analytics?.cpm.projectDuration ?? 0}d
                  </p>
                  <p className="text-[12px] text-[rgba(232,228,220,0.35)] mt-1">
                    Estimated total project duration
                  </p>
                  <p className="text-[12px] text-[rgba(232,228,220,0.55)] mt-2">
                    {analytics?.cpm.criticalPath.length ?? 0} milestones on critical path
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* ── Dependency Flow Graph ────────────────────────────────── */}
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5">
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <div>
                <h3 className="text-[14px] font-semibold text-[#e8e4dc]">Simple Dependency Flow</h3>
                <p className="text-[12px] text-[rgba(232,228,220,0.4)] mt-0.5">
                  Arrows show what must finish before the next milestone can start
                </p>
              </div>
              <Link
                href={`/execution-intelligence/${projectId}/gantt`}
                className="text-[12.5px] font-semibold text-[var(--ax-accent)] hover:text-[var(--ax-accent)] transition-colors flex items-center gap-1.5"
              >
                Open Gantt
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </Link>
            </div>

            {ganttData?.cpm.hasCycle && (
              <div className="mb-3 rounded-lg border border-[rgba(224,96,80,0.24)] bg-[rgba(224,96,80,0.08)] px-3 py-2 text-[12.5px] text-[#f38a7b]">
                {ganttData.cpm.cycleDescription ?? 'A circular dependency was found. Remove one link in the loop to restore the flow.'}
              </div>
            )}

            {ganttLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-16 rounded-lg bg-[rgba(255,255,255,0.04)] animate-pulse" />
                ))}
              </div>
            ) : ganttData?.milestones?.length ? (
              <DependencyGraph milestones={ganttData.milestones} />
            ) : (
              <div className="py-10 text-center text-[rgba(232,228,220,0.3)] text-sm">
                No milestones found. Add milestones with planned dates to see the dependency graph.
              </div>
            )}
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
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-12 h-12 rounded-full bg-[rgba(var(--ax-accent-rgb),0.08)] border border-[rgba(var(--ax-accent-rgb),0.15)] flex items-center justify-center mb-4">
            <svg className="w-6 h-6 text-[rgba(var(--ax-accent-rgb),0.5)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
            </svg>
          </div>
          <p className="text-[#e8e4dc] font-semibold mb-2">No schedule data yet</p>
          <p className="text-sm text-[rgba(232,228,220,0.45)] max-w-sm">
            Add milestones with <strong className="text-[rgba(232,228,220,0.7)]">Planned Start</strong> and <strong className="text-[rgba(232,228,220,0.7)]">Planned End</strong> dates to generate the critical path, KPIs, and dependency graph.
          </p>
          <Link
            href={`/projects/${projectId}/milestones/new`}
            className="mt-5 px-4 py-2 rounded-lg text-sm font-semibold text-[#0a0c10] bg-[var(--ax-accent)] hover:bg-[var(--ax-accent-hover)] transition-colors"
          >
            Add a milestone
          </Link>
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
    red: 'text-[#e06050]',
    blue: 'text-[var(--ax-accent)]',
    orange: 'text-warning-600',
    purple: 'text-[rgba(232,228,220,0.55)]',
    gray: 'text-[rgba(232,228,220,0.55)]',
  }[accent];

  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
      <p className="text-[11px] font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wide mb-1">
        {label}
      </p>
      <p className={`text-2xl font-bold ${accentClass}`}>{value}</p>
      <p className="text-[11px] text-[rgba(232,228,220,0.35)] mt-1">{sub}</p>
    </div>
  );
}

function KPISkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-[rgba(255,255,255,0.05)] animate-pulse" />
        ))}
      </div>
      <div className="h-20 rounded-xl bg-[rgba(255,255,255,0.05)] animate-pulse" />
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
      className="flex items-start gap-4 bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 hover:border-[rgba(var(--ax-accent-rgb),0.3)] hover:shadow-none transition-all group"
    >
      <div className="w-10 h-10 rounded-lg bg-[rgba(var(--ax-accent-rgb),0.08)] flex items-center justify-center shrink-0 group-hover:bg-[rgba(var(--ax-accent-rgb),0.12)] transition-colors">
        {icon}
      </div>
      <div>
        <p className="text-[14px] font-semibold text-[#e8e4dc] group-hover:text-[var(--ax-accent)] transition-colors">
          {title}
        </p>
        <p className="text-[12px] text-[rgba(232,228,220,0.35)] mt-1 leading-relaxed">{description}</p>
      </div>
    </a>
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
    <svg className="w-5 h-5 text-[var(--ax-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 4.5h14.25M3 9h9.75M3 13.5h9.75m4.5-4.5v12m0 0l-3.75-3.75M17.25 21L21 17.25" />
    </svg>
  );
}

function AnalyticsIcon() {
  return (
    <svg className="w-5 h-5 text-[var(--ax-accent)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}
