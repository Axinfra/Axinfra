'use client';

import { useState } from 'react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import { useVendorPortal } from '@/lib/contexts/VendorPortalContext';
import { DARK_TOOLTIP } from '@/lib/chartConfig';
import { Loader2, AlertTriangle, TrendingUp, TrendingDown, Clock, CheckCircle2, ChevronDown } from 'lucide-react';
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

type Tab = 'scurve' | 'delay' | 'payment' | 'ontime';
const TABS: { id: Tab; label: string }[] = [
  { id: 'scurve',  label: 'S-Curve'       },
  { id: 'delay',   label: 'Delay Dist.'   },
  { id: 'payment', label: 'Payment Cycle' },
  { id: 'ontime',  label: 'On-time Trend' },
];

function EmptyChart({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center h-[280px] text-center">
      <div className="w-10 h-10 rounded-full bg-[var(--ax-overlay)] border border-[var(--ax-border)] flex items-center justify-center mb-3">
        <TrendingUp className="w-4 h-4 text-[rgba(var(--ax-text-rgb),0.25)]" />
      </div>
      <p className="text-sm text-[rgba(var(--ax-text-rgb),0.35)]">{message ?? 'No data yet'}</p>
      <p className="text-xs text-[rgba(var(--ax-text-rgb),0.25)] mt-1">Data will appear as milestones are completed</p>
    </div>
  );
}

export default function VendorAnalyticsPage() {
  const { data, loading, error, reload } = useVendorPortal();
  const [activeTab, setActiveTab] = useState<Tab>('scurve');

  if (loading) return <Layout><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[rgba(var(--ax-text-rgb),0.35)]" /></div></Layout>;
  if (error)   return <Layout><div className="flex flex-col items-center justify-center py-20 text-center px-4"><AlertTriangle className="w-8 h-8 text-[#e06050] mb-3" /><p className="text-[#e06050] font-semibold mb-1">Failed to load analytics</p><p className="text-sm text-[rgba(var(--ax-text-rgb),0.45)]">{error}</p></div></Layout>;
  if (!data)   return null;

  const { projectName, allProjects, analytics } = data;
  const { kpis, sCurve, delayHistogram, paymentCycleDays, onTimeTrend } = analytics;
  const completionPct = kpis.totalMilestones > 0 ? Math.round((kpis.completedMilestones / kpis.totalMilestones) * 100) : 0;

  return (
    <Layout>
      <VendorNav projectName={projectName} />
      <div className="space-y-5">

        {allProjects.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[rgba(var(--ax-text-rgb),0.45)] uppercase tracking-wider shrink-0">Project</span>
            <div className="relative">
              <select value={data.projectId} onChange={e => reload(e.target.value)}
                className="appearance-none bg-[var(--ax-input)] border border-[var(--ax-border)] rounded-lg pl-3 pr-8 py-2 text-sm text-[var(--ax-text)] outline-none focus:border-[rgba(var(--ax-accent-rgb),0.4)] cursor-pointer">
                {allProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[rgba(var(--ax-text-rgb),0.35)] pointer-events-none" />
            </div>
          </div>
        )}

        {/* KPI cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4 text-[#5cba80]" /><span className="text-[10.5px] font-semibold text-[rgba(var(--ax-text-rgb),0.45)] uppercase tracking-wider">On-time</span></div>
            <p className={`text-2xl font-bold ${kpis.onTimePct >= 80 ? 'text-[#5cba80]' : kpis.onTimePct >= 50 ? 'text-[var(--ax-accent)]' : 'text-[#e06050]'}`}>{kpis.onTimePct}%</p>
          </div>
          <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2">
              {kpis.netScheduleDays >= 0 ? <TrendingUp className="w-4 h-4 text-[#5cba80]" /> : <TrendingDown className="w-4 h-4 text-[#e06050]" />}
              <span className="text-[10.5px] font-semibold text-[rgba(var(--ax-text-rgb),0.45)] uppercase tracking-wider">Schedule</span>
            </div>
            <p className={`text-2xl font-bold ${kpis.netScheduleDays >= 0 ? 'text-[#5cba80]' : 'text-[#e06050]'}`}>{kpis.netScheduleDays >= 0 ? '+' : ''}{kpis.netScheduleDays}d</p>
            <p className="text-[10.5px] text-[rgba(var(--ax-text-rgb),0.35)] mt-0.5">{kpis.netScheduleDays >= 0 ? 'Ahead of plan' : 'Behind plan'}</p>
          </div>
          <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><Clock className="w-4 h-4 text-[var(--ax-accent)]" /><span className="text-[10.5px] font-semibold text-[rgba(var(--ax-text-rgb),0.45)] uppercase tracking-wider">Approval</span></div>
            <p className="text-2xl font-bold text-[var(--ax-text)]">{kpis.avgApprovalCycleDays}d</p>
            <p className="text-[10.5px] text-[rgba(var(--ax-text-rgb),0.35)] mt-0.5">Evidence → verified</p>
          </div>
          <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl p-4">
            <div className="flex items-center gap-2 mb-2"><CheckCircle2 className="w-4 h-4 text-[rgba(var(--ax-text-rgb),0.35)]" /><span className="text-[10.5px] font-semibold text-[rgba(var(--ax-text-rgb),0.45)] uppercase tracking-wider">Progress</span></div>
            <p className="text-2xl font-bold text-[var(--ax-text)]">{kpis.completedMilestones}<span className="text-base text-[rgba(var(--ax-text-rgb),0.35)] font-normal">/{kpis.totalMilestones}</span></p>
            <div className="h-1.5 rounded-full bg-[var(--ax-overlay-hover)] mt-2 overflow-hidden">
              <div className="h-full rounded-full bg-[var(--ax-accent)] transition-all" style={{ width: `${completionPct}%` }} />
            </div>
          </div>
        </div>

        {/* Chart panel */}
        <div className="bg-[var(--ax-card)] border border-[var(--ax-border)] rounded-xl overflow-hidden">
          <div className="flex border-b border-[var(--ax-border)] overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                className="px-5 py-3 text-[12.5px] font-medium whitespace-nowrap border-b-2 -mb-px transition-colors"
                style={{ borderBottomColor: activeTab === tab.id ? 'var(--ax-accent)' : 'transparent', color: activeTab === tab.id ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.5)' }}>
                {tab.label}
              </button>
            ))}
          </div>

          <div className="p-5">
            {activeTab === 'scurve' && (
              <div>
                <div className="flex items-start justify-between mb-4 gap-2 flex-wrap">
                  <div><h3 className="text-sm font-semibold text-[var(--ax-text)]">S-Curve — Cumulative Value</h3><p className="text-xs text-[rgba(var(--ax-text-rgb),0.4)] mt-0.5">Planned vs actual work completed over time</p></div>
                  <div className="flex items-center gap-4 text-[11px] text-[rgba(var(--ax-text-rgb),0.55)]">
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-[var(--ax-accent)] inline-block"/>Planned</span>
                    <span className="flex items-center gap-1.5"><span className="w-3 h-0.5 rounded-full bg-[#3b82f6] inline-block"/>Actual</span>
                  </div>
                </div>
                {sCurve.length === 0 ? <EmptyChart message="No scheduled milestones with planned dates" /> : (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={sCurve} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                      <defs>
                        <linearGradient id="gP" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--ax-accent)" stopOpacity={0.25}/><stop offset="95%" stopColor="var(--ax-accent)" stopOpacity={0.02}/></linearGradient>
                        <linearGradient id="gA" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#3b82f6" stopOpacity={0.25}/><stop offset="95%" stopColor="#3b82f6" stopOpacity={0.02}/></linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--ax-chart-line)" />
                      <XAxis dataKey="date" tick={{ fontSize: 10.5, fill: 'rgba(var(--ax-text-rgb),0.4)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10.5, fill: 'rgba(var(--ax-text-rgb),0.4)' }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip {...DARK_TOOLTIP} />
                      <Area type="monotone" dataKey="plannedCumulative" stroke="var(--ax-accent)" strokeWidth={2} fill="url(#gP)" name="Planned" dot={false} />
                      <Area type="monotone" dataKey="actualCumulative"  stroke="#3b82f6" strokeWidth={2} fill="url(#gA)" name="Actual"  dot={false} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

            {activeTab === 'delay' && (
              <div>
                <div className="mb-4"><h3 className="text-sm font-semibold text-[var(--ax-text)]">Delay Distribution</h3><p className="text-xs text-[rgba(var(--ax-text-rgb),0.4)] mt-0.5">How many milestones fell into each delay bucket (days late)</p></div>
                {delayHistogram.length === 0 ? <EmptyChart message="No completed milestones with delay data" /> : (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={delayHistogram} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--ax-chart-line)" />
                      <XAxis dataKey="bucket" tick={{ fontSize: 10.5, fill: 'rgba(var(--ax-text-rgb),0.4)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10.5, fill: 'rgba(var(--ax-text-rgb),0.4)' }} axisLine={false} tickLine={false} allowDecimals={false} width={30} />
                      <Tooltip {...DARK_TOOLTIP} />
                      <Bar dataKey="count" name="Milestones" radius={[4,4,0,0]} fill="rgba(var(--ax-accent-rgb),0.7)" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}

            {activeTab === 'payment' && (
              <div>
                <div className="mb-4"><h3 className="text-sm font-semibold text-[var(--ax-text)]">Payment Cycle</h3><p className="text-xs text-[rgba(var(--ax-text-rgb),0.4)] mt-0.5">Average days from evidence submission to payment eligibility</p></div>
                <div className="grid sm:grid-cols-3 gap-4">
                  <div className="sm:col-span-1 flex flex-col items-center justify-center bg-[var(--ax-overlay)] border border-[var(--ax-border-subtle)] rounded-xl py-10 px-4 text-center">
                    <p className="text-5xl font-bold text-[var(--ax-accent)]">{paymentCycleDays.avg}</p>
                    <p className="text-sm text-[rgba(var(--ax-text-rgb),0.55)] mt-2">days avg</p>
                    <p className="text-xs text-[rgba(var(--ax-text-rgb),0.3)] mt-1">Evidence → payment eligible</p>
                  </div>
                  <div className="sm:col-span-2 space-y-3 flex flex-col justify-center">
                    {[
                      {icon:'📄',label:'Evidence submitted',sub:'Vendor uploads photos/docs'},
                      {icon:'🔍',label:'PMC review',sub:'Checked against BOQ'},
                      {icon:'✅',label:'Owner verification',sub:'Final approval'},
                      {icon:'💳',label:'Payment released',sub:'Eligible amount unlocked'},
                    ].map((s,i) => (
                      <div key={i} className="flex items-center gap-3">
                        <div className="w-7 h-7 rounded-full bg-[rgba(var(--ax-accent-rgb),0.1)] border border-[rgba(var(--ax-accent-rgb),0.2)] flex items-center justify-center text-base shrink-0">{s.icon}</div>
                        <div><p className="text-[12.5px] font-medium text-[var(--ax-text)]">{s.label}</p><p className="text-[11px] text-[rgba(var(--ax-text-rgb),0.4)]">{s.sub}</p></div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'ontime' && (
              <div>
                <div className="mb-4"><h3 className="text-sm font-semibold text-[var(--ax-text)]">On-time % Trend</h3><p className="text-xs text-[rgba(var(--ax-text-rgb),0.4)] mt-0.5">Monthly on-time delivery rate over the last 6 months</p></div>
                {onTimeTrend.length === 0 ? <EmptyChart message="Not enough completed milestones to show a trend yet" /> : (
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={onTimeTrend} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--ax-chart-line)" />
                      <XAxis dataKey="month" tick={{ fontSize: 10.5, fill: 'rgba(var(--ax-text-rgb),0.4)' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fontSize: 10.5, fill: 'rgba(var(--ax-text-rgb),0.4)' }} domain={[0,100]} axisLine={false} tickLine={false} width={32} tickFormatter={v=>`${v}%`} />
                      <Tooltip {...DARK_TOOLTIP} formatter={(v:number) => [`${v}%`,'On-time']} />
                      <Legend wrapperStyle={{ fontSize: 11.5, color: 'rgba(var(--ax-text-rgb),0.5)' }} formatter={() => 'On-time %'} />
                      <Line type="monotone" dataKey="onTimePct" stroke="#5cba80" strokeWidth={2.5} dot={{ r:4, fill:'#5cba80', strokeWidth:0 }} activeDot={{ r:6, fill:'#5cba80' }} name="On-time %" />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </Layout>
  );
}
