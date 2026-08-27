'use client';

import { useState } from 'react';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import ActivityStateBadge from '@/components/ActivityStateBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useProject } from '@/lib/contexts/ProjectContext';
import OrderList from '@/components/phases/OrderList';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';
import VendorCreateRABillModal from '@/components/vendor/VendorCreateRABillModal';
import VendorStatusPill from '@/components/vendor/VendorStatusPill';
import VendorGanttChart from '@/components/vendor/VendorGanttChart';
import VendorPerformanceCharts from '@/components/vendor/VendorPerformanceCharts';
import CostScheduleVarianceCard from '@/components/dashboard/CostScheduleVarianceCard';
import type { GanttMilestone, AnalyticsKPIs, SCurvePoint, DelayBucket, OnTimeTrend, PaymentCycleDays } from '@/lib/contexts/VendorPortalContext';
import { X, Package, Wallet, ArrowRight } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ProjectData {
  id: string;
  name: string;
  description?: string;
  currency?: string;
  isExampleProject?: boolean;
  myRole: string;
  myUserId: string;
  permissions: Record<string, boolean>;
  boqs: Array<{ id: string; status: string; items: Array<{ id: string; plannedValue: number }> }>;
  /** One-off vendor purchases outside the BOQ flow (HVAC/Electrical/Civil-style direct
   * orders) — undefined for Vendor/Viewer, who don't get project-wide totals. */
  directOrdersTotal?: number;
  milestones: Array<{
    id: string; title: string; state: string;
    plannedEnd: string | null;
  }>;
}

const WEEK_DAY_LABEL = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Today" / "Tomorrow" / "Mon" plus a short date. No clock time — every form that sets
 * `plannedEnd` (ActivityEditModal, PhaseEditModal, WorkOrderUploadModal, etc.) only ever
 * collects a plain date, never a time of day, so there's no real time to show. Mirrors the
 * mobile app's identical helper in src/app/project/[projectId].tsx so "This Week" reads the
 * same on both. */
function weekAgendaLabel(iso: string, today: Date): { dayLabel: string; dateLabel: string } {
  const d = new Date(iso);
  const dayStart = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((dayStart.getTime() - today.getTime()) / 86_400_000);
  const dayLabel = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : WEEK_DAY_LABEL[d.getDay()];
  const dateLabel = d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return { dayLabel, dateLabel };
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function ProjectDetailPage() {
  const params = useParams();
  const projectId = params.projectId as string;
  const { project: ctxProject, isLoading: loading, error } = useProject();
  const project = ctxProject as unknown as ProjectData | null;

  const [activeTab, setActiveTab] = useState<'overview' | 'reports'>('overview');

  if (loading) return <Layout><TablePageSkeleton title={false} /></Layout>;
  if (error || !project) return <Layout><div className="alert alert-error">{error?.message || 'Project not found'}</div></Layout>;

  const myRole = project.myRole;

  const tabs = [
    { key: 'overview', label: 'Overview' },
    // Reports (Schedule + Performance graphs) is vendor-specific — same charts as the mobile
    // portal's Gantt/Analytics pages, embedded here instead of a separate navigation hop.
    ...(myRole === 'VENDOR' ? [{ key: 'reports', label: 'Reports' }] : []),
  ];

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={project.name} role={myRole} />

      {project.isExampleProject && (
        <div className="mb-6 p-4 rounded-lg border-l-4"
          style={{ borderColor: '#7e22ce', backgroundColor: 'rgba(124, 58, 237, 0.08)' }}>
          <p className="text-sm" style={{ color: 'var(--ax-banner-purple, #a78bfa)' }}>
            <span className="font-semibold">Example Project:</span> This project was created as an example for demonstration.
          </p>
        </div>
      )}

      {tabs.length > 1 && (
        <div className="border-b mb-6" style={{ borderColor: 'var(--ax-border)' }}>
          <div className="flex gap-1">
            {tabs.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setActiveTab(key as typeof activeTab)}
                className={`px-5 py-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === key ? 'ax-tab-active' : 'ax-tab-inactive'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'overview' && myRole === 'VENDOR' && <VendorOverviewTab project={project} projectId={projectId} onOpenReports={() => setActiveTab('reports')} />}
      {activeTab === 'overview' && myRole !== 'VENDOR' && <OverviewTab project={project} projectId={projectId} />}
      {activeTab === 'reports'  && myRole === 'VENDOR' && <VendorReportsTab projectId={projectId} />}
    </Layout>
  );
}

// ── Vendor Reports Tab — Schedule + Performance graphs, embedded ───────────────

interface VendorPortalAllData {
  gantt: { milestones: GanttMilestone[]; cpm: { criticalPath: string[] } };
  analytics: {
    kpis: AnalyticsKPIs;
    sCurve: SCurvePoint[];
    delayHistogram: DelayBucket[];
    paymentCycleDays: PaymentCycleDays;
    onTimeTrend: OnTimeTrend[];
  };
}

function VendorReportsTab({ projectId }: { projectId: string }) {
  // jsonFetcher already unwraps the `{ success, data }` envelope — `data` here is the API's
  // `data` field directly (projectId/projectName/overview/gantt/analytics).
  const { data, isLoading, error } = useSWR<VendorPortalAllData>(
    `/api/vendor/portal?view=all&projectId=${projectId}`,
    jsonFetcher,
  );

  if (isLoading) return <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</p>;
  if (error || !data) return <div className="alert alert-error">Failed to load reports</div>;

  const { gantt, analytics } = data;

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--ax-text)' }}>Schedule</h2>
        <VendorGanttChart milestones={gantt.milestones} criticalPathLength={gantt.cpm.criticalPath.length} />
      </div>
      <div>
        <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--ax-text)' }}>Performance</h2>
        <VendorPerformanceCharts
          kpis={analytics.kpis}
          sCurve={analytics.sCurve}
          delayHistogram={analytics.delayHistogram}
          paymentCycleDays={analytics.paymentCycleDays}
          onTimeTrend={analytics.onTimeTrend}
        />
      </div>
    </div>
  );
}

// ── Vendor Overview Tab ───────────────────────────────────────────────────────

interface VendorOrderRow {
  id: string;
  name: string;
  projectId: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  boqsCount: number;
  workOrder: { id: string; number: string; status: string } | null;
  pendingAcceptance: boolean;
}

interface VendorRABillRow {
  id: string;
  billNumber: number;
  status: string;
  projectId: string;
  orderId: string;
  orderName: string;
  draftValue: number;
  submittedValue: number | null;
  approvedValue: number | null;
  releasedValue: number | null;
}

function RABillStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; label: string }> = {
    DRAFT: { cls: 'bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.55)]', label: 'Draft' },
    PENDING_SITE_ENGINEER_REVIEW: { cls: 'bg-[rgba(168,85,247,0.15)] text-[#a855f7]', label: 'With Site Engineer' },
    PENDING_VENDOR_REVIEW: { cls: 'bg-[rgba(234,179,8,0.15)] text-[#eab308]', label: 'Pending Certification' },
    REVISION_REQUESTED: { cls: 'bg-[rgba(234,88,12,0.12)] text-[#f97316]', label: 'Needs Revision' },
    CERTIFIED: { cls: 'bg-[rgba(56,189,248,0.15)] text-[#38bdf8]', label: 'Certified' },
    APPROVED: { cls: 'bg-[rgba(92,186,128,0.15)] text-[#5cba80]', label: 'Approved' },
    PAID: { cls: 'badge-verified', label: 'Paid' },
  };
  const m = map[status] ?? map.DRAFT;
  if (status === 'PAID') return <span className="badge badge-verified">{m.label}</span>;
  return <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${m.cls}`}>{m.label}</span>;
}

function VendorOverviewTab({ project, projectId, onOpenReports }: { project: ProjectData; projectId: string; onOpenReports: () => void }) {
  const router = useRouter();
  const milestones = project.milestones ?? [];
  const ms = {
    total: milestones.length,
    inProgress: milestones.filter((m) => m.state === 'IN_PROGRESS').length,
    submitted: milestones.filter((m) => m.state === 'SUBMITTED').length,
    verified: milestones.filter((m) => m.state === 'VERIFIED').length,
    closed: milestones.filter((m) => m.state === 'CLOSED').length,
  };

  const [showOrderPicker, setShowOrderPicker] = useState(false);
  const [createFor, setCreateFor] = useState<VendorOrderRow | null>(null);

  // Both endpoints are already scoped to the logged-in vendor's own Purchase Orders / bills —
  // filtered down to this project client-side since neither takes a projectId param.
  const { data: allOrders = [], isLoading: ordersLoading } = useSWR<VendorOrderRow[]>('/api/vendor/orders', jsonFetcher);
  const { data: allBills = [], isLoading: billsLoading } = useSWR<VendorRABillRow[]>('/api/vendor/ra-bills?all=true', jsonFetcher);
  const orders = allOrders.filter((o) => o.projectId === projectId);
  const bills = allBills.filter((b) => b.projectId === projectId);

  const ORDERS_PAGE_SIZE = 5;
  const [ordersPage, setOrdersPage] = useState(1);
  const ordersTotalPages = Math.max(1, Math.ceil(orders.length / ORDERS_PAGE_SIZE));
  const pagedOrders = orders.slice((ordersPage - 1) * ORDERS_PAGE_SIZE, ordersPage * ORDERS_PAGE_SIZE);

  const BILLS_PAGE_SIZE = 8;
  const [billsPage, setBillsPage] = useState(1);
  const billsTotalPages = Math.max(1, Math.ceil(bills.length / BILLS_PAGE_SIZE));
  const pagedBills = bills.slice((billsPage - 1) * BILLS_PAGE_SIZE, billsPage * BILLS_PAGE_SIZE);

  const handleCreateBill = () => {
    if (orders.length === 1) {
      setCreateFor(orders[0]);
    } else {
      setShowOrderPicker(true);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 grid-cols-2 md:grid-cols-4">
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>Purchase Orders</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>{orders.length}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>RA Bills</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>{bills.length}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>My Activities</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>{ms.total}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>In Progress</p>
          <p className="text-2xl font-bold text-orange-400">{ms.inProgress}</p>
        </div></div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="text-lg font-semibold">Quick Actions</h2></div>
        <div className="card-body flex flex-wrap gap-3">
          <Link href={`/projects/${projectId}/boqs`} className="btn btn-secondary">View Orders</Link>
          <button onClick={onOpenReports} className="btn btn-secondary">Schedule &amp; Performance</button>
          <Link href={`/projects/${projectId}/payments`} className="btn btn-secondary">My Invoices</Link>
          <Link href={`/projects/${projectId}/dashboard`} className="btn btn-primary">View Dashboard</Link>
        </div>
      </div>

      {/* Striking Create Bill CTA — the vendor's most common action, front and center */}
      {orders.length > 0 && (
        <button
          onClick={handleCreateBill}
          className="w-full flex items-center justify-between gap-4 rounded-xl p-6 text-left transition-transform hover:scale-[1.005]"
          style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.18), rgba(34,197,94,0.06))', border: '1px solid rgba(34,197,94,0.35)' }}
        >
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(34,197,94,0.18)' }}>
              <Wallet className="w-6 h-6" style={{ color: '#22c55e' }} strokeWidth={2.25} />
            </div>
            <div>
              <p className="text-lg font-bold" style={{ color: 'var(--ax-text)' }}>Create RA Bill</p>
              <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>Claim this period&apos;s executed quantity against an approved Purchase Order</p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg font-semibold text-sm shrink-0" style={{ background: '#22c55e', color: '#052e16' }}>
            New Bill <ArrowRight className="w-4 h-4" />
          </div>
        </button>
      )}

      {/* My Purchase Orders — only this vendor's own orders on this project */}
      <div className="card">
        <div className="card-header"><h2 className="text-lg font-semibold">My Purchase Orders</h2></div>
        {ordersLoading ? (
          <div className="card-body text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</div>
        ) : orders.length === 0 ? (
          <div className="card-body py-10 text-center">
            <Package className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(var(--ax-text-rgb),0.25)' }} />
            <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>No Purchase Orders assigned to you on this project yet</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead><tr><th>Purchase Order</th><th>Items</th><th>Work Order</th><th>Planned End</th></tr></thead>
              <tbody>
                {pagedOrders.map((o) => (
                  <tr key={o.id} onClick={() => router.push(`/projects/${projectId}/orders/${o.id}`)} className="cursor-pointer hover:bg-[rgba(var(--ax-accent-rgb),0.03)]">
                    <td className="font-medium" style={{ color: 'var(--ax-text)' }}>{o.name}</td>
                    <td>{o.boqsCount}</td>
                    <td>
                      {o.workOrder ? (
                        <span className="inline-flex items-center gap-2">
                          {o.workOrder.number}
                          <VendorStatusPill kind="workOrder" status={o.workOrder.status} size="sm" />
                        </span>
                      ) : '—'}
                    </td>
                    <td style={{ color: 'rgba(var(--ax-text-rgb),0.65)' }}>{o.plannedEnd ? formatDate(o.plannedEnd) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {orders.length > ORDERS_PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--ax-border)' }}>
            <span className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>Page {ordersPage} of {ordersTotalPages}</span>
            <div className="flex items-center gap-1">
              <button disabled={ordersPage === 1} onClick={() => setOrdersPage((p) => p - 1)} className="btn btn-sm btn-secondary disabled:opacity-40">← Prev</button>
              <button disabled={ordersPage === ordersTotalPages} onClick={() => setOrdersPage((p) => p + 1)} className="btn btn-sm btn-secondary disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}
      </div>

      {/* My RA Bills — only this vendor's own bills on this project */}
      <div className="card">
        <div className="card-header flex justify-between items-center">
          <h2 className="text-lg font-semibold">My RA Bills</h2>
          <Link href={`/projects/${projectId}/ra-bills`} className="text-sm hover:underline" style={{ color: 'var(--ax-accent)' }}>View all</Link>
        </div>
        {billsLoading ? (
          <div className="card-body text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Loading…</div>
        ) : bills.length === 0 ? (
          <div className="card-body py-10 text-center">
            <Wallet className="w-8 h-8 mx-auto mb-2" style={{ color: 'rgba(var(--ax-text-rgb),0.25)' }} />
            <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>No RA Bills yet — create one above</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table text-sm">
              <thead><tr><th>RA No.</th><th>Purchase Order</th><th>Status</th><th className="text-right">Value</th></tr></thead>
              <tbody>
                {pagedBills.map((b) => (
                  <tr
                    key={b.id}
                    onClick={() => router.push(`/projects/${projectId}/orders/${b.orderId}/ra-bills/${b.id}`)}
                    className="cursor-pointer hover:bg-[rgba(var(--ax-accent-rgb),0.03)]"
                  >
                    <td className="font-medium" style={{ color: 'var(--ax-text)' }}>RA-{b.billNumber}</td>
                    <td style={{ color: 'rgba(var(--ax-text-rgb),0.65)' }}>{b.orderName}</td>
                    <td><RABillStatusBadge status={b.status} /></td>
                    <td className="text-right">{formatCurrency(b.submittedValue ?? b.draftValue, project?.currency)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {bills.length > BILLS_PAGE_SIZE && (
          <div className="flex items-center justify-between px-4 py-3 border-t" style={{ borderColor: 'var(--ax-border)' }}>
            <span className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>Page {billsPage} of {billsTotalPages}</span>
            <div className="flex items-center gap-1">
              <button disabled={billsPage === 1} onClick={() => setBillsPage((p) => p - 1)} className="btn btn-sm btn-secondary disabled:opacity-40">← Prev</button>
              <button disabled={billsPage === billsTotalPages} onClick={() => setBillsPage((p) => p + 1)} className="btn btn-sm btn-secondary disabled:opacity-40">Next →</button>
            </div>
          </div>
        )}
      </div>

      {milestones.length > 0 && (
        <div className="card">
          <div className="card-header flex justify-between items-center">
            <h2 className="text-lg font-semibold">My Activities</h2>
            <Link href={`/projects/${projectId}/activities`} className="text-sm hover:underline" style={{ color: 'var(--ax-accent)' }}>View all</Link>
          </div>
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Title</th><th>State</th><th>Due Date</th></tr></thead>
              <tbody>
                {milestones.slice(0, 5).map((m) => (
                  <tr key={m.id}>
                    <td>
                      <Link href={`/projects/${projectId}/activities/${m.id}`} className="hover:underline" style={{ color: 'var(--ax-accent)' }}>{m.title}</Link>
                    </td>
                    <td><ActivityStateBadge state={m.state as any} /></td>
                    <td style={{ color: 'rgba(var(--ax-text-rgb),0.7)' }}>{formatDate(m.plannedEnd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Order picker — only shown when the vendor has more than one PO on this project */}
      {showOrderPicker && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" onClick={() => setShowOrderPicker(false)}>
          <div className="rounded-xl w-full max-w-md overflow-hidden border" style={{ backgroundColor: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b" style={{ borderColor: 'var(--ax-border)' }}>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--ax-text)' }}>Which Purchase Order?</h2>
              <button onClick={() => setShowOrderPicker(false)} className="p-1 rounded-lg ax-hover-overlay" style={{ color: 'rgba(var(--ax-text-rgb), 0.4)' }}>
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-3 space-y-1 max-h-[60vh] overflow-y-auto">
              {orders.map((o) => (
                <button
                  key={o.id}
                  onClick={() => { setShowOrderPicker(false); setCreateFor(o); }}
                  className="w-full flex items-center gap-3 text-left px-3 py-3 rounded-lg ax-hover-overlay"
                >
                  <Package className="w-4 h-4 shrink-0" style={{ color: '#3b82f6' }} />
                  <span className="font-medium" style={{ color: 'var(--ax-text)' }}>{o.name}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {createFor && (
        <VendorCreateRABillModal projectId={projectId} orderId={createFor.id} onClose={() => setCreateFor(null)} />
      )}
    </div>
  );
}

// ── Overview Tab (PMC / Consultant / Owner / Viewer) ──────────────────────────

function OverviewTab({ project, projectId }: { project: ProjectData; projectId: string }) {
  const boqs = project.boqs ?? [];
  const milestones = project.milestones ?? [];
  const totalBOQValue = boqs.reduce((sum, boq) => sum + (boq.items ?? []).reduce((s, i) => s + i.plannedValue, 0), 0);
  // Total Order Value = everything ordered on this project, not just the BOQ/Purchase-Order
  // portion — Direct Orders (one-off vendor purchases outside the BOQ flow, e.g. HVAC/
  // Electrical/Civil) are real project spend too. Without this, this card silently disagreed
  // with the Analysis page's "Order Planned Value" (which already includes Direct Orders) by
  // however much a project has ordered directly.
  const totalOrderValue = totalBOQValue + (project.directOrdersTotal ?? 0);
  const ms = {
    total: milestones.length,
    draft: milestones.filter((m) => m.state === 'DRAFT').length,
    inProgress: milestones.filter((m) => m.state === 'IN_PROGRESS').length,
    submitted: milestones.filter((m) => m.state === 'SUBMITTED').length,
    verified: milestones.filter((m) => m.state === 'VERIFIED').length,
    closed: milestones.filter((m) => m.state === 'CLOSED').length,
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekEnd = new Date(today.getTime() + 6 * 86_400_000);
  const thisWeek = milestones
    .filter((m) => m.plannedEnd && m.state !== 'VERIFIED' && m.state !== 'CLOSED')
    .filter((m) => {
      const due = new Date(m.plannedEnd as string).getTime();
      return due >= today.getTime() && due <= weekEnd.getTime();
    })
    .sort((a, b) => new Date(a.plannedEnd as string).getTime() - new Date(b.plannedEnd as string).getTime());

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-4">
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>Total Order Value</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>{formatCurrency(totalOrderValue, project?.currency)}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>Total Activities</p>
          <p className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>{ms.total}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>Verified</p>
          <p className="text-2xl font-bold text-green-400">{ms.verified}</p>
        </div></div>
        <div className="card"><div className="card-body">
          <p className="text-sm font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>In Progress</p>
          <p className="text-2xl font-bold text-orange-400">{ms.inProgress}</p>
        </div></div>
      </div>

      <div className="card">
        <div className="card-header flex justify-between items-center">
          <h2 className="text-lg font-semibold">This Week</h2>
          <Link href={`/projects/${projectId}/activities`} className="text-sm hover:underline" style={{ color: 'var(--ax-accent)' }}>View all</Link>
        </div>
        <div className="card-body">
          {thisWeek.length === 0 ? (
            <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Nothing scheduled this week.</p>
          ) : (
            <div className="space-y-2">
              {thisWeek.map((m) => {
                const agenda = weekAgendaLabel(m.plannedEnd as string, today);
                const isToday = agenda.dayLabel === 'Today';
                return (
                  <Link
                    key={m.id}
                    href={`/projects/${projectId}/activities/${m.id}`}
                    className="flex items-center gap-3 rounded-lg border p-2.5 transition-colors hover:bg-[rgba(255,255,255,0.03)]"
                    style={{ borderColor: 'var(--ax-border)' }}
                  >
                    <div
                      className="flex w-14 shrink-0 flex-col items-center rounded-md py-1.5"
                      style={{ backgroundColor: isToday ? 'var(--ax-accent-subtle)' : 'rgba(255,255,255,0.05)' }}
                    >
                      <span className="text-[10px] font-bold uppercase" style={{ color: isToday ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.55)' }}>
                        {agenda.dayLabel}
                      </span>
                      <span className="text-[10px]" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>{agenda.dateLabel}</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium" style={{ color: 'var(--ax-text)' }}>{m.title}</p>
                    </div>
                    <ActivityStateBadge state={m.state as any} />
                  </Link>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Simple cost/schedule variance summary — CLIENT and PMC only, same access as Analysis */}
      {(project.myRole === 'CLIENT' || project.myRole === 'PMC') && (
        <CostScheduleVarianceCard projectId={projectId} currency={project?.currency} />
      )}

      <div className="card">
        <div className="card-header"><h2 className="text-lg font-semibold">Quick Actions</h2></div>
        <div className="card-body flex flex-wrap gap-3">
          {project.permissions?.canEditBOQ && <Link href={`/projects/${projectId}/boqs`} className="btn btn-secondary">Manage Orders</Link>}
          {project.permissions?.canEditMilestones && <Link href={`/projects/${projectId}/activities`} className="btn btn-secondary">Manage Activities</Link>}
          <Link href={`/projects/${projectId}/dashboard`} className="btn btn-primary">View Dashboard</Link>
        </div>
      </div>

      <div id="purchase-orders">
        <OrderList projectId={projectId} userRole={project.myRole} currency={project?.currency} />
      </div>

      <div className="card">
        <div className="card-header flex justify-between items-center">
          <h2 className="text-lg font-semibold">Recent Activities</h2>
          <Link href={`/projects/${projectId}/activities`} className="text-sm hover:underline" style={{ color: 'var(--ax-accent)' }}>View all</Link>
        </div>
        <div className="overflow-x-auto">
          <table className="table">
            <thead><tr><th>Title</th><th>State</th><th>Due Date</th></tr></thead>
            <tbody>
              {milestones.slice(0, 5).map((m) => (
                <tr key={m.id}>
                  <td><Link href={`/projects/${projectId}/activities/${m.id}`} className="hover:underline" style={{ color: 'var(--ax-accent)' }}>{m.title}</Link></td>
                  <td><ActivityStateBadge state={m.state as any} /></td>
                  <td style={{ color: 'rgba(var(--ax-text-rgb),0.7)' }}>{formatDate(m.plannedEnd)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-header"><h2 className="text-lg font-semibold">Activity Progress</h2></div>
        <div className="card-body">
          <div className="flex items-center space-x-4">
            <div className="flex-1 rounded-full h-4 overflow-hidden flex" style={{ backgroundColor: 'rgba(255,255,255,0.06)' }}>
              {ms.total > 0 && <>
                <div className="bg-gray-400" style={{ width: `${(ms.draft / ms.total) * 100}%` }} />
                <div className="bg-blue-500" style={{ width: `${(ms.inProgress / ms.total) * 100}%` }} />
                <div className="bg-yellow-500" style={{ width: `${(ms.submitted / ms.total) * 100}%` }} />
                <div className="bg-green-500" style={{ width: `${(ms.verified / ms.total) * 100}%` }} />
                <div className="bg-purple-500" style={{ width: `${(ms.closed / ms.total) * 100}%` }} />
              </>}
            </div>
          </div>
          <div className="flex justify-between mt-2 text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.6)' }}>
            <span>Draft: {ms.draft}</span><span>In Progress: {ms.inProgress}</span>
            <span>Submitted: {ms.submitted}</span><span>Verified: {ms.verified}</span><span>Closed: {ms.closed}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
