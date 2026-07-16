'use client';

import { useMemo, useState } from 'react';
import { ChevronRight, ChevronDown, Folder, Diamond, Pencil, Info } from 'lucide-react';
import { formatDate } from '@/lib/utils';

export interface WbsMilestone {
  id: string;
  title: string;
  wbsCode: string | null;
  outlineLevel: number | null;
  isMsProjectMilestone: boolean | null;
  plannedStart: string | null;
  plannedEnd: string | null;
  durationDays: number | null;
  percentComplete: number | null;
  isCritical: boolean;
  resourceAssignments: Array<{ resource: { name: string } }>;
}

export interface WbsPhase {
  id: string;
  name: string;
  parentPhaseId: string | null;
  outlineLevel: number | null;
  sortOrder: number;
  milestones: WbsMilestone[];
}

interface PhaseNode extends WbsPhase {
  children: PhaseNode[];
}

function buildPhaseTree(phases: WbsPhase[]): PhaseNode[] {
  const nodeById = new Map<string, PhaseNode>(phases.map((p) => [p.id, { ...p, children: [] }]));
  const roots: PhaseNode[] = [];
  for (const node of Array.from(nodeById.values())) {
    if (node.parentPhaseId && nodeById.has(node.parentPhaseId)) {
      nodeById.get(node.parentPhaseId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const bySortOrder = (a: PhaseNode, b: PhaseNode) => a.sortOrder - b.sortOrder;
  roots.sort(bySortOrder);
  for (const node of Array.from(nodeById.values())) node.children.sort(bySortOrder);
  return roots;
}

const COL_ID = 'w-10 shrink-0 text-right';
const COL_WBS = 'w-20 shrink-0';
const COL_DURATION = 'w-14 shrink-0 text-right';
const COL_START = 'w-20 shrink-0 text-right';
const COL_FINISH = 'w-20 shrink-0 text-right';
const COL_PERCENT = 'w-14 shrink-0 text-right';
const COL_RESOURCES = 'w-28 shrink-0 truncate text-right';

/** Nested WBS hierarchy — Project → Phase → Subphase(s) → Milestones, mirroring MS Project's
 * own outline view. Phases/subphases are real nested Phase rows (Prisma self-relation);
 * collapse/expand state is per phase id, matching the folder-tree convention of MS Project's
 * Task view. Clicking a milestone opens the edit modal (title/dates/dependencies). Row numbering
 * (ID column) follows MS Project's own convention — Row 0 is the Project Summary Task, every
 * subsequent row (phase or milestone) gets the next sequential ID in document order. */
export default function WbsTree({
  phases,
  unphasedMilestones = [],
  onEditMilestone,
  onEditPhase,
}: {
  phases: WbsPhase[];
  unphasedMilestones?: WbsMilestone[];
  onEditMilestone?: (milestoneId: string) => void;
  onEditPhase?: (phaseId: string) => void;
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const tree = useMemo(() => buildPhaseTree(phases), [phases]);
  const unphased = unphasedMilestones;
  const allPhaseIds = useMemo(() => phases.map((p) => p.id), [phases]);

  // Row 0 — Project Summary Task, MS Project's own convention: not a phase, just an
  // auto-computed rollup (duration/start/finish) derived from every sub-task beneath it —
  // same rule MS Project itself uses, so we compute it from leaf task dates, not phase dates.
  const summary = useMemo(() => {
    const allMilestones = [...phases.flatMap((p) => p.milestones), ...unphased];
    const starts = allMilestones.map((m) => m.plannedStart).filter((d): d is string => !!d).map((d) => new Date(d).getTime());
    const ends = allMilestones.map((m) => m.plannedEnd).filter((d): d is string => !!d).map((d) => new Date(d).getTime());
    if (starts.length === 0 || ends.length === 0) return null;
    const start = new Date(Math.min(...starts));
    const end = new Date(Math.max(...ends));
    const durationDays = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
    return { start, end, durationDays, taskCount: allMilestones.length };
  }, [phases, unphased]);

  if (phases.length === 0 && unphased.length === 0) {
    return <p className="text-sm text-[rgba(232,228,220,0.4)] text-center py-8">No schedule imported yet.</p>;
  }

  function toggle(id: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Sequential row IDs, MS-Project-style — a single counter walked once per render in document
  // order (Row 0 = project summary, handled separately below).
  let nextId = 1;

  function renderPhase(node: PhaseNode, depth: number): React.ReactNode {
    const rowId = nextId++;
    const isCollapsed = collapsed.has(node.id);
    const totalCount = node.milestones.length + node.children.reduce((s, c) => s + countDescendantMilestones(c), 0);
    return (
      <div key={node.id}>
        <div
          className="flex items-center gap-2 py-2 px-2 rounded-md bg-[rgba(255,255,255,0.03)] hover:bg-[rgba(255,255,255,0.05)] cursor-pointer select-none group"
          onClick={() => toggle(node.id)}
        >
          <span className={`${COL_ID} text-[10px] text-[rgba(232,228,220,0.3)] font-mono`}>{rowId}</span>
          <span className={`${COL_WBS} text-[rgba(232,228,220,0.35)] text-xs font-mono truncate`}>—</span>
          <div className="flex items-center gap-1.5 min-w-0 flex-1" style={{ paddingLeft: depth * 20 }}>
            {isCollapsed ? <ChevronRight className="w-3.5 h-3.5 text-[rgba(232,228,220,0.4)] shrink-0" /> : <ChevronDown className="w-3.5 h-3.5 text-[rgba(232,228,220,0.4)] shrink-0" />}
            <Folder className="w-3.5 h-3.5 text-[var(--ax-accent)] shrink-0" />
            <span className="text-sm font-bold text-[#e8e4dc] truncate">{node.name}</span>
            <span className="text-xs text-[rgba(232,228,220,0.35)] shrink-0">({totalCount})</span>
            {onEditPhase && (
              <button
                onClick={(e) => { e.stopPropagation(); onEditPhase(node.id); }}
                className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded text-[rgba(232,228,220,0.35)] hover:text-[var(--ax-accent)] shrink-0"
                title="Edit phase"
              >
                <Pencil className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
        {!isCollapsed && (
          <div>
            {node.children.map((child) => renderPhase(child, depth + 1))}
            {node.milestones.map((m) => renderMilestone(m, depth + 1))}
          </div>
        )}
      </div>
    );
  }

  function countDescendantMilestones(node: PhaseNode): number {
    return node.milestones.length + node.children.reduce((s, c) => s + countDescendantMilestones(c), 0);
  }

  function renderMilestone(m: WbsMilestone, depth: number) {
    const rowId = nextId++;
    return (
      <div
        key={m.id}
        className="flex items-center gap-2 py-2 px-2 text-sm hover:bg-[rgba(255,255,255,0.02)] cursor-pointer group"
        onClick={() => onEditMilestone?.(m.id)}
      >
        <span className={`${COL_ID} text-[10px] text-[rgba(232,228,220,0.3)] font-mono`}>{rowId}</span>
        <span className={`${COL_WBS} text-[rgba(232,228,220,0.4)] text-xs font-mono truncate`}>{m.wbsCode ?? '—'}</span>
        <div className="flex items-center gap-1.5 min-w-0 flex-1" style={{ paddingLeft: depth * 20 }}>
          {m.isMsProjectMilestone ? (
            <Diamond className="w-3 h-3 text-[var(--ax-accent)] shrink-0" fill="currentColor" />
          ) : (
            <span className="w-3 h-3 shrink-0" />
          )}
          <span className={`truncate ${m.isCritical ? 'text-[#e06050]' : 'text-[rgba(232,228,220,0.85)]'}`}>{m.title}</span>
          {onEditMilestone && <Pencil className="w-3 h-3 text-[rgba(232,228,220,0.25)] opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />}
        </div>
        <span className={`${COL_DURATION} text-xs text-[rgba(232,228,220,0.45)]`}>
          {m.durationDays !== null ? `${m.durationDays}d` : '—'}
        </span>
        <span className={`${COL_START} text-xs text-[rgba(232,228,220,0.45)]`}>{formatDate(m.plannedStart) || '—'}</span>
        <span className={`${COL_FINISH} text-xs text-[rgba(232,228,220,0.45)]`}>{formatDate(m.plannedEnd) || '—'}</span>
        <span className={`${COL_PERCENT} text-xs text-[var(--ax-accent)]`}>
          {m.percentComplete !== null ? `${Math.round(m.percentComplete)}%` : '—'}
        </span>
        <span className={`${COL_RESOURCES} text-xs text-[rgba(232,228,220,0.4)]`}>
          {m.resourceAssignments.map((a) => a.resource.name).join(', ') || '—'}
        </span>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
    <div className="space-y-1 min-w-[760px]">
      {/* Toolbar — expand/collapse all */}
      <div className="flex items-center justify-end gap-2 pb-1">
        <button
          onClick={() => setCollapsed(new Set())}
          className="text-[11px] px-2 py-1 rounded-md bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors"
        >
          ▼ Expand All
        </button>
        <button
          onClick={() => setCollapsed(new Set(allPhaseIds))}
          className="text-[11px] px-2 py-1 rounded-md bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors"
        >
          ▶ Collapse All
        </button>
      </div>

      {/* Column header — ID | WBS | Name | Duration | Start | Finish | % Complete | Resources.
          Widths match the COL_* constants used by data rows below (so columns line up), but
          header labels are centered — a distinct alignment from the right-aligned data values
          reads more clearly as "this heading covers that column" than matching alignment does.
          The whole tree scrolls horizontally as one unit (see the wrapping div below) rather
          than columns shrinking/overlapping on a narrow viewport. */}
      <div className="flex items-center gap-2 py-1.5 px-2 text-[10px] font-semibold text-[rgba(232,228,220,0.4)] uppercase tracking-wider border-b border-[rgba(255,255,255,0.07)]">
        <span className="w-10 shrink-0 text-center">ID</span>
        <span className="w-20 shrink-0 text-center">WBS</span>
        <span className="flex-1 min-w-[80px] text-left">Name</span>
        <span className="w-14 shrink-0 text-center">Duration</span>
        <span className="w-20 shrink-0 text-center">Start</span>
        <span className="w-20 shrink-0 text-center">Finish</span>
        <span className="w-14 shrink-0 text-center">% Complete</span>
        <span className="w-28 shrink-0 text-center">Resources</span>
      </div>

      <div
        className="flex items-center gap-2 py-2.5 px-2 rounded-md border"
        style={{ background: 'rgba(var(--ax-accent-rgb),0.05)', borderColor: 'rgba(var(--ax-accent-rgb),0.15)' }}
        title="Row 0 — Microsoft Project's Project Summary Task. Not a phase: its duration and dates are auto-computed from every sub-task beneath it."
      >
        <span className={`${COL_ID} text-[10px] text-[rgba(232,228,220,0.3)] font-mono`}>0</span>
        <span className={`${COL_WBS} text-[rgba(232,228,220,0.35)] text-xs font-mono`}>—</span>
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <Folder className="w-3.5 h-3.5 text-[var(--ax-accent)] shrink-0" fill="currentColor" />
          <span className="text-sm font-extrabold text-[var(--ax-accent)] truncate">Project Summary</span>
          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0 inline-flex items-center gap-1" style={{ background: 'rgba(var(--ax-accent-rgb),0.12)', color: 'var(--ax-accent)' }}>
            <Info className="w-2.5 h-2.5" /> Row 0 — not a phase
          </span>
        </div>
        {summary && (
          <>
            <span className="text-xs text-[rgba(232,228,220,0.5)] w-14 shrink-0 text-right">{summary.durationDays}d</span>
            <span className="text-xs text-[rgba(232,228,220,0.5)] w-20 shrink-0 text-right">{formatDate(summary.start.toISOString())}</span>
            <span className="text-xs text-[rgba(232,228,220,0.5)] w-20 shrink-0 text-right">{formatDate(summary.end.toISOString())}</span>
            <span className="text-xs text-[rgba(232,228,220,0.5)] w-14 shrink-0 text-right">{summary.taskCount} tasks</span>
            <span className="w-28 shrink-0" />
          </>
        )}
      </div>
      <div className="divide-y divide-[rgba(255,255,255,0.04)]">
        {tree.map((node) => renderPhase(node, 1))}
        {unphased.length > 0 && (
          <div>
            <div className="flex items-center gap-2 py-2 px-2 rounded-md bg-[rgba(255,255,255,0.03)]">
              <span className={COL_ID} />
              <span className={COL_WBS} />
              <div className="flex items-center gap-1.5 min-w-0 flex-1" style={{ paddingLeft: 20 }}>
                <Folder className="w-3.5 h-3.5 text-[rgba(232,228,220,0.4)] shrink-0" />
                <span className="text-sm font-bold text-[rgba(232,228,220,0.6)]">Unphased</span>
                <span className="text-xs text-[rgba(232,228,220,0.35)]">({unphased.length})</span>
              </div>
            </div>
            {unphased.map((m) => renderMilestone(m, 2))}
          </div>
        )}
      </div>
    </div>
    </div>
  );
}
