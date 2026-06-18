'use client';

import { useMemo, useState, useRef, useCallback } from 'react';
import { format, parseISO } from 'date-fns';

/* ─── Constants ──────────────────────────────────────────────────────── */
const NODE_W   = 176;
const NODE_H   = 68;
const COL_GAP  = 112;   // horizontal space between columns (for arrow routing)
const ROW_GAP  = 18;    // vertical space between nodes in the same column
const PAD      = 32;    // outer padding

/* ─── State colour mapping ───────────────────────────────────────────── */
const STATE_COLOR: Record<string, string> = {
  VERIFIED: '#22c55e', CLOSED: '#22c55e',
  SUBMITTED: '#f59e0b', IN_PROGRESS: '#3b82f6',
  DRAFT: 'rgba(var(--ax-text-rgb),0.35)',
};
const STATE_LABEL: Record<string, string> = {
  VERIFIED: 'Verified', CLOSED: 'Closed',
  SUBMITTED: 'Submitted', IN_PROGRESS: 'In Progress', DRAFT: 'Draft',
};

/* ─── Types ──────────────────────────────────────────────────────────── */
export interface DepMilestone {
  id: string;
  title: string;
  state: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  vendorName: string | null;
  isCritical: boolean;
  totalFloat: number | null;
  phaseName: string | null;
  predecessors: { predecessorId: string; dependencyType: string; lagDays: number }[];
}

interface LayoutNode extends DepMilestone {
  col: number;
  row: number;
  x: number;
  y: number;
}

/* ─── Layout algorithm: topological column assignment ───────────────── */
function computeLayout(milestones: DepMilestone[]): LayoutNode[] {
  if (!milestones.length) return [];

  const byId = new Map<string, DepMilestone>(milestones.map(m => [m.id, m]));

  // Assign column = depth (longest incoming path). Cycle-safe via inStack guard.
  const colMemo  = new Map<string, number>();
  const inStack  = new Set<string>();

  function depth(id: string): number {
    if (colMemo.has(id)) return colMemo.get(id)!;
    if (inStack.has(id)) { colMemo.set(id, 0); return 0; }
    inStack.add(id);
    const m = byId.get(id);
    const preds = (m?.predecessors ?? []).filter(p => byId.has(p.predecessorId));
    const col = preds.length === 0 ? 0 : Math.max(...preds.map(p => depth(p.predecessorId))) + 1;
    inStack.delete(id);
    colMemo.set(id, col);
    return col;
  }
  milestones.forEach(m => depth(m.id));

  // Group by column, sort within column to minimise edge crossings
  const colGroups = new Map<number, DepMilestone[]>();
  milestones.forEach(m => {
    const col = colMemo.get(m.id) ?? 0;
    const arr = colGroups.get(col) ?? [];
    arr.push(m);
    colGroups.set(col, arr);
  });

  // Sort each column: put critical nodes first, then by phase/title
  colGroups.forEach(arr =>
    arr.sort((a, b) =>
      (b.isCritical ? 1 : 0) - (a.isCritical ? 1 : 0) ||
      (a.phaseName ?? '').localeCompare(b.phaseName ?? '') ||
      a.title.localeCompare(b.title)
    )
  );

  const nodes: LayoutNode[] = [];
  colGroups.forEach((arr, col) => {
    arr.forEach((m, row) => {
      nodes.push({
        ...m,
        col, row,
        x: PAD + col * (NODE_W + COL_GAP),
        y: PAD + row * (NODE_H + ROW_GAP),
      });
    });
  });
  return nodes;
}

/* ─── Component ──────────────────────────────────────────────────────── */
export default function DependencyGraph({
  milestones,
}: {
  milestones: DepMilestone[];
}) {
  const [critOnly, setCritOnly]  = useState(false);
  const [hoverId, setHoverId]    = useState<string | null>(null);
  const [tipPos, setTipPos]      = useState({ x: 0, y: 0 });
  const svgContainerRef          = useRef<HTMLDivElement>(null);

  const shown   = critOnly ? milestones.filter(m => m.isCritical) : milestones;
  const nodes   = useMemo(() => computeLayout(shown), [shown]);
  const byId    = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);
  const hovered = hoverId ? byId.get(hoverId) ?? null : null;

  const svgW = nodes.length ? Math.max(...nodes.map(n => n.x + NODE_W)) + PAD : 480;
  const svgH = nodes.length ? Math.max(...nodes.map(n => n.y + NODE_H)) + PAD : 200;

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    setTipPos({ x: e.clientX + 18, y: e.clientY + 14 });
  }, []);

  function nodeColor(state: string, crit: boolean) {
    return crit ? '#ef4444' : (STATE_COLOR[state] ?? 'rgba(var(--ax-text-rgb),0.3)');
  }

  if (!milestones.length) {
    return (
      <div className="flex items-center justify-center py-12 text-[rgba(232,228,220,0.3)] text-sm">
        No milestones found. Add milestones with planned dates to see the dependency flow.
      </div>
    );
  }

  const depCount  = milestones.reduce((s, m) => s + m.predecessors.length, 0);
  const critCount = milestones.filter(m => m.isCritical).length;
  const maxCol    = nodes.length ? Math.max(...nodes.map(n => n.col)) + 1 : 0;

  return (
    <div className="relative select-none">

      {/* ── Toolbar ───────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-[12.5px] text-[rgba(232,228,220,0.65)] cursor-pointer">
            <input type="checkbox" checked={critOnly} onChange={e => setCritOnly(e.target.checked)}
              className="accent-[#ef4444]" />
            Critical path only
          </label>
          <span className="text-[11.5px] text-[rgba(232,228,220,0.35)]">
            {shown.length} milestones · {depCount} arrows · {maxCol} steps
          </span>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 flex-wrap">
          {[
            { color: STATE_COLOR['DRAFT'],       label: 'Draft' },
            { color: STATE_COLOR['IN_PROGRESS'],  label: 'In Progress' },
            { color: STATE_COLOR['SUBMITTED'],    label: 'Submitted' },
            { color: STATE_COLOR['VERIFIED'],     label: 'Verified' },
            ...(critCount > 0 ? [{ color: '#ef4444', label: 'Critical' }] : []),
          ].map(({ color, label }) => (
            <span key={label} className="flex items-center gap-1.5 text-[11.5px] text-[rgba(232,228,220,0.5)]">
              <span className="w-2.5 h-2.5 rounded-full" style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* ── Hint ──────────────────────────────────────────────────────── */}
      <p className="text-[11px] text-[rgba(232,228,220,0.38)] mb-2">
        Read left to right. Each arrow means the previous milestone must finish before the next one starts.
      </p>

      {/* ── Graph container ───────────────────────────────────────────── */}
      <div
        ref={svgContainerRef}
        className="overflow-auto rounded-xl border border-[rgba(255,255,255,0.07)]"
        style={{ background: 'var(--ax-card)', maxHeight: 500 }}
        onMouseMove={handleMouseMove}
      >
        <svg width={svgW} height={svgH} style={{ display: 'block' }}>
          <defs>
            {/* Grid pattern */}
            <pattern id="dep-grid" width={48} height={48} patternUnits="userSpaceOnUse">
              <path d="M 48 0 L 0 0 0 48" fill="none" stroke="var(--ax-chart-line-faint)" strokeWidth={1} />
            </pattern>
            {/* Arrow markers */}
            <marker id="arr-std" viewBox="0 0 10 10" refX={8} refY={5}
              markerWidth={6} markerHeight={6} orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ax-chart-text-faint)" />
            </marker>
            <marker id="arr-crit" viewBox="0 0 10 10" refX={8} refY={5}
              markerWidth={6} markerHeight={6} orient="auto">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#ef4444" />
            </marker>
          </defs>

          {/* Background */}
          <rect width={svgW} height={svgH} fill="url(#dep-grid)" />

          {/* Column labels (level indicators) */}
          {Array.from(new Set(nodes.map(n => n.col))).map(col => {
            const colNodes = nodes.filter(n => n.col === col);
            const x = PAD + col * (NODE_W + COL_GAP) + NODE_W / 2;
            return (
              <text key={col} x={x} y={14} fontSize={10} fill="var(--ax-chart-text-faint)"
                textAnchor="middle" fontWeight="600">
                STEP {col + 1}
              </text>
            );
          })}

          {/* ── Edges ─────────────────────────────────────────────────── */}
          {nodes.map(to =>
            to.predecessors.map(dep => {
              const from = byId.get(dep.predecessorId);
              if (!from) return null;

              const x1 = from.x + NODE_W;
              const y1 = from.y + NODE_H / 2;
              const x2 = to.x;
              const y2 = to.y + NODE_H / 2;

              const bothCrit = from.isCritical && to.isCritical;

              // Cubic bezier — control points pulled horizontally
              let d: string;
              if (Math.abs(x1 - x2) < 10) {
                // Same column (rare) — bow left
                const bow = -80;
                d = `M ${x1} ${y1} C ${x1 + bow} ${y1} ${x2 + bow} ${y2} ${x2} ${y2}`;
              } else {
                const cp = (x1 + x2) / 2;
                d = `M ${x1} ${y1} C ${cp} ${y1} ${cp} ${y2} ${x2} ${y2}`;
              }

              return (
                <g key={`${dep.predecessorId}→${to.id}`}>
                  <path d={d} fill="none"
                    stroke={bothCrit ? '#ef4444' : 'var(--ax-chart-line)'}
                    strokeWidth={bothCrit ? 2 : 1.5}
                    markerEnd={bothCrit ? 'url(#arr-crit)' : 'url(#arr-std)'}
                  />
                  {/* Dependency type + lag label on edge midpoint */}
                  {(dep.dependencyType !== 'FS' || dep.lagDays !== 0) && (
                    <text
                      x={(x1 + x2) / 2}
                      y={(y1 + y2) / 2 - 5}
                      fontSize={9} textAnchor="middle"
                      fill={bothCrit ? 'rgba(239,68,68,0.7)' : 'rgba(var(--ax-text-rgb),0.3)'}>
                      {dep.dependencyType}{dep.lagDays > 0 ? `+${dep.lagDays}d` : dep.lagDays < 0 ? `${dep.lagDays}d` : ''}
                    </text>
                  )}
                </g>
              );
            })
          )}

          {/* ── Nodes ─────────────────────────────────────────────────── */}
          {nodes.map(node => {
            const color     = nodeColor(node.state, node.isCritical);
            const isHovered = hoverId === node.id;
            const stateLabel = STATE_LABEL[node.state] ?? node.state;
            const stateC    = STATE_COLOR[node.state] ?? 'rgba(var(--ax-text-rgb),0.3)';

            return (
              <g key={node.id}
                onMouseEnter={() => setHoverId(node.id)}
                onMouseLeave={() => setHoverId(null)}
                style={{ cursor: 'default' }}>

                {/* Hover ring */}
                {isHovered && (
                  <rect x={node.x - 4} y={node.y - 4}
                    width={NODE_W + 8} height={NODE_H + 8}
                    rx={12} fill="none"
                    stroke={color} strokeWidth={1.5} opacity={0.45} />
                )}

                {/* Node body */}
                <rect x={node.x} y={node.y} width={NODE_W} height={NODE_H}
                  rx={8}
                  fill={isHovered ? 'var(--ax-card-hover)' : 'var(--ax-card)'}
                  stroke={color}
                  strokeWidth={node.isCritical ? 2 : 1} />

                {/* Left accent bar */}
                <rect x={node.x} y={node.y} width={5} height={NODE_H}
                  rx={4} fill={color} />

                {/* Title — clipped to node width */}
                <clipPath id={`cp-${node.id}`}>
                  <rect x={node.x + 11} y={node.y + 9} width={NODE_W - 18} height={20} />
                </clipPath>
                <text x={node.x + 11} y={node.y + 22}
                  fontSize={12} fontWeight="600" fill="var(--ax-text)"
                  clipPath={`url(#cp-${node.id})`}>
                  {node.title}
                </text>

                {/* State badge */}
                <rect x={node.x + 11} y={node.y + 34}
                  width={70} height={16} rx={3}
                  fill={`${stateC}28`} />
                <text x={node.x + 16} y={node.y + 45}
                  fontSize={9.5} fontWeight="700" fill={stateC}>
                  {stateLabel}
                </text>

                {/* Float or CRITICAL label */}
                {node.isCritical ? (
                  <text x={node.x + 86} y={node.y + 45}
                    fontSize={9} fontWeight="800" fill="#ef4444">
                    CRITICAL
                  </text>
                ) : node.totalFloat !== null ? (
                  <text x={node.x + 86} y={node.y + 45}
                    fontSize={9} fill="var(--ax-chart-text-faint)">
                    F:{node.totalFloat}d
                  </text>
                ) : null}

                {/* Phase tag top-right */}
                {node.phaseName && (
                  <>
                    <clipPath id={`pcp-${node.id}`}>
                      <rect x={node.x + NODE_W - 62} y={node.y + 7} width={56} height={14} />
                    </clipPath>
                    <text x={node.x + NODE_W - 9} y={node.y + 18}
                      fontSize={8.5} fill="var(--ax-chart-text-faint)"
                      textAnchor="end" clipPath={`url(#pcp-${node.id})`}>
                      {node.phaseName}
                    </text>
                  </>
                )}
              </g>
            );
          })}
        </svg>
      </div>

      {/* ── Hover tooltip (fixed position — doesn't clip) ─────────────── */}
      {hovered && (
        <div style={{
          position: 'fixed',
          left: tipPos.x,
          top: tipPos.y,
          zIndex: 9999,
          pointerEvents: 'none',
          background: 'var(--ax-modal)',
          border: '1px solid var(--ax-border)',
          borderRadius: 10,
          padding: '10px 14px',
          minWidth: 210,
          boxShadow: '0 8px 32px rgba(0,0,0,0.6)',
        }}>
          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--ax-text)', marginBottom: 7 }}>
            {hovered.title}
          </div>
          {[
            ['Phase',   hovered.phaseName ?? '—'],
            ['State',   STATE_LABEL[hovered.state] ?? hovered.state],
            ['Vendor',  hovered.vendorName ?? '—'],
            ['Start',   hovered.plannedStart ? format(parseISO(hovered.plannedStart), 'dd MMM yyyy') : '—'],
            ['End',     hovered.plannedEnd   ? format(parseISO(hovered.plannedEnd),   'dd MMM yyyy') : '—'],
            ['Float',   hovered.totalFloat !== null ? `${hovered.totalFloat} days` : '—'],
            ['Depends on', String(hovered.predecessors.length) + ' milestone' + (hovered.predecessors.length !== 1 ? 's' : '')],
          ].map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', gap: 20, marginBottom: 3 }}>
              <span style={{ fontSize: 11.5, color: 'rgba(var(--ax-text-rgb),0.45)', flexShrink: 0 }}>{k}</span>
              <span style={{ fontSize: 11.5, color: 'var(--ax-text)', fontWeight: 500, textAlign: 'right' }}>{v}</span>
            </div>
          ))}
          {hovered.isCritical && (
            <div style={{
              marginTop: 7, paddingTop: 7, borderTop: '1px solid rgba(239,68,68,0.2)',
              fontSize: 11.5, fontWeight: 700, color: '#ef4444',
            }}>
              ● On critical path — any delay shifts project end
            </div>
          )}
          {!hovered.isCritical && hovered.totalFloat !== null && hovered.totalFloat > 0 && (
            <div style={{
              marginTop: 7, paddingTop: 7, borderTop: '1px solid var(--ax-border-subtle)',
              fontSize: 11.5, color: 'rgba(var(--ax-text-rgb),0.45)',
            }}>
              Can slip up to {hovered.totalFloat} days without delaying project
            </div>
          )}
        </div>
      )}
    </div>
  );
}
