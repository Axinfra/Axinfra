'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import MilestoneStateBadge from '@/components/MilestoneStateBadge';
import { formatCurrency, formatDate } from '@/lib/utils';
import { BlockingReasonLabels } from '@/types';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import { ChevronDown, ChevronRight, Layers, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
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

interface Phase {
  id: string;
  name: string;
  sortOrder: number;
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

type ModalType = 'confirmPaid' | 'notDone' | 'block' | 'unblock' | null;
type PayStatus = 'due' | 'soon' | 'released' | 'blocked' | 'none';
type DrawingPayStatus = 'due' | 'approaching' | 'paid' | 'none';

// ── Helpers ───────────────────────────────────────────────────────────────────

function getPayStatus(m: Milestone): PayStatus {
  const e = m.paymentEligibility;
  if (!e) return 'none';
  if (e.state === 'MARKED_PAID') return 'released';
  if (e.state === 'BLOCKED') return 'blocked';
  if (e.state === 'FULLY_ELIGIBLE' || e.state === 'PARTIALLY_ELIGIBLE') return 'due';
  if (['VERIFIED', 'CLOSED', 'SUBMITTED'].includes(m.state)) return 'soon';
  return 'none';
}

function getDrawingPayStatus(row: DrawingRow): DrawingPayStatus {
  if (row.paidAt) return 'paid';
  if (row.status === 'APPROVED') return 'due';
  if (row.status === 'SUBMITTED') return 'approaching';
  return 'none';
}

function PayBadge({ status }: { status: PayStatus }) {
  if (status === 'due') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-[rgba(251,146,60,0.15)] text-[#fb923c] border border-[rgba(251,146,60,0.3)]">
      <span className="w-1.5 h-1.5 rounded-full bg-[#fb923c] animate-pulse" />Payment Due
    </span>
  );
  if (status === 'soon') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[rgba(196,163,90,0.12)] text-[#c4a35a] border border-[rgba(196,163,90,0.25)]">
      Payment Soon
    </span>
  );
  if (status === 'released') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[rgba(92,186,128,0.12)] text-[#5cba80] border border-[rgba(92,186,128,0.2)]">
      ✓ Released
    </span>
  );
  if (status === 'blocked') return (
    <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-[rgba(224,96,80,0.12)] text-[#e06050] border border-[rgba(224,96,80,0.2)]">
      Blocked
    </span>
  );
  return null;
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
    <span className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-[rgba(196,163,90,0.12)] text-[#c4a35a] border border-[rgba(196,163,90,0.25)]">
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
    IN_PROGRESS:      { label: 'In Progress', color: 'text-[#c4a35a]',               bg: 'bg-[rgba(196,163,90,0.1)]' },
    DELIVERED:        { label: 'Delivered',   color: 'text-[#c4a35a]',               bg: 'bg-[rgba(196,163,90,0.1)]' },
    APPROVED:         { label: 'Approved',    color: 'text-[#fb923c]',               bg: 'bg-[rgba(251,146,60,0.1)]' },
    PAID:             { label: 'Fully Paid',  color: 'text-[#5cba80]',               bg: 'bg-[rgba(92,186,128,0.1)]' },
  };
  const c = cfg[status] ?? cfg.DRAFT;
  return <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${c.color} ${c.bg}`}>{c.label}</span>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function PaymentsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { project, isLoading: projectLoading } = useProject();
  const myRole = project?.myRole ?? '';
  const projectName = project?.name ?? '';
  const permissions = (project?.permissions ?? {}) as Record<string, boolean>;
  const isOwner = myRole === 'OWNER';

  // ── Tab state ───────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<'milestones' | 'architecture'>('milestones');

  // ── Fetch data ──────────────────────────────────────────────────────────────
  const { data: milestonesResp, mutate: refetchMilestones } = useSWR(
    projectId ? `/api/projects/${projectId}/milestones?all=true` : null, jsonFetcher
  );
  const { data: phasesResp } = useSWR(
    projectId ? `/api/projects/${projectId}/phases` : null, jsonFetcher
  );
  const { data: setsResp, error: setsError, mutate: refetchSets } = useSWR(
    projectId ? `/api/projects/${projectId}/architecture/sets` : null, jsonFetcher
  );

  const milestones: Milestone[] = (milestonesResp as Milestone[]) ?? [];
  const phases: Phase[] = (phasesResp as Phase[]) ?? [];
  const sets: DrawingSet[] = (setsResp as DrawingSet[]) ?? [];

  // ── Modal state (milestone payment actions) ────────────────────────────────
  const [activeMs, setActiveMs] = useState<Milestone | null>(null);
  const [modalType, setModalType] = useState<ModalType>(null);
  const [reasonCode, setReasonCode] = useState('QUALITY_ISSUE');
  const [explanation, setExplanation] = useState('');
  const [processing, setProcessing] = useState(false);
  const [modalError, setModalError] = useState('');

  // ── Collapsed phase / set state ────────────────────────────────────────────
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

  // ── Milestone modal actions ────────────────────────────────────────────────
  const openModal = (m: Milestone, type: ModalType) => {
    setActiveMs(m); setModalType(type); setExplanation(''); setModalError('');
  };
  const closeModal = () => { setActiveMs(null); setModalType(null); setExplanation(''); setModalError(''); };

  const handleMsAction = async () => {
    if (!activeMs || !modalType) return;
    if (modalType !== 'confirmPaid' && !explanation.trim()) { setModalError('Please provide a reason'); return; }
    setProcessing(true); setModalError('');
    try {
      const body: Record<string, unknown> = { explanation: explanation.trim() || 'Payment confirmed' };
      if (modalType === 'confirmPaid') body.action = 'markPaid';
      else if (modalType === 'notDone') { body.action = 'block'; body.reasonCode = reasonCode; }
      else if (modalType === 'block')   { body.action = 'block'; body.reasonCode = reasonCode; }
      else if (modalType === 'unblock') { body.action = 'unblock'; body.reason = explanation; }

      const res = await fetch(
        `/api/projects/${projectId}/milestones/${activeMs.id}/payment/mark`,
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      );
      const data = await res.json();
      if (data.success) { closeModal(); void refetchMilestones(); }
      else setModalError(data.error);
    } catch { setModalError('Failed to process action'); }
    finally { setProcessing(false); }
  };

  if (projectLoading) return <Layout><ListPageSkeleton /></Layout>;

  // ── Derived data ───────────────────────────────────────────────────────────

  const phaseMap = new Map<string, Milestone[]>();
  const unphased: Milestone[] = [];
  for (const m of milestones) {
    if (m.phaseId) {
      if (!phaseMap.has(m.phaseId)) phaseMap.set(m.phaseId, []);
      phaseMap.get(m.phaseId)!.push(m);
    } else {
      unphased.push(m);
    }
  }

  const dueMs    = milestones.filter((m) => getPayStatus(m) === 'due');
  const paidMs   = milestones.filter((m) => getPayStatus(m) === 'released');
  const totalDue = dueMs.reduce((s, m) => s + (m.paymentEligibility?.eligibleAmount ?? 0), 0);
  const totalPaid = paidMs.reduce((s, m) => s + (m.paymentEligibility?.eligibleAmount ?? 0), 0);

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
    { id: 'milestones' as const,    label: 'Phases & Milestones', badge: dueMs.length > 0 ? dueMs.length : null },
    { id: 'architecture' as const,  label: 'Architecture Fees',   badge: null },
  ];

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-6 max-w-4xl">

        {/* ── Header ── */}
        <div>
          <h1 className="text-2xl font-bold text-[#e8e4dc]">Payments</h1>
          <p className="text-sm text-[rgba(232,228,220,0.45)] mt-1">Milestone payments by phase and architectural drawing fees</p>
        </div>

        {/* ── Summary row ── */}
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="card">
            <div className="card-body py-3">
              <p className="text-[10px] text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Milestones Pending</p>
              <p className="text-xl font-bold text-[#fb923c] mt-0.5">{formatCurrency(totalDue)}</p>
              <p className="text-[10px] text-[rgba(232,228,220,0.35)]">{dueMs.length} due now</p>
            </div>
          </div>
          <div className="card">
            <div className="card-body py-3">
              <p className="text-[10px] text-[rgba(232,228,220,0.45)] uppercase tracking-wider">Milestones Released</p>
              <p className="text-xl font-bold text-[#5cba80] mt-0.5">{formatCurrency(totalPaid)}</p>
              <p className="text-[10px] text-[rgba(232,228,220,0.35)]">{paidMs.length} paid</p>
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
        <div className="border-b border-[rgba(255,255,255,0.07)]">
          <div className="flex gap-1">
            {TABS.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center gap-2 px-5 py-3 text-sm font-medium border-b-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-[#c4a35a] text-[#c4a35a] bg-[rgba(196,163,90,0.06)]'
                    : 'border-transparent text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] hover:border-[rgba(255,255,255,0.12)]'
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
            TAB 1 — PHASES & MILESTONES
            ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === 'milestones' && (
          <div className="space-y-3">
            {phases.length === 0 && milestones.length === 0 && (
              <div className="card p-8 text-center text-[rgba(232,228,220,0.35)] text-sm">
                No milestones yet.
              </div>
            )}

            {phases.map((phase) => {
              const phaseMilestones = phaseMap.get(phase.id) ?? [];
              if (phaseMilestones.length === 0) return null;
              const isOpen = !collapsed.has(phase.id);
              const dueCnt = phaseMilestones.filter((m) => getPayStatus(m) === 'due').length;

              return (
                <div key={phase.id} className="card overflow-hidden">
                  <button
                    onClick={() => toggleSection(phase.id)}
                    className="w-full flex items-center justify-between px-5 py-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isOpen
                        ? <ChevronDown className="w-4 h-4 text-[rgba(232,228,220,0.4)]" />
                        : <ChevronRight className="w-4 h-4 text-[rgba(232,228,220,0.4)]" />}
                      <span className="font-semibold text-[#e8e4dc] text-sm">{phase.name}</span>
                      <span className="text-xs text-[rgba(232,228,220,0.35)]">{phaseMilestones.length} milestone{phaseMilestones.length !== 1 ? 's' : ''}</span>
                    </div>
                    {dueCnt > 0 && (
                      <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-[rgba(251,146,60,0.15)] text-[#fb923c] border border-[rgba(251,146,60,0.3)]">
                        {dueCnt} due
                      </span>
                    )}
                  </button>

                  {isOpen && (
                    <div className="divide-y divide-[rgba(255,255,255,0.04)] border-t border-[rgba(255,255,255,0.06)]">
                      {phaseMilestones.map((m) => (
                        <MilestonePayRow
                          key={m.id}
                          milestone={m}
                          isOwner={isOwner}
                          permissions={permissions}
                          onConfirm={() => openModal(m, 'confirmPaid')}
                          onNotDone={() => openModal(m, 'notDone')}
                          onUnblock={() => openModal(m, 'unblock')}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {unphased.length > 0 && (
              <div className="card overflow-hidden">
                <button
                  onClick={() => toggleSection('__unphased__')}
                  className="w-full flex items-center justify-between px-5 py-4 hover:bg-[rgba(255,255,255,0.02)] transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {!collapsed.has('__unphased__')
                      ? <ChevronDown className="w-4 h-4 text-[rgba(232,228,220,0.4)]" />
                      : <ChevronRight className="w-4 h-4 text-[rgba(232,228,220,0.4)]" />}
                    <span className="font-semibold text-[rgba(232,228,220,0.6)] text-sm">Other Milestones</span>
                    <span className="text-xs text-[rgba(232,228,220,0.3)]">{unphased.length}</span>
                  </div>
                </button>
                {!collapsed.has('__unphased__') && (
                  <div className="divide-y divide-[rgba(255,255,255,0.04)] border-t border-[rgba(255,255,255,0.06)]">
                    {unphased.map((m) => (
                      <MilestonePayRow
                        key={m.id}
                        milestone={m}
                        isOwner={isOwner}
                        permissions={permissions}
                        onConfirm={() => openModal(m, 'confirmPaid')}
                        onNotDone={() => openModal(m, 'notDone')}
                        onUnblock={() => openModal(m, 'unblock')}
                      />
                    ))}
                  </div>
                )}
              </div>
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
                              <div className="bg-[#c4a35a] transition-all"
                                style={{ width: `${(set.rowStats.submitted / set.rowStats.total) * 100}%` }} />
                            )}
                          </div>
                          <div className="flex gap-4 mt-1 text-[10px] text-[rgba(232,228,220,0.35)]">
                            <span className="text-[#5cba80]">{set.rowStats.paid} paid</span>
                            {Math.max(0, set.rowStats.approved - set.rowStats.paid) > 0 && (
                              <span className="text-[#fb923c]">{set.rowStats.approved - set.rowStats.paid} approved unpaid</span>
                            )}
                            {set.rowStats.submitted > 0 && (
                              <span className="text-[#c4a35a]">{set.rowStats.submitted} approaching</span>
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
          MILESTONE PAYMENT MODAL
          ═══════════════════════════════════════════════════════════════════ */}
      {activeMs && modalType && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl max-w-md w-full shadow-2xl">
            <div className="p-6 space-y-5">
              <div>
                <h2 className="text-lg font-semibold text-[#e8e4dc]">
                  {modalType === 'confirmPaid' && 'Confirm Payment Release'}
                  {modalType === 'notDone'     && 'Mark Payment as Not Done'}
                  {modalType === 'block'       && 'Block Payment'}
                  {modalType === 'unblock'     && 'Resume Payment'}
                </h2>
                <p className="text-sm text-[rgba(232,228,220,0.5)] mt-1">
                  {activeMs.title} · {formatCurrency(activeMs.paymentEligibility?.eligibleAmount ?? activeMs.value)}
                </p>
              </div>

              {modalError && <div className="alert alert-error text-sm">{modalError}</div>}

              {(modalType === 'block' || modalType === 'notDone') && (
                <div>
                  <label className="label text-xs">Reason</label>
                  <select className="input text-sm" value={reasonCode} onChange={(e) => setReasonCode(e.target.value)}>
                    {Object.entries(BlockingReasonLabels).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                </div>
              )}

              {modalType !== 'confirmPaid' && (
                <div>
                  <label className="label text-xs">Explanation <span className="text-[#e06050]">*</span></label>
                  <textarea className="input resize-none text-sm" rows={3} value={explanation}
                    onChange={(e) => setExplanation(e.target.value)}
                    placeholder={
                      modalType === 'notDone'  ? 'Explain why payment is deferred…' :
                      modalType === 'unblock'  ? 'Reason for resuming payment…'     :
                                                 'Reason for blocking…'
                    }
                  />
                </div>
              )}

              {modalType === 'notDone' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(224,96,80,0.06)] border border-[rgba(224,96,80,0.15)]">
                  <span className="text-[#e06050] shrink-0">⚠</span>
                  <p className="text-xs text-[rgba(232,228,220,0.6)]">PMC and Vendor will be notified. You can resume payment later.</p>
                </div>
              )}
              {modalType === 'confirmPaid' && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-[rgba(92,186,128,0.06)] border border-[rgba(92,186,128,0.15)]">
                  <span className="text-[#5cba80] shrink-0">✓</span>
                  <p className="text-xs text-[rgba(232,228,220,0.6)]">Payment will be marked released and milestone closed.</p>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-2">
                <button onClick={closeModal} className="btn btn-secondary">Cancel</button>
                <button onClick={handleMsAction} disabled={processing}
                  className={`btn disabled:opacity-50 ${
                    modalType === 'confirmPaid' ? 'btn-success' :
                    modalType === 'notDone' || modalType === 'block'
                      ? 'bg-[rgba(224,96,80,0.15)] text-[#e06050] border border-[rgba(224,96,80,0.3)] hover:bg-[rgba(224,96,80,0.25)]'
                      : 'btn-primary'
                  }`}>
                  {processing ? 'Processing…' :
                    modalType === 'confirmPaid' ? 'Confirm & Release' :
                    modalType === 'notDone'     ? 'Mark Not Done'     :
                    modalType === 'unblock'     ? 'Resume Payment'    :
                                                  'Block Payment'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}

// ── Milestone row sub-component ───────────────────────────────────────────────

function MilestonePayRow({
  milestone: m,
  isOwner,
  permissions,
  onConfirm,
  onNotDone,
  onUnblock,
}: {
  milestone: Milestone;
  isOwner: boolean;
  permissions: Record<string, boolean>;
  onConfirm: () => void;
  onNotDone: () => void;
  onUnblock: () => void;
}) {
  const status = getPayStatus(m);
  const e = m.paymentEligibility;

  return (
    <div className="px-5 py-3.5 flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-[#e8e4dc] truncate">{m.title}</span>
          <MilestoneStateBadge state={m.state as any} />
          <PayBadge status={status} />
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-[rgba(232,228,220,0.4)] flex-wrap">
          {e?.eligibleAmount != null && e.eligibleAmount > 0 && (
            <span className="font-medium text-[rgba(232,228,220,0.65)]">{formatCurrency(e.eligibleAmount)}</span>
          )}
          {m.plannedEnd && <span>Due {formatDate(m.plannedEnd)}</span>}
          {e?.state === 'BLOCKED' && e.blockExplanation && (
            <span className="text-[#e06050] italic">"{e.blockExplanation}"</span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {isOwner && status === 'due' && (
          <>
            <button onClick={onConfirm}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[rgba(92,186,128,0.35)] bg-[rgba(92,186,128,0.08)] text-[#5cba80] hover:bg-[rgba(92,186,128,0.15)] transition-colors">
              Confirm
            </button>
            <button onClick={onNotDone}
              className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[rgba(224,96,80,0.25)] bg-[rgba(224,96,80,0.06)] text-[#e06050] hover:bg-[rgba(224,96,80,0.12)] transition-colors">
              Defer
            </button>
          </>
        )}
        {isOwner && status === 'blocked' && permissions.canUnblockPayment && (
          <button onClick={onUnblock}
            className="text-xs font-semibold px-3 py-1.5 rounded-lg border border-[rgba(196,163,90,0.3)] bg-[rgba(196,163,90,0.08)] text-[#c4a35a] hover:bg-[rgba(196,163,90,0.15)] transition-colors">
            Resume
          </button>
        )}
        {!isOwner && status === 'due' && permissions.canMarkPaid && (
          <button onClick={onNotDone}
            className="text-xs px-3 py-1.5 rounded-lg border border-[rgba(255,255,255,0.1)] text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors">
            Block
          </button>
        )}
      </div>
    </div>
  );
}
