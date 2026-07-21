'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { ChevronDown, ChevronRight, Layers, CheckCircle2, Clock, AlertCircle, FileText, Ban, Hourglass, TrendingUp, Receipt, Download } from 'lucide-react';
import { ListPageSkeleton } from '@/components/ui/SkeletonPage';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PaymentEligibility {
  id: string;
  state: string;
  eligibleAmount: number;
  dueDate: string | null;
  blockedAmount?: number;
  blockReasonCode?: string;
  blockExplanation?: string;
  blockedAt?: string;
  markedPaidAt?: string;
  paidExplanation?: string;
}

interface Milestone {
  id: string;
  title: string;
  state: string;
  paymentModel: string;
  plannedEnd: string | null;
  value: number;
  phaseId: string | null;
  paymentEligibility: PaymentEligibility | null;
}

interface RABillLineItem {
  thisBillAmount: number;
}

interface RABill {
  id: string;
  billNumber: number;
  status: string;
  periodStart: string;
  periodEnd: string;
  submittedValue: number | null;
  certifiedAt: string | null;
  approvedValue: number | null;
  deductions: number;
  releasedValue: number | null;
  paymentReference: string | null;
  order: { id: string; name: string; vendorUserId: string | null };
  lineItems: RABillLineItem[];
}

interface DrawingRow {
  id: string;
  serialNo: number;
  name: string;
  category: string;
  floor: string;
  status: string;
  paidAt: string | null;
  dueDate: string | null;
}

interface DrawingSet {
  id: string;
  name: string;
  cost: number;
  currency: string;
  status: string;
  dueDate: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  rowStats: { total: number; pending: number; submitted: number; approved: number; rejected: number; paid: number };
  rows: DrawingRow[];
}

type DrawingPayStatus = 'due' | 'approaching' | 'paid' | 'none';

// ── Helpers ───────────────────────────────────────────────────────────────────

function raBillGross(bill: RABill): number {
  return bill.lineItems.reduce((sum, l) => sum + l.thisBillAmount, 0);
}

function raBillNetPayable(bill: RABill): number {
  return bill.releasedValue ?? bill.approvedValue ?? raBillGross(bill);
}

function getDrawingPayStatus(row: DrawingRow): DrawingPayStatus {
  if (row.paidAt) return 'paid';
  if (row.status === 'APPROVED') return 'due';
  if (row.status === 'SUBMITTED') return 'approaching';
  return 'none';
}

function DrawingPayBadge({ status }: { status: DrawingPayStatus }) {
  if (status === 'paid') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[rgba(92,186,128,0.12)] text-[#5cba80] border border-[rgba(92,186,128,0.2)]">
      <CheckCircle2 className="w-3 h-3" />Paid
    </span>
  );
  if (status === 'due') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-[rgba(251,146,60,0.15)] text-[#fb923c] border border-[rgba(251,146,60,0.3)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c] animate-pulse" />Due
    </span>
  );
  if (status === 'approaching') return (
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.12)] text-[var(--ax-accent)] border border-[rgba(var(--ax-accent-rgb),0.25)]">
      <Clock className="w-3 h-3" />Approaching
    </span>
  );
  return null;
}

function SetStatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    DRAFT:            { label: 'Draft',       color: 'text-[rgba(232,228,220,0.5)]',  bg: 'bg-[rgba(255,255,255,0.05)]' },
    SUBMITTED_TO_PMC: { label: 'Submitted',   color: 'text-[#818cf8]',               bg: 'bg-[rgba(129,140,248,0.1)]' },
    REQUESTED:        { label: 'Requested',   color: 'text-[#818cf8]',               bg: 'bg-[rgba(129,140,248,0.1)]' },
    IN_PROGRESS:      { label: 'In Progress', color: 'text-[var(--ax-accent)]',               bg: 'bg-[rgba(var(--ax-accent-rgb),0.1)]' },
    DELIVERED:        { label: 'Delivered',   color: 'text-[var(--ax-accent)]',               bg: 'bg-[rgba(var(--ax-accent-rgb),0.1)]' },
    APPROVED:         { label: 'Approved',    color: 'text-[#fb923c]',               bg: 'bg-[rgba(251,146,60,0.1)]' },
    PAID:             { label: 'Fully Paid',  color: 'text-[#5cba80]',               bg: 'bg-[rgba(92,186,128,0.1)]' },
  };
  const c = cfg[status] ?? cfg.DRAFT;
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${c.color} ${c.bg}`}>{c.label}</span>;
}

function RABillStatusPill({ status }: { status: string }) {
  const cfg: Record<string, { label: string; color: string; bg: string }> = {
    CERTIFIED: { label: 'Certified', color: '#38bdf8', bg: 'rgba(56,189,248,0.12)' },
    APPROVED:  { label: 'Approved',  color: '#fb923c', bg: 'rgba(251,146,60,0.12)' },
    PAID:      { label: 'Paid',      color: '#5cba80', bg: 'rgba(92,186,128,0.12)' },
  };
  const c = cfg[status] ?? { label: status, color: 'rgba(232,228,220,0.5)', bg: 'rgba(255,255,255,0.05)' };
  return (
    <span className="text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ color: c.color, background: c.bg }}>
      {c.label}
    </span>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { project, isLoading: projectLoading } = useProject();
  const myRole = project?.myRole ?? '';
  const projectName = project?.name ?? '';
  // Matches Navbar's `roles` array for this tab — the underlying data here comes from the
  // Milestones/RA Bills/Architecture endpoints (all accessible to other roles for their own
  // tabs), so unlike Analysis this page needs its own explicit gate rather than relying on a
  // single protected API route.
  const hasAccess = ['CLIENT', 'PMC', 'VENDOR'].includes(myRole);
  const isOwner = myRole === 'CLIENT';
  const canApproveRABill = isOwner;
  const canReleaseRABillPayment = isOwner || myRole === 'PMC';

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'rabills' | 'architecture'>('rabills');

  // ── Fetch data ──────────────────────────────────────────────────────────────
  // Milestones are still needed here even though the "Phases & Milestones" tab is gone —
  // the Vendor's separate "My Invoices" view (below) is milestone-based and unaffected by
  // this change.
  const { data: milestonesResp } = useSWR(
    projectId ? `/api/projects/${projectId}/milestones?all=true` : null, jsonFetcher
  );
  const {
    data: raBillsResp,
    error: raBillsError,
    mutate: refetchRABills,
  } = useSWR<{ raBills: RABill[]; total: number }>(
    projectId ? `/api/projects/${projectId}/ra-bills` : null, jsonFetcher
  );
  const { data: setsResp, error: setsError, mutate: refetchSets } = useSWR(
    projectId ? `/api/projects/${projectId}/architecture/sets` : null, jsonFetcher
  );

  const milestones: Milestone[] = (milestonesResp as Milestone[]) ?? [];
  const raBills: RABill[] = raBillsResp?.raBills ?? [];
  const sets: DrawingSet[] = (setsResp as DrawingSet[]) ?? [];

  // ── Pay Now modal state (RA Bill payment actions) ──────────────────────────
  const [payingBill, setPayingBill] = useState<RABill | null>(null);

  // ── Collapsed set state (architecture tab) ─────────────────────────────────
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const toggleSection = (id: string) =>
    setCollapsed((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });

  // ── Architecture row payment ───────────────────────────────────────────────
  const [rowActionLoading, setRowActionLoading] = useState<string | null>(null);
  const handlePayRow = async (rowId: string, rowName: string, amount: number) => {
    if (!confirm(`Release payment of ${formatCurrency(amount)} for drawing "${rowName}"?`)) return;
    setRowActionLoading(rowId);
    try {
      const res = await fetch(`/api/projects/${projectId}/architecture/rows/${rowId}/payment`, { method: 'POST' });
      const data = await res.json();
      if (data.success) void refetchSets();
      else alert(data.error);
    } catch { alert('Failed to release payment'); }
    finally { setRowActionLoading(null); }
  };

  if (projectLoading) return <Layout><ListPageSkeleton /></Layout>;

  if (myRole && !hasAccess) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="alert alert-error">
          Access denied. Payments is available to Owner, PMC, and Vendor only.
        </div>
      </Layout>
    );
  }

  // ── Vendor: completely separate invoice view ────────────────────────────────
  if (myRole === 'VENDOR') {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <VendorInvoiceView milestones={milestones} projectName={projectName} />
      </Layout>
    );
  }

  // ── Derived data ───────────────────────────────────────────────────────────

  const readyToPay = raBills.filter((b) => b.status === 'CERTIFIED' || b.status === 'APPROVED');
  const paidRABills = raBills.filter((b) => b.status === 'PAID');
  const totalReadyToPay = readyToPay.reduce((s, b) => s + raBillNetPayable(b), 0);
  const totalPaidRABills = paidRABills.reduce((s, b) => s + raBillNetPayable(b), 0);

  // Architecture summary
  const totalArchFees = sets.reduce((s, set) => s + set.cost, 0);
  const archPaidFees  = sets.reduce((s, set) => {
    if (set.rowStats.total === 0) return s;
    const perDrawing = set.cost / set.rowStats.total;
    return s + perDrawing * set.rowStats.paid;
  }, 0);
  const archDueFees   = sets.reduce((s, set) => {
    if (set.rowStats.total === 0) return s;
    const perDrawing = set.cost / set.rowStats.total;
    const unpaidApproved = set.rowStats.approved - set.rowStats.paid;
    return s + perDrawing * Math.max(0, unpaidApproved);
  }, 0);

  const TABS = [
    { id: 'rabills' as const,      label: 'RA Bill Payments', badge: readyToPay.length > 0 ? readyToPay.length : null },
    { id: 'architecture' as const, label: 'Consultant Fees',  badge: null },
  ];

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 max-w-4xl">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Payments</h1>
          <p className="text-sm text-[rgba(232,228,220,0.45)] mt-1">RA Bill payments and architectural drawing fees</p>
        </div>

        {/* ── Summary row ── */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="card">
            <div className="card-body py-3">
              <p className="text-[10px] text-[rgba(232,228,220,0.45)] uppercase tracking-wider">RA Bills Ready to Pay</p>
              <p className="text-xl font-bold text-[#fb923c] mt-0.5">{formatCurrency(totalReadyToPay)}</p>
              <p className="text-[10px] text-[rgba(232,228,220,0.35)]">{readyToPay.length} awaiting payment</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body py-3">
              <p className="text-[10px] text-[rgba(232,228,220,0.45)] uppercase tracking-wider">RA Bills Paid</p>
              <p className="text-xl font-bold text-[#5cba80] mt-0.5">{formatCurrency(totalPaidRABills)}</p>
              <p className="text-[10px] text-[rgba(232,228,220,0.35)]">{paidRABills.length} paid</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body py-3">
              <p className="text-[10px] text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Arch Fees Due</p>
              <p className="text-xl font-bold text-[#a78bfa] mt-0.5">{formatCurrency(archDueFees)}</p>
              <p className="text-[10px] text-[rgba(232,228,220,0.35)]">approved drawings unpaid</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body py-3">
              <p className="text-[10px] text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Arch Fees Paid</p>
              <p className="text-xl font-bold text-[#5cba80] mt-0.5">{formatCurrency(archPaidFees)}</p>
              <p className="text-[10px] text-[rgba(232,228,220,0.35)]">of {formatCurrency(totalArchFees)} total</p>
            </div>
          </div>
        </div>

        {/* ── Tab bar ── */}
        <div className="border-b" style={{ borderColor: 'var(--ax-border)' }}>
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'ax-tab-active'
                    : 'ax-tab-inactive'
                }`}
              >
                {tab.label}
                {tab.badge != null && (
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(251,146,60,0.2)] text-[#fb923c] border border-[rgba(251,146,60,0.3)] min-w-[18px] text-center">
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 1 — RA BILL PAYMENTS
            ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'rabills' && (
          <div className="space-y-4">
            {raBillsError ? (
              <div className="card p-8 text-center space-y-3">
                <AlertCircle className="w-7 h-7 text-[#e06050] mx-auto" />
                <p className="text-sm font-medium text-[#e06050]">Could not load RA Bills</p>
                <p className="text-xs text-[rgba(232,228,220,0.4)]">{String((raBillsError as Error)?.message ?? 'Server error')}</p>
                <button onClick={() => void refetchRABills()} className="btn btn-secondary btn-sm mx-auto">Retry</button>
              </div>
            ) : !raBillsResp ? (
              <div className="card p-8 text-center text-sm text-[rgba(232,228,220,0.35)]">Loading…</div>
            ) : (
              <>
                <div className="card overflow-hidden">
                  <div className="card-header flex items-center gap-2">
                    <Receipt className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
                    <h2 className="text-base font-semibold">Ready to Pay ({readyToPay.length})</h2>
                  </div>
                  {readyToPay.length === 0 ? (
                    <div className="card-body text-center text-sm text-[rgba(232,228,220,0.35)] py-8">
                      No RA Bills certified and ready for payment right now.
                    </div>
                  ) : (
                    <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                      {readyToPay.map((bill) => (
                        <RABillPayRow
                          key={bill.id}
                          bill={bill}
                          projectId={projectId}
                          canApprove={canApproveRABill}
                          canRelease={canReleaseRABillPayment}
                          onPayNow={() => setPayingBill(bill)}
                        />
                      ))}
                    </div>
                  )}
                </div>

                {paidRABills.length > 0 && (
                  <div className="card overflow-hidden">
                    <div className="card-header">
                      <h2 className="text-base font-semibold">Paid ({paidRABills.length})</h2>
                    </div>
                    <div className="divide-y divide-[rgba(255,255,255,0.04)]">
                      {paidRABills.map((bill) => (
                        <RABillPayRow
                          key={bill.id}
                          bill={bill}
                          projectId={projectId}
                          canApprove={canApproveRABill}
                          canRelease={canReleaseRABillPayment}
                          onPayNow={() => {}}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {readyToPay.length === 0 && paidRABills.length === 0 && (
                  <div className="card p-12 text-center">
                    <Receipt className="w-8 h-8 text-[rgba(232,228,220,0.15)] mx-auto mb-3" />
                    <p className="text-sm text-[rgba(232,228,220,0.35)]">No RA Bills have reached certification yet.</p>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            TAB 2 — ARCHITECTURE FEES
            ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'architecture' && (
          <div className="space-y-4">
            {setsError ? (
              <div className="card p-8 text-center space-y-3">
                <AlertCircle className="w-7 h-7 text-[#e06050] mx-auto" />
                <p className="text-sm font-medium text-[#e06050]">Could not load drawing sets</p>
                <p className="text-xs text-[rgba(232,228,220,0.4)]">{String(setsError?.message ?? 'Server error')}</p>
                <button onClick={() => void refetchSets()} className="btn btn-secondary btn-sm mx-auto">Retry</button>
              </div>
            ) : sets.length === 0 ? (
              <div className="card p-8 text-center">
                <Layers className="w-7 h-7 text-[rgba(232,228,220,0.2)] mx-auto mb-2" />
                <p className="text-sm text-[rgba(232,228,220,0.35)]">No drawing sets yet.</p>
              </div>
            ) : (
              sets.map((set) => {
                const perDrawing = set.rowStats.total > 0 ? set.cost / set.rowStats.total : 0;
                const paidAmount = perDrawing * set.rowStats.paid;
                const dueAmount  = perDrawing * Math.max(0, set.rowStats.approved - set.rowStats.paid);
                const isOpen = !collapsed.has(set.id);
                const hasDue = set.rowStats.approved > set.rowStats.paid;

                return (
                  <div key={set.id} className="card overflow-hidden">
                    {/* Set header */}
                    <button
                      onClick={() => toggleSection(set.id)}
                      className="w-full px-5 py-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3 min-w-0">
                          {isOpen
                            ? <ChevronDown className="w-4 h-4 text-[rgba(232,228,220,0.4)] shrink-0" />
                            : <ChevronRight className="w-4 h-4 text-[rgba(232,228,220,0.4)] shrink-0" />}
                          <div className="min-w-0 text-left">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-semibold text-[#e8e4dc] text-sm">{set.name}</span>
                              <SetStatusBadge status={set.status} />
                              {hasDue && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-[rgba(251,146,60,0.15)] text-[#fb923c] border border-[rgba(251,146,60,0.3)]">
                                  {set.rowStats.approved - set.rowStats.paid} due
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-xs text-[rgba(232,228,220,0.4)]">
                              <span>Total fee: <span className="text-[#e8e4dc] font-medium">{formatCurrency(set.cost)}</span></span>
                              <span>{set.rowStats.total} drawings · {set.rowStats.approved} approved · {set.rowStats.paid} paid</span>
                            </div>
                          </div>
                        </div>
                        <div className="shrink-0 text-right ml-4">
                          <p className="text-xs text-[rgba(232,228,220,0.4)]">Paid so far</p>
                          <p className="text-sm font-bold text-[#5cba80]">{formatCurrency(paidAmount)}</p>
                          {dueAmount > 0 && (
                            <p className="text-xs text-[#fb923c] font-medium">{formatCurrency(dueAmount)} due</p>
                          )}
                        </div>
                      </div>

                      {/* Payment progress bar */}
                      {set.rowStats.total > 0 && (
                        <div className="mt-3 mx-7">
                          <div className="flex h-1.5 w-full rounded-full overflow-hidden bg-[rgba(255,255,255,0.06)] gap-px">
                            {set.rowStats.paid > 0 && (
                              <div className="bg-[#5cba80] transition-all"
                                style={{ width: `${(set.rowStats.paid / set.rowStats.total) * 100}%` }} />
                            )}
                            {Math.max(0, set.rowStats.approved - set.rowStats.paid) > 0 && (
                              <div className="bg-[#fb923c] transition-all"
                                style={{ width: `${(Math.max(0, set.rowStats.approved - set.rowStats.paid) / set.rowStats.total) * 100}%` }} />
                            )}
                            {set.rowStats.submitted > 0 && (
                              <div className="bg-[var(--ax-accent)] transition-all"
                                style={{ width: `${(set.rowStats.submitted / set.rowStats.total) * 100}%` }} />
                            )}
                          </div>
                          <div className="flex gap-4 mt-1 text-[10px] text-[rgba(232,228,220,0.35)]">
                            <span className="text-[#5cba80]">{set.rowStats.paid} paid</span>
                            {Math.max(0, set.rowStats.approved - set.rowStats.paid) > 0 && (
                              <span className="text-[#fb923c]">{set.rowStats.approved - set.rowStats.paid} approved unpaid</span>
                            )}
                            {set.rowStats.submitted > 0 && (
                              <span className="text-[var(--ax-accent)]">{set.rowStats.submitted} approaching</span>
                            )}
                          </div>
                        </div>
                      )}
                    </button>

                    {/* Drawing rows list */}
                    {isOpen && set.rows.length > 0 && (
                      <div className="border-t border-[rgba(255,255,255,0.06)]">
                        {/* Column header */}
                        <div className="px-5 py-2 grid grid-cols-[2rem_1fr_auto_auto_auto] gap-3 items-center border-b border-[rgba(255,255,255,0.04)]">
                          <span className="text-[10px] text-[rgba(232,228,220,0.3)] font-medium">#</span>
                          <span className="text-[10px] text-[rgba(232,228,220,0.3)] font-medium">Drawing</span>
                          <span className="text-[10px] text-[rgba(232,228,220,0.3)] font-medium text-right">Fee</span>
                          <span className="text-[10px] text-[rgba(232,228,220,0.3)] font-medium text-right">Status</span>
                          {isOwner && <span className="text-[10px] text-[rgba(232,228,220,0.3)] font-medium text-right">Action</span>}
                        </div>

                        <div className="divide-y divide-[rgba(255,255,255,0.03)]">
                          {set.rows.map((row) => {
                            const payStatus = getDrawingPayStatus(row);
                            const isLoading = rowActionLoading === row.id;
                            const canPay = isOwner && payStatus === 'due';

                            return (
                              <div
                                key={row.id}
                                className={`px-5 py-3 grid grid-cols-[2rem_1fr_auto_auto_auto] gap-3 items-center ${
                                  payStatus === 'due' ? 'bg-[rgba(251,146,60,0.03)]' :
                                  payStatus === 'paid' ? 'bg-[rgba(92,186,128,0.02)]' : ''
                                }`}
                              >
                                <span className="text-xs text-[rgba(232,228,220,0.3)] font-mono">{row.serialNo}</span>
                                <div className="min-w-0">
                                  <p className="text-sm text-[#e8e4dc] truncate">{row.name}</p>
                                  <p className="text-[10px] text-[rgba(232,228,220,0.35)] mt-0.5">
                                    {row.category} · {row.floor}
                                    {row.paidAt && <span className="ml-2 text-[#5cba80]">Paid {formatDate(row.paidAt)}</span>}
                                    {row.dueDate && !row.paidAt && <span className="ml-2">Due {formatDate(row.dueDate)}</span>}
                                  </p>
                                </div>
                                <span className="text-xs font-medium text-[rgba(232,228,220,0.65)] text-right whitespace-nowrap">
                                  {formatCurrency(perDrawing)}
                                </span>
                                <div className="text-right">
                                  <DrawingPayBadge status={payStatus} />
                                </div>
                                <div className="text-right">
                                  {canPay && (
                                    <button
                                      onClick={() => void handlePayRow(row.id, row.name, perDrawing)}
                                      disabled={isLoading}
                                      className="text-[10px] font-semibold px-2.5 py-1 rounded-lg border border-[rgba(167,139,250,0.4)] bg-[rgba(167,139,250,0.08)] text-[#a78bfa] hover:bg-[rgba(167,139,250,0.15)] disabled:opacity-50 transition-colors whitespace-nowrap"
                                    >
                                      {isLoading ? '…' : 'Release'}
                                    </button>
                                  )}
                                  {!isOwner && payStatus === 'due' && (
                                    <AlertCircle className="w-3.5 h-3.5 text-[#fb923c] inline" />
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        {/* Set total footer */}
                        <div className="px-5 py-3 border-t border-[rgba(255,255,255,0.06)] flex justify-between items-center bg-[rgba(255,255,255,0.01)]">
                          <span className="text-xs text-[rgba(232,228,220,0.4)]">
                            Set total · {formatCurrency(set.cost)} · {set.rowStats.paid}/{set.rowStats.total} drawings paid
                          </span>
                          <div className="flex items-center gap-3">
                            {paidAmount > 0 && (
                              <span className="text-xs text-[#5cba80] font-medium">Paid: {formatCurrency(paidAmount)}</span>
                            )}
                            {dueAmount > 0 && (
                              <span className="text-xs text-[#fb923c] font-medium">Due: {formatCurrency(dueAmount)}</span>
                            )}
                            {dueAmount === 0 && paidAmount === set.cost && (
                              <span className="text-xs text-[#5cba80] font-semibold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5" />Fully Paid
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )}

                    {isOpen && set.rows.length === 0 && (
                      <div className="border-t border-[rgba(255,255,255,0.06)] px-5 py-4 text-sm text-[rgba(232,228,220,0.35)]">
                        No drawings added to this set yet.
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        )}

      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          RA BILL "PAY NOW" MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {payingBill && (
        <PayRABillModal
          projectId={projectId}
          bill={payingBill}
          onClose={() => setPayingBill(null)}
          onPaid={() => void refetchRABills()}
        />
      )}
    </Layout>
  );
}

// ── RA Bill row + Pay Now modal ────────────────────────────────────────────────

function RABillPayRow({
  bill,
  projectId,
  canApprove,
  canRelease,
  onPayNow,
}: {
  bill: RABill;
  projectId: string;
  canApprove: boolean;
  canRelease: boolean;
  onPayNow: () => void;
}) {
  const netPayable = raBillNetPayable(bill);
  const canPayNow =
    (bill.status === 'CERTIFIED' && canApprove) ||
    (bill.status === 'APPROVED' && canRelease);

  return (
    <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-3">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#e8e4dc]">RA-{bill.billNumber}</span>
          <span className="text-xs text-[rgba(232,228,220,0.45)]">{bill.order.name}</span>
          <RABillStatusPill status={bill.status} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-[rgba(232,228,220,0.4)] flex-wrap">
          <span>{formatDate(bill.periodStart)} – {formatDate(bill.periodEnd)}</span>
          {bill.certifiedAt && <span>Certified {formatDate(bill.certifiedAt)}</span>}
          <span className="font-medium text-[rgba(232,228,220,0.65)]">{formatCurrency(netPayable)}</span>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <a
          href={`/api/projects/${projectId}/orders/${bill.order.id}/ra-bills/${bill.id}/pdf`}
          className="text-xs font-medium px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] text-[rgba(232,228,220,0.6)] hover:text-[#e8e4dc] transition-colors inline-flex items-center gap-1.5"
        >
          <Download className="w-3.5 h-3.5" /> Download
        </a>
        {canPayNow ? (
          <button
            onClick={onPayNow}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[rgba(92,186,128,0.35)] bg-[rgba(92,186,128,0.08)] text-[#5cba80] hover:bg-[rgba(92,186,128,0.15)] transition-colors"
          >
            Pay Now
          </button>
        ) : bill.status === 'CERTIFIED' ? (
          <span className="text-xs text-[rgba(232,228,220,0.35)] px-1 whitespace-nowrap">Awaiting Client Approval</span>
        ) : bill.status === 'APPROVED' ? (
          <span className="text-xs text-[rgba(232,228,220,0.35)] px-1 whitespace-nowrap">Approved — Awaiting Release</span>
        ) : bill.status === 'PAID' ? (
          <span className="text-xs text-[#5cba80] px-1 flex items-center gap-1 whitespace-nowrap"><CheckCircle2 className="w-3.5 h-3.5" /> Paid</span>
        ) : null}
      </div>
    </div>
  );
}

/** One-click "Pay Now" — collapses whatever step(s) remain (Approve, then Release Payment)
 * into a single action so a 300-bill-a-year project doesn't require the Client to separately
 * approve and then release every RA Bill. A CERTIFIED bill gets approved (with the entered
 * deductions) and released in the same click; an already-APPROVED bill just gets released. */
function PayRABillModal({
  projectId,
  bill,
  onClose,
  onPaid,
}: {
  projectId: string;
  bill: RABill;
  onClose: () => void;
  onPaid: () => void;
}) {
  const gross = raBillGross(bill);
  const [deductions, setDeductions] = useState(String(bill.deductions ?? 0));
  const [paymentReference, setPaymentReference] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');

  const deductionsNum = parseFloat(deductions) || 0;
  const netPayable = bill.status === 'CERTIFIED' ? gross - deductionsNum : (bill.approvedValue ?? gross);

  const handlePay = async () => {
    setProcessing(true);
    setError('');
    try {
      const orderId = bill.order.id;

      if (bill.status === 'CERTIFIED') {
        const approveRes = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills/${bill.id}/approve`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deductions: deductionsNum }),
        });
        const approveData = await approveRes.json();
        if (!approveData.success) {
          setError(approveData.error ?? 'Failed to approve RA Bill');
          setProcessing(false);
          return;
        }
      }

      const releaseRes = await fetch(`/api/projects/${projectId}/orders/${orderId}/ra-bills/${bill.id}/release-payment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ releasedValue: netPayable, paymentReference: paymentReference.trim() || undefined }),
      });
      const releaseData = await releaseRes.json();
      if (releaseData.success) {
        onPaid();
        onClose();
      } else {
        setError(releaseData.error ?? 'Failed to release payment');
      }
    } catch {
      setError('Failed to process payment. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full shadow-2xl">
        <div className="p-6 space-y-5">
          <div>
            <h2 className="text-lg font-semibold text-[#e8e4dc]">Pay RA-{bill.billNumber}</h2>
            <p className="text-sm text-[rgba(232,228,220,0.5)] mt-1">{bill.order.name}</p>
          </div>

          {error && <div className="alert alert-error text-sm">{error}</div>}

          <div className="rounded-lg bg-[rgba(255,255,255,0.03)] p-3 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-[rgba(232,228,220,0.5)]">Certified Value</span>
              <span className="text-[#e8e4dc] font-medium">{formatCurrency(gross)}</span>
            </div>
            {bill.status === 'CERTIFIED' ? (
              <div className="flex justify-between items-center">
                <span className="text-[rgba(232,228,220,0.5)]">Deductions</span>
                <input
                  type="number"
                  className="input text-sm w-28 text-right py-1"
                  value={deductions}
                  onChange={(e) => setDeductions(e.target.value)}
                />
              </div>
            ) : (
              <div className="flex justify-between">
                <span className="text-[rgba(232,228,220,0.5)]">Deductions</span>
                <span className="text-[#e8e4dc]">{formatCurrency(bill.deductions ?? 0)}</span>
              </div>
            )}
            <div className="flex justify-between pt-1.5 border-t border-[rgba(255,255,255,0.06)]">
              <span className="text-[#e8e4dc] font-semibold">Net Payable</span>
              <span className="text-[#5cba80] font-bold">{formatCurrency(netPayable)}</span>
            </div>
          </div>

          <div>
            <label className="label text-xs">Payment Reference (optional)</label>
            <input
              type="text"
              className="input text-sm"
              placeholder="UTR / cheque number"
              value={paymentReference}
              onChange={(e) => setPaymentReference(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button onClick={onClose} className="btn btn-secondary">Cancel</button>
            <button onClick={() => void handlePay()} disabled={processing} className="btn btn-success disabled:opacity-50">
              {processing ? 'Processing…' : `Pay ${formatCurrency(netPayable)}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Vendor Invoice View ───────────────────────────────────────────────────────

function VendorInvoiceView({ milestones, projectName }: { milestones: Milestone[]; projectName: string }) {
  type InvoiceStatus = 'received' | 'due' | 'upcoming' | 'blocked';

  function getInvoiceStatus(m: Milestone): InvoiceStatus {
    const e = m.paymentEligibility;
    if (!e) return 'upcoming';
    if (e.state === 'MARKED_PAID') return 'received';
    if (e.state === 'BLOCKED') return 'blocked';
    if (e.state === 'FULLY_ELIGIBLE' || e.state === 'PARTIALLY_ELIGIBLE') return 'due';
    return 'upcoming';
  }

  const invoices = milestones
    .filter((m) => m.value > 0 || m.paymentEligibility)
    .map((m) => ({ ...m, invoiceStatus: getInvoiceStatus(m) }))
    .sort((a, b) => {
      const order: Record<InvoiceStatus, number> = { due: 0, blocked: 1, upcoming: 2, received: 3 };
      return order[a.invoiceStatus] - order[b.invoiceStatus];
    });

  const received  = invoices.filter((m) => m.invoiceStatus === 'received');
  const due       = invoices.filter((m) => m.invoiceStatus === 'due');
  const upcoming  = invoices.filter((m) => m.invoiceStatus === 'upcoming');
  const blocked   = invoices.filter((m) => m.invoiceStatus === 'blocked');

  const totalReceived = received.reduce((s, m) => s + (m.paymentEligibility?.eligibleAmount ?? m.value), 0);
  const totalDue      = due.reduce((s, m) => s + (m.paymentEligibility?.eligibleAmount ?? m.value), 0);
  const totalBlocked  = blocked.reduce((s, m) => s + (m.paymentEligibility?.eligibleAmount ?? m.value), 0);
  const totalContract = invoices.reduce((s, m) => s + m.value, 0);

  const STATUS_CFG = {
    received: {
      label: 'Received',
      labelFull: 'Payment Received',
      dot:   'bg-[#5cba80]',
      pill:  'bg-[rgba(92,186,128,0.12)] text-[#5cba80] border-[rgba(92,186,128,0.25)]',
      row:   'bg-[rgba(92,186,128,0.025)]',
      icon:  <CheckCircle2 className="w-3.5 h-3.5 text-[#5cba80]" />,
    },
    due: {
      label: 'Due Now',
      labelFull: 'Payment Due',
      dot:   'bg-[#fb923c] animate-pulse',
      pill:  'bg-[rgba(251,146,60,0.15)] text-[#fb923c] border-[rgba(251,146,60,0.35)]',
      row:   'bg-[rgba(251,146,60,0.025)]',
      icon:  <TrendingUp className="w-3.5 h-3.5 text-[#fb923c]" />,
    },
    upcoming: {
      label: 'Upcoming',
      labelFull: 'Upcoming',
      dot:   'bg-[rgba(232,228,220,0.25)]',
      pill:  'bg-[rgba(255,255,255,0.06)] text-[rgba(232,228,220,0.5)] border-[rgba(255,255,255,0.1)]',
      row:   '',
      icon:  <Hourglass className="w-3.5 h-3.5 text-[rgba(232,228,220,0.35)]" />,
    },
    blocked: {
      label: 'Blocked',
      labelFull: 'Blocked',
      dot:   'bg-[#e06050]',
      pill:  'bg-[rgba(224,96,80,0.12)] text-[#e06050] border-[rgba(224,96,80,0.25)]',
      row:   'bg-[rgba(224,96,80,0.02)]',
      icon:  <Ban className="w-3.5 h-3.5 text-[#e06050]" />,
    },
  };

  function InvoiceStatusPill({ status }: { status: InvoiceStatus }) {
    const cfg = STATUS_CFG[status];
    return (
      <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium px-2 py-0.5 rounded-full border ${cfg.pill}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
        {cfg.labelFull}
      </span>
    );
  }

  function InvoiceSection({ title, items, emptyText }: { title: string; items: typeof invoices; emptyText?: string }) {
    if (items.length === 0 && !emptyText) return null;
    return (
      <div className="space-y-2">
        <h3 className="text-xs font-semibold text-[rgba(232,228,220,0.4)] uppercase tracking-widest px-1">{title}</h3>
        {items.length === 0
          ? <p className="text-sm text-[rgba(232,228,220,0.3)] px-1">{emptyText}</p>
          : (
            <div className="card overflow-hidden divide-y divide-[rgba(255,255,255,0.04)]">
              {items.map((m, idx) => {
                const cfg = STATUS_CFG[m.invoiceStatus];
                const amount = m.paymentEligibility?.eligibleAmount ?? m.value;
                return (
                  <div key={m.id} className={`flex items-center gap-4 px-5 py-4 ${cfg.row}`}>
                    {/* Index + icon */}
                    <div className="shrink-0 flex flex-col items-center gap-1 w-7">
                      <span className="text-[10px] font-mono text-[rgba(232,228,220,0.25)]">{String(idx + 1).padStart(2, '0')}</span>
                      {cfg.icon}
                    </div>

                    {/* Main info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-[#e8e4dc] truncate">{m.title}</span>
                        <InvoiceStatusPill status={m.invoiceStatus} />
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-[11px] text-[rgba(232,228,220,0.4)] flex-wrap">
                        {m.plannedEnd && (
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {m.invoiceStatus === 'received' ? 'Completed' : 'Due'} {formatDate(m.plannedEnd)}
                          </span>
                        )}
                        {m.paymentEligibility?.markedPaidAt && (
                          <span className="text-[#5cba80] flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Received {formatDate(m.paymentEligibility.markedPaidAt)}
                          </span>
                        )}
                        {m.invoiceStatus === 'blocked' && m.paymentEligibility?.blockExplanation && (
                          <span className="text-[#e06050] italic">"{m.paymentEligibility.blockExplanation}"</span>
                        )}
                        {m.paymentEligibility?.paidExplanation && m.invoiceStatus === 'received' && (
                          <span className="italic opacity-60">"{m.paymentEligibility.paidExplanation}"</span>
                        )}
                      </div>
                    </div>

                    {/* Amount */}
                    <div className="shrink-0 text-right">
                      <p className={`text-base font-bold ${
                        m.invoiceStatus === 'received' ? 'text-[#5cba80]' :
                        m.invoiceStatus === 'due'      ? 'text-[#fb923c]' :
                        m.invoiceStatus === 'blocked'  ? 'text-[#e06050]' :
                                                         'text-[rgba(232,228,220,0.5)]'
                      }`}>
                        {formatCurrency(amount)}
                      </p>
                      {m.paymentModel && m.paymentModel !== 'FIXED' && (
                        <p className="text-[10px] text-[rgba(232,228,220,0.3)] mt-0.5">{m.paymentModel}</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )
        }
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <FileText className="w-5 h-5 text-[var(--ax-accent)]" />
            <h1 className="text-2xl font-bold text-[#e8e4dc]">My Invoices</h1>
          </div>
          <p className="text-sm text-[rgba(232,228,220,0.4)]">{projectName} · Payment ledger</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] text-[rgba(232,228,220,0.35)] uppercase tracking-wider">Contract Value</p>
          <p className="text-xl font-bold text-[#e8e4dc]">{formatCurrency(totalContract)}</p>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="card">
          <div className="card-body py-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-3.5 h-3.5 text-[#5cba80]" />
              <p className="text-[10px] text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Received</p>
            </div>
            <p className="text-xl font-bold text-[#5cba80]">{formatCurrency(totalReceived)}</p>
            <p className="text-[10px] text-[rgba(232,228,220,0.35)] mt-0.5">{received.length} invoice{received.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body py-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-3.5 h-3.5 text-[#fb923c]" />
              <p className="text-[10px] text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Due Now</p>
            </div>
            <p className="text-xl font-bold text-[#fb923c]">{formatCurrency(totalDue)}</p>
            <p className="text-[10px] text-[rgba(232,228,220,0.35)] mt-0.5">{due.length} pending</p>
          </div>
        </div>
        <div className="card">
          <div className="card-body py-3">
            <div className="flex items-center gap-2 mb-1">
              <Ban className="w-3.5 h-3.5 text-[#e06050]" />
              <p className="text-[10px] text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Blocked</p>
            </div>
            <p className="text-xl font-bold text-[#e06050]">{formatCurrency(totalBlocked)}</p>
            <p className="text-[10px] text-[rgba(232,228,220,0.35)] mt-0.5">{blocked.length} on hold</p>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      {totalContract > 0 && (
        <div className="card px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-[rgba(232,228,220,0.5)]">Collection progress</span>
            <span className="text-xs font-medium text-[#e8e4dc]">
              {Math.round((totalReceived / totalContract) * 100)}% collected
            </span>
          </div>
          <div className="h-2 w-full rounded-full overflow-hidden bg-[rgba(255,255,255,0.06)] flex gap-px">
            {totalReceived > 0 && (
              <div className="bg-[#5cba80] transition-all rounded-l-full"
                style={{ width: `${(totalReceived / totalContract) * 100}%` }} />
            )}
            {totalDue > 0 && (
              <div className="bg-[#fb923c] transition-all"
                style={{ width: `${(totalDue / totalContract) * 100}%` }} />
            )}
            {totalBlocked > 0 && (
              <div className="bg-[#e06050] transition-all"
                style={{ width: `${(totalBlocked / totalContract) * 100}%` }} />
            )}
          </div>
          <div className="flex gap-4 mt-2 text-[10px] text-[rgba(232,228,220,0.4)]">
            {totalReceived > 0 && <span className="text-[#5cba80]">● Received {formatCurrency(totalReceived)}</span>}
            {totalDue > 0      && <span className="text-[#fb923c]">● Due {formatCurrency(totalDue)}</span>}
            {totalBlocked > 0  && <span className="text-[#e06050]">● Blocked {formatCurrency(totalBlocked)}</span>}
          </div>
        </div>
      )}

      {/* Empty state */}
      {invoices.length === 0 && (
        <div className="card p-12 text-center">
          <FileText className="w-8 h-8 text-[rgba(232,228,220,0.15)] mx-auto mb-3" />
          <p className="text-sm text-[rgba(232,228,220,0.35)]">No invoices yet for this project.</p>
        </div>
      )}

      {/* Invoice sections */}
      <InvoiceSection title="Due Now" items={due} />
      <InvoiceSection title="Blocked" items={blocked} />
      <InvoiceSection title="Upcoming" items={upcoming} />
      <InvoiceSection title="Received" items={received} />
    </div>
  );
}
