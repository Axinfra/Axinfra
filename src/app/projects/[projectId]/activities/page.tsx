'use client';

import { useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import type { LucideIcon } from 'lucide-react';
import {
  AlertTriangle, CalendarClock, Clock, CheckCircle2, Flag, Wallet, CalendarDays,
  ClipboardCheck, FileText, Receipt, FileSignature, Diamond, Pencil,
} from 'lucide-react';
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceArea,
} from 'recharts';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import ActivityStateBadge from '@/components/ActivityStateBadge';
import ActivitySearch from '@/components/activities/ActivitySearch';
import ActivityStatusSection, { type ActivityRow } from '@/components/activities/ActivityStatusSection';
import ActivityEditModal from '@/components/schedule/ActivityEditModal';
import HierarchicalSelect from '@/components/ui/HierarchicalSelect';
import Pagination from '@/components/ui/Pagination';
import { buildPhaseOptions, collectDescendantPhaseIds, isPurchaseOrderPhase, type SchedulePhaseOption } from '@/lib/phaseHierarchy';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { startOfDay, groupActivitiesByStatus, type ActivityStatusBucket } from '@/lib/activityStatus';
import { computeScheduleVariance, HEALTH_LABEL, HEALTH_COLOR } from '@/lib/scheduleVariance';
import { CHART_TOOLTIP } from '@/lib/chartConfig';

interface Activity {
  id: string;
  title: string;
  description?: string;
  state: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  baselinePlannedStart: string | null;
  baselinePlannedEnd: string | null;
  durationDays: number | null;
  actualWorkHours: number | null;
  remainingWorkHours: number | null;
  vendorUserId: string | null;
  vendorUser?: { id: string; name: string; email: string } | null;
  phaseId: string | null;
  phase?: { id: string; name: string } | null;
  wbsCode?: string | null;
  isMsProjectMilestone?: boolean | null;
  percentComplete: number | null;
  priority: string;
  remarks: string | null;
  predecessorDependencies?: Array<{
    dependencyType: string;
    lagDays: number;
    predecessor: { id: string; title: string; state: string };
  }>;
  successorDependencies?: Array<{
    dependencyType: string;
    lagDays: number;
    successor: { id: string; title: string; state: string };
  }>;
}

interface PendingBOQ {
  id: string;
  boqNumber: string | null;
  status: string;
  order: { id: string; name: string; vendorUserId: string | null } | null;
}
interface PendingRABill {
  id: string;
  billNumber: number;
  status: string;
  order: { id: string; name: string; vendorUserId: string | null };
}
interface PendingWorkOrder {
  id: string;
  number: string;
  status: string;
  order: { id: string; name: string; vendorUserId: string | null };
}
interface ApprovalItem {
  id: string;
  title: string;
  status: string;
  href: string;
}

const APPROVAL_STATUS_LABEL: Record<string, string> = {
  DRAFT: 'Draft — not sent',
  PENDING_APPROVAL: 'Awaiting your approval',
  REVISED: 'Needs revision',
  REVISION_REQUESTED: 'Revision requested',
  PENDING_VENDOR_REVIEW: 'Awaiting certification',
  CERTIFIED: 'Awaiting your approval',
  APPROVED: 'Awaiting payment release',
  PENDING_VENDOR_ACCEPTANCE: 'Awaiting your acceptance',
  CHANGES_REQUESTED: 'Changes requested',
};

const DAY_MS = 86_400_000;
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

type ActivityTab = ActivityStatusBucket | 'ALL';
// Today first (the primary "what needs my attention right now" view), then urgency-descending,
// then the full unscoped table last — mirrors how a PMC actually triages a day.
const TAB_ORDER: ActivityTab[] = ['DUE_TODAY', 'OVERDUE', 'UPCOMING', 'COMPLETED', 'ALL'];
const TAB_CONFIG: Record<ActivityTab, { label: string; icon: LucideIcon; dotColor: string; emptyMessage: string }> = {
  DUE_TODAY: { label: 'Today', icon: CalendarClock, dotColor: '#f97316', emptyMessage: 'Nothing due today.' },
  OVERDUE: { label: 'Overdue', icon: AlertTriangle, dotColor: '#e06050', emptyMessage: 'Nothing overdue — nice work.' },
  UPCOMING: { label: 'Upcoming', icon: Clock, dotColor: '#eab308', emptyMessage: 'Nothing scheduled next.' },
  COMPLETED: { label: 'Completed', icon: CheckCircle2, dotColor: '#5cba80', emptyMessage: 'Nothing completed yet.' },
  ALL: { label: 'All Activities', icon: Flag, dotColor: 'var(--ax-accent)', emptyMessage: 'No activities created yet' },
};

type DependencyFilter = 'ALL' | 'BLOCKED' | 'HAS_DEPENDENCIES' | 'NO_DEPENDENCIES';

/** An activity is "Blocked" when at least one of its predecessors hasn't finished yet — it
 * can't meaningfully start until that dependency clears. */
function isBlocked(a: Activity): boolean {
  return !!a.predecessorDependencies?.some(
    (d) => d.predecessor.state !== 'VERIFIED' && d.predecessor.state !== 'CLOSED',
  );
}

function hasDependencies(a: Activity): boolean {
  return !!(a.predecessorDependencies?.length || a.successorDependencies?.length);
}

/** Weekday of `d` (Monday of the containing calendar week). */
function startOfWeek(d: Date): Date {
  const day = d.getDay(); // 0 = Sun
  const diff = day === 0 ? -6 : 1 - day;
  return startOfDay(new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff));
}

function StatCard({ icon: Icon, label, value, color, sub }: { icon: React.ElementType; label: string; value: string; color: string; sub?: string }) {
  return (
    <div className="card">
      <div className="card-body flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${color}1f` }}>
          <Icon className="w-[18px] h-[18px]" style={{ color }} />
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>{label}</p>
          <p className="text-xl font-bold truncate" style={{ color: 'var(--ax-text)' }}>{value}</p>
          {sub && <p className="text-[11px] mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function toActivityRow(a: Activity, projectName: string): ActivityRow {
  return {
    id: a.id,
    title: a.title,
    projectName,
    assignedTo: a.vendorUser?.name ?? null,
    priority: a.priority,
    state: a.state,
    plannedStart: a.plannedStart,
    plannedEnd: a.plannedEnd,
    percentComplete: a.percentComplete,
    remarks: a.remarks,
  };
}

export default function ActivitiesPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const urlPhaseId = searchParams.get('phaseId') ?? '';
  const projectId = params.projectId as string;
  const PAGE_SIZE = 25;
  // Bucket cards are taller/richer than table rows, so a smaller page keeps each screen
  // scannable — a 300+ item Overdue tab still shouldn't be one long unbroken scroll.
  const BUCKET_PAGE_SIZE = 10;
  // Same reasoning for Pending Approvals — a project with dozens of BOQs/RA Bills/Work Orders
  // all awaiting this user's action shouldn't render every row unconditionally.
  const APPROVALS_PAGE_SIZE = 10;
  const [error, setError] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [searchActive, setSearchActive] = useState(false);
  const [activeTab, setActiveTab] = useState<ActivityTab>('DUE_TODAY');
  const [bucketPage, setBucketPage] = useState(1);
  const [approvalsPage, setApprovalsPage] = useState(1);
  const [phaseFilter, setPhaseFilter] = useState(urlPhaseId);
  const [dependencyFilter, setDependencyFilter] = useState<DependencyFilter>('ALL');
  const [page, setPage] = useState(1);
  const [editingId, setEditingId] = useState<string | null>(null);

  const { project, isLoading: projectLoading, refetch: refetchProject } = useProject();

  const activitiesKey = projectId ? `/api/projects/${projectId}/milestones?all=true` : null;
  const {
    data: activities = [],
    isLoading: activitiesLoading,
    mutate: refetchActivities,
  } = useSWR<Activity[]>(activitiesKey, jsonFetcher, {
    revalidateOnFocus: true,
    dedupingInterval: 5_000,
    // A tab left open across midnight should reclassify Today/Overdue/Upcoming without a
    // manual refresh — this is what makes "Today" self-updating day to day.
    refreshInterval: 5 * 60 * 1000,
  });

  // Full phase/subphase hierarchy (same source the WBS Tree and EI Gantt use) — needed so the
  // filter dropdown can show proper indentation and selecting a parent phase also matches
  // activities filed under its subphases.
  const { data: scheduleForPhases } = useSWR<{ phases: SchedulePhaseOption[] }>(
    projectId ? `/api/projects/${projectId}/schedule` : null,
    jsonFetcher,
  );

  // Pending-approval digest — BOQs, RA Bills and Work Orders each have their own approval
  // workflow with a different "whose turn is it" owner per status; these three fetches feed
  // the Pending Approvals card, filtered to whatever's actionable for the current role.
  const { data: boqsPayload } = useSWR<{ boqs: PendingBOQ[]; total: number }>(
    projectId ? `/api/projects/${projectId}/boq` : null, jsonFetcher,
  );
  const { data: raBillsPayload } = useSWR<{ raBills: PendingRABill[]; total: number }>(
    projectId ? `/api/projects/${projectId}/ra-bills` : null, jsonFetcher,
  );
  const { data: workOrders } = useSWR<PendingWorkOrder[]>(
    projectId ? `/api/projects/${projectId}/work-orders` : null, jsonFetcher,
  );

  const allPhases = scheduleForPhases?.phases ?? [];
  const phaseOptions = useMemo(() => buildPhaseOptions(allPhases), [allPhases]);
  const phaseDepthById = useMemo(() => new Map(phaseOptions.map((p) => [p.id, p.depth])), [phaseOptions]);
  // The filter dropdown only offers Execution/schedule phases — Purchase Orders are a
  // separate concept, filtered by BOQ/Purchase Order elsewhere, not through this picker.
  const executionPhaseOptions = useMemo(
    () => buildPhaseOptions(allPhases.filter((p) => !isPurchaseOrderPhase(p))),
    [allPhases],
  );
  const phaseFilterIds = useMemo(
    () => (phaseFilter && phaseFilter !== 'none' ? collectDescendantPhaseIds(phaseFilter, allPhases) : null),
    [phaseFilter, allPhases],
  );

  const projectName = project?.name ?? '';
  const myRole = (project?.myRole as string) ?? '';
  const myUserId = (project?.myUserId as string) ?? '';
  const permissions = (project?.permissions ?? {}) as Record<string, boolean>;
  const loading = projectLoading || activitiesLoading;
  const isScopedToMe = myRole === 'VENDOR';

  // useProject()'s cached project payload is shared with Analysis/Gantt and deliberately
  // sticky for several minutes — an activity mutation here must explicitly bust that cache
  // too, or those other pages would keep showing pre-mutation state.
  const refetchAll = () => {
    void refetchActivities();
    void refetchProject();
  };

  const today = useMemo(() => startOfDay(new Date()), []);
  const weekStart = useMemo(() => startOfWeek(today), [today]);
  const weekEnd = useMemo(() => new Date(weekStart.getTime() + 7 * DAY_MS), [weekStart]);
  const todayIndex = Math.floor((today.getTime() - weekStart.getTime()) / DAY_MS);

  // The Today/Overdue/Upcoming/Completed tabs are scoped to "my work" for a Vendor (mirrors
  // the old Today page); PMC/Client/Consultant see the whole project. The "All Activities" tab
  // stays unscoped for everyone, unchanged from the original Milestones table's behavior.
  const myActivities = useMemo(
    () => (isScopedToMe ? activities.filter((a) => a.vendorUserId === myUserId) : activities),
    [activities, isScopedToMe, myUserId],
  );

  const grouped = useMemo(() => groupActivitiesByStatus(myActivities, today), [myActivities, today]);
  const completedCount = grouped.COMPLETED.length;
  const completionPct = myActivities.length > 0 ? Math.round((completedCount / myActivities.length) * 100) : 0;
  const tabCount = (t: ActivityTab) => (t === 'ALL' ? activities.length : grouped[t].length);

  // ── This week: due vs completed, one bucket per day ──────────────────────
  const weekChartData = useMemo(() => {
    const buckets = DAY_LABELS.map((label, i) => ({
      day: label,
      date: new Date(weekStart.getTime() + i * DAY_MS),
      due: 0,
      completed: 0,
    }));
    for (const a of myActivities) {
      if (a.plannedEnd) {
        const d = startOfDay(new Date(a.plannedEnd));
        if (d >= weekStart && d < weekEnd) {
          buckets[Math.floor((d.getTime() - weekStart.getTime()) / DAY_MS)].due++;
        }
      }
      if (a.actualEnd) {
        const d = startOfDay(new Date(a.actualEnd));
        if (d >= weekStart && d < weekEnd) {
          buckets[Math.floor((d.getTime() - weekStart.getTime()) / DAY_MS)].completed++;
        }
      }
    }
    return buckets;
  }, [myActivities, weekStart, weekEnd]);

  const weekTotals = useMemo(
    () => weekChartData.reduce((acc, b) => ({ due: acc.due + b.due, completed: acc.completed + b.completed }), { due: 0, completed: 0 }),
    [weekChartData],
  );

  // ── Pending Approvals: BOQs / RA Bills / Work Orders whose next step is this user's turn ──
  const pendingBOQs = useMemo(() => {
    const boqs = boqsPayload?.boqs ?? [];
    return boqs.filter((b) => {
      if (myRole === 'PMC') return b.status === 'DRAFT' || b.status === 'REVISED';
      if (myRole === 'CLIENT') return b.status === 'PENDING_APPROVAL';
      return false; // Vendor/Consultant only ever receive APPROVED BOQs — nothing pending for them
    });
  }, [boqsPayload, myRole]);

  const pendingRABills = useMemo(() => {
    const bills = raBillsPayload?.raBills ?? [];
    return bills.filter((b) => {
      if (myRole === 'PMC') return b.status === 'PENDING_VENDOR_REVIEW' || b.status === 'APPROVED';
      if (myRole === 'CLIENT') return b.status === 'CERTIFIED';
      if (myRole === 'VENDOR') return b.status === 'REVISION_REQUESTED' && b.order.vendorUserId === myUserId;
      return false;
    });
  }, [raBillsPayload, myRole, myUserId]);

  const pendingWorkOrdersList = useMemo(() => {
    const orders = workOrders ?? [];
    return orders.filter((wo) => {
      if (myRole === 'VENDOR') return wo.status === 'PENDING_VENDOR_ACCEPTANCE' && wo.order.vendorUserId === myUserId;
      if (myRole === 'PMC') return wo.status === 'CHANGES_REQUESTED';
      return false;
    });
  }, [workOrders, myRole, myUserId]);

  const approvalItems: ApprovalItem[] = useMemo(() => [
    ...pendingBOQs.map((b) => ({ id: b.id, title: `BOQ ${b.boqNumber ?? ''} · ${b.order?.name ?? 'Unassigned order'}`, status: APPROVAL_STATUS_LABEL[b.status] ?? b.status, href: `/projects/${projectId}/boq/${b.id}` })),
    ...pendingRABills.map((b) => ({ id: b.id, title: `RA-${b.billNumber} · ${b.order.name}`, status: APPROVAL_STATUS_LABEL[b.status] ?? b.status, href: `/projects/${projectId}/orders/${b.order.id}/ra-bills/${b.id}` })),
    ...pendingWorkOrdersList.map((wo) => ({ id: wo.id, title: `${wo.number} · ${wo.order.name}`, status: APPROVAL_STATUS_LABEL[wo.status] ?? wo.status, href: `/projects/${projectId}/orders/${wo.order.id}` })),
  ], [pendingBOQs, pendingRABills, pendingWorkOrdersList, projectId]);

  const endDate = project?.endDate ? new Date(project.endDate as string) : null;
  const daysRemaining = endDate ? Math.ceil((startOfDay(endDate).getTime() - today.getTime()) / DAY_MS) : null;

  const visibleActivities = activities
    .filter((a) => {
      if (!phaseFilter) return true;
      if (phaseFilter === 'none') return !a.phaseId;
      return a.phaseId !== null && a.phaseId !== undefined && phaseFilterIds!.has(a.phaseId);
    })
    .filter((a) => {
      if (dependencyFilter === 'ALL') return true;
      if (dependencyFilter === 'BLOCKED') return isBlocked(a);
      if (dependencyFilter === 'HAS_DEPENDENCIES') return hasDependencies(a);
      return !hasDependencies(a); // NO_DEPENDENCIES
    });

  const totalPages = Math.max(1, Math.ceil(visibleActivities.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedActivities = visibleActivities.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const approvalsTotalPages = Math.max(1, Math.ceil(approvalItems.length / APPROVALS_PAGE_SIZE));
  const safeApprovalsPage = Math.min(approvalsPage, approvalsTotalPages);
  const pagedApprovalItems = approvalItems.slice(
    (safeApprovalsPage - 1) * APPROVALS_PAGE_SIZE,
    safeApprovalsPage * APPROVALS_PAGE_SIZE,
  );

  const editingActivity = editingId ? activities.find((a) => a.id === editingId) ?? null : null;

  // ── Handlers ─────────────────────────────────────────────────────────────

  const handleDelete = async (activityId: string) => {
    const res = await fetch(`/api/projects/${projectId}/milestones/${activityId}`, {
      method: 'DELETE',
    });
    const data = await res.json();
    if (data.success) {
      setDeleteConfirm(null);
      void refetchActivities(
        (current = []) => current.filter((a) => a.id !== activityId),
        { revalidate: true },
      );
    } else {
      setError(data.error);
      setDeleteConfirm(null);
    }
  };

  if (loading) {
    return (
      <Layout>
        <TablePageSkeleton />
      </Layout>
    );
  }

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>Activities</h1>
          <p className="text-sm mt-1" style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>
            {today.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })} · {projectName}
          </p>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard icon={CheckCircle2} label="Completion" value={`${completionPct}%`} color="#5cba80" sub={`${completedCount} of ${myActivities.length} done`} />
          <StatCard icon={Flag} label={isScopedToMe ? 'My Activities' : 'Activities'} value={String(myActivities.length)} color="var(--ax-accent)" sub={`${grouped.OVERDUE.length + grouped.DUE_TODAY.length} need attention`} />
          <StatCard icon={CalendarDays} label="Days Remaining" value={daysRemaining !== null ? `${daysRemaining}d` : '—'} color={daysRemaining !== null && daysRemaining < 0 ? '#e06050' : '#38bdf8'} sub={endDate ? `Ends ${formatDate(endDate.toISOString())}` : undefined} />
          <StatCard icon={Wallet} label="Contract Value" value={project?.contractValue ? formatCurrency(project.contractValue as number, project?.currency) : '—'} color="#a78bfa" />
        </div>

        {/* ── Tab strip + its content panel, wrapped together with no gap so the active
             tab and its content read as one connected surface, not two separate blocks.
             Placed right after the stat row (matching Overview/Architecture/Analysis, where
             the primary tabs sit immediately below the header) so it's never pushed down the
             page by a long Pending Approvals list or the weekly chart. ── */}
        <div>
          <div className="flex gap-1 border-b overflow-x-auto" style={{ borderColor: 'var(--ax-border)' }}>
            {TAB_ORDER.map((t) => {
              const cfg = TAB_CONFIG[t];
              const isActive = activeTab === t;
              return (
                <button
                  key={t}
                  onClick={() => { setActiveTab(t); setBucketPage(1); }}
                  className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
                    isActive ? 'border-[var(--ax-accent)] text-[var(--ax-accent)]' : 'border-transparent text-[rgba(232,228,220,0.5)] hover:text-[#e8e4dc]'
                  }`}
                >
                  <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cfg.dotColor }} />
                  {cfg.label}
                  <span className="opacity-70">({tabCount(t)})</span>
                </button>
              );
            })}
          </div>

          {activeTab !== 'ALL' ? (
            /* ── Single status bucket, paginated — a backlog-heavy bucket (e.g. 300+ overdue)
                 shouldn't turn into one long unbroken scroll ── */
            (() => {
              const bucketItems = grouped[activeTab];
              const bucketTotalPages = Math.max(1, Math.ceil(bucketItems.length / BUCKET_PAGE_SIZE));
              const safeBucketPage = Math.min(bucketPage, bucketTotalPages);
              const pagedBucketItems = bucketItems.slice((safeBucketPage - 1) * BUCKET_PAGE_SIZE, safeBucketPage * BUCKET_PAGE_SIZE);
              return (
                <>
                  <ActivityStatusSection
                    bucket={activeTab}
                    items={pagedBucketItems.map((a) => toActivityRow(a, projectName))}
                    projectId={projectId}
                    emptyMessage={TAB_CONFIG[activeTab].emptyMessage}
                  />
                  <div className="mt-3">
                    <Pagination
                      page={safeBucketPage}
                      totalPages={bucketTotalPages}
                      totalItems={bucketItems.length}
                      pageSize={BUCKET_PAGE_SIZE}
                      onPageChange={setBucketPage}
                    />
                  </div>
                </>
              );
            })()
          ) : (
          <div className="space-y-6 pt-6">
            {/* ── All Activities: full filterable/searchable/paginated table ── */}
            <div className="flex justify-between items-center flex-wrap gap-3">
              <h2 className="text-lg font-semibold text-[#e8e4dc]">All Activities</h2>
              {permissions.canEditMilestones && (
                <Link href={`/projects/${projectId}/activities/new`} className="btn btn-primary">
                  Create Activity
                </Link>
              )}
            </div>

            <ActivitySearch projectId={projectId} onSearchActive={setSearchActive} />

            <div className="flex flex-col sm:flex-row sm:items-center gap-3">
              {phaseOptions.length > 0 && (
                <div className="flex items-center gap-3 w-full sm:w-auto">
                  <label className="text-sm text-[rgba(232,228,220,0.55)] shrink-0">Phase:</label>
                  <HierarchicalSelect
                    className="flex-1 sm:flex-none sm:w-64"
                    value={phaseFilter}
                    onChange={(v) => { setPhaseFilter(v); setPage(1); }}
                    fixedOptions={[
                      { value: '', label: 'All Phases', depth: 0 },
                      { value: 'none', label: 'No phase (Extras)', depth: 0 },
                    ]}
                    treeOptions={executionPhaseOptions.map((p) => ({ value: p.id, label: p.name, depth: p.depth }))}
                  />
                  {phaseFilter && (
                    <button
                      onClick={() => { setPhaseFilter(''); setPage(1); }}
                      className="text-xs text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] transition-colors shrink-0"
                    >
                      Clear
                    </button>
                  )}
                </div>
              )}
              <div className="flex items-center gap-3 w-full sm:w-auto">
                <label className="text-sm text-[rgba(232,228,220,0.55)] shrink-0">Dependency:</label>
                <select
                  value={dependencyFilter}
                  onChange={(e) => { setDependencyFilter(e.target.value as DependencyFilter); setPage(1); }}
                  className="input flex-1 sm:flex-none sm:w-52 text-sm"
                >
                  <option value="ALL">All</option>
                  <option value="BLOCKED">Blocked (waiting on predecessor)</option>
                  <option value="HAS_DEPENDENCIES">Has dependencies</option>
                  <option value="NO_DEPENDENCIES">No dependencies</option>
                </select>
              </div>
            </div>

            {searchActive ? null : visibleActivities.length === 0 ? (
              <div className="card">
                <div className="card-body text-center py-12">
                  <p className="text-[rgba(232,228,220,0.55)]">No activities created yet</p>
                  {permissions.canEditMilestones && (
                    <Link
                      href={`/projects/${projectId}/activities/new`}
                      className="btn btn-primary mt-4 inline-flex"
                    >
                      Create First Activity
                    </Link>
                  )}
                </div>
              </div>
            ) : (
              <div className="card">
                <div className="overflow-x-auto">
                  <table className="table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Phase</th>
                        {(myRole === 'CLIENT' || myRole === 'PMC') && <th>Vendor</th>}
                        <th>Priority</th>
                        <th>State</th>
                        <th>Due Date</th>
                        <th>% Complete</th>
                        <th>Health</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedActivities.map((activity) => (
                        <tr key={activity.id} className="group">
                          <td>
                            <div className="flex items-center gap-2">
                              {activity.isMsProjectMilestone && (
                                <Diamond className="w-2.5 h-2.5 text-[var(--ax-accent)] shrink-0" fill="currentColor" />
                              )}
                              <Link
                                href={`/projects/${projectId}/activities/${activity.id}`}
                                className="text-[var(--ax-accent)] hover:underline font-medium"
                              >
                                {activity.title}
                              </Link>
                              {permissions.canEditMilestones && (
                                <button
                                  onClick={() => setEditingId(activity.id)}
                                  title="Edit activity"
                                  className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-[rgba(232,228,220,0.35)] hover:text-[var(--ax-accent)] shrink-0"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            {activity.description && (
                              <p className="text-xs text-[rgba(232,228,220,0.55)] mt-1 truncate max-w-xs">
                                {activity.description}
                              </p>
                            )}
                          </td>

                          <td className="text-xs text-[rgba(232,228,220,0.5)]">
                            {activity.phase ? (
                              <span className="inline-flex items-center" style={{ paddingLeft: (phaseDepthById.get(activity.phase.id) ?? 0) * 14 }}>
                                <span className="truncate">{activity.phase.name}</span>
                              </span>
                            ) : '—'}
                          </td>

                          {(myRole === 'CLIENT' || myRole === 'PMC') && (
                            <td>
                              {activity.vendorUser ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[rgba(50,200,120,0.1)] text-[#5cba80] text-xs font-medium">
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                                  </svg>
                                  {activity.vendorUser.name}
                                </span>
                              ) : (
                                <span className="text-xs text-[rgba(232,228,220,0.35)]">&mdash;</span>
                              )}
                            </td>
                          )}

                          <td className="text-xs text-[rgba(232,228,220,0.55)]">{activity.priority.charAt(0) + activity.priority.slice(1).toLowerCase()}</td>

                          <td>
                            <div className="flex items-center gap-1.5">
                              <ActivityStateBadge state={activity.state as any} />
                              {isBlocked(activity) && (
                                <span
                                  title={`Waiting on: ${activity.predecessorDependencies
                                    ?.filter((d) => d.predecessor.state !== 'VERIFIED' && d.predecessor.state !== 'CLOSED')
                                    .map((d) => d.predecessor.title)
                                    .join(', ')}`}
                                  className="text-[10px] px-1.5 py-0.5 rounded-full bg-[rgba(224,96,80,0.12)] text-[#e06050] font-medium whitespace-nowrap"
                                >
                                  Blocked
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="text-[rgba(232,228,220,0.55)]">{formatDate(activity.plannedEnd)}</td>
                          <td className="text-xs text-[var(--ax-accent)]">
                            {activity.percentComplete !== null && activity.percentComplete !== undefined ? `${Math.round(activity.percentComplete)}%` : '—'}
                          </td>
                          <td>
                            {(() => {
                              const v = computeScheduleVariance(activity);
                              const c = HEALTH_COLOR[v.health];
                              return (
                                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap" style={{ color: c.color, background: c.bg }}>
                                  {HEALTH_LABEL[v.health]}
                                </span>
                              );
                            })()}
                          </td>

                          {/* Actions column — PMC updates progress from the activity detail
                              page; the only row-level action left is Delete (Owner). */}
                          <td className="whitespace-nowrap">
                            {myRole === 'CLIENT' && (
                              <button
                                onClick={() => setDeleteConfirm(activity.id)}
                                className="text-[rgba(232,228,220,0.35)] hover:text-[#e06050] text-xs transition-colors"
                              >
                                Delete
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Pagination */}
            {!searchActive && (
              <Pagination
                page={safePage}
                totalPages={totalPages}
                totalItems={visibleActivities.length}
                pageSize={PAGE_SIZE}
                onPageChange={setPage}
              />
            )}
          </div>
          )}
        </div>

        {/* This Week: Due vs Completed */}
        <div className="card">
          <div className="card-header flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-lg font-semibold">This Week — Due vs Completed</h2>
              <p className="text-xs mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>
                Activities due this week (from the schedule) vs how many actually got completed each day
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: 'var(--ax-accent)' }} /> {weekTotals.due} due
              </span>
              <span className="flex items-center gap-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>
                <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#5cba80' }} /> {weekTotals.completed} completed
              </span>
            </div>
          </div>
          <div className="card-body">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={weekChartData} margin={{ top: 4, right: 8, bottom: 4, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--ax-chart-line)" />
                {todayIndex >= 0 && todayIndex < 7 && (
                  <ReferenceArea
                    x1={DAY_LABELS[todayIndex]} x2={DAY_LABELS[todayIndex]}
                    fill="var(--ax-accent)" fillOpacity={0.08}
                  />
                )}
                <XAxis dataKey="day" tick={{ fontSize: 12, fill: 'rgba(var(--ax-text-rgb),0.5)' }} axisLine={false} tickLine={false} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: 'rgba(var(--ax-text-rgb),0.4)' }} axisLine={false} tickLine={false} width={28} />
                <Tooltip {...CHART_TOOLTIP} />
                <Legend wrapperStyle={{ fontSize: 12, color: 'rgba(var(--ax-text-rgb),0.55)' }} />
                <Bar dataKey="due" name="Due" fill="var(--ax-accent)" radius={[4, 4, 0, 0]} />
                <Bar dataKey="completed" name="Completed" fill="#5cba80" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Pending Approvals */}
        {approvalItems.length > 0 && (
          <div className="card">
            <div className="card-header flex items-center gap-2">
              <ClipboardCheck className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
              <h2 className="text-lg font-semibold">Pending Approvals ({approvalItems.length})</h2>
            </div>
            <div className="card-body p-0">
              <div className="divide-y" style={{ borderColor: 'var(--ax-border-subtle)' }}>
                {pagedApprovalItems.map((item) => (
                  <Link
                    key={item.id}
                    href={item.href}
                    className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-[rgba(var(--ax-accent-rgb),0.03)] transition-colors"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      {item.title.startsWith('BOQ') ? <FileText className="w-4 h-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }} />
                        : item.title.startsWith('RA-') ? <Receipt className="w-4 h-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }} />
                        : <FileSignature className="w-4 h-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }} />}
                      <span className="text-sm truncate" style={{ color: 'var(--ax-text)' }}>{item.title}</span>
                    </div>
                    <span className="text-xs shrink-0" style={{ color: 'var(--ax-accent)' }}>{item.status}</span>
                  </Link>
                ))}
              </div>
              {approvalsTotalPages > 1 && (
                <div className="px-5">
                  <Pagination
                    page={safeApprovalsPage}
                    totalPages={approvalsTotalPages}
                    totalItems={approvalItems.length}
                    pageSize={APPROVALS_PAGE_SIZE}
                    onPageChange={setApprovalsPage}
                  />
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-sm w-full mx-4">
            <div className="p-6">
              <h2 className="text-lg font-semibold mb-2 text-[#e06050]">Delete Activity</h2>
              <p className="text-[rgba(232,228,220,0.55)] mb-4">
                Are you sure you want to delete this activity? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-3">
                <button onClick={() => setDeleteConfirm(null)} className="btn btn-secondary">
                  Cancel
                </button>
                <button
                  onClick={() => void handleDelete(deleteConfirm)}
                  className="btn bg-[#e06050] text-white hover:bg-[#c8503f]"
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit modal — name, priority, remarks, dates, linked phase, assigned vendor, history */}
      {editingActivity && (
        <ActivityEditModal
          projectId={projectId}
          milestone={editingActivity}
          canEdit={permissions.canEditMilestones}
          onClose={() => setEditingId(null)}
          onSaved={() => void refetchAll()}
        />
      )}
    </Layout>
  );
}
