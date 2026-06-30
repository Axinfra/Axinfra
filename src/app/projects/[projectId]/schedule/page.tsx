'use client';

import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { useState, useMemo } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import Navbar from '@/components/Navbar';
import { formatCurrency, formatDate } from '@/lib/utils';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';
import {
  Calendar,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  Clock,
  ExternalLink,
  Pencil,
  Users,
  CheckCircle2,
  AlertCircle,
  BarChart3,
  Flag,
  TrendingUp,
  Layers,
  Plus,
  Trash2,
  Search,
  Star,
  X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface MilestoneDisplay {
  id: string;
  title: string;
  state: string;
  value: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  vendorUser: { id: string; name: string; email: string } | null;
  phase?: { id: string; name: string } | null;
}

interface VendorSummary {
  id: string;
  name: string;
  email: string;
  milestoneCount: number;
}

interface PhaseSchedule {
  id: string;
  name: string;
  sortOrder: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  computedStart: string | null;
  computedEnd: string | null;
  durationDays: number | null;
  milestoneCount: number;
  completedCount: number;
  datedCount: number;
  stateBreakdown: Record<string, number>;
  vendors: VendorSummary[];
  totalValue: number;
  milestones: MilestoneDisplay[];
}

interface ProjectInfo {
  id: string;
  name: string;
  status: string;
  location: string | null;
  contractValue: number | null;
  metaStartDate: string | null;
  metaEndDate: string | null;
  computedStart: string | null;
  computedEnd: string | null;
}

interface ScheduleData {
  project: ProjectInfo;
  phases: PhaseSchedule[];
  unphased: PhaseSchedule | null;
  myRole: string;
}

interface CustomPhase {
  id: string;
  name: string;
  plannedStart: string;
  plannedEnd: string;
  sortOrder: number;
  milestones: MilestoneDisplay[];
}

interface CustomScheduleInfo {
  id: string;
  isPreferred: boolean;
  createdBy: { id: string; name: string };
  phases: CustomPhase[];
}

interface CustomSchedulePayload {
  customSchedule: CustomScheduleInfo | null;
  myRole: string;
  allMilestones: MilestoneDisplay[];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const C_CLOSED    = '#5cba80';
const C_VERIFIED  = '#6ee7b7';
const C_SUBMITTED = '#60a5fa';

const STATE_CONFIG: Record<string, { label: string; bg: string; text: string; bar: string; order: number }> = {
  DRAFT:       { label: 'Draft',       bg: 'rgba(var(--ax-text-rgb),0.07)',    text: 'rgba(var(--ax-text-rgb),0.4)',  bar: 'rgba(var(--ax-text-rgb),0.2)',  order: 1 },
  IN_PROGRESS: { label: 'In Progress', bg: 'rgba(var(--ax-accent-rgb),0.1)',   text: 'var(--ax-accent)',              bar: 'var(--ax-accent)',               order: 2 },
  SUBMITTED:   { label: 'Submitted',   bg: 'rgba(96,165,250,0.1)',             text: C_SUBMITTED,                     bar: C_SUBMITTED,                      order: 3 },
  VERIFIED:    { label: 'Verified',    bg: 'rgba(110,231,183,0.1)',            text: C_VERIFIED,                      bar: C_VERIFIED,                       order: 4 },
  CLOSED:      { label: 'Closed',      bg: 'rgba(92,186,128,0.1)',             text: C_CLOSED,                        bar: C_CLOSED,                         order: 5 },
};

const CUSTOM_PHASE_COLORS = [
  '#c4a35a', '#60a5fa', '#a78bfa', '#fb923c',
  '#5cba80', '#38bdf8', '#f472b6', '#34d399',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function durationLabel(days: number | null): string {
  if (days === null || days < 0) return '—';
  if (days === 0) return '< 1 day';
  if (days === 1) return '1 day';
  if (days < 30) return `${days} days`;
  const months = Math.floor(days / 30);
  const rem = days % 30;
  return rem > 0 ? `${months}mo ${rem}d` : `${months} month${months > 1 ? 's' : ''}`;
}

function timelinePos(
  start: string | null, end: string | null,
  pStart: string | null, pEnd: string | null,
): { left: number; width: number } | null {
  if (!start || !end || !pStart || !pEnd) return null;
  const ps = new Date(pStart).getTime(), pe = new Date(pEnd).getTime();
  const fs = new Date(start).getTime(), fe = new Date(end).getTime();
  const span = pe - ps;
  if (span <= 0) return null;
  const left  = Math.max(0, Math.min(100, ((fs - ps) / span) * 100));
  const width = Math.max(2, Math.min(100 - left, ((fe - fs) / span) * 100));
  return { left, width };
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, sub, icon, accent }: {
  label: string; value: string; sub?: string; icon: React.ReactNode; accent?: boolean;
}) {
  return (
    <div className="rounded-xl border p-4 flex flex-col gap-2" style={{ background: 'var(--ax-card)', borderColor: 'var(--ax-border)' }}>
      <div className="flex items-center gap-2">
        <span style={{ color: accent ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.35)' }}>{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>{label}</span>
      </div>
      <p className="text-lg sm:text-2xl font-bold tabular-nums leading-none" style={{ color: accent ? 'var(--ax-accent)' : 'var(--ax-text)' }}>{value}</p>
      {sub && <p className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>{sub}</p>}
    </div>
  );
}

// ── Segmented progress bar ────────────────────────────────────────────────────

function ProgressBar({ completed, total, stateBreakdown }: {
  completed: number; total: number; stateBreakdown: Record<string, number>;
}) {
  if (total === 0) {
    return <p className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>No milestones in this phase</p>;
  }
  const pct             = (n: number) => (n / total) * 100;
  const verifiedCount   = stateBreakdown['VERIFIED']    ?? 0;
  const submittedCount  = stateBreakdown['SUBMITTED']   ?? 0;
  const inProgressCount = stateBreakdown['IN_PROGRESS'] ?? 0;
  const draftCount      = stateBreakdown['DRAFT']       ?? 0;
  const isDone = completed === total;

  return (
    <div className="space-y-2.5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>
          <span className="font-semibold tabular-nums" style={{ color: isDone ? C_CLOSED : 'var(--ax-text)' }}>{completed}</span>
          {' '}of {total} closed
        </span>
        <span className="text-sm font-bold tabular-nums" style={{ color: isDone ? C_CLOSED : 'var(--ax-accent)' }}>
          {Math.round(pct(completed))}%
        </span>
      </div>
      <div className="h-3 rounded-full overflow-hidden flex" style={{ background: 'rgba(var(--ax-text-rgb),0.09)' }}>
        {pct(completed) > 0     && <div className="h-full transition-all" style={{ width: `${pct(completed)}%`,     background: C_CLOSED }} />}
        {pct(verifiedCount) > 0 && <div className="h-full transition-all" style={{ width: `${pct(verifiedCount)}%`, background: C_VERIFIED, opacity: 0.7 }} />}
        {pct(submittedCount) > 0 && <div className="h-full transition-all" style={{ width: `${pct(submittedCount)}%`, background: C_SUBMITTED, opacity: 0.55 }} />}
        {pct(inProgressCount) > 0 && <div className="h-full transition-all" style={{ width: `${pct(inProgressCount)}%`, background: 'var(--ax-accent)', opacity: 0.45 }} />}
      </div>
      <div className="flex items-center gap-3 flex-wrap">
        {completed > 0       && <span className="flex items-center gap-1.5 text-xs" style={{ color: C_CLOSED }}><span className="w-2 h-2 rounded-full shrink-0" style={{ background: C_CLOSED }} />{completed} Closed</span>}
        {verifiedCount > 0   && <span className="flex items-center gap-1.5 text-xs" style={{ color: C_VERIFIED }}><span className="w-2 h-2 rounded-full shrink-0" style={{ background: C_VERIFIED }} />{verifiedCount} Verified</span>}
        {submittedCount > 0  && <span className="flex items-center gap-1.5 text-xs" style={{ color: C_SUBMITTED }}><span className="w-2 h-2 rounded-full shrink-0" style={{ background: C_SUBMITTED }} />{submittedCount} Submitted</span>}
        {inProgressCount > 0 && <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ax-accent)' }}><span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'var(--ax-accent)' }} />{inProgressCount} In Progress</span>}
        {draftCount > 0      && <span className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}><span className="w-2 h-2 rounded-full shrink-0" style={{ background: 'rgba(var(--ax-text-rgb),0.15)' }} />{draftCount} Draft</span>}
      </div>
    </div>
  );
}

// ── Milestone row (single milestone display) ──────────────────────────────────

function MilestoneRow({ milestone, projectId }: { milestone: MilestoneDisplay; projectId: string }) {
  const cfg = STATE_CONFIG[milestone.state] ?? STATE_CONFIG.DRAFT;
  return (
    <Link
      href={`/projects/${projectId}/milestones`}
      className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg transition-colors hover:opacity-90"
      style={{ background: 'var(--ax-card)', border: '1px solid var(--ax-border)' }}
    >
      {/* State dot */}
      <span className="mt-0.5 shrink-0 w-2 h-2 rounded-full" style={{ background: cfg.bar }} />

      {/* Main content */}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium leading-snug truncate" style={{ color: 'var(--ax-text)' }}>
          {milestone.title}
        </p>
        {(milestone.plannedStart || milestone.plannedEnd) && (
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>
            {milestone.plannedStart ? formatDate(milestone.plannedStart) : '—'}
            {' → '}
            {milestone.plannedEnd ? formatDate(milestone.plannedEnd) : '—'}
          </p>
        )}
        {milestone.vendorUser && (
          <p className="text-[10px] mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.32)' }}>
            {milestone.vendorUser.name}
          </p>
        )}
      </div>

      {/* State badge */}
      <span
        className="shrink-0 text-[10px] font-medium px-1.5 py-0.5 rounded-full"
        style={{ background: cfg.bg, color: cfg.text }}
      >
        {cfg.label}
      </span>
    </Link>
  );
}

// ── Phase Flow Strip ──────────────────────────────────────────────────────────

function PhaseFlowStrip({ phases }: { phases: Array<{ id: string; name: string; milestoneCount: number; completedCount: number; stateBreakdown: Record<string, number> }> }) {
  if (phases.length === 0) return null;
  return (
    <div className="rounded-xl border px-4 pt-3.5 pb-4 space-y-3" style={{ background: 'var(--ax-card)', borderColor: 'var(--ax-border)' }}>
      <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>
        Phase Progress Flow
      </p>

      <div className="flex items-start overflow-x-auto gap-0 pb-1">
        {phases.map((phase, idx) => {
          const pct        = phase.milestoneCount > 0 ? Math.round((phase.completedCount / phase.milestoneCount) * 100) : 0;
          const isComplete = phase.milestoneCount > 0 && phase.completedCount === phase.milestoneCount;
          const hasWork    = (phase.stateBreakdown['IN_PROGRESS'] ?? 0) + (phase.stateBreakdown['SUBMITTED'] ?? 0) + (phase.stateBreakdown['VERIFIED'] ?? 0) > 0;
          const dotColor   = isComplete ? C_CLOSED : hasWork ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.2)';
          const dotBg      = isComplete ? 'rgba(92,186,128,0.12)' : hasWork ? 'rgba(var(--ax-accent-rgb),0.1)' : 'rgba(var(--ax-text-rgb),0.05)';
          const pctColor   = isComplete ? C_CLOSED : hasWork ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.22)';
          return (
            <div key={phase.id} className="flex items-start flex-shrink-0" style={{ minWidth: 80 }}>
              <div className="flex flex-col items-center gap-1.5 px-2">
                <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition-all"
                  style={{ background: dotBg, border: `2px solid ${dotColor}`, color: dotColor }}>
                  {isComplete ? <CheckCircle2 className="w-4 h-4" /> : <span>{idx + 1}</span>}
                </div>
                <p className="text-[10px] font-medium text-center leading-tight max-w-[72px]" style={{ color: isComplete ? C_CLOSED : 'var(--ax-text)' }}>
                  {phase.name}
                </p>
                <span className="text-xs font-bold tabular-nums px-2 py-0.5 rounded-full"
                  style={{ color: pctColor, background: isComplete ? 'rgba(92,186,128,0.1)' : hasWork ? 'rgba(var(--ax-accent-rgb),0.08)' : 'rgba(var(--ax-text-rgb),0.05)' }}>
                  {pct}%
                </span>
              </div>
              {idx < phases.length - 1 && (
                <div className="flex items-center mt-4 shrink-0">
                  <div className="w-3 h-px" style={{ background: 'var(--ax-border)' }} />
                  <ChevronRight className="w-3 h-3" style={{ color: 'rgba(var(--ax-text-rgb),0.2)' }} />
                  <div className="w-3 h-px" style={{ background: 'var(--ax-border)' }} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex h-2.5 rounded-full overflow-hidden gap-px" style={{ background: 'rgba(var(--ax-text-rgb),0.07)' }}>
        {phases.map((phase) => {
          const pct        = phase.milestoneCount > 0 ? (phase.completedCount / phase.milestoneCount) * 100 : 0;
          const isComplete = phase.milestoneCount > 0 && phase.completedCount === phase.milestoneCount;
          const segWidth   = 100 / phases.length;
          return (
            <div key={phase.id} className="relative h-full overflow-hidden" style={{ width: `${segWidth}%`, background: 'rgba(var(--ax-text-rgb),0.06)' }} title={`${phase.name}: ${Math.round(pct)}%`}>
              <div className="absolute inset-y-0 left-0 transition-all duration-700" style={{ width: `${pct}%`, background: isComplete ? C_CLOSED : 'var(--ax-accent)' }} />
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Edit dates modal ──────────────────────────────────────────────────────────

function EditDatesModal({ phase, onClose, onSave }: {
  phase: PhaseSchedule;
  onClose: () => void;
  onSave: (phaseId: string, newStartDate: string | null, newEndDate: string | null) => Promise<void>;
}) {
  const [startDate, setStartDate] = useState(phase.plannedStart ? phase.plannedStart.split('T')[0] : '');
  const [endDate, setEndDate]     = useState(phase.plannedEnd   ? phase.plannedEnd.split('T')[0]   : '');
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  async function handleSave() {
    if (!startDate && !endDate) { setError('Please set at least one date'); return; }
    if (startDate && endDate && startDate >= endDate) { setError('Start must be before end'); return; }
    setSaving(true); setError('');
    try { await onSave(phase.id, startDate || null, endDate || null); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl border w-full max-w-sm shadow-2xl" style={{ background: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}>
        <div className="p-5 space-y-4">
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--ax-text)' }}>Update Phase Dates</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
              <span style={{ color: 'var(--ax-accent)' }}>{phase.name}</span>
            </p>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Start Date</label>
              <input type="date" className="input w-full" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>End Date</label>
              <input type="date" className="input w-full" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <p className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>Updates the planned dates for this phase. All team members will be notified.</p>
          {error && <p className="text-xs font-medium" style={{ color: '#e06050' }}>{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving} className="btn btn-secondary flex-1 text-sm">Cancel</button>
            <button onClick={() => void handleSave()} disabled={saving || (!startDate && !endDate)} className="btn btn-primary flex-1 text-sm">
              {saving ? 'Saving…' : 'Save & Notify'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Phase card (default schedule) ─────────────────────────────────────────────

function PhaseCard({ phase, index, isExtra, canEdit, projectId, projectStart, projectEnd, onEdit }: {
  phase: PhaseSchedule;
  index: number;
  isExtra?: boolean;
  canEdit: boolean;
  projectId: string;
  projectStart: string | null;
  projectEnd: string | null;
  onEdit: () => void;
}) {
  const [showMilestones, setShowMilestones] = useState(false);

  const isComplete = phase.milestoneCount > 0 && phase.completedCount === phase.milestoneCount;
  const displayStart = phase.computedStart;
  const displayEnd   = phase.computedEnd;
  const noDate       = !displayStart && !displayEnd;
  const pos          = timelinePos(displayStart, displayEnd, projectStart, projectEnd);

  const stateEntries = Object.entries(phase.stateBreakdown).sort(
    ([a], [b]) => (STATE_CONFIG[a]?.order ?? 99) - (STATE_CONFIG[b]?.order ?? 99),
  );
  const durationDays = displayStart && displayEnd
    ? Math.round((new Date(displayEnd).getTime() - new Date(displayStart).getTime()) / 86400000)
    : phase.durationDays;

  return (
    <div className="rounded-2xl border overflow-hidden" style={{ background: 'var(--ax-card)', borderColor: isExtra ? 'rgba(var(--ax-accent-rgb),0.18)' : 'var(--ax-border)' }}>
      {/* Header */}
      <div className="px-5 py-3.5 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--ax-border)' }}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <span className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: isComplete ? 'rgba(92,186,128,0.12)' : 'rgba(var(--ax-accent-rgb),0.1)', color: isComplete ? C_CLOSED : 'var(--ax-accent)', border: `1px solid ${isComplete ? 'rgba(92,186,128,0.22)' : 'rgba(var(--ax-accent-rgb),0.18)'}` }}>
            {isExtra ? '✦' : isComplete ? '✓' : index + 1}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm font-bold leading-tight" style={{ color: 'var(--ax-text)' }}>{phase.name}</h2>
              {isComplete && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(92,186,128,0.1)', color: C_CLOSED }}>
                  <CheckCircle2 className="w-2.5 h-2.5" /> Complete
                </span>
              )}
              {isExtra && (
                <span className="inline-flex text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(var(--ax-accent-rgb),0.08)', color: 'var(--ax-accent)' }}>Extra</span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>
              {phase.milestoneCount} milestone{phase.milestoneCount !== 1 ? 's' : ''}
              {phase.totalValue > 0 && <> · <span style={{ color: 'var(--ax-accent)' }}>{formatCurrency(phase.totalValue)}</span></>}
              {durationDays !== null && <> · {durationLabel(durationDays)}</>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {!isExtra && (
            <Link href={`/projects/${projectId}/milestones?phaseId=${phase.id}`}
              className="hidden sm:flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg transition-colors"
              style={{ background: 'var(--ax-overlay)', color: 'rgba(var(--ax-text-rgb),0.45)', border: '1px solid var(--ax-border)' }}>
              <Flag className="w-3 h-3" /> Milestones
            </Link>
          )}
          {canEdit && !isExtra && (
            <button onClick={onEdit} className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
              style={{ background: 'rgba(var(--ax-accent-rgb),0.09)', color: 'var(--ax-accent)', border: '1px solid rgba(var(--ax-accent-rgb),0.18)' }}>
              <Pencil className="w-3 h-3 shrink-0" />
              <span className="hidden sm:inline">Edit Dates</span>
            </button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-4">

        {/* Timeline section — green when complete */}
        <div className="rounded-xl p-3.5 space-y-3"
          style={{ background: isComplete ? 'rgba(92,186,128,0.05)' : 'var(--ax-overlay)', border: `1px solid ${isComplete ? 'rgba(92,186,128,0.2)' : 'var(--ax-border)'}` }}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>Timeline</p>
            {phase.milestoneCount > 0 && (
              <div className="flex items-center gap-1.5">
                {isComplete && <CheckCircle2 className="w-3.5 h-3.5" style={{ color: C_CLOSED }} />}
                <span className="text-sm font-bold tabular-nums" style={{ color: isComplete ? C_CLOSED : 'var(--ax-accent)' }}>
                  {Math.round((phase.completedCount / phase.milestoneCount) * 100)}%
                </span>
              </div>
            )}
          </div>

          {phase.milestoneCount > 0 && (
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(var(--ax-text-rgb),0.08)' }}>
              <div className="h-full rounded-full transition-all duration-700"
                style={{ width: `${(phase.completedCount / phase.milestoneCount) * 100}%`, background: isComplete ? C_CLOSED : 'var(--ax-accent)' }} />
            </div>
          )}

          {noDate ? (
            <div className="flex items-center gap-2 text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              No planned dates set for this phase yet
              {canEdit && !isExtra && (
                <button onClick={onEdit} className="ml-2 text-xs font-medium underline" style={{ color: 'var(--ax-accent)' }}>Set dates</button>
              )}
            </div>
          ) : (
            <>
              <div className="flex items-start justify-between gap-2">
                <div className="shrink-0">
                  <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>Start</p>
                  <p className="text-xs sm:text-sm font-semibold" style={{ color: 'var(--ax-text)' }}>{displayStart ? formatDate(displayStart) : '—'}</p>
                  {phase.plannedStart && <p className="text-[9px] mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.28)' }}>planned</p>}
                </div>
                <div className="flex flex-col items-center gap-1 shrink-0 px-1 pt-3">
                  <div className="flex items-center gap-0.5 text-[10px]" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }}>
                    <Clock className="w-2.5 h-2.5 shrink-0" />
                    <span className="whitespace-nowrap">{durationLabel(durationDays)}</span>
                  </div>
                  <div className="flex items-center gap-0.5">
                    <div className="w-5 h-px" style={{ background: 'var(--ax-border)' }} />
                    <ChevronRight className="w-2.5 h-2.5 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.2)' }} />
                    <div className="w-5 h-px" style={{ background: 'var(--ax-border)' }} />
                  </div>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>End</p>
                  <p className="text-xs sm:text-sm font-semibold" style={{ color: canEdit && !isExtra ? 'var(--ax-accent)' : 'var(--ax-text)' }}>
                    {displayEnd ? formatDate(displayEnd) : '—'}
                  </p>
                  {phase.plannedEnd && <p className="text-[9px] mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.28)' }}>planned</p>}
                </div>
              </div>

              {pos && (
                <div>
                  <div className="relative h-2 rounded-full overflow-hidden" style={{ background: 'rgba(var(--ax-text-rgb),0.08)' }}
                    title={`${phase.name}: ${Math.round((phase.completedCount / Math.max(phase.milestoneCount, 1)) * 100)}% complete`}>
                    <div className="absolute inset-y-0 rounded-full" style={{ left: `${pos.left}%`, width: `${pos.width}%`, background: isComplete ? 'rgba(92,186,128,0.15)' : 'rgba(var(--ax-accent-rgb),0.12)' }} />
                    {phase.milestoneCount > 0 && (
                      <div className="absolute inset-y-0 rounded-full transition-all duration-700"
                        style={{ left: `${pos.left}%`, width: `${pos.width * (phase.completedCount / phase.milestoneCount)}%`, background: isComplete ? C_CLOSED : 'var(--ax-accent)', opacity: 0.85 }} />
                    )}
                  </div>
                  <p className="text-[10px] mt-1" style={{ color: 'rgba(var(--ax-text-rgb),0.28)' }}>Position &amp; completion within overall project timeline</p>
                </div>
              )}
            </>
          )}
        </div>

        {/* Progress + Vendors */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="rounded-xl p-3.5 space-y-3.5" style={{ background: 'var(--ax-overlay)', border: '1px solid var(--ax-border)' }}>
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>Progress</p>
            <ProgressBar completed={phase.completedCount} total={phase.milestoneCount} stateBreakdown={phase.stateBreakdown} />
            {stateEntries.length > 0 && phase.milestoneCount > 0 && (
              <div className="pt-1 border-t space-y-2" style={{ borderColor: 'var(--ax-border)' }}>
                {stateEntries.map(([state, count]) => {
                  const cfg = STATE_CONFIG[state];
                  if (!cfg || count === 0) return null;
                  return (
                    <div key={state} className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: cfg.bar }} />
                        <span className="text-[10px]" style={{ color: cfg.text }}>{cfg.label}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="w-16 h-1 rounded-full overflow-hidden" style={{ background: 'rgba(var(--ax-text-rgb),0.08)' }}>
                          <div className="h-full rounded-full" style={{ width: `${(count / phase.milestoneCount) * 100}%`, background: cfg.bar }} />
                        </div>
                        <span className="text-[10px] font-semibold tabular-nums w-3" style={{ color: cfg.text }}>{count}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="rounded-xl p-3.5 space-y-3" style={{ background: 'var(--ax-overlay)', border: '1px solid var(--ax-border)' }}>
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>Vendors</p>
              {phase.vendors.length > 0 && (
                <span className="text-[10px] font-semibold tabular-nums px-1.5 py-0.5 rounded-full" style={{ background: 'rgba(var(--ax-accent-rgb),0.08)', color: 'var(--ax-accent)' }}>
                  {phase.vendors.length} {phase.vendors.length === 1 ? 'vendor' : 'vendors'}
                </span>
              )}
            </div>
            {phase.vendors.length === 0 ? (
              <div className="flex items-center gap-2 py-2" style={{ color: 'rgba(var(--ax-text-rgb),0.28)' }}>
                <Users className="w-4 h-4 shrink-0" /><span className="text-xs">No vendors assigned</span>
              </div>
            ) : (
              <div className="space-y-2 max-h-48 overflow-y-auto">
                {phase.vendors.map((vendor) => (
                  <div key={vendor.id} className="flex items-center gap-2.5 p-2.5 rounded-lg" style={{ background: 'var(--ax-card)', border: '1px solid var(--ax-border)' }}>
                    <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold" style={{ background: 'rgba(var(--ax-accent-rgb),0.1)', color: 'var(--ax-accent)' }}>
                      {vendor.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate leading-tight" style={{ color: 'var(--ax-text)' }}>{vendor.name}</p>
                      <p className="text-[10px] truncate leading-tight mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>{vendor.email}</p>
                    </div>
                    <div className="shrink-0 text-center">
                      <p className="text-xs font-bold tabular-nums" style={{ color: 'var(--ax-accent)' }}>{vendor.milestoneCount}</p>
                      <p className="text-[9px] leading-tight" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }}>{vendor.milestoneCount === 1 ? 'task' : 'tasks'}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Milestones expandable section */}
        {phase.milestones.length > 0 && (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--ax-border)' }}>
            <button
              onClick={() => setShowMilestones((v) => !v)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-left transition-colors"
              style={{ background: 'var(--ax-overlay)' }}
            >
              <div className="flex items-center gap-2">
                <Flag className="w-3.5 h-3.5" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>
                  Milestones
                </span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold"
                  style={{ background: 'rgba(var(--ax-accent-rgb),0.08)', color: 'var(--ax-accent)' }}>
                  {phase.milestones.length}
                </span>
              </div>
              {showMilestones
                ? <ChevronUp className="w-3.5 h-3.5" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
                : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />}
            </button>

            {showMilestones && (
              <div className="p-2.5 space-y-1.5" style={{ background: 'var(--ax-overlay)' }}>
                {phase.milestones.map((m) => (
                  <MilestoneRow key={m.id} milestone={m} projectId={projectId} />
                ))}
              </div>
            )}
          </div>
        )}

        {!isExtra && (
          <Link href={`/projects/${projectId}/milestones?phaseId=${phase.id}`}
            className="sm:hidden flex items-center justify-center gap-2 text-xs py-2.5 rounded-lg"
            style={{ background: 'var(--ax-overlay)', color: 'rgba(var(--ax-text-rgb),0.45)', border: '1px solid var(--ax-border)' }}>
            <Flag className="w-3.5 h-3.5" /> View Milestones
          </Link>
        )}
      </div>
    </div>
  );
}

// ── Add custom phase modal ─────────────────────────────────────────────────────

function AddCustomPhaseModal({ onClose, onSave, editPhase }: {
  onClose: () => void;
  onSave: (name: string, start: string, end: string, phaseId?: string) => Promise<void>;
  editPhase?: CustomPhase | null;
}) {
  const [name, setName]     = useState(editPhase?.name ?? '');
  const [start, setStart]   = useState(editPhase?.plannedStart ? editPhase.plannedStart.split('T')[0] : '');
  const [end, setEnd]       = useState(editPhase?.plannedEnd   ? editPhase.plannedEnd.split('T')[0]   : '');
  const [saving, setSaving] = useState(false);
  const [error, setError]   = useState('');

  async function handleSave() {
    if (!name.trim())  { setError('Phase name is required'); return; }
    if (!start)        { setError('Start date is required'); return; }
    if (!end)          { setError('End date is required'); return; }
    if (start >= end)  { setError('Start must be before end'); return; }
    setSaving(true); setError('');
    try { await onSave(name.trim(), start, end, editPhase?.id); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl border w-full max-w-sm shadow-2xl" style={{ background: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}>
        <div className="p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold" style={{ color: 'var(--ax-text)' }}>
              {editPhase ? 'Edit Phase' : 'Add Custom Phase'}
            </h2>
            <button onClick={onClose} style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}><X className="w-4 h-4" /></button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Phase Name</label>
              <input className="input w-full" placeholder="e.g. Foundation Works" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Start Date</label>
              <input type="date" className="input w-full" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div>
              <label className="block text-[10px] font-semibold uppercase tracking-wider mb-1.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>End Date</label>
              <input type="date" className="input w-full" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          {error && <p className="text-xs font-medium" style={{ color: '#e06050' }}>{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving} className="btn btn-secondary flex-1 text-sm">Cancel</button>
            <button onClick={() => void handleSave()} disabled={saving} className="btn btn-primary flex-1 text-sm">
              {saving ? 'Saving…' : editPhase ? 'Update' : 'Add Phase'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Milestone picker modal ────────────────────────────────────────────────────

function MilestonePicker({ phase, allMilestones, onClose, onSave }: {
  phase: CustomPhase;
  allMilestones: MilestoneDisplay[];
  onClose: () => void;
  onSave: (phaseId: string, toAdd: string[], toRemove: string[]) => Promise<void>;
}) {
  const assignedIds = useMemo(() => new Set(phase.milestones.map((m) => m.id)), [phase.milestones]);
  const [selected, setSelected]  = useState<Set<string>>(new Set(assignedIds));
  const [search, setSearch]      = useState('');
  const [saving, setSaving]      = useState(false);
  const [error, setError]        = useState('');

  const filtered = useMemo(() => {
    if (!search.trim()) return allMilestones;
    const q = search.toLowerCase();
    return allMilestones.filter((m) => m.title.toLowerCase().includes(q) || (m.phase?.name ?? '').toLowerCase().includes(q));
  }, [allMilestones, search]);

  // Group milestones by phase name
  const grouped = useMemo(() => {
    const map = new Map<string, MilestoneDisplay[]>();
    for (const m of filtered) {
      const key = m.phase?.name ?? 'Unphased';
      const arr = map.get(key) ?? [];
      arr.push(m);
      map.set(key, arr);
    }
    return map;
  }, [filtered]);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    const toAdd    = Array.from(selected).filter((id) => !assignedIds.has(id));
    const toRemove = Array.from(assignedIds).filter((id) => !selected.has(id));
    if (toAdd.length === 0 && toRemove.length === 0) { onClose(); return; }
    setSaving(true); setError('');
    try { await onSave(phase.id, toAdd, toRemove); onClose(); }
    catch (e) { setError(e instanceof Error ? e.message : 'Failed to save'); }
    finally { setSaving(false); }
  }

  const cfg = STATE_CONFIG;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="rounded-2xl border w-full max-w-md shadow-2xl flex flex-col max-h-[85vh]" style={{ background: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
          <div>
            <h2 className="text-sm font-bold" style={{ color: 'var(--ax-text)' }}>Assign Milestones</h2>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
              <span style={{ color: 'var(--ax-accent)' }}>{phase.name}</span>
            </p>
          </div>
          <button onClick={onClose} style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}><X className="w-4 h-4" /></button>
        </div>

        {/* Search */}
        <div className="px-5 pb-3 shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
            <input
              className="input w-full pl-8 text-sm"
              placeholder="Search milestones…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>

        {/* Milestone list */}
        <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-3">
          {grouped.size === 0 && (
            <p className="text-xs text-center py-8" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>No milestones found</p>
          )}
          {Array.from(grouped.entries()).map(([phaseName, milestones]) => (
            <div key={phaseName}>
              <p className="text-[10px] font-semibold uppercase tracking-widest mb-2" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>
                {phaseName}
              </p>
              <div className="space-y-1">
                {milestones.map((m: MilestoneDisplay) => {
                  const isSelected = selected.has(m.id);
                  const stateCfg   = cfg[m.state] ?? cfg.DRAFT;
                  return (
                    <button key={m.id} onClick={() => toggle(m.id)}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-all"
                      style={{ background: isSelected ? 'rgba(var(--ax-accent-rgb),0.08)' : 'var(--ax-overlay)', border: `1px solid ${isSelected ? 'rgba(var(--ax-accent-rgb),0.2)' : 'var(--ax-border)'}` }}>
                      {/* Checkbox */}
                      <div className="shrink-0 w-4 h-4 rounded border flex items-center justify-center transition-all"
                        style={{ borderColor: isSelected ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.25)', background: isSelected ? 'var(--ax-accent)' : 'transparent' }}>
                        {isSelected && <CheckCircle2 className="w-3 h-3" style={{ color: 'var(--ax-card)' }} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium truncate" style={{ color: 'var(--ax-text)' }}>{m.title}</p>
                        {m.plannedEnd && <p className="text-[10px] mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>Due {formatDate(m.plannedEnd)}</p>}
                      </div>
                      <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full" style={{ background: stateCfg.bg, color: stateCfg.text }}>{stateCfg.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="px-5 pb-5 pt-3 shrink-0 border-t" style={{ borderColor: 'var(--ax-border)' }}>
          <p className="text-[10px] mb-3" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>
            {selected.size} milestone{selected.size !== 1 ? 's' : ''} selected
          </p>
          {error && <p className="text-xs font-medium mb-2" style={{ color: '#e06050' }}>{error}</p>}
          <div className="flex gap-3">
            <button onClick={onClose} disabled={saving} className="btn btn-secondary flex-1 text-sm">Cancel</button>
            <button onClick={() => void handleSave()} disabled={saving} className="btn btn-primary flex-1 text-sm">
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Custom Phase Card ─────────────────────────────────────────────────────────

function CustomPhaseCard({ phase, colorIdx, isPmc, projectId, onEdit, onDelete, onAssignMilestones }: {
  phase: CustomPhase;
  colorIdx: number;
  isPmc: boolean;
  projectId: string;
  onEdit: () => void;
  onDelete: () => void;
  onAssignMilestones: () => void;
}) {
  const [showMilestones, setShowMilestones] = useState(true);

  const color       = CUSTOM_PHASE_COLORS[colorIdx % CUSTOM_PHASE_COLORS.length];
  const start       = new Date(phase.plannedStart);
  const end         = new Date(phase.plannedEnd);
  const durationDays = Math.round((end.getTime() - start.getTime()) / 86400000);

  const total     = phase.milestones.length;
  const completed = phase.milestones.filter((m) => m.state === 'CLOSED').length;
  const isComplete = total > 0 && completed === total;
  const pct        = total > 0 ? Math.round((completed / total) * 100) : 0;

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${isComplete ? 'rgba(92,186,128,0.25)' : 'var(--ax-border)'}`, background: 'var(--ax-card)' }}>
      {/* Accent bar */}
      <div className="h-1" style={{ background: color }} />

      {/* Header */}
      <div className="px-4 py-3 flex items-center justify-between gap-3 flex-wrap" style={{ borderBottom: '1px solid var(--ax-border)' }}>
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold"
            style={{ background: `${color}20`, color, border: `1.5px solid ${color}55` }}>
            {isComplete ? '✓' : colorIdx + 1}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold leading-tight truncate" style={{ color: 'var(--ax-text)' }}>{phase.name}</h3>
              {isComplete && (
                <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: 'rgba(92,186,128,0.1)', color: C_CLOSED }}>
                  <CheckCircle2 className="w-2.5 h-2.5" /> Complete
                </span>
              )}
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>
              {formatDate(phase.plannedStart)} → {formatDate(phase.plannedEnd)}
              <span className="mx-1">·</span>
              {durationLabel(durationDays)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isPmc && (
            <>
              <button onClick={onAssignMilestones}
                className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-lg font-medium transition-all"
                style={{ background: 'rgba(var(--ax-accent-rgb),0.09)', color: 'var(--ax-accent)', border: '1px solid rgba(var(--ax-accent-rgb),0.18)' }}>
                <Plus className="w-3 h-3" />
                <span className="hidden sm:inline">Milestones</span>
              </button>
              <button onClick={onEdit}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: 'rgba(var(--ax-text-rgb),0.4)', border: '1px solid var(--ax-border)' }}>
                <Pencil className="w-3.5 h-3.5" />
              </button>
              <button onClick={onDelete}
                className="p-1.5 rounded-lg transition-all"
                style={{ color: '#e06050', border: '1px solid rgba(224,96,80,0.2)' }}>
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="p-4 space-y-3">
        {/* Progress bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>Progress</p>
            {total > 0 && (
              <span className="text-sm font-bold tabular-nums" style={{ color: isComplete ? C_CLOSED : color }}>{pct}%</span>
            )}
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(var(--ax-text-rgb),0.08)' }}>
            <div className="h-full rounded-full transition-all duration-700"
              style={{ width: `${pct}%`, background: isComplete ? C_CLOSED : color }} />
          </div>
          {total > 0 && (
            <p className="text-[10px]" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>
              {completed} of {total} milestones closed
            </p>
          )}
        </div>

        {/* Milestones */}
        {total > 0 ? (
          <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--ax-border)' }}>
            <button
              onClick={() => setShowMilestones((v) => !v)}
              className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
              style={{ background: 'var(--ax-overlay)' }}
            >
              <div className="flex items-center gap-2">
                <Flag className="w-3.5 h-3.5" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }} />
                <span className="text-[10px] font-semibold uppercase tracking-widest" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>Milestones</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-semibold" style={{ background: `${color}20`, color }}>{total}</span>
              </div>
              {showMilestones
                ? <ChevronUp className="w-3.5 h-3.5" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
                : <ChevronDown className="w-3.5 h-3.5" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />}
            </button>

            {showMilestones && (
              <div className="p-2.5 space-y-1.5" style={{ background: 'var(--ax-overlay)' }}>
                {phase.milestones.map((m) => (
                  <MilestoneRow key={m.id} milestone={m} projectId={projectId} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2 py-4 rounded-xl" style={{ background: 'var(--ax-overlay)', border: '1px solid var(--ax-border)' }}>
            <Flag className="w-5 h-5" style={{ color: 'rgba(var(--ax-text-rgb),0.2)' }} />
            <p className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>No milestones assigned yet</p>
            {isPmc && (
              <button onClick={onAssignMilestones} className="text-xs font-medium underline" style={{ color: 'var(--ax-accent)' }}>
                Add Milestones
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Custom Schedule Tab ───────────────────────────────────────────────────────

function CustomScheduleTab({ projectId, isPmc }: { projectId: string; isPmc: boolean }) {
  const [showAddPhase, setShowAddPhase]         = useState(false);
  const [editingPhase, setEditingPhase]         = useState<CustomPhase | null>(null);
  const [pickerPhase, setPickerPhase]           = useState<CustomPhase | null>(null);
  const [deleteConfirm, setDeleteConfirm]       = useState<CustomPhase | null>(null);
  const [successMsg, setSuccessMsg]             = useState('');
  const [error, setError]                       = useState('');

  const { data: payload, mutate: refetch, isLoading } = useSWR<CustomSchedulePayload>(
    projectId ? `/api/projects/${projectId}/custom-schedule` : null,
    jsonFetcher,
    { revalidateOnFocus: true },
  );

  const cs          = payload?.customSchedule ?? null;
  const allMs       = payload?.allMilestones  ?? [];
  const isPreferred = cs?.isPreferred ?? false;

  function flash(msg: string) {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(''), 5000);
  }

  async function handleCreateSchedule() {
    const res  = await fetch(`/api/projects/${projectId}/custom-schedule`, { method: 'POST' });
    const data = await res.json() as { success: boolean; error?: string };
    if (!data.success) { setError(data.error ?? 'Failed'); return; }
    void refetch();
  }

  async function handleTogglePreferred() {
    const res  = await fetch(`/api/projects/${projectId}/custom-schedule`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPreferred: !isPreferred }),
    });
    const data = await res.json() as { success: boolean; error?: string };
    if (!data.success) { setError(data.error ?? 'Failed'); return; }
    flash(isPreferred ? 'Default schedule is now preferred.' : 'Custom schedule is now preferred for all team members.');
    void refetch();
  }

  async function handleSavePhase(name: string, start: string, end: string, phaseId?: string) {
    const url    = phaseId
      ? `/api/projects/${projectId}/custom-schedule/phases/${phaseId}`
      : `/api/projects/${projectId}/custom-schedule/phases`;
    const method = phaseId ? 'PATCH' : 'POST';
    const res    = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, plannedStart: start, plannedEnd: end }),
    });
    const data = await res.json() as { success: boolean; error?: string };
    if (!data.success) throw new Error(data.error ?? 'Failed');
    flash(phaseId ? 'Phase updated.' : 'Phase added.');
    void refetch();
  }

  async function handleDeletePhase(phaseId: string) {
    const res  = await fetch(`/api/projects/${projectId}/custom-schedule/phases/${phaseId}`, { method: 'DELETE' });
    const data = await res.json() as { success: boolean; error?: string };
    if (!data.success) { setError(data.error ?? 'Failed to delete'); return; }
    setDeleteConfirm(null);
    flash('Phase deleted.');
    void refetch();
  }

  async function handleSaveMilestones(phaseId: string, toAdd: string[], toRemove: string[]) {
    const reqs: Promise<Response>[] = [];
    if (toAdd.length > 0) {
      reqs.push(fetch(`/api/projects/${projectId}/custom-schedule/phases/${phaseId}/milestones`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneIds: toAdd }),
      }));
    }
    if (toRemove.length > 0) {
      reqs.push(fetch(`/api/projects/${projectId}/custom-schedule/phases/${phaseId}/milestones`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ milestoneIds: toRemove }),
      }));
    }
    await Promise.all(reqs);
    flash('Milestones updated.');
    void refetch();
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2].map((i) => (
          <div key={i} className="h-36 rounded-2xl animate-pulse" style={{ background: 'var(--ax-overlay)' }} />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-base font-bold" style={{ color: 'var(--ax-text)' }}>Custom Schedule</h2>
          <p className="text-xs mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.42)' }}>
            {isPmc
              ? 'Create a curated schedule view — define phases with custom date ranges and assign milestones.'
              : 'PMC-curated schedule showing key phases and milestones.'}
          </p>
        </div>

        {isPmc && cs && (
          <button
            onClick={() => void handleTogglePreferred()}
            className="flex items-center gap-2 text-xs px-3 py-2 rounded-lg font-medium transition-all"
            style={{
              background: isPreferred ? 'rgba(var(--ax-accent-rgb),0.12)' : 'var(--ax-overlay)',
              color:      isPreferred ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.5)',
              border:     `1px solid ${isPreferred ? 'rgba(var(--ax-accent-rgb),0.25)' : 'var(--ax-border)'}`,
            }}
          >
            <Star className={`w-3.5 h-3.5 ${isPreferred ? 'fill-current' : ''}`} />
            {isPreferred ? 'Custom is Preferred' : 'Set as Preferred'}
          </button>
        )}
      </div>

      {/* Feedback */}
      {successMsg && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-medium"
          style={{ background: 'rgba(92,186,128,0.07)', borderColor: 'rgba(92,186,128,0.2)', color: C_CLOSED }}>
          <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMsg}
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-xl border text-xs font-medium"
          style={{ background: 'rgba(224,96,80,0.07)', borderColor: 'rgba(224,96,80,0.2)', color: '#e06050' }}>
          <AlertCircle className="w-4 h-4 shrink-0" /> {error}
          <button onClick={() => setError('')} className="ml-auto"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      {!cs ? (
        /* No custom schedule yet */
        <div className="rounded-2xl border text-center py-16" style={{ background: 'var(--ax-card)', borderColor: 'var(--ax-border)' }}>
          <Calendar className="w-10 h-10 mx-auto mb-4" style={{ color: 'rgba(var(--ax-text-rgb),0.18)' }} />
          <p className="text-base font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.42)' }}>
            No custom schedule yet
          </p>
          <p className="text-xs mt-2 mb-6" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }}>
            {isPmc ? 'Create a custom schedule to show a curated project view to your team.' : 'The PMC has not created a custom schedule for this project yet.'}
          </p>
          {isPmc && (
            <button onClick={() => void handleCreateSchedule()} className="btn btn-primary inline-flex items-center gap-2">
              <Plus className="w-4 h-4" /> Create Custom Schedule
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Preferred info banner */}
          {isPreferred && (
            <div className="flex items-center gap-2 px-4 py-2.5 rounded-xl border text-xs"
              style={{ background: 'rgba(var(--ax-accent-rgb),0.05)', borderColor: 'rgba(var(--ax-accent-rgb),0.15)' }}>
              <Star className="w-3.5 h-3.5 fill-current shrink-0" style={{ color: 'var(--ax-accent)' }} />
              <p style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>
                <span className="font-semibold" style={{ color: 'var(--ax-accent)' }}>Preferred</span>
                {' '}— all team members see this schedule first when they open the Schedule tab.
              </p>
            </div>
          )}

          {/* Phase flow strip (custom phases) */}
          {cs.phases.length > 0 && (
            <PhaseFlowStrip
              phases={cs.phases.map((p) => ({
                id: p.id,
                name: p.name,
                milestoneCount: p.milestones.length,
                completedCount: p.milestones.filter((m) => m.state === 'CLOSED').length,
                stateBreakdown: p.milestones.reduce<Record<string, number>>((acc, m) => {
                  acc[m.state] = (acc[m.state] ?? 0) + 1;
                  return acc;
                }, {}),
              }))}
            />
          )}

          {/* Phase cards */}
          {cs.phases.length === 0 ? (
            <div className="rounded-2xl border text-center py-16" style={{ background: 'var(--ax-card)', borderColor: 'var(--ax-border)' }}>
              <Layers className="w-8 h-8 mx-auto mb-3" style={{ color: 'rgba(var(--ax-text-rgb),0.18)' }} />
              <p className="text-sm font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.42)' }}>No phases yet</p>
              {isPmc && (
                <button onClick={() => setShowAddPhase(true)} className="mt-4 text-xs font-medium underline" style={{ color: 'var(--ax-accent)' }}>
                  Add your first phase
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {cs.phases.map((phase, idx) => (
                <CustomPhaseCard
                  key={phase.id}
                  phase={phase}
                  colorIdx={idx}
                  isPmc={isPmc}
                  projectId={projectId}
                  onEdit={() => setEditingPhase(phase)}
                  onDelete={() => setDeleteConfirm(phase)}
                  onAssignMilestones={() => setPickerPhase(phase)}
                />
              ))}
            </div>
          )}

          {/* Add phase button (PMC only) */}
          {isPmc && (
            <button
              onClick={() => setShowAddPhase(true)}
              className="w-full flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-medium transition-all"
              style={{ background: 'var(--ax-overlay)', color: 'rgba(var(--ax-text-rgb),0.45)', borderStyle: 'dashed', borderColor: 'var(--ax-border)' }}
            >
              <Plus className="w-4 h-4" /> Add Phase
            </button>
          )}
        </>
      )}

      {/* Modals */}
      {(showAddPhase || editingPhase) && (
        <AddCustomPhaseModal
          editPhase={editingPhase}
          onClose={() => { setShowAddPhase(false); setEditingPhase(null); }}
          onSave={handleSavePhase}
        />
      )}

      {pickerPhase && (
        <MilestonePicker
          phase={pickerPhase}
          allMilestones={allMs}
          onClose={() => setPickerPhase(null)}
          onSave={handleSaveMilestones}
        />
      )}

      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
          <div className="rounded-2xl border w-full max-w-sm p-5 space-y-4 shadow-2xl" style={{ background: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}>
            <h2 className="text-sm font-bold" style={{ color: 'var(--ax-text)' }}>Delete Phase?</h2>
            <p className="text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>
              This will remove <span style={{ color: 'var(--ax-text)', fontWeight: 600 }}>{deleteConfirm.name}</span> and all its milestone assignments from the custom schedule.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteConfirm(null)} className="btn btn-secondary flex-1 text-sm">Cancel</button>
              <button onClick={() => void handleDeletePhase(deleteConfirm.id)}
                className="btn flex-1 text-sm font-medium"
                style={{ background: 'rgba(224,96,80,0.1)', color: '#e06050', border: '1px solid rgba(224,96,80,0.2)' }}>
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SchedulePage() {
  const params    = useParams();
  const projectId = params.projectId as string;

  const [editPhase, setEditPhase]   = useState<PhaseSchedule | null>(null);
  const [successMsg, setSuccessMsg] = useState('');

  const { project: projectMeta, isLoading: projectLoading } = useProject();
  const projectName = projectMeta?.name ?? '';
  const myRole      = projectMeta?.myRole ?? '';

  const { data: payload, isLoading: scheduleLoading, mutate: refetch } = useSWR<ScheduleData>(
    projectId ? `/api/projects/${projectId}/schedule` : null,
    jsonFetcher,
    { revalidateOnFocus: true, dedupingInterval: 10_000 },
  );

  // Load custom schedule to know if it's preferred (for default tab selection)
  const { data: csPayload } = useSWR<CustomSchedulePayload>(
    projectId ? `/api/projects/${projectId}/custom-schedule` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const csIsPreferred = csPayload?.customSchedule?.isPreferred ?? false;
  const [activeTab, setActiveTab] = useState<'default' | 'custom' | null>(null);

  // Resolve active tab once preferred data loads
  const resolvedTab = activeTab ?? (csIsPreferred ? 'custom' : 'default');

  const loading   = projectLoading || scheduleLoading;
  const hasAccess = ['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT'].includes(myRole);
  const canEdit   = myRole === 'CLIENT' || myRole === 'PMC';
  const isPmc     = myRole === 'PMC';

  async function handleSaveDates(phaseId: string, newStartDate: string | null, newEndDate: string | null) {
    const body: Record<string, string> = { phaseId };
    if (newStartDate) body.newStartDate = newStartDate;
    if (newEndDate)   body.newEndDate   = newEndDate;
    const res  = await fetch(`/api/projects/${projectId}/schedule`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
    });
    const data = await res.json() as { success: boolean; error?: string };
    if (!data.success) throw new Error(data.error ?? 'Failed to update');
    setSuccessMsg('Phase dates updated — all assigned members have been notified.');
    setTimeout(() => setSuccessMsg(''), 6000);
    void refetch();
  }

  if (loading) return <Layout><TablePageSkeleton /></Layout>;

  if (myRole && !hasAccess) {
    return (
      <Layout>
        <Navbar projectId={projectId} projectName={projectName} role={myRole} />
        <div className="alert alert-error">Access denied.</div>
      </Layout>
    );
  }

  const phases      = payload?.phases ?? [];
  const unphased    = payload?.unphased ?? null;
  const projectInfo = payload?.project;

  const projectStart = projectInfo?.computedStart ?? projectInfo?.metaStartDate ?? null;
  const projectEnd   = projectInfo?.computedEnd   ?? projectInfo?.metaEndDate   ?? null;

  const allPhases       = unphased ? [...phases, unphased] : phases;
  const totalMilestones = allPhases.reduce((s, p) => s + p.milestoneCount, 0);
  const totalCompleted  = allPhases.reduce((s, p) => s + p.completedCount, 0);
  const totalVerified   = allPhases.reduce((s, p) => s + (p.stateBreakdown['VERIFIED']    ?? 0), 0);
  const totalSubmitted  = allPhases.reduce((s, p) => s + (p.stateBreakdown['SUBMITTED']   ?? 0), 0);
  const totalInProgress = allPhases.reduce((s, p) => s + (p.stateBreakdown['IN_PROGRESS'] ?? 0), 0);
  const totalVendors    = new Set(allPhases.flatMap((p) => p.vendors.map((v) => v.id))).size;
  const totalValue      = allPhases.reduce((s, p) => s + p.totalValue, 0);
  const overallPct      = totalMilestones > 0 ? Math.round((totalCompleted / totalMilestones) * 100) : 0;
  const pctOf           = (n: number) => totalMilestones > 0 ? (n / totalMilestones) * 100 : 0;
  const ganttUrl        = `/execution-intelligence/${projectId}/gantt`;

  return (
    <Layout>
      <Navbar projectId={projectId} projectName={projectName} role={myRole} />

      <div className="space-y-5">

        {/* Page header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold tracking-tight" style={{ color: 'var(--ax-text)' }}>Project Schedule</h1>
            <p className="text-xs mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.42)' }}>Phase-wise timeline · planned dates · milestone tracking</p>
          </div>
          <Link href={ganttUrl}
            className="flex items-center gap-1.5 text-xs font-medium px-3 py-2 rounded-lg transition-all"
            style={{ background: 'var(--ax-accent-subtle)', color: 'var(--ax-accent)', border: '1px solid rgba(var(--ax-accent-rgb),0.18)' }}>
            <BarChart3 className="w-3.5 h-3.5" /> Gantt Chart <ExternalLink className="w-3 h-3 opacity-55" />
          </Link>
        </div>

        {/* Success banner */}
        {successMsg && (
          <div className="flex items-center gap-3 px-4 py-3 rounded-xl border text-xs font-medium"
            style={{ background: 'rgba(92,186,128,0.07)', borderColor: 'rgba(92,186,128,0.2)', color: C_CLOSED }}>
            <CheckCircle2 className="w-4 h-4 shrink-0" /> {successMsg}
          </div>
        )}

        {/* Tab switcher */}
        <div className="flex items-center gap-1 p-1 rounded-xl" style={{ background: 'var(--ax-overlay)', border: '1px solid var(--ax-border)' }}>
          {(['default', 'custom'] as const).map((tab) => {
            const isActive   = resolvedTab === tab;
            const isPreferred = tab === 'default' ? !csIsPreferred : csIsPreferred;
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all"
                style={{
                  background:  isActive ? 'var(--ax-card)' : 'transparent',
                  color:       isActive ? 'var(--ax-text)' : 'rgba(var(--ax-text-rgb),0.45)',
                  boxShadow:   isActive ? '0 1px 4px rgba(0,0,0,0.12)' : 'none',
                  border:      isActive ? '1px solid var(--ax-border)' : '1px solid transparent',
                }}
              >
                {tab === 'default' ? <Layers className="w-3.5 h-3.5" /> : <Calendar className="w-3.5 h-3.5" />}
                {tab === 'default' ? 'Default Schedule' : 'Custom Schedule'}
                {isPreferred && csPayload?.customSchedule && (
                  <Star className="w-3 h-3 fill-current" style={{ color: 'var(--ax-accent)' }} />
                )}
              </button>
            );
          })}
        </div>

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* DEFAULT SCHEDULE TAB                                        */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {resolvedTab === 'default' && (
          <>
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <StatCard label="Phases" value={phases.length.toString()} sub={unphased ? '+ unphased extras' : undefined} icon={<Layers className="w-4 h-4" />} />
              <StatCard label="Milestones" value={`${totalCompleted}/${totalMilestones}`} sub={`${overallPct}% closed`} icon={<Flag className="w-4 h-4" />} />
              <StatCard label="Vendors" value={totalVendors.toString()} sub="across all phases" icon={<Users className="w-4 h-4" />} />
              <StatCard label="Contract Value" value={formatCurrency(totalValue)} icon={<TrendingUp className="w-4 h-4" />} accent />
            </div>

            {/* Overall timeline band */}
            {(projectStart || projectEnd) && (
              <div className="rounded-xl border px-5 py-4 space-y-3" style={{ background: 'var(--ax-card)', borderColor: 'var(--ax-border)' }}>
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: 'var(--ax-text)' }}>
                    <Calendar className="w-4 h-4" style={{ color: 'var(--ax-accent)' }} />
                    Overall Project Timeline
                  </div>
                  <div className="flex items-center gap-3">
                    {projectStart && projectEnd && (
                      <span className="flex items-center gap-1 text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.38)' }}>
                        <Clock className="w-3 h-3" />
                        {durationLabel(Math.round((new Date(projectEnd).getTime() - new Date(projectStart).getTime()) / 86400000))}
                      </span>
                    )}
                    <span className="text-sm font-bold tabular-nums" style={{ color: overallPct === 100 ? C_CLOSED : 'var(--ax-accent)' }}>{overallPct}%</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs tabular-nums shrink-0 hidden sm:block" style={{ color: 'rgba(var(--ax-text-rgb),0.42)', minWidth: '5rem' }}>{formatDate(projectStart)}</span>
                    <div className="flex-1 h-3 rounded-full overflow-hidden flex" style={{ background: 'rgba(var(--ax-text-rgb),0.09)' }}>
                      {pctOf(totalCompleted) > 0     && <div className="h-full" style={{ width: `${pctOf(totalCompleted)}%`, background: C_CLOSED }} />}
                      {pctOf(totalVerified) > 0      && <div className="h-full" style={{ width: `${pctOf(totalVerified)}%`, background: C_VERIFIED, opacity: 0.7 }} />}
                      {pctOf(totalSubmitted) > 0     && <div className="h-full" style={{ width: `${pctOf(totalSubmitted)}%`, background: C_SUBMITTED, opacity: 0.55 }} />}
                      {pctOf(totalInProgress) > 0    && <div className="h-full" style={{ width: `${pctOf(totalInProgress)}%`, background: 'var(--ax-accent)', opacity: 0.45 }} />}
                    </div>
                    <span className="text-xs tabular-nums shrink-0 text-right hidden sm:block" style={{ color: 'rgba(var(--ax-text-rgb),0.42)', minWidth: '5rem' }}>{formatDate(projectEnd)}</span>
                  </div>
                  <div className="flex sm:hidden items-center justify-between">
                    <span className="text-xs tabular-nums" style={{ color: 'rgba(var(--ax-text-rgb),0.42)' }}>{formatDate(projectStart)}</span>
                    <span className="text-xs tabular-nums" style={{ color: 'rgba(var(--ax-text-rgb),0.42)' }}>{formatDate(projectEnd)}</span>
                  </div>
                </div>
                <div className="flex items-center gap-4 flex-wrap">
                  {totalCompleted > 0  && <span className="flex items-center gap-1.5 text-xs" style={{ color: C_CLOSED }}><span className="w-2 h-2 rounded-full" style={{ background: C_CLOSED }} />{totalCompleted} Closed</span>}
                  {totalVerified > 0   && <span className="flex items-center gap-1.5 text-xs" style={{ color: C_VERIFIED }}><span className="w-2 h-2 rounded-full" style={{ background: C_VERIFIED }} />{totalVerified} Verified</span>}
                  {totalSubmitted > 0  && <span className="flex items-center gap-1.5 text-xs" style={{ color: C_SUBMITTED }}><span className="w-2 h-2 rounded-full" style={{ background: C_SUBMITTED }} />{totalSubmitted} Submitted</span>}
                  {totalInProgress > 0 && <span className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--ax-accent)' }}><span className="w-2 h-2 rounded-full" style={{ background: 'var(--ax-accent)' }} />{totalInProgress} In Progress</span>}
                  {totalMilestones - totalCompleted - totalVerified - totalSubmitted - totalInProgress > 0 && (
                    <span className="flex items-center gap-1.5 text-xs" style={{ color: 'rgba(var(--ax-text-rgb),0.32)' }}>
                      <span className="w-2 h-2 rounded-full" style={{ background: 'rgba(var(--ax-text-rgb),0.15)' }} />
                      {totalMilestones - totalCompleted - totalVerified - totalSubmitted - totalInProgress} Draft
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Gantt callout */}
            <div className="flex items-center gap-3 px-4 py-2.5 rounded-xl border text-xs flex-wrap" style={{ background: 'var(--ax-accent-subtle)', borderColor: 'rgba(var(--ax-accent-rgb),0.15)' }}>
              <BarChart3 className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--ax-accent)' }} />
              <p className="flex-1" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>For critical path analysis and dependency mapping —</p>
              <Link href={ganttUrl} className="flex items-center gap-1 font-semibold whitespace-nowrap hover:underline" style={{ color: 'var(--ax-accent)' }}>
                Open Gantt Chart <ChevronRight className="w-3.5 h-3.5" />
              </Link>
            </div>

            {/* Phase flow strip */}
            {phases.length > 0 && <PhaseFlowStrip phases={phases} />}

            {/* Phase cards */}
            {phases.length === 0 && !unphased ? (
              <div className="rounded-2xl border text-center py-20" style={{ background: 'var(--ax-card)', borderColor: 'var(--ax-border)' }}>
                <Layers className="w-10 h-10 mx-auto mb-4" style={{ color: 'rgba(var(--ax-text-rgb),0.18)' }} />
                <p className="text-base font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.42)' }}>No phases yet</p>
                <p className="text-xs mt-2 mb-6" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }}>Create phases on the Overview tab to see the schedule here.</p>
                <Link href={`/projects/${projectId}`} className="btn btn-primary inline-flex">Go to Overview</Link>
              </div>
            ) : (
              <div className="space-y-4">
                {phases.map((phase, idx) => (
                  <PhaseCard
                    key={phase.id}
                    phase={phase}
                    index={idx}
                    canEdit={canEdit}
                    projectId={projectId}
                    projectStart={projectStart}
                    projectEnd={projectEnd}
                    onEdit={() => setEditPhase(phase)}
                  />
                ))}
                {unphased && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 px-1">
                      <div className="flex-1 h-px" style={{ background: 'var(--ax-border)' }} />
                      <span className="text-[10px] font-semibold uppercase tracking-widest px-3 py-1 rounded-full" style={{ background: 'rgba(var(--ax-accent-rgb),0.07)', color: 'var(--ax-accent)' }}>
                        Extra / Unphased
                      </span>
                      <div className="flex-1 h-px" style={{ background: 'var(--ax-border)' }} />
                    </div>
                    <PhaseCard
                      phase={unphased}
                      index={phases.length}
                      isExtra
                      canEdit={false}
                      projectId={projectId}
                      projectStart={projectStart}
                      projectEnd={projectEnd}
                      onEdit={() => {}}
                    />
                  </div>
                )}
              </div>
            )}

            {canEdit && (
              <p className="text-[11px]" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>
                <Pencil className="w-2.5 h-2.5 inline mr-1 shrink-0" style={{ color: 'var(--ax-accent)' }} />
                As {myRole === 'CLIENT' ? 'Project Owner' : 'PMC'}, you can update start and end dates of any phase — all members will be notified.
              </p>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════════ */}
        {/* CUSTOM SCHEDULE TAB                                         */}
        {/* ═══════════════════════════════════════════════════════════ */}
        {resolvedTab === 'custom' && (
          <CustomScheduleTab projectId={projectId} isPmc={isPmc} />
        )}
      </div>

      {editPhase && (
        <EditDatesModal
          phase={editPhase}
          onClose={() => setEditPhase(null)}
          onSave={handleSaveDates}
        />
      )}
    </Layout>
  );
}
