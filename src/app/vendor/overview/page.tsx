'use client';

import Link from 'next/link';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import { useVendorPortal } from '@/lib/contexts/VendorPortalContext';
import { Loader2, AlertTriangle, Clock, CheckCircle2, Timer, ChevronDown } from 'lucide-react';
import { formatCurrency } from '@/lib/utils';

const STATE_LABEL: Record<string, string> = {
  DRAFT: 'Draft', IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted', VERIFIED: 'Verified', CLOSED: 'Closed',
};
const STATE_STYLE: Record<string, string> = {
  DRAFT:       'bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)]',
  IN_PROGRESS: 'bg-[rgba(196,163,90,0.1)] text-[#c4a35a]',
  SUBMITTED:   'bg-[rgba(196,163,90,0.1)] text-[#c4a35a]',
  VERIFIED:    'bg-[rgba(50,200,120,0.1)] text-[#5cba80]',
  CLOSED:      'bg-[rgba(92,186,128,0.07)] text-[#5cba80]',
};

export default function VendorOverviewPage() {
  const { data, loading, error, reload } = useVendorPortal();

  if (loading) return (
    <Layout><div className="flex items-center justify-center py-20">
      <Loader2 className="w-6 h-6 animate-spin text-[rgba(232,228,220,0.35)]" />
    </div></Layout>
  );

  if (error) return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-20 text-center px-4">
        <AlertTriangle className="w-8 h-8 text-[#e06050] mb-3" />
        <p className="text-[#e06050] font-semibold mb-2">Access denied</p>
        <p className="text-sm text-[rgba(232,228,220,0.45)]">{error}</p>
      </div>
    </Layout>
  );

  if (!data) return null;

  const { projectId, projectName, allProjects, overview } = data;
  const { kpis, milestones } = overview;
  const completionPct = kpis.totalMilestones > 0
    ? Math.round((kpis.completedMilestones / kpis.totalMilestones) * 100) : 0;

  return (
    <Layout>
      <VendorNav projectName={projectName} />

      <div className="space-y-6">

        {/* Project switcher */}
        {allProjects.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[rgba(232,228,220,0.45)] uppercase tracking-wider shrink-0">Project</span>
            <div className="relative">
              <select value={projectId} onChange={e => reload(e.target.value)}
                className="appearance-none bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.09)] rounded-lg pl-3 pr-8 py-2 text-sm text-[#e8e4dc] outline-none focus:border-[rgba(196,163,90,0.4)] cursor-pointer">
                {allProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[rgba(232,228,220,0.35)] pointer-events-none" />
            </div>
          </div>
        )}

        {/* KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Total"     value={String(kpis.totalMilestones)}          icon={<Clock className="w-4 h-4 text-[rgba(232,228,220,0.35)]" />} />
          <KpiCard label="Completed" value={String(kpis.completedMilestones)}       icon={<CheckCircle2 className="w-4 h-4 text-[#5cba80]" />} highlight />
          <KpiCard label="On-time"   value={`${kpis.onTimePct}%`}                   icon={<CheckCircle2 className="w-4 h-4 text-[#5cba80]" />} highlight={kpis.onTimePct >= 80} />
          <KpiCard label="Avg delay" value={kpis.avgDelayDays > 0 ? `${kpis.avgDelayDays}d` : '0d'} icon={<AlertTriangle className="w-4 h-4 text-[#c4a35a]" />} />
          <KpiCard label="Approval"  value={`${kpis.avgApprovalCycleDays}d`}        icon={<Timer className="w-4 h-4 text-[#c4a35a]" />} />
          <KpiCard label="Escalations" value={String(kpis.escalationsLast30Days)}
            icon={<AlertTriangle className={`w-4 h-4 ${kpis.escalationsLast30Days > 0 ? 'text-[#e06050]' : 'text-[rgba(232,228,220,0.35)]'}`} />} />
        </div>

        {/* Progress bar */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Overall Progress</span>
            <span className="text-sm font-semibold text-[#e8e4dc]">{kpis.completedMilestones}/{kpis.totalMilestones} — {completionPct}%</span>
          </div>
          <div className="h-2 rounded-full bg-[rgba(255,255,255,0.05)] overflow-hidden">
            <div className="h-full rounded-full bg-[#c4a35a] transition-all duration-500" style={{ width: `${completionPct}%` }} />
          </div>
        </div>

        {/* Milestones table */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-[rgba(255,255,255,0.07)]">
            <h2 className="text-sm font-semibold text-[#e8e4dc]">
              Your Milestones
              {milestones.length > 0 && (
                <span className="ml-2 text-xs font-normal text-[rgba(232,228,220,0.4)]">{milestones.length} total</span>
              )}
            </h2>
          </div>

          {milestones.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-14 px-4 text-center">
              <Clock className="w-8 h-8 text-[rgba(232,228,220,0.2)] mb-3" />
              <p className="text-sm font-medium text-[rgba(232,228,220,0.55)] mb-1">No milestones assigned</p>
              <p className="text-xs text-[rgba(232,228,220,0.35)] max-w-xs">
                The project owner or PMC will assign milestones to you. Check back after they&apos;ve set up the schedule.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[520px]">
                <thead className="sticky top-0 bg-[#0f1016]">
                  <tr className="border-b border-[rgba(255,255,255,0.07)]">
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Milestone</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Status</th>
                    <th className="text-left py-3 px-4 text-[11px] font-semibold text-[rgba(232,228,220,0.45)] uppercase tracking-wider hidden sm:table-cell">Planned End</th>
                    <th className="text-right py-3 px-4 text-[11px] font-semibold text-[rgba(232,228,220,0.45)] uppercase tracking-wider hidden md:table-cell">Value</th>
                    <th className="text-right py-3 px-4 text-[11px] font-semibold text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m) => (
                    <tr key={m.id} className="border-b border-[rgba(255,255,255,0.04)] last:border-0 hover:bg-[rgba(255,255,255,0.02)] transition-colors">
                      <td className="py-3 px-4">
                        <Link href={`/projects/${projectId}/milestones/${m.id}`}
                          className="font-medium text-[#c4a35a] hover:text-[#d4b36a] hover:underline transition-colors line-clamp-2">
                          {m.title}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATE_STYLE[m.state] ?? STATE_STYLE['DRAFT']}`}>
                          {STATE_LABEL[m.state] ?? m.state.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-[rgba(232,228,220,0.55)] hidden sm:table-cell whitespace-nowrap">
                        {m.plannedEnd ? new Date(m.plannedEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td className="py-3 px-4 text-right text-[rgba(232,228,220,0.7)] font-mono text-xs hidden md:table-cell whitespace-nowrap">
                        {formatCurrency(m.value)}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        {m.state === 'IN_PROGRESS' && (
                          <Link href={`/projects/${projectId}/milestones/${m.id}/evidence`}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-[#c4a35a] hover:text-[#d4b36a] transition-colors">
                            Submit Evidence →
                          </Link>
                        )}
                        {m.state !== 'IN_PROGRESS' && (
                          <Link href={`/projects/${projectId}/milestones/${m.id}`}
                            className="text-xs font-medium text-[rgba(232,228,220,0.45)] hover:text-[rgba(232,228,220,0.7)] transition-colors">
                            View
                          </Link>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}

function KpiCard({ label, value, icon, highlight }: { label: string; value: string; icon: React.ReactNode; highlight?: boolean }) {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">{icon}
        <span className="text-[10.5px] font-semibold text-[rgba(232,228,220,0.45)] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-xl font-bold ${highlight ? 'text-[#5cba80]' : 'text-[#e8e4dc]'}`}>{value}</p>
    </div>
  );
}
