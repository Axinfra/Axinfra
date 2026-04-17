'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import { Loader2, Clock, CheckCircle2, AlertTriangle, Timer } from 'lucide-react';

interface VendorKPIs {
  totalMilestones: number;
  completedMilestones: number;
  onTimePct: number;
  avgDelayDays: number;
  avgApprovalCycleDays: number;
  escalationsLast30Days: number;
}

interface MilestoneRow {
  id: string;
  title: string;
  state: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualEnd: string | null;
  value: number;
}

export default function VendorOverviewPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [projectId, setProjectId] = useState('');
  const [projectName, setProjectName] = useState('');
  const [kpis, setKpis] = useState<VendorKPIs | null>(null);
  const [milestones, setMilestones] = useState<MilestoneRow[]>([]);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/vendor/portal?view=overview');
      const data = await res.json();
      if (!data.success) {
        if (res.status === 401) { router.push('/auth/login'); return; }
        if (res.status === 403) { router.push('/projects'); return; }
        setError(data.error);
        return;
      }
      setProjectId(data.data.projectId);
      setProjectName(data.data.projectName);
      setKpis(data.data.kpis);
      setMilestones(data.data.milestones);
    } catch {
      setError('Failed to load vendor portal');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { load(); }, [load]);

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin text-[rgba(232,228,220,0.35)]" />
        </div>
      </Layout>
    );
  }

  if (error) {
    return (
      <Layout>
        <div className="text-center py-20 text-[#e06050]">{error}</div>
      </Layout>
    );
  }

  const stateColors: Record<string, string> = {
    DRAFT: 'bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)]',
    IN_PROGRESS: 'bg-[rgba(196,163,90,0.08)] text-[#c4a35a]',
    SUBMITTED: 'bg-[rgba(196,163,90,0.08)] text-[#c4a35a]',
    VERIFIED: 'bg-[rgba(50,200,120,0.1)] text-[#5cba80]',
    CLOSED: 'bg-[rgba(196,163,90,0.08)] text-[#c4a35a]',
  };

  return (
    <Layout>
      <VendorNav projectName={projectName} />

      <div className="space-y-6">
        {/* KPI Cards */}
        {kpis && (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            <KpiCard
              label="Total Milestones"
              value={kpis.totalMilestones}
              icon={<Clock className="w-4 h-4 text-[rgba(232,228,220,0.35)]" />}
            />
            <KpiCard
              label="Completed"
              value={kpis.completedMilestones}
              icon={<CheckCircle2 className="w-4 h-4 text-[#5cba80]" />}
            />
            <KpiCard
              label="On-time %"
              value={`${kpis.onTimePct}%`}
              icon={<CheckCircle2 className="w-4 h-4 text-teal-500" />}
              highlight={kpis.onTimePct >= 80}
            />
            <KpiCard
              label="Avg Delay"
              value={kpis.avgDelayDays > 0 ? `${kpis.avgDelayDays}d` : '0d'}
              icon={<AlertTriangle className="w-4 h-4 text-[#c4a35a]" />}
            />
            <KpiCard
              label="Approval Cycle"
              value={`${kpis.avgApprovalCycleDays}d`}
              icon={<Timer className="w-4 h-4 text-[#c4a35a]" />}
            />
            <KpiCard
              label="Escalations (30d)"
              value={kpis.escalationsLast30Days}
              icon={<AlertTriangle className="w-4 h-4 text-red-500" />}
            />
          </div>
        )}

        {/* Milestones Table */}
        <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-6">
          <h2 className="text-sm font-semibold text-[#e8e4dc] mb-4">Your Milestones</h2>
          {milestones.length === 0 ? (
            <p className="text-sm text-[rgba(232,228,220,0.35)] py-8 text-center">
              No milestones assigned to you yet.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[rgba(255,255,255,0.07)]">
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Title</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Status</th>
                    <th className="text-left py-2.5 px-3 text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Planned End</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Value</th>
                    <th className="text-right py-2.5 px-3 text-xs font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map((m) => (
                    <tr key={m.id} className="border-b border-surface-50 last:border-0 hover:bg-[rgba(255,255,255,0.05)]/50">
                      <td className="py-3 px-3 font-medium">
                        <Link
                          href={`/projects/${projectId}/milestones/${m.id}`}
                          className="text-[#c4a35a] hover:underline"
                        >
                          {m.title}
                        </Link>
                      </td>
                      <td className="py-3 px-3">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${stateColors[m.state] || 'bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)]'}`}>
                          {m.state.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-[rgba(232,228,220,0.55)]">
                        {m.plannedEnd ? new Date(m.plannedEnd).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-3 px-3 text-right text-[rgba(232,228,220,0.55)] font-mono">
                        {m.value.toLocaleString()}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {m.state === 'IN_PROGRESS' && (
                          <Link
                            href={`/projects/${projectId}/milestones/${m.id}/evidence`}
                            className="text-xs font-medium text-[#c4a35a] hover:underline"
                          >
                            Submit Evidence
                          </Link>
                        )}
                        {m.state === 'DRAFT' && (
                          <Link
                            href={`/projects/${projectId}/milestones/${m.id}`}
                            className="text-xs font-medium text-[rgba(232,228,220,0.55)] hover:underline"
                          >
                            View
                          </Link>
                        )}
                        {(m.state === 'SUBMITTED' || m.state === 'VERIFIED' || m.state === 'CLOSED') && (
                          <Link
                            href={`/projects/${projectId}/milestones/${m.id}`}
                            className="text-xs font-medium text-[rgba(232,228,220,0.55)] hover:underline"
                          >
                            View Status
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

function KpiCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: string | number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-[11px] font-medium text-[rgba(232,228,220,0.55)] uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-xl font-semibold ${highlight ? 'text-teal-600' : 'text-[#e8e4dc]'}`}>
        {value}
      </p>
    </div>
  );
}
