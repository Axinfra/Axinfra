'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { Download, FileBarChart } from 'lucide-react';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import ProjectSwitcher from '@/components/ProjectSwitcher';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { formatCurrency, formatDate } from '@/lib/utils';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';

type PeriodType = 'WEEK' | 'MONTH';

interface ReportData {
  clientName: string;
  pmcName: string;
  consultantName: string;
  period: { label: string };
  overview: { description: string | null; status: string; location: string | null; duration: { totalDurationDays: number; elapsedDays: number; balanceDays: number } | null };
  execution: {
    overview: { totalMilestones: number; doneCount: number; inProgressCount: number; submittedCount: number; draftCount: number; verifiedPercent: number };
    allActivities: Array<{ title: string; lifecycleStatus: string; percentComplete: number; plannedEnd: string | null; vendorName: string | null }>;
    dueThisPeriod: Array<{ title: string; lifecycleStatus: string; percentComplete: number; plannedEnd: string | null; vendorName: string | null }>;
    dueCompletedCount: number; dueOngoingCount: number; dueUndoneCount: number;
  };
  financial: {
    totals: { totalPlannedValue: number; totalSubmittedValue: number; totalApprovedValue: number; totalReleasedValue: number };
    byOrder: Array<{ orderName: string; boqPlannedValue: number; submittedValue: number; approvedValue: number; releasedValue: number }>;
  };
  activities: {
    updatesThisPeriodCount: number;
    completedThisPeriodCount: number;
    progressUpdates: Array<{ date: string; activityTitle: string; percentComplete: number; authorName: string; remarks: string | null }>;
  };
  payments: {
    billsTouchedCount: number;
    events: Array<{ billNumber: number; orderName: string; stage: string; amount: number; date: string }>;
    allBills: Array<{ billNumber: number; orderName: string; status: string; submittedValue: number; approvedValue: number; releasedValue: number }>;
  };
  checklists: {
    createdCount: number; signedCount: number; okCount: number; notOkCount: number; naCount: number;
    allTimeOkCount: number; allTimeNotOkCount: number; allTimeNaCount: number;
    allChecklists: Array<{ docRefNo: string; title: string; status: string; itemCount: number; filledCount: number }>;
  };
  dpr: {
    reportsFiledCount: number; calendarDaysInPeriod: number; manpowerActualTotal: number; manpowerPlannedTotal: number; highlightsTotal: number; photosTotal: number;
    criticalIssueReports: Array<{ reportDate: string; docRefNo: string; criticalIssues: string }>;
    manpowerByDay: Array<{ reportDate: string; actual: number; planned: number }>;
  };
  documents: { uploadedCount: number };
  evidencePhotos: Array<{
    activityTitle: string; submittedByName: string; submittedAt: string; remarks: string | null; authorRole: string | null;
    photoFiles: Array<{ id: string; dprId?: string; fileName: string; mimeType: string }>;
  }>;
  drawings: Array<{ serialNo: number; name: string; category: string; status: string; uploadedByName: string; date: string }>;
  stakeholders: { clientName: string; pmcName: string; consultantName: string; vendorNames: string[] };
  dashboard: { physicalActualPercent: number; financialActualPercent: number; timeElapsedPercent: number | null; physicalVariancePoints: number | null; scheduleStatusLabel: string };
  healthFlags: { scheduleRag: 'GREEN' | 'AMBER' | 'RED'; costRag: 'GREEN' | 'AMBER' | 'RED'; qualityRag: 'GREEN' | 'AMBER' | 'RED' };
  keyRisks: {
    overdueActivities: Array<{ id: string; title: string; dueDate: string; daysOverdue: number; severity: 'MINOR' | 'MAJOR' | 'CRITICAL' }>;
    overdueBills: Array<{ raBillId: string; billNumber: number; orderName: string; stage: string; daysInStage: number; amount: number }>;
  };
  materials: Array<{ materialName: string; unit: string; receivedThisPeriod: number; cumulativeReceived: number; consumedTillDate: number; balanceAtSite: number }>;
  nonConformances: Array<{ docRefNo: string; checklistTitle: string; description: string; remarks: string | null }>;
}

const RAG_COLOR: Record<string, string> = { GREEN: '#5cba80', AMBER: '#b3943f', RED: '#e06050' };
const RAG_LABEL: Record<string, string> = { GREEN: 'Healthy', AMBER: 'Minor Concern', RED: 'Serious Issue' };
function RagDot({ status }: { status: string }) {
  return <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: RAG_COLOR[status] ?? '#9ca3af' }} />;
}

const LIFECYCLE_LABELS: Record<string, string> = {
  DRAFT: 'Draft', UPCOMING: 'Upcoming', IN_PROGRESS: 'In Progress',
  DELAYED: 'Delayed', COMPLETE: 'Complete', CLOSED: 'Closed',
};

function HBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-2.5 rounded-full flex-1" style={{ background: 'rgba(232,228,220,0.1)' }}>
      <div className="h-2.5 rounded-full" style={{ width: `${Math.min(100, pct)}%`, background: color }} />
    </div>
  );
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function currentMonthStr() {
  return new Date().toISOString().slice(0, 7);
}

export default function ReportsPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '';
  const myRole = project?.myRole ?? '';

  const [periodType, setPeriodType] = useState<PeriodType>('WEEK');
  const [weekDate, setWeekDate] = useState(todayStr());
  const [month, setMonth] = useState(currentMonthStr());

  const query = periodType === 'WEEK' ? `type=WEEK&date=${weekDate}` : `type=MONTH&month=${month}`;
  const { data: report, isLoading } = useSWR<ReportData>(
    projectId ? `/api/projects/${projectId}/reports?${query}` : null,
    jsonFetcher,
  );

  const pdfHref = `/api/projects/${projectId}/reports/pdf?${query}`;

  if (projectLoading) return <Layout><TablePageSkeleton /></Layout>;

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 pb-32">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[12px]" style={{ color: 'rgba(232,228,220,0.35)' }}>Reports ·</span>
            <ProjectSwitcher currentProjectId={projectId} currentProjectName={projectName} buildHref={(id) => `/projects/${id}/reports`} />
          </div>
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Project Report</h1>
          <p className="text-sm text-[rgba(232,228,220,0.45)] mt-0.5">Weekly or monthly rollup across BOQ, activities, payments, checklists, DPR, and documents.</p>
        </div>

        {/* Period controls */}
        <div className="card">
          <div className="card-body flex flex-wrap items-end gap-4">
            <div>
              <label className="label">Report Type</label>
              <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--ax-overlay-hover)' }}>
                {(['WEEK', 'MONTH'] as PeriodType[]).map((t) => (
                  <button
                    key={t}
                    onClick={() => setPeriodType(t)}
                    className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${periodType === t ? 'ax-tab-active' : 'ax-tab-inactive'}`}
                  >
                    {t === 'WEEK' ? 'Weekly' : 'Monthly'}
                  </button>
                ))}
              </div>
            </div>
            {periodType === 'WEEK' ? (
              <div>
                <label className="label">Any date in the week</label>
                <input type="date" className="input" value={weekDate} onChange={(e) => setWeekDate(e.target.value)} />
              </div>
            ) : (
              <div>
                <label className="label">Month</label>
                <input type="month" className="input" value={month} onChange={(e) => setMonth(e.target.value)} />
              </div>
            )}
            <a href={pdfHref} className="btn btn-primary flex items-center gap-2 ml-auto">
              <Download className="w-4 h-4" />Download PDF
            </a>
          </div>
          {report && (
            <div className="card-body pt-0 text-sm" style={{ color: 'rgba(232,228,220,0.5)' }}>
              Showing: <span style={{ color: 'var(--ax-text)' }}>{report.period.label}</span>
            </div>
          )}
        </div>

        {isLoading ? (
          <TablePageSkeleton />
        ) : !report ? (
          <div className="card"><div className="card-body text-center py-12 text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No data.</div></div>
        ) : (
          <>
            {/* 1. Executive Summary */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">1.1 Progress Dashboard</h2></div>
              <div className="card-body p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['Key Indicator', 'Planned', 'Actual', 'Variance'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      <td className="px-3 py-1.5">Overall Physical Progress (%)</td>
                      <td className="px-3 py-1.5">{report.dashboard.timeElapsedPercent !== null ? `${report.dashboard.timeElapsedPercent.toFixed(1)}% (time-linear est.)` : 'Not set'}</td>
                      <td className="px-3 py-1.5">{report.dashboard.physicalActualPercent.toFixed(1)}%</td>
                      <td className="px-3 py-1.5">{report.dashboard.physicalVariancePoints !== null ? `${report.dashboard.physicalVariancePoints >= 0 ? '+' : ''}${report.dashboard.physicalVariancePoints.toFixed(1)} pts` : '—'}</td>
                    </tr>
                    <tr className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      <td className="px-3 py-1.5">Overall Financial Progress (%)</td>
                      <td className="px-3 py-1.5">{report.dashboard.timeElapsedPercent !== null ? `${report.dashboard.timeElapsedPercent.toFixed(1)}% (time-linear est.)` : 'Not set'}</td>
                      <td className="px-3 py-1.5">{report.dashboard.financialActualPercent.toFixed(1)}%</td>
                      <td className="px-3 py-1.5">{report.dashboard.timeElapsedPercent !== null ? `${(report.dashboard.financialActualPercent - report.dashboard.timeElapsedPercent) >= 0 ? '+' : ''}${(report.dashboard.financialActualPercent - report.dashboard.timeElapsedPercent).toFixed(1)} pts` : '—'}</td>
                    </tr>
                    <tr>
                      <td className="px-3 py-1.5">Time Elapsed (%)</td>
                      <td className="px-3 py-1.5">—</td>
                      <td className="px-3 py-1.5">{report.dashboard.timeElapsedPercent !== null ? `${report.dashboard.timeElapsedPercent.toFixed(1)}%` : 'Not set'}</td>
                      <td className="px-3 py-1.5">—</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <div className="card-body pt-0 text-sm">
                <span style={{ color: 'rgba(232,228,220,0.45)' }}>Schedule Status: </span>
                <span className="font-semibold" style={{ color: 'var(--ax-text)' }}>{report.dashboard.scheduleStatusLabel}</span>
              </div>
            </div>

            <div className="card">
              <div className="card-header"><h2 className="font-semibold">1.2 Health Flags</h2></div>
              <div className="card-body space-y-2.5">
                {[
                  { area: 'Time / Schedule', status: report.healthFlags.scheduleRag },
                  { area: 'Cost / Finance', status: report.healthFlags.costRag },
                  { area: 'Quality', status: report.healthFlags.qualityRag },
                ].map((f) => (
                  <div key={f.area} className="flex items-center gap-2 text-sm">
                    <RagDot status={f.status} />
                    <span style={{ color: 'var(--ax-text)' }}>{f.area}</span>
                    <span className="text-xs font-medium ml-auto" style={{ color: RAG_COLOR[f.status] ?? 'rgba(232,228,220,0.4)' }}>{RAG_LABEL[f.status] ?? f.status}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 2. Project Particulars */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">2.1 General Details</h2></div>
              <div className="card-body grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <Stat label="Status" value={report.overview.status} />
                <Stat label="Location" value={report.overview.location || '—'} />
                <Stat label="Total Duration" value={report.overview.duration ? `${report.overview.duration.totalDurationDays} days` : 'Not set'} />
                <Stat label="Elapsed" value={report.overview.duration ? `${report.overview.duration.elapsedDays} days` : 'Not set'} />
                <Stat label="Balance" value={report.overview.duration ? `${report.overview.duration.balanceDays} days` : 'Not set'} />
              </div>
              {report.overview.description && (
                <div className="card-body pt-0 text-sm" style={{ color: 'rgba(232,228,220,0.6)' }}>{report.overview.description}</div>
              )}
              <div className="card-body pt-0">
                <p className="text-xs font-medium mb-2" style={{ color: 'rgba(232,228,220,0.45)' }}>2.2 Project Stakeholders</p>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between"><span style={{ color: 'rgba(232,228,220,0.5)' }}>Client / Owner</span><span style={{ color: 'var(--ax-text)' }}>{report.stakeholders.clientName}</span></div>
                  <div className="flex justify-between"><span style={{ color: 'rgba(232,228,220,0.5)' }}>PMC</span><span style={{ color: 'var(--ax-text)' }}>{report.stakeholders.pmcName}</span></div>
                  <div className="flex justify-between"><span style={{ color: 'rgba(232,228,220,0.5)' }}>Consultant</span><span style={{ color: 'var(--ax-text)' }}>{report.stakeholders.consultantName}</span></div>
                  <div className="flex justify-between"><span style={{ color: 'rgba(232,228,220,0.5)' }}>Vendors</span><span style={{ color: 'var(--ax-text)' }}>{report.stakeholders.vendorNames.join(', ') || '—'}</span></div>
                </div>
              </div>
            </div>

            {/* Executive Summary (key numbers) */}
            <div className="card">
              <div className="card-header flex items-center gap-2">
                <FileBarChart className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
                <h2 className="font-semibold">Executive Summary</h2>
              </div>
              <div className="card-body grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                <Stat label="BOQ Planned Value" value={formatCurrency(report.financial.totals.totalPlannedValue, project?.currency)} />
                <Stat label="Billed to Date" value={formatCurrency(report.financial.totals.totalSubmittedValue, project?.currency)} />
                <Stat label="Approved to Date" value={formatCurrency(report.financial.totals.totalApprovedValue, project?.currency)} />
                <Stat label="Released to Date" value={formatCurrency(report.financial.totals.totalReleasedValue, project?.currency)} />
                <Stat label="Activities Updated" value={String(report.activities.updatesThisPeriodCount)} />
                <Stat label="Activities Completed" value={String(report.activities.completedThisPeriodCount)} />
                <Stat label="Checklists Signed" value={String(report.checklists.signedCount)} />
                <Stat label="DPR Coverage" value={`${report.dpr.reportsFiledCount}/${report.dpr.calendarDaysInPeriod} days`} />
                <Stat label="Critical Issues" value={String(report.dpr.criticalIssueReports.length)} />
                <Stat label="Documents Uploaded" value={String(report.documents.uploadedCount)} />
              </div>
            </div>

            {/* BOQ / Financial */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">BOQ &amp; Financial Progress (as of period end)</h2></div>
              <div className="card-body p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['Order', 'Planned', 'Submitted', 'Approved', 'Released'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.financial.byOrder.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No purchase orders.</td></tr>
                    ) : (
                      report.financial.byOrder.map((o, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                          <td className="px-3 py-1.5">{o.orderName}</td>
                          <td className="px-3 py-1.5">{formatCurrency(o.boqPlannedValue, project?.currency)}</td>
                          <td className="px-3 py-1.5">{formatCurrency(o.submittedValue, project?.currency)}</td>
                          <td className="px-3 py-1.5">{formatCurrency(o.approvedValue, project?.currency)}</td>
                          <td className="px-3 py-1.5">{formatCurrency(o.releasedValue, project?.currency)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Activities */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">Activities</h2></div>
              <div className="card-body space-y-2.5">
                {[
                  { label: 'Done', value: report.execution.overview.doneCount, color: '#5cba80' },
                  { label: 'In Progress', value: report.execution.overview.inProgressCount, color: 'var(--ax-accent)' },
                  { label: 'Submitted', value: report.execution.overview.submittedCount, color: '#6b93c9' },
                  { label: 'Draft', value: report.execution.overview.draftCount, color: '#9ca3af' },
                ].map((s) => (
                  <div key={s.label} className="flex items-center gap-3 text-sm">
                    <span className="w-24 shrink-0" style={{ color: 'rgba(232,228,220,0.5)' }}>{s.label}</span>
                    <HBar pct={report.execution.overview.totalMilestones > 0 ? (s.value / report.execution.overview.totalMilestones) * 100 : 0} color={s.color} />
                    <span className="w-8 text-right shrink-0" style={{ color: 'var(--ax-text)' }}>{s.value}</span>
                  </div>
                ))}
              </div>
              <div className="card-body p-0 pt-0 overflow-x-auto"><p className="px-3 pb-2 text-xs" style={{ color: 'rgba(232,228,220,0.4)' }}>Progress updates this period</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['Date', 'Activity', '%', 'By', 'Remarks'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.activities.progressUpdates.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No progress updates this period.</td></tr>
                    ) : (
                      report.activities.progressUpdates.map((u, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                          <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(u.date)}</td>
                          <td className="px-3 py-1.5">{u.activityTitle}</td>
                          <td className="px-3 py-1.5">{u.percentComplete}%</td>
                          <td className="px-3 py-1.5">{u.authorName}</td>
                          <td className="px-3 py-1.5">{u.remarks ?? ''}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Due This Period */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">Due This Period — Completed / Ongoing / Undone</h2></div>
              <div className="card-body space-y-2.5">
                {[
                  { label: 'Completed', value: report.execution.dueCompletedCount, color: '#5cba80' },
                  { label: 'Ongoing', value: report.execution.dueOngoingCount, color: 'var(--ax-accent)' },
                  { label: 'Undone', value: report.execution.dueUndoneCount, color: '#e06050' },
                ].map((s) => {
                  const total = Math.max(report.execution.dueCompletedCount + report.execution.dueOngoingCount + report.execution.dueUndoneCount, 1);
                  return (
                    <div key={s.label} className="flex items-center gap-3 text-sm">
                      <span className="w-24 shrink-0" style={{ color: 'rgba(232,228,220,0.5)' }}>{s.label}</span>
                      <HBar pct={(s.value / total) * 100} color={s.color} />
                      <span className="w-8 text-right shrink-0" style={{ color: 'var(--ax-text)' }}>{s.value}</span>
                    </div>
                  );
                })}
              </div>
              <div className="card-body p-0 pt-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['Activity', 'Status', '%', 'Vendor', 'Planned End'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.execution.dueThisPeriod.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No activities were due this period.</td></tr>
                    ) : (
                      report.execution.dueThisPeriod.map((a, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                          <td className="px-3 py-1.5">{a.title}</td>
                          <td className="px-3 py-1.5">{LIFECYCLE_LABELS[a.lifecycleStatus] ?? a.lifecycleStatus}</td>
                          <td className="px-3 py-1.5">{a.percentComplete}%</td>
                          <td className="px-3 py-1.5">{a.vendorName ?? '—'}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{a.plannedEnd ? formatDate(a.plannedEnd) : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* All Activities roster */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">All Activities</h2></div>
              <div className="card-body p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['Activity', 'Status', '%', 'Vendor', 'Planned End'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.execution.allActivities.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No activities on this project.</td></tr>
                    ) : (
                      report.execution.allActivities.map((a, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                          <td className="px-3 py-1.5">{a.title}</td>
                          <td className="px-3 py-1.5">{LIFECYCLE_LABELS[a.lifecycleStatus] ?? a.lifecycleStatus}</td>
                          <td className="px-3 py-1.5">{a.percentComplete}%</td>
                          <td className="px-3 py-1.5">{a.vendorName ?? '—'}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{a.plannedEnd ? formatDate(a.plannedEnd) : '—'}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Payments */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">Payments — RA Bills Touched This Period</h2></div>
              <div className="card-body p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['Date', 'Bill', 'Order', 'Stage', 'Amount'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.payments.events.length === 0 ? (
                      <tr><td colSpan={5} className="px-3 py-6 text-center text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No RA Bill activity this period.</td></tr>
                    ) : (
                      report.payments.events.map((e, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                          <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(e.date)}</td>
                          <td className="px-3 py-1.5">RA-{e.billNumber}</td>
                          <td className="px-3 py-1.5">{e.orderName}</td>
                          <td className="px-3 py-1.5">{e.stage}</td>
                          <td className="px-3 py-1.5">{formatCurrency(e.amount, project?.currency)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* All RA Bills roster */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">All RA Bills</h2></div>
              <div className="card-body p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['Bill', 'Order', 'Status', 'Submitted', 'Approved', 'Released'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.payments.allBills.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No RA Bills on this project.</td></tr>
                    ) : (
                      report.payments.allBills.map((b, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                          <td className="px-3 py-1.5">RA-{b.billNumber}</td>
                          <td className="px-3 py-1.5">{b.orderName}</td>
                          <td className="px-3 py-1.5">{b.status.replace(/_/g, ' ')}</td>
                          <td className="px-3 py-1.5">{formatCurrency(b.submittedValue, project?.currency)}</td>
                          <td className="px-3 py-1.5">{formatCurrency(b.approvedValue, project?.currency)}</td>
                          <td className="px-3 py-1.5">{formatCurrency(b.releasedValue, project?.currency)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Checklists */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">Checklists</h2></div>
              <div className="card-body grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <Stat label="Created" value={String(report.checklists.createdCount)} />
                <Stat label="Signed" value={String(report.checklists.signedCount)} />
                <Stat label="O.K. (This Period)" value={String(report.checklists.okCount)} />
                <Stat label="Not O.K. (This Period)" value={String(report.checklists.notOkCount)} />
              </div>
              <div className="card-body pt-0 space-y-2.5">
                <p className="text-xs" style={{ color: 'rgba(232,228,220,0.4)' }}>Check-point results, all-time across every checklist</p>
                {[
                  { label: 'O.K.', value: report.checklists.allTimeOkCount, color: '#5cba80' },
                  { label: 'Not O.K.', value: report.checklists.allTimeNotOkCount, color: '#e06050' },
                  { label: 'N.A.', value: report.checklists.allTimeNaCount, color: '#9ca3af' },
                ].map((s) => {
                  const total = Math.max(report.checklists.allTimeOkCount + report.checklists.allTimeNotOkCount + report.checklists.allTimeNaCount, 1);
                  return (
                    <div key={s.label} className="flex items-center gap-3 text-sm">
                      <span className="w-16 shrink-0" style={{ color: 'rgba(232,228,220,0.5)' }}>{s.label}</span>
                      <HBar pct={(s.value / total) * 100} color={s.color} />
                      <span className="w-8 text-right shrink-0" style={{ color: 'var(--ax-text)' }}>{s.value}</span>
                    </div>
                  );
                })}
              </div>
              <div className="card-body p-0 pt-0 overflow-x-auto">
                <p className="px-3 pb-2 text-xs" style={{ color: 'rgba(232,228,220,0.4)' }}>All checklists on this project</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['Ref No.', 'Title', 'Status', 'Filled / Items'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.checklists.allChecklists.length === 0 ? (
                      <tr><td colSpan={4} className="px-3 py-6 text-center text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No checklists on this project.</td></tr>
                    ) : (
                      report.checklists.allChecklists.map((c, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                          <td className="px-3 py-1.5">{c.docRefNo}</td>
                          <td className="px-3 py-1.5">{c.title}</td>
                          <td className="px-3 py-1.5">{c.status.replace(/_/g, ' ')}</td>
                          <td className="px-3 py-1.5">{c.filledCount} / {c.itemCount}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              <div className="card-body pt-0 space-y-1.5">
                <p className="text-xs font-medium" style={{ color: 'rgba(232,228,220,0.45)' }}>Non-Conformances — Not O.K. check points this period</p>
                {report.nonConformances.length === 0 ? (
                  <p className="text-xs" style={{ color: 'rgba(232,228,220,0.35)' }}>None recorded this period.</p>
                ) : (
                  report.nonConformances.map((n, i) => (
                    <p key={i} className="text-xs" style={{ color: 'rgba(232,228,220,0.6)' }}>
                      <span style={{ color: 'rgba(232,228,220,0.4)' }}>{n.docRefNo} · {n.checklistTitle} —</span> {n.description}{n.remarks ? ` (${n.remarks})` : ''}
                    </p>
                  ))
                )}
              </div>
            </div>

            {/* DPR */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">Daily Progress Reports</h2></div>
              <div className="card-body grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <Stat label="Filed" value={`${report.dpr.reportsFiledCount}/${report.dpr.calendarDaysInPeriod} days`} />
                <Stat label="Manpower (Actual/Planned)" value={`${report.dpr.manpowerActualTotal}/${report.dpr.manpowerPlannedTotal}`} />
                <Stat label="Highlights" value={String(report.dpr.highlightsTotal)} />
                <Stat label="Photos" value={String(report.dpr.photosTotal)} />
              </div>
              {report.dpr.manpowerByDay.length > 0 && (
                <div className="card-body pt-0 space-y-2.5">
                  <p className="text-xs" style={{ color: 'rgba(232,228,220,0.4)' }}>Manpower trend — Actual vs Planned, by day</p>
                  {report.dpr.manpowerByDay.map((d, i) => {
                    const max = Math.max(1, ...report.dpr.manpowerByDay.map((r) => Math.max(r.actual, r.planned)));
                    return (
                      <div key={i} className="flex items-center gap-3 text-sm">
                        <span className="w-20 shrink-0 text-xs" style={{ color: 'rgba(232,228,220,0.5)' }}>{formatDate(d.reportDate)}</span>
                        <div className="flex-1 space-y-1">
                          <HBar pct={(d.actual / max) * 100} color="var(--ax-accent)" />
                          <HBar pct={(d.planned / max) * 100} color="rgba(232,228,220,0.25)" />
                        </div>
                        <span className="w-14 text-right shrink-0 text-xs" style={{ color: 'var(--ax-text)' }}>{d.actual}/{d.planned}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {report.dpr.criticalIssueReports.length > 0 && (
                <div className="card-body pt-0 space-y-1.5">
                  <p className="text-xs font-medium" style={{ color: '#e06050' }}>Critical Issues Flagged</p>
                  {report.dpr.criticalIssueReports.map((r, i) => (
                    <p key={i} className="text-xs" style={{ color: 'rgba(232,228,220,0.6)' }}>
                      <span style={{ color: 'rgba(232,228,220,0.4)' }}>{formatDate(r.reportDate)} · {r.docRefNo} —</span> {r.criticalIssues}
                    </p>
                  ))}
                </div>
              )}
              <div className="card-body p-0 pt-0 overflow-x-auto">
                <p className="px-3 pb-2 text-xs" style={{ color: 'rgba(232,228,220,0.4)' }}>Key Raw Materials — Procurement &amp; Stock</p>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['Material', 'Unit', 'Recd. (Period)', 'Recd. (Cum.)', 'Consumed', 'Balance'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.materials.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No procurement recorded this period.</td></tr>
                    ) : (
                      report.materials.map((m, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                          <td className="px-3 py-1.5">{m.materialName}</td>
                          <td className="px-3 py-1.5">{m.unit}</td>
                          <td className="px-3 py-1.5">{m.receivedThisPeriod}</td>
                          <td className="px-3 py-1.5">{m.cumulativeReceived}</td>
                          <td className="px-3 py-1.5">{m.consumedTillDate}</td>
                          <td className="px-3 py-1.5">{m.balanceAtSite}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Key Issues & Risks */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">Key Issues &amp; Risks</h2></div>
              <div className="card-body p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['Issue', 'Severity', 'Detail'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.keyRisks.overdueActivities.length === 0 && report.keyRisks.overdueBills.length === 0 ? (
                      <tr><td colSpan={3} className="px-3 py-6 text-center text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No overdue activities or bills flagged.</td></tr>
                    ) : (
                      <>
                        {report.keyRisks.overdueActivities.map((a, i) => (
                          <tr key={`a-${i}`} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                            <td className="px-3 py-1.5">Activity overdue: {a.title}</td>
                            <td className="px-3 py-1.5" style={{ color: a.severity === 'CRITICAL' ? '#e06050' : a.severity === 'MAJOR' ? '#b3943f' : undefined }}>
                              {a.severity.charAt(0) + a.severity.slice(1).toLowerCase()}
                            </td>
                            <td className="px-3 py-1.5">{a.daysOverdue} day(s) overdue (due {formatDate(a.dueDate)})</td>
                          </tr>
                        ))}
                        {report.keyRisks.overdueBills.map((b, i) => (
                          <tr key={`b-${i}`} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                            <td className="px-3 py-1.5">RA-{b.billNumber} ({b.orderName}) stuck in {b.stage}</td>
                            <td className="px-3 py-1.5" style={{ color: b.daysInStage > 30 ? '#b3943f' : undefined }}>{b.daysInStage > 30 ? 'Major' : 'Minor'}</td>
                            <td className="px-3 py-1.5">{b.daysInStage} day(s) in stage · {formatCurrency(b.amount, project?.currency)}</td>
                          </tr>
                        ))}
                      </>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Progress Photographs */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">Progress Photographs</h2></div>
              <div className="card-body space-y-5">
                {report.evidencePhotos.length === 0 ? (
                  <p className="text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No photos captured this period.</p>
                ) : (
                  report.evidencePhotos.map((group, i) => (
                    <div key={i}>
                      <p className="text-sm font-medium" style={{ color: 'var(--ax-text)' }}>{group.activityTitle}</p>
                      <p className="text-xs mb-2" style={{ color: 'rgba(232,228,220,0.4)' }}>
                        {group.submittedByName} ({group.authorRole === 'VENDOR' ? 'Vendor' : group.authorRole === 'PMC' ? 'PMC' : group.authorRole === 'SITE_ENGINEER' ? 'Site Engineer' : 'Unknown'}) · {formatDate(group.submittedAt)}
                        {group.remarks ? ` — ${group.remarks}` : ''}
                      </p>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {group.photoFiles.map((f) => {
                          const src = f.dprId ? `/api/projects/${projectId}/dpr/${f.dprId}/photos/${f.id}` : `/api/files/${f.id}`;
                          // eslint-disable-next-line @next/next/no-img-element
                          return <img key={f.id} src={src} alt={f.fileName} className="w-full h-28 object-cover rounded-lg border" style={{ borderColor: 'var(--ax-border)' }} />;
                        })}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Drawings */}
            <div className="card">
              <div className="card-header"><h2 className="font-semibold">Drawings (this period)</h2></div>
              <div className="card-body p-0 overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                      {['No.', 'Name', 'Category', 'Status', 'Uploaded By', 'Date'].map((h) => (
                        <th key={h} className="px-3 py-2 font-medium whitespace-nowrap" style={{ color: 'rgba(232,228,220,0.5)' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {report.drawings.length === 0 ? (
                      <tr><td colSpan={6} className="px-3 py-6 text-center text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>No drawings uploaded or reviewed this period.</td></tr>
                    ) : (
                      report.drawings.map((d, i) => (
                        <tr key={i} className="border-b" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                          <td className="px-3 py-1.5">{d.serialNo}</td>
                          <td className="px-3 py-1.5">{d.name}</td>
                          <td className="px-3 py-1.5">{d.category}</td>
                          <td className="px-3 py-1.5">{d.status}</td>
                          <td className="px-3 py-1.5">{d.uploadedByName}</td>
                          <td className="px-3 py-1.5 whitespace-nowrap">{formatDate(d.date)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs" style={{ color: 'rgba(232,228,220,0.35)' }}>{label}</p>
      <p className="text-lg font-semibold" style={{ color: 'var(--ax-text)' }}>{value}</p>
    </div>
  );
}
