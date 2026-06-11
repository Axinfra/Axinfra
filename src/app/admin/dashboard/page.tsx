'use client';

import { useEffect, useState } from 'react';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { CUSTOM_TOOLTIP_WRAPPER } from '@/lib/chartConfig';

interface Stats {
  users: { total: number; new30Days: number };
  roleDistribution: Record<string, number>;
  projects: { total: number; active: number; new30Days: number; byStatus: Record<string, number> };
  milestones: { total: number; byState: Record<string, number> };
  followUps: { open: number; escalated: number };
  recentUsers: { id: string; name: string; email: string; createdAt: string }[];
  recentProjects: { id: string; name: string; status: string; createdAt: string; isExampleProject: boolean; _count: { roles: number; milestones: number } }[];
}

const ROLE_COLORS: Record<string, string> = {
  CLIENT: '#c4a35a', PMC: '#60a5fa', VENDOR: '#5cba80',
  CONSULTANT: '#a78bfa', VIEWER: 'rgba(232,228,220,0.4)',
};
const STATE_COLORS: Record<string, string> = {
  DRAFT: 'rgba(232,228,220,0.3)', IN_PROGRESS: '#60a5fa',
  SUBMITTED: '#fb923c', VERIFIED: '#5cba80', CLOSED: '#c4a35a',
};
const STATUS_COLORS: Record<string, string> = {
  ONGOING: '#5cba80', COMPLETED: '#c4a35a', PAUSED: '#fb923c', CANCELLED: '#e06050',
};

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { name: string; value: number; payload: { fill: string } }[] }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1e1e26] border border-[rgba(255,255,255,0.1)] rounded-lg px-3 py-2">
      <div className="text-[13px] font-semibold" style={{ color: payload[0].payload.fill }}>{payload[0].name}</div>
      <div className="text-[14px] font-bold text-[#e8e4dc]">{payload[0].value}</div>
    </div>
  );
}

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/admin/stats')
      .then(r => r.json())
      .then(d => { if (d.success) setStats(d.data); else setError(d.error || 'Failed'); })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div className="flex items-center justify-center h-screen text-[rgba(232,228,220,0.4)] text-sm">
      Loading platform data…
    </div>
  );
  if (error) return <div className="p-6 text-[#e06050] text-sm">{error}</div>;
  if (!stats) return null;

  const roleData = Object.entries(stats.roleDistribution).map(([name, value]) => ({ name, value, fill: ROLE_COLORS[name] || '#555' }));
  const statusData = Object.entries(stats.projects.byStatus).map(([name, value]) => ({ name, value, fill: STATUS_COLORS[name] || '#555' }));
  const stateData = Object.entries(stats.milestones.byState).map(([name, value]) => ({
    name: name.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase()), value, fill: STATE_COLORS[name] || '#555',
  }));

  const totalIssues = stats.followUps.open + stats.followUps.escalated;
  const vendorCount = stats.roleDistribution['VENDOR'] ?? 0;
  const pmcCount = stats.roleDistribution['PMC'] ?? 0;
  const clientCount = stats.roleDistribution['CLIENT'] ?? 0;

  const kpis = [
    { label: 'Total Users', value: stats.users.total, sub: `+${stats.users.new30Days} this month`, color: '#e8e4dc' },
    { label: 'Owners / Clients', value: clientCount, sub: 'Companies using platform', color: '#c4a35a' },
    { label: 'PMC Users', value: pmcCount, sub: 'Project managers', color: '#60a5fa' },
    { label: 'Vendors', value: vendorCount, sub: 'Contractors & suppliers', color: '#5cba80' },
    { label: 'Projects', value: stats.projects.total, sub: `${stats.projects.active} active · +${stats.projects.new30Days} new`, color: '#e8e4dc' },
    { label: 'Open Issues', value: totalIssues, sub: `${stats.followUps.escalated} escalated`, color: totalIssues > 0 ? '#fb923c' : '#5cba80' },
  ];

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-9 lg:py-8 max-w-[1400px]">

      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2.5 mb-1">
          <h1 className="text-xl sm:text-2xl font-bold text-[#e8e4dc]">Platform Dashboard</h1>
          <span className="text-[10px] font-bold text-[#c4a35a] bg-[rgba(196,163,90,0.12)] border border-[rgba(196,163,90,0.25)] px-2 py-0.5 rounded-full uppercase tracking-wide">Admin</span>
        </div>
        <p className="text-[13px] text-[rgba(232,228,220,0.45)]">Live overview of all users, projects, and platform activity</p>
      </div>

      {/* KPI Cards — 2 cols on mobile, 3 on sm, 6 on xl */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3 mb-6">
        {kpis.map(({ label, value, sub, color }) => (
          <div key={label} className="bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 sm:p-5">
            <div className="text-[10px] sm:text-[11px] text-[rgba(232,228,220,0.45)] font-semibold uppercase tracking-wide mb-2">{label}</div>
            <div className="text-2xl sm:text-3xl font-bold leading-none" style={{ color }}>{value}</div>
            <div className="text-[10px] sm:text-[11px] text-[rgba(232,228,220,0.35)] mt-1.5 leading-snug">{sub}</div>
          </div>
        ))}
      </div>

      {/* Charts — stack on mobile, 3-col on lg */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">

        {/* Role Distribution */}
        <div className="bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 sm:p-5">
          <div className="text-[13px] font-semibold text-[#e8e4dc] mb-0.5">User Roles</div>
          <div className="text-[11px] text-[rgba(232,228,220,0.4)] mb-3">Role assignments across projects</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={roleData} cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} dataKey="value">
                {roleData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} {...CUSTOM_TOOLTIP_WRAPPER} />
              <Legend iconSize={8} formatter={(v) => <span className="text-[11px] text-[rgba(232,228,220,0.6)]">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Project Status */}
        <div className="bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 sm:p-5">
          <div className="text-[13px] font-semibold text-[#e8e4dc] mb-0.5">Project Status</div>
          <div className="text-[11px] text-[rgba(232,228,220,0.4)] mb-3">{stats.projects.total} total projects</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={statusData} cx="50%" cy="50%" innerRadius={44} outerRadius={68} paddingAngle={3} dataKey="value">
                {statusData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} {...CUSTOM_TOOLTIP_WRAPPER} />
              <Legend iconSize={8} formatter={(v) => <span className="text-[11px] text-[rgba(232,228,220,0.6)]">{v}</span>} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        {/* Milestone Pipeline */}
        <div className="bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 sm:p-5 sm:col-span-2 lg:col-span-1">
          <div className="text-[13px] font-semibold text-[#e8e4dc] mb-0.5">Milestone Pipeline</div>
          <div className="text-[11px] text-[rgba(232,228,220,0.4)] mb-3">{stats.milestones.total} total milestones</div>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={stateData} barCategoryGap="30%">
              <XAxis dataKey="name" tick={{ fill: 'rgba(232,228,220,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'rgba(232,228,220,0.4)', fontSize: 10 }} axisLine={false} tickLine={false} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(255,255,255,0.04)' }} />
              <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                {stateData.map((e, i) => <Cell key={i} fill={e.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Recent Tables — stack on mobile, side by side on lg */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

        {/* Recent Users */}
        <div className="bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-[rgba(255,255,255,0.06)]">
            <div className="text-[13px] font-semibold text-[#e8e4dc]">Recent Users</div>
            <div className="text-[11px] text-[rgba(232,228,220,0.4)]">Newest accounts on the platform</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[380px]">
              <thead>
                <tr className="bg-[rgba(255,255,255,0.02)]">
                  {['User', 'Email', 'Joined'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[rgba(232,228,220,0.35)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.recentUsers.map(u => (
                  <tr key={u.id} className="border-t border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-[rgba(196,163,90,0.15)] flex items-center justify-center text-[11px] font-bold text-[#c4a35a] shrink-0">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <span className="text-[13px] font-medium text-[#e8e4dc] truncate max-w-[100px]">{u.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-[12px] text-[rgba(232,228,220,0.5)] truncate max-w-[140px]">{u.email}</td>
                    <td className="px-4 py-3 text-[11.5px] text-[rgba(232,228,220,0.35)] whitespace-nowrap">{fmt(u.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Recent Projects */}
        <div className="bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
          <div className="px-4 sm:px-5 py-3.5 border-b border-[rgba(255,255,255,0.06)]">
            <div className="text-[13px] font-semibold text-[#e8e4dc]">Recent Projects</div>
            <div className="text-[11px] text-[rgba(232,228,220,0.4)]">Latest projects created on the platform</div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse min-w-[360px]">
              <thead>
                <tr className="bg-[rgba(255,255,255,0.02)]">
                  {['Project', 'Status', 'Team', 'Milestones'].map(h => (
                    <th key={h} className="px-4 py-2.5 text-left text-[10px] font-semibold text-[rgba(232,228,220,0.35)] uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {stats.recentProjects.map(p => {
                  const sc = { ONGOING: '#5cba80', COMPLETED: '#c4a35a', PAUSED: '#fb923c', CANCELLED: '#e06050' }[p.status] ?? '#888';
                  return (
                    <tr key={p.id} className="border-t border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.02)]">
                      <td className="px-4 py-3">
                        <div className="text-[13px] font-medium text-[#e8e4dc] truncate max-w-[130px]">{p.name}</div>
                        {p.isExampleProject && <div className="text-[10px] text-[rgba(232,228,220,0.3)]">Example</div>}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-[10.5px] font-bold px-2 py-0.5 rounded-full" style={{ background: `${sc}22`, color: sc }}>{p.status}</span>
                      </td>
                      <td className="px-4 py-3 text-[13px] text-[rgba(232,228,220,0.6)]">{p._count.roles}</td>
                      <td className="px-4 py-3 text-[13px] text-[rgba(232,228,220,0.6)]">{p._count.milestones}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
