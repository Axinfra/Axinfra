'use client';

import { memo, useRef, useMemo, useState, useEffect, useCallback } from 'react';
import { format, parseISO, differenceInDays, addDays, startOfDay } from 'date-fns';

/* ─── Types ──────────────────────────────────────────────────────────── */
export type GanttMode = 'L1' | 'L2' | 'L3' | 'L4';

export interface GanttPhase {
  id: string; name: string; sortOrder: number;
}
export interface GanttMilestone {
  id: string; title: string; state: string; sortOrder: number;
  plannedStart: string | null; plannedEnd: string | null;
  actualStart: string | null; actualEnd: string | null;
  baselinePlannedStart: string | null; baselinePlannedEnd: string | null;
  value: number; vendorId: string | null; vendorName: string | null;
  isCritical: boolean; totalFloat: number | null;
  phaseId: string | null; phaseName: string | null; phaseOrder: number;
  predecessors: Array<{ predecessorId: string; dependencyType: string; lagDays: number }>;
}
interface GanttChartProps {
  milestones: GanttMilestone[]; phases: GanttPhase[];
  mode: GanttMode; hasCycle: boolean; projectStartDate: string | null;
  viewMode?: 'phase' | 'flat';
  onDateEdit?: (milestoneId: string, field: 'plannedStart' | 'plannedEnd', value: string) => void;
}

/* ─── Layout constants ───────────────────────────────────────────────── */
const PHASE_ROW_H = 52;
const MS_ROW_H    = 50;
const HEADER_H    = 52;
const BAR_H       = 16;
const ACTUAL_H    = 10;
const LABEL_W     = 272;
const MS_INDENT   = 28;

const PHASE_COLORS = ['#c4a35a','#60a5fa','#a78bfa','#34d399','#fb923c','#f472b6','#22d3ee','#84cc16'];

const STATE_COLORS: Record<string, string> = {
  VERIFIED: '#22c55e', CLOSED: '#22c55e',
  SUBMITTED: '#f59e0b', IN_PROGRESS: '#3b82f6', DRAFT: 'rgba(232,228,220,0.3)',
};
const STATE_LABELS: Record<string, string> = {
  VERIFIED: 'Verified', CLOSED: 'Closed',
  SUBMITTED: 'Submitted', IN_PROGRESS: 'In Progress', DRAFT: 'Draft',
};

/* ─── Helpers ────────────────────────────────────────────────────────── */
function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { return parseISO(typeof s === 'string' ? s : String(s)); } catch { return null; }
}
function barColor(m: GanttMilestone, mode: GanttMode, phaseColor: string): string {
  if (m.isCritical && (mode === 'L3' || mode === 'L4')) return '#ef4444';
  return STATE_COLORS[m.state] ?? phaseColor;
}

interface PhaseRow {
  kind: 'phase'; phaseId: string; phaseName: string; color: string;
  milestones: GanttMilestone[]; phaseStart: Date | null; phaseEnd: Date | null;
  doneCount: number; totalCount: number; expanded: boolean;
}
interface MsRow { kind: 'ms'; ms: GanttMilestone; phaseColor: string; msIndex: number; }
type DisplayRow = PhaseRow | MsRow;

/* ─── Tooltip state ─────────────────────────────────────────────────── */
interface Tip { x: number; y: number; content: React.ReactNode }

/* ─── Component ──────────────────────────────────────────────────────── */
function GanttChart({ milestones, phases, mode, hasCycle, projectStartDate, viewMode = 'phase', onDateEdit }: GanttChartProps) {
  const outerRef   = useRef<HTMLDivElement>(null);
  const chartRef   = useRef<HTMLDivElement>(null); // scrollable chart column
  const headerRef  = useRef<HTMLDivElement>(null); // sticky header chart area

  const [expanded, setExpanded] = useState<Set<string>>(() => new Set([...phases.map(p => p.id), '_unphased']));
  const [editing, setEditing]   = useState<{ id: string; field: 'plannedStart' | 'plannedEnd' } | null>(null);
  const [editVal, setEditVal]   = useState('');
  const [focusPhase, setFocusPhase] = useState<string | null>(null);
  const [hovered, setHovered]   = useState<string | null>(null); // milestone id
  const [tip, setTip]           = useState<Tip | null>(null);

  const toggle      = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const expandAll   = () => setExpanded(new Set([...phases.map(p => p.id), '_unphased']));
  const collapseAll = () => setExpanded(new Set());

  /* ── Group milestones by phase ──────────────────────────────────────── */
  const { byPhase, unphased } = useMemo(() => {
    const map = new Map<string, GanttMilestone[]>();
    phases.forEach(p => map.set(p.id, []));
    const up: GanttMilestone[] = [];
    milestones.forEach(m => { if (m.phaseId && map.has(m.phaseId)) map.get(m.phaseId)!.push(m); else up.push(m); });
    return { byPhase: map, unphased: up };
  }, [milestones, phases]);

  /* ── Build display rows ──────────────────────────────────────────────── */
  const displayRows = useMemo<DisplayRow[]>(() => {
    let msIndex = 0;
    if (viewMode === 'flat') {
      const sorted = [...milestones].sort((a, b) => (a.phaseOrder - b.phaseOrder) || (a.sortOrder - b.sortOrder));
      return sorted.map(ms => ({
        kind: 'ms', ms, msIndex: msIndex++,
        phaseColor: PHASE_COLORS[phases.findIndex(p => p.id === ms.phaseId) % PHASE_COLORS.length] ?? PHASE_COLORS[0],
      }));
    }
    const rows: DisplayRow[] = [];
    const addPhase = (phaseId: string, phaseName: string, pms: GanttMilestone[], colorIdx: number) => {
      if (focusPhase && focusPhase !== phaseId) return;
      const color = PHASE_COLORS[colorIdx % PHASE_COLORS.length];
      const dates = pms.flatMap(m => [toDate(m.plannedStart), toDate(m.plannedEnd)]).filter(Boolean) as Date[];
      const phaseStart = dates.length ? new Date(Math.min(...dates.map(d => d.getTime()))) : null;
      const phaseEnd   = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;
      const doneCount  = pms.filter(m => m.state === 'VERIFIED' || m.state === 'CLOSED').length;
      const isExp = expanded.has(phaseId);
      rows.push({ kind: 'phase', phaseId, phaseName, color, milestones: pms, phaseStart, phaseEnd, doneCount, totalCount: pms.length, expanded: isExp });
      if (isExp) pms.forEach(ms => rows.push({ kind: 'ms', ms, phaseColor: color, msIndex: msIndex++ }));
    };
    phases.forEach((p, i) => addPhase(p.id, p.name, byPhase.get(p.id) ?? [], i));
    if (unphased.length > 0) addPhase('_unphased', 'Extra Milestones', unphased, phases.length);
    return rows;
  }, [viewMode, milestones, phases, byPhase, unphased, expanded, focusPhase]);

  /* ── Date range ──────────────────────────────────────────────────────── */
  const { chartStart, chartEnd, totalDays } = useMemo(() => {
    const dates: Date[] = [];
    const ref = toDate(projectStartDate);
    if (ref) dates.push(ref);
    milestones.forEach(m =>
      [m.plannedStart, m.plannedEnd, m.actualStart, m.actualEnd, m.baselinePlannedStart, m.baselinePlannedEnd]
        .forEach(s => { const d = toDate(s); if (d) dates.push(d); })
    );
    if (!dates.length) { const now = new Date(); return { chartStart: now, chartEnd: addDays(now, 120), totalDays: 120 }; }
    const min = Math.min(...dates.map(d => d.getTime()));
    const max = Math.max(...dates.map(d => d.getTime()));
    const start = addDays(new Date(min), -14);
    const end   = addDays(new Date(max), 28);
    return { chartStart: start, chartEnd: end, totalDays: Math.max(differenceInDays(end, start), 60) };
  }, [milestones, projectStartDate]);

  const MIN_CHART_W = 800;
  const PX_PER_DAY  = Math.max(MIN_CHART_W / totalDays, 5);
  const chartWidth  = Math.ceil(totalDays * PX_PER_DAY);

  const xFrom = useCallback((d: Date) => differenceInDays(d, chartStart) * PX_PER_DAY, [chartStart, PX_PER_DAY]);

  /* ── Row y-offsets (no header — header is separate) ─────────────────── */
  const rowH = (r: DisplayRow) => r.kind === 'phase' ? PHASE_ROW_H : MS_ROW_H;
  const { rowOffsets, bodyH } = useMemo(() => {
    const offsets: number[] = [];
    let y = 0;
    for (const r of displayRows) { offsets.push(y); y += rowH(r); }
    return { rowOffsets: offsets, bodyH: y + 8 };
  }, [displayRows]);

  /* ── Month ticks ─────────────────────────────────────────────────────── */
  const monthTicks = useMemo(() => {
    const marks: { x: number; label: string }[] = [];
    let cur = new Date(chartStart.getFullYear(), chartStart.getMonth(), 1);
    while (cur <= chartEnd) {
      const x = xFrom(cur);
      if (x >= 0 && x <= chartWidth) marks.push({ x, label: format(cur, totalDays > 200 ? 'MMM yy' : 'MMM yyyy') });
      cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
    }
    return marks;
  }, [chartStart, chartEnd, chartWidth, PX_PER_DAY, totalDays, xFrom]);

  const weekTicks = useMemo(() => {
    if (totalDays > 180) return [];
    const marks: number[] = [];
    const start = new Date(chartStart);
    start.setDate(start.getDate() + (7 - start.getDay()) % 7);
    let cur = start;
    while (cur <= chartEnd) { const x = xFrom(cur); if (x >= 0) marks.push(x); cur = addDays(cur, 7); }
    return marks;
  }, [chartStart, chartEnd, PX_PER_DAY, totalDays, xFrom]);

  const todayX = useMemo(() => xFrom(startOfDay(new Date())), [xFrom]);

  /* ── Dependency row index map ────────────────────────────────────────── */
  const msRowIdxById = useMemo(() => {
    const m = new Map<string, number>();
    displayRows.forEach((r, i) => { if (r.kind === 'ms') m.set(r.ms.id, i); });
    return m;
  }, [displayRows]);

  /* ── SPI ─────────────────────────────────────────────────────────────── */
  function spi(m: GanttMilestone): number | null {
    if (mode !== 'L4' || !m.plannedStart || !m.plannedEnd) return null;
    const dur = differenceInDays(parseISO(m.plannedEnd), parseISO(m.plannedStart));
    if (dur <= 0) return null;
    const elapsed = differenceInDays(new Date(), parseISO(m.plannedStart));
    const bcwp = ['VERIFIED', 'CLOSED'].includes(m.state) ? dur : Math.min(elapsed, dur);
    const bcws = Math.min(elapsed, dur);
    if (bcws <= 0) return null;
    return Math.round((bcwp / bcws) * 100) / 100;
  }

  /* ── Commit date edit ────────────────────────────────────────────────── */
  const commitEdit = () => {
    if (editing && onDateEdit && editVal) onDateEdit(editing.id, editing.field, editVal);
    setEditing(null);
  };

  /* ── Sync header horizontal scroll with chart body ───────────────────── */
  const onBodyScroll = useCallback(() => {
    if (chartRef.current && headerRef.current) {
      headerRef.current.scrollLeft = chartRef.current.scrollLeft;
    }
  }, []);

  /* ── Auto-scroll to today on mount ──────────────────────────────────── */
  useEffect(() => {
    const el = chartRef.current;
    if (!el || todayX < 0) return;
    const target = Math.max(0, todayX - el.clientWidth * 0.3);
    el.scrollLeft = target;
  }, [todayX]);

  const scrollToToday = () => {
    const el = chartRef.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, todayX - el.clientWidth * 0.3), behavior: 'smooth' });
  };

  /* ─────────────────────────────────────────────────────────────────────
     Render
  ───────────────────────────────────────────────────────────────────── */
  return (
    <div className="flex flex-col bg-[#0b0b0f] border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">

      {/* ── Toolbar ──────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          {viewMode === 'phase' && (
            <>
              <button onClick={expandAll}
                className="text-[11.5px] px-2.5 py-1 rounded-md bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.6)] hover:text-[#e8e4dc] transition-all">
                ▼ Expand All
              </button>
              <button onClick={collapseAll}
                className="text-[11.5px] px-2.5 py-1 rounded-md bg-[rgba(255,255,255,0.05)] text-[rgba(232,228,220,0.6)] hover:text-[#e8e4dc] transition-all">
                ▶ Collapse All
              </button>
            </>
          )}
          {focusPhase && (
            <button onClick={() => setFocusPhase(null)}
              className="text-[11.5px] px-2.5 py-1 rounded-md bg-[rgba(196,163,90,0.12)] text-[#c4a35a] border border-[rgba(196,163,90,0.25)]">
              ✕ Clear Focus
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          {todayX >= 0 && todayX <= chartWidth && (
            <button onClick={scrollToToday}
              className="text-[11.5px] px-3 py-1 rounded-md bg-[rgba(59,130,246,0.12)] text-[#60a5fa] border border-[rgba(59,130,246,0.2)] hover:bg-[rgba(59,130,246,0.2)] transition-all">
              ⌖ Jump to Today
            </button>
          )}
          <span className="text-[11px] text-[rgba(232,228,220,0.35)]">
            {phases.length} phases · {milestones.length} milestones
          </span>
        </div>
      </div>

      {/* ── Date editor bar ──────────────────────────────────────────────── */}
      {editing && (
        <div className="flex flex-wrap items-center gap-3 px-4 py-2.5 bg-[rgba(196,163,90,0.08)] border-b border-[rgba(196,163,90,0.2)] shrink-0">
          <span className="text-[12.5px] text-[#c4a35a] font-semibold">
            Editing {editing.field === 'plannedStart' ? 'Start Date' : 'End Date'}
          </span>
          <input type="date" value={editVal} onChange={e => setEditVal(e.target.value)} autoFocus
            className="text-[13px] border border-[rgba(196,163,90,0.3)] rounded-lg px-3 py-1.5 bg-[#1a1c22] text-[#e8e4dc] outline-none focus:border-[#c4a35a]" />
          <button onClick={commitEdit} className="text-[12.5px] px-4 py-1.5 bg-[#c4a35a] text-[#0a0c10] rounded-lg font-bold">Save</button>
          <button onClick={() => setEditing(null)} className="text-[12.5px] px-3 py-1.5 text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc]">Cancel</button>
        </div>
      )}

      {/* ── Two-column layout: sticky labels | scrollable chart ─────────── */}
      <div ref={outerRef} className="flex min-w-0 overflow-hidden">

        {/* ── LEFT: sticky label panel ─────────────────────────────────── */}
        {/* position:sticky left:0 keeps this visible while the right panel scrolls */}
        <div
          style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 20 }}
          className="bg-[#0b0b0f] border-r border-[rgba(255,255,255,0.08)] flex flex-col"
        >
          {/* Header cell */}
          <div style={{ height: HEADER_H }}
            className="flex items-end px-4 pb-2.5 border-b border-[rgba(255,255,255,0.08)] bg-[#13151a] shrink-0">
            <span className="text-[10.5px] font-semibold text-[rgba(232,228,220,0.4)] uppercase tracking-wider">
              {viewMode === 'phase' ? 'Phase / Milestone' : 'Milestone'}
            </span>
          </div>

          {/* Label rows */}
          {displayRows.map((row, idx) => {
            if (row.kind === 'phase') {
              const pct = row.totalCount > 0 ? Math.round((row.doneCount / row.totalCount) * 100) : 0;
              return (
                <div key={row.phaseId}
                  style={{ height: PHASE_ROW_H, borderLeft: `3px solid ${row.color}`, background: `${row.color}0d` }}
                  className="flex items-center gap-2 px-3 border-b border-[rgba(255,255,255,0.07)] cursor-pointer select-none group shrink-0"
                  onClick={() => toggle(row.phaseId)}>
                  <span style={{ color: row.color }} className="text-[11px] font-bold w-3 shrink-0">
                    {row.expanded ? '▼' : '▶'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[12.5px] font-bold text-[#e8e4dc] truncate leading-tight">{row.phaseName}</span>
                      <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded"
                        style={{ background: `${row.color}28`, color: row.color }}>
                        {row.doneCount}/{row.totalCount}
                      </span>
                    </div>
                    <div className="h-1 w-full rounded-full bg-[rgba(255,255,255,0.07)] overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${pct}%`, background: row.color }} />
                    </div>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-0.5">
                    <span className="text-[10px] font-semibold" style={{ color: row.color }}>{pct}%</span>
                    <button
                      onClick={e => { e.stopPropagation(); setFocusPhase(focusPhase === row.phaseId ? null : row.phaseId); }}
                      className="text-[9px] px-1.5 py-0.5 rounded text-[rgba(232,228,220,0.3)] hover:text-[#c4a35a] opacity-0 group-hover:opacity-100 transition-all">
                      Focus
                    </button>
                  </div>
                </div>
              );
            }

            const m = row.ms;
            const isHov  = hovered === m.id;
            const isCrit = m.isCritical && (mode === 'L3' || mode === 'L4');
            const stateC = isCrit ? '#ef4444' : (STATE_COLORS[m.state] ?? row.phaseColor);
            const spiv   = spi(m);

            return (
              <div key={m.id}
                style={{ height: MS_ROW_H, paddingLeft: MS_INDENT, background: isHov ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.1)' }}
                className="flex items-center gap-2 pr-3 border-b border-[rgba(255,255,255,0.05)] shrink-0 transition-colors cursor-default"
                onMouseEnter={() => setHovered(m.id)}
                onMouseLeave={() => setHovered(null)}>

                {/* State dot */}
                <div className="w-2 h-2 rounded-full shrink-0" style={{ background: stateC, opacity: 0.9 }} />

                <div className="flex-1 min-w-0">
                  <p className={`text-[12px] font-medium leading-tight truncate ${isCrit ? 'text-[#ef4444]' : 'text-[#e8e4dc]'}`} title={m.title}>
                    {isCrit && <span className="text-[8px] mr-1">●</span>}
                    {m.title}
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    <span className="text-[9.5px] font-semibold px-1.5 py-0.5 rounded leading-none"
                      style={{ background: `${stateC}22`, color: stateC }}>
                      {STATE_LABELS[m.state] ?? m.state}
                    </span>
                    {m.vendorName && (
                      <span className="text-[9.5px] text-[rgba(232,228,220,0.38)] truncate max-w-[80px]">{m.vendorName}</span>
                    )}
                    {mode === 'L3' && m.totalFloat !== null && (
                      <span className={`text-[9px] font-semibold ${m.totalFloat === 0 ? 'text-[#ef4444]' : 'text-[rgba(232,228,220,0.35)]'}`}>
                        F:{m.totalFloat}d
                      </span>
                    )}
                    {mode === 'L4' && spiv !== null && (
                      <span className={`text-[9px] font-bold ${spiv >= 1 ? 'text-[#22c55e]' : 'text-[#ef4444]'}`}>
                        SPI {spiv}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* ── RIGHT: chart area (header + body scroll together) ─────────── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">

          {/* Sticky date header */}
          <div
            ref={headerRef}
            style={{ height: HEADER_H, overflowX: 'hidden', flexShrink: 0, position: 'sticky', top: 0, zIndex: 10 }}
            className="bg-[#13151a] border-b border-[rgba(255,255,255,0.08)]">
            <svg width={chartWidth} height={HEADER_H} style={{ display: 'block' }}>
              {/* Week grid in header */}
              {weekTicks.map((x, i) => (
                <line key={i} x1={x} y1={0} x2={x} y2={HEADER_H} stroke="rgba(255,255,255,0.04)" />
              ))}
              {/* Month labels */}
              {monthTicks.map((t, i) => (
                <g key={i}>
                  <line x1={t.x} y1={0} x2={t.x} y2={HEADER_H} stroke="rgba(255,255,255,0.1)" />
                  <text x={t.x + 7} y={HEADER_H - 10} fontSize={11.5} fontWeight="600" fill="rgba(232,228,220,0.6)">
                    {t.label}
                  </text>
                </g>
              ))}
              {/* Today pill in header */}
              {todayX >= 0 && todayX <= chartWidth && (
                <g>
                  <line x1={todayX} y1={0} x2={todayX} y2={HEADER_H} stroke="#3b82f6" strokeWidth={2} opacity={0.9} />
                  <rect x={todayX - 20} y={4} width={40} height={20} rx={5} fill="#3b82f6" />
                  <text x={todayX} y={19} fontSize={10} fill="white" textAnchor="middle" fontWeight="700">Today</text>
                </g>
              )}
            </svg>
          </div>

          {/* Scrollable chart body */}
          <div
            ref={chartRef}
            className="flex-1 overflow-x-auto overflow-y-visible"
            onScroll={onBodyScroll}
            onMouseLeave={() => { setTip(null); }}
          >
            <svg
              width={chartWidth}
              height={bodyH}
              style={{ display: 'block' }}
            >
              {/* Week grid */}
              {weekTicks.map((x, i) => (
                <line key={i} x1={x} y1={0} x2={x} y2={bodyH} stroke="rgba(255,255,255,0.03)" />
              ))}
              {/* Month grid */}
              {monthTicks.map((t, i) => (
                <line key={i} x1={t.x} y1={0} x2={t.x} y2={bodyH} stroke="rgba(255,255,255,0.07)" />
              ))}
              {/* Today line */}
              {todayX >= 0 && todayX <= chartWidth && (
                <line x1={todayX} y1={0} x2={todayX} y2={bodyH}
                  stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.7} />
              )}

              {/* Arrow marker defs */}
              <defs>
                <marker id="arr-std" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={5} markerHeight={5} orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(232,228,220,0.3)" />
                </marker>
                <marker id="arr-crit" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={5} markerHeight={5} orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(239,68,68,0.6)" />
                </marker>
              </defs>

              {/* ── Rows ──────────────────────────────────────────────── */}
              {displayRows.map((row, idx) => {
                const y = rowOffsets[idx];
                const h = rowH(row);

                /* Phase row */
                if (row.kind === 'phase') {
                  const { phaseStart: ps, phaseEnd: pe, color, doneCount, totalCount } = row;
                  const phaseX = ps ? xFrom(ps) : null;
                  const phaseW = ps && pe ? Math.max(20, xFrom(pe) - xFrom(ps)) : null;
                  const barMidY = y + h / 2;
                  const barH2 = 24;
                  const pct = totalCount > 0 ? doneCount / totalCount : 0;
                  return (
                    <g key={row.phaseId}>
                      <rect x={0} y={y} width={chartWidth} height={h} fill={`${color}07`} />
                      <line x1={0} y1={y + h} x2={chartWidth} y2={y + h} stroke="rgba(255,255,255,0.07)" />
                      {phaseX !== null && phaseW !== null && (
                        <>
                          <rect x={phaseX} y={barMidY - barH2 / 2} width={phaseW} height={barH2}
                            rx={6} fill={`${color}18`} stroke={color} strokeWidth={1.5} />
                          {pct > 0 && (
                            <rect x={phaseX} y={barMidY - barH2 / 2}
                              width={Math.max(phaseW * pct, barH2 / 2)} height={barH2}
                              rx={6} fill={`${color}45`} />
                          )}
                          {phaseW > 80 && (
                            <text x={phaseX + 10} y={barMidY + 5} fontSize={11.5} fontWeight="bold" fill={color} style={{ pointerEvents: 'none' }}>
                              {row.phaseName}
                            </text>
                          )}
                          {ps && (
                            <text x={phaseX + 2} y={barMidY - barH2 / 2 - 4} fontSize={9} fill={`${color}bb`}>
                              {format(ps, 'MMM d')}
                            </text>
                          )}
                          {pe && (
                            <text x={phaseX + phaseW - 2} y={barMidY - barH2 / 2 - 4} fontSize={9}
                              fill={`${color}bb`} textAnchor="end">
                              {format(pe, 'MMM d')}
                            </text>
                          )}
                          {row.milestones.map(m => {
                            const mEnd = toDate(m.plannedEnd);
                            if (!mEnd) return null;
                            const mx = xFrom(mEnd);
                            if (mx < phaseX || mx > phaseX + phaseW) return null;
                            const done = m.state === 'VERIFIED' || m.state === 'CLOSED';
                            return (
                              <polygon key={m.id}
                                points={`${mx},${barMidY - 6} ${mx + 5},${barMidY} ${mx},${barMidY + 6} ${mx - 5},${barMidY}`}
                                fill={done ? '#22c55e' : color} opacity={0.85} />
                            );
                          })}
                        </>
                      )}
                    </g>
                  );
                }

                /* Milestone row */
                const m = row.ms;
                const isHov  = hovered === m.id;
                const color  = barColor(m, mode, row.phaseColor);
                const planY  = y + Math.floor((h - BAR_H - ACTUAL_H - 6) / 2);
                const actualY = planY + BAR_H + 6;

                const ps  = toDate(m.plannedStart);
                const pe  = toDate(m.plannedEnd);
                const as_ = toDate(m.actualStart);
                const ae  = toDate(m.actualEnd);
                const bs  = toDate(m.baselinePlannedStart);
                const be  = toDate(m.baselinePlannedEnd);

                const plannedX = ps ? xFrom(ps) : null;
                const plannedW = ps && pe ? Math.max(10, xFrom(pe) - xFrom(ps)) : null;
                const actualX  = as_ ? xFrom(as_) : null;
                const actualW  = as_ && ae ? Math.max(8, xFrom(ae) - xFrom(as_)) : null;

                return (
                  <g key={m.id}
                    onMouseEnter={e => {
                      setHovered(m.id);
                      const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
                      const mx = e.clientX - rect.left;
                      const my = e.clientY - rect.top;
                      setTip({
                        x: mx, y: my,
                        content: (
                          <div className="space-y-1.5">
                            <p className="font-bold text-[13px] text-[#e8e4dc]">{m.title}</p>
                            <div className="flex gap-2 text-[11px]">
                              <span className="px-1.5 py-0.5 rounded font-semibold"
                                style={{ background: `${color}25`, color }}>{STATE_LABELS[m.state] ?? m.state}</span>
                              {m.vendorName && <span className="text-[rgba(232,228,220,0.55)]">{m.vendorName}</span>}
                            </div>
                            {(ps || pe) && (
                              <div className="text-[11px] text-[rgba(232,228,220,0.55)] space-y-0.5">
                                {ps && <div>Planned Start: <span className="text-[#e8e4dc]">{format(ps, 'dd MMM yyyy')}</span></div>}
                                {pe && <div>Planned End: <span className="text-[#e8e4dc]">{format(pe, 'dd MMM yyyy')}</span></div>}
                                {ps && pe && <div>Duration: <span className="text-[#e8e4dc]">{differenceInDays(pe, ps)}d</span></div>}
                              </div>
                            )}
                            {(as_ || ae) && (
                              <div className="text-[11px] text-[rgba(232,228,220,0.55)] space-y-0.5">
                                {as_ && <div>Actual Start: <span className="text-[#3b82f6]">{format(as_, 'dd MMM yyyy')}</span></div>}
                                {ae  && <div>Actual End: <span className="text-[#3b82f6]">{format(ae,  'dd MMM yyyy')}</span></div>}
                                {pe && ae && (
                                  <div>
                                    {differenceInDays(ae, pe) > 0
                                      ? <span className="text-[#ef4444]">{differenceInDays(ae, pe)}d late</span>
                                      : <span className="text-[#22c55e]">{Math.abs(differenceInDays(ae, pe))}d early</span>}
                                  </div>
                                )}
                              </div>
                            )}
                            {(mode === 'L3' || mode === 'L4') && m.totalFloat !== null && (
                              <div className={`text-[11px] font-semibold ${m.totalFloat === 0 ? 'text-[#ef4444]' : 'text-[rgba(232,228,220,0.55)]'}`}>
                                {m.totalFloat === 0 ? '● Critical path — zero float' : `Float: ${m.totalFloat}d`}
                              </div>
                            )}
                          </div>
                        ),
                      });
                    }}
                    onMouseLeave={() => { setHovered(null); setTip(null); }}
                    onMouseMove={e => {
                      const rect = (e.target as SVGElement).closest('svg')!.getBoundingClientRect();
                      setTip(prev => prev ? { ...prev, x: e.clientX - rect.left, y: e.clientY - rect.top } : null);
                    }}
                  >
                    {/* Row bg */}
                    <rect x={0} y={y} width={chartWidth} height={h}
                      fill={isHov ? 'rgba(255,255,255,0.04)' : (idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.01)')} />
                    <line x1={0} y1={y + h} x2={chartWidth} y2={y + h} stroke="rgba(255,255,255,0.045)" />

                    {/* Baseline bar (L4) */}
                    {mode === 'L4' && bs && be && (
                      <rect x={xFrom(bs)} y={planY} width={Math.max(4, xFrom(be) - xFrom(bs))} height={BAR_H}
                        rx={3} fill="rgba(232,228,220,0.08)" stroke="rgba(232,228,220,0.2)" strokeWidth={1} strokeDasharray="3 2" />
                    )}

                    {/* Planned bar */}
                    {plannedX !== null && plannedW !== null && (
                      <g>
                        <rect x={plannedX} y={planY} width={plannedW} height={BAR_H}
                          rx={4} fill={color} fillOpacity={isHov ? 0.35 : 0.2} stroke={color} strokeWidth={1.5}
                          style={mode === 'L2' ? { cursor: 'pointer' } : {}}
                          onClick={() => mode === 'L2' && onDateEdit && (() => {
                            setEditing({ id: m.id, field: 'plannedEnd' });
                            setEditVal(m.plannedEnd ? m.plannedEnd.slice(0, 10) : '');
                          })()} />
                        {/* Date labels on bar */}
                        {ps && (
                          <text x={plannedX + 3} y={planY - 3} fontSize={8.5} fill={`${color}99`}>{format(ps, 'MMM d')}</text>
                        )}
                        {pe && plannedW > 50 && (
                          <text x={plannedX + plannedW - 3} y={planY - 3} fontSize={8.5} fill={`${color}99`} textAnchor="end">{format(pe, 'MMM d')}</text>
                        )}
                      </g>
                    )}

                    {/* Actual bar */}
                    {actualX !== null && actualW !== null && (
                      <rect x={actualX} y={actualY} width={actualW} height={ACTUAL_H}
                        rx={3} fill={color} fillOpacity={0.85} />
                    )}

                    {/* No-date diamond */}
                    {!ps && !pe && (
                      <polygon
                        points={`${chartWidth / 3},${planY} ${chartWidth / 3 + 10},${planY + BAR_H / 2} ${chartWidth / 3},${planY + BAR_H} ${chartWidth / 3 - 10},${planY + BAR_H / 2}`}
                        fill={color} opacity={0.5} />
                    )}

                    {/* Dependency arrows (L3/L4) */}
                    {(mode === 'L3' || mode === 'L4') && m.predecessors.map(dep => {
                      const predIdx = msRowIdxById.get(dep.predecessorId);
                      if (predIdx === undefined) return null;
                      const predRow = displayRows[predIdx];
                      if (predRow.kind !== 'ms') return null;
                      const predM = predRow.ms;
                      const predPe = toDate(predM.plannedEnd);
                      if (!predPe || !ps) return null;
                      const predY0 = rowOffsets[predIdx];
                      const predMidY = predY0 + Math.floor((MS_ROW_H - BAR_H - ACTUAL_H - 6) / 2) + BAR_H / 2;
                      const curMidY  = planY + BAR_H / 2;
                      const x1 = xFrom(predPe);
                      const x2 = xFrom(ps);
                      const isCritArr = m.isCritical && predM.isCritical;
                      return (
                        <path key={`${dep.predecessorId}-${m.id}`}
                          d={`M ${x1} ${predMidY} C ${x1 + 28} ${predMidY} ${x2 - 28} ${curMidY} ${x2} ${curMidY}`}
                          stroke={isCritArr ? 'rgba(239,68,68,0.55)' : 'rgba(232,228,220,0.18)'}
                          strokeWidth={isCritArr ? 1.5 : 1} fill="none" strokeDasharray="4 3"
                          markerEnd={isCritArr ? 'url(#arr-crit)' : 'url(#arr-std)'} />
                      );
                    })}
                  </g>
                );
              })}
            </svg>

            {/* Tooltip */}
            {tip && hovered && (
              <div
                className="absolute pointer-events-none z-50 bg-[#1a1c24] border border-[rgba(255,255,255,0.12)] rounded-xl shadow-2xl p-3"
                style={{ left: tip.x + 18, top: tip.y - 10, minWidth: 220, maxWidth: 300 }}>
                {tip.content}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Legend ───────────────────────────────────────────────────────── */}
      <div className="flex items-center flex-wrap gap-4 px-4 py-2.5 border-t border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] shrink-0">
        {[
          { color: STATE_COLORS['DRAFT'],       label: 'Draft' },
          { color: STATE_COLORS['IN_PROGRESS'], label: 'In Progress' },
          { color: STATE_COLORS['SUBMITTED'],   label: 'Submitted' },
          { color: STATE_COLORS['VERIFIED'],    label: 'Verified / Closed' },
          ...(mode === 'L3' || mode === 'L4' ? [{ color: '#ef4444', label: 'Critical' }] : []),
        ].map(({ color, label }) => (
          <span key={label} className="flex items-center gap-1.5 text-[11px] text-[rgba(232,228,220,0.5)]">
            <span className="w-5 h-2.5 rounded-sm inline-block" style={{ background: color, opacity: 0.75 }} />
            {label}
          </span>
        ))}
        <span className="ml-auto text-[10.5px] text-[rgba(232,228,220,0.28)] hidden sm:block">
          Outline = Planned · Solid = Actual{mode === 'L4' ? ' · Dashed = Baseline' : ''}
          {' · Hover bars for details'}
        </span>
      </div>
    </div>
  );
}

export default memo(GanttChart);
