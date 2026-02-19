'use client';

import { useRef, useMemo, useState } from 'react';
import { format, parseISO, differenceInDays, addDays, startOfDay } from 'date-fns';

type GanttMode = 'L1' | 'L2' | 'L3' | 'L4';

interface GanttMilestone {
  id: string;
  title: string;
  state: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  baselinePlannedStart: string | null;
  baselinePlannedEnd: string | null;
  value: number;
  vendorId: string | null;
  vendorName: string | null;
  isCritical: boolean;
  totalFloat: number | null;
  predecessors: Array<{ predecessorId: string; dependencyType: string; lagDays: number }>;
}

interface GanttChartProps {
  milestones: GanttMilestone[];
  mode: GanttMode;
  hasCycle: boolean;
  projectStartDate: string | null;
  onDateEdit?: (milestoneId: string, field: 'plannedStart' | 'plannedEnd', value: string) => void;
}

const ROW_HEIGHT = 40;
const LABEL_WIDTH = 200;
const HEADER_HEIGHT = 36;
const BAR_HEIGHT = 14;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT * 2 - 4) / 2;

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { return parseISO(s); } catch { return null; }
}

function clampToRange(x: number, min: number, max: number) {
  return Math.max(min, Math.min(max, x));
}

export default function GanttChart({
  milestones,
  mode,
  hasCycle,
  projectStartDate,
  onDateEdit,
}: GanttChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [editingCell, setEditingCell] = useState<{ id: string; field: 'plannedStart' | 'plannedEnd' } | null>(null);
  const [editValue, setEditValue] = useState('');

  // Compute date range
  const { chartStart, chartEnd, totalDays } = useMemo(() => {
    const dates: Date[] = [];
    const ref = projectStartDate ? toDate(projectStartDate) : null;
    if (ref) dates.push(ref);

    for (const m of milestones) {
      const d1 = toDate(m.plannedStart);
      const d2 = toDate(m.plannedEnd);
      const d3 = toDate(m.actualStart);
      const d4 = toDate(m.actualEnd);
      const d5 = toDate(m.baselinePlannedStart);
      const d6 = toDate(m.baselinePlannedEnd);
      [d1, d2, d3, d4, d5, d6].forEach((d) => { if (d) dates.push(d); });
    }

    if (dates.length === 0) {
      const now = new Date();
      return { chartStart: now, chartEnd: addDays(now, 90), totalDays: 90 };
    }

    const minTime = Math.min(...dates.map((d) => d.getTime()));
    const maxTime = Math.max(...dates.map((d) => d.getTime()));
    const start = addDays(new Date(minTime), -7);
    const end = addDays(new Date(maxTime), 14);
    const total = differenceInDays(end, start);
    return { chartStart: start, chartEnd: end, totalDays: Math.max(total, 30) };
  }, [milestones, projectStartDate]);

  // x position from date
  const chartWidth = Math.max(600, milestones.length > 0 ? 900 : 600);
  const dayWidth = chartWidth / totalDays;

  function xFromDate(d: Date): number {
    return differenceInDays(d, chartStart) * dayWidth;
  }

  function dateFromX(x: number): Date {
    const days = Math.round(x / dayWidth);
    return addDays(chartStart, days);
  }

  // Generate month/week tick marks
  const ticks = useMemo(() => {
    const marks: Array<{ x: number; label: string }> = [];
    let cursor = new Date(chartStart);
    cursor.setDate(1); // start of month
    if (cursor < chartStart) cursor.setMonth(cursor.getMonth() + 1);

    while (cursor <= chartEnd) {
      const x = xFromDate(cursor);
      if (x >= 0 && x <= chartWidth) {
        marks.push({ x, label: format(cursor, 'MMM yy') });
      }
      cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
    }
    return marks;
  }, [chartStart, chartEnd, chartWidth, dayWidth]);

  const svgHeight = HEADER_HEIGHT + milestones.length * ROW_HEIGHT + 20;

  // Today line
  const todayX = xFromDate(new Date());

  // State color
  const stateColor = (state: string, isCritical: boolean) => {
    if (isCritical && (mode === 'L3' || mode === 'L4')) return '#ef4444'; // red-500
    switch (state) {
      case 'VERIFIED': case 'CLOSED': return '#22c55e'; // green-500
      case 'SUBMITTED': return '#f59e0b'; // amber-500
      case 'IN_PROGRESS': return '#3b82f6'; // blue-500
      default: return '#94a3b8'; // slate-400
    }
  };

  const handleBarClick = (m: GanttMilestone, field: 'plannedStart' | 'plannedEnd') => {
    if (mode !== 'L2' || !onDateEdit) return;
    const val = field === 'plannedStart' ? m.plannedStart : m.plannedEnd;
    setEditingCell({ id: m.id, field });
    setEditValue(val ? val.slice(0, 10) : '');
  };

  const commitEdit = () => {
    if (!editingCell || !onDateEdit || !editValue) {
      setEditingCell(null);
      return;
    }
    onDateEdit(editingCell.id, editingCell.field, editValue);
    setEditingCell(null);
  };

  // EV Overlay: schedule performance index per milestone
  function spi(m: GanttMilestone): number | null {
    if (mode !== 'L4') return null;
    if (!m.plannedEnd || !m.plannedStart) return null;
    const totalDuration = differenceInDays(parseISO(m.plannedEnd), parseISO(m.plannedStart));
    if (totalDuration <= 0) return null;
    const today = new Date();
    const elapsed = differenceInDays(today, parseISO(m.plannedStart));
    const bcwp = (['VERIFIED', 'CLOSED'].includes(m.state)) ? totalDuration : Math.min(elapsed, totalDuration);
    const bcws = Math.min(elapsed, totalDuration);
    if (bcws <= 0) return null;
    return Math.round((bcwp / bcws) * 100) / 100;
  }

  return (
    <div className="bg-white border border-surface-200 rounded-xl overflow-hidden">
      {/* Inline date editor */}
      {editingCell && (
        <div className="flex items-center gap-2 px-4 py-2 bg-primary-50 border-b border-primary-200">
          <span className="text-[12px] text-primary-700 font-medium">
            Editing {editingCell.field === 'plannedStart' ? 'planned start' : 'planned end'}
          </span>
          <input
            type="date"
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            className="text-[12px] border border-primary-300 rounded-md px-2 py-1 bg-white focus:outline-none focus:ring-2 focus:ring-primary-400"
            autoFocus
          />
          <button
            onClick={commitEdit}
            className="text-[12px] px-3 py-1 bg-primary-600 text-white rounded-md hover:bg-primary-700"
          >
            Save
          </button>
          <button
            onClick={() => setEditingCell(null)}
            className="text-[12px] px-3 py-1 text-surface-500 hover:text-surface-700"
          >
            Cancel
          </button>
        </div>
      )}

      <div ref={containerRef} className="overflow-x-auto">
        <div style={{ display: 'flex', minWidth: LABEL_WIDTH + chartWidth }}>
          {/* Left: row labels */}
          <div style={{ width: LABEL_WIDTH, flexShrink: 0 }} className="border-r border-surface-200">
            {/* Header spacer */}
            <div style={{ height: HEADER_HEIGHT }} className="border-b border-surface-200 bg-surface-50" />
            {milestones.map((m) => (
              <div
                key={m.id}
                style={{ height: ROW_HEIGHT }}
                className="flex items-center px-3 border-b border-surface-100"
              >
                <div className="min-w-0">
                  <p
                    className={`text-[12px] font-medium truncate ${
                      m.isCritical && mode === 'L3' ? 'text-danger-600' : 'text-surface-800'
                    }`}
                    title={m.title}
                  >
                    {m.isCritical && mode === 'L3' && (
                      <span className="mr-1 text-danger-500">●</span>
                    )}
                    {m.title}
                  </p>
                  {mode === 'L3' && m.totalFloat !== null && (
                    <p className="text-[10px] text-surface-400">
                      Float: {m.totalFloat}d
                    </p>
                  )}
                  {mode === 'L4' && (() => {
                    const s = spi(m);
                    return s !== null ? (
                      <p className={`text-[10px] ${s >= 1 ? 'text-success-600' : 'text-danger-600'}`}>
                        SPI: {s}
                      </p>
                    ) : null;
                  })()}
                  {m.vendorName && (
                    <p className="text-[10px] text-surface-400 truncate">{m.vendorName}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Right: SVG chart */}
          <div style={{ flex: 1, overflowX: 'auto' }}>
            <svg
              width={chartWidth}
              height={svgHeight}
              style={{ display: 'block' }}
            >
              {/* Header background */}
              <rect x={0} y={0} width={chartWidth} height={HEADER_HEIGHT} fill="#f8fafc" />
              <line x1={0} y1={HEADER_HEIGHT} x2={chartWidth} y2={HEADER_HEIGHT} stroke="#e2e8f0" />

              {/* Month ticks */}
              {ticks.map((tick) => (
                <g key={tick.x}>
                  <line x1={tick.x} y1={0} x2={tick.x} y2={svgHeight} stroke="#e2e8f0" strokeWidth={1} />
                  <text x={tick.x + 4} y={HEADER_HEIGHT - 8} fontSize={10} fill="#94a3b8">
                    {tick.label}
                  </text>
                </g>
              ))}

              {/* Today line */}
              {todayX >= 0 && todayX <= chartWidth && (
                <g>
                  <line
                    x1={todayX} y1={HEADER_HEIGHT} x2={todayX} y2={svgHeight}
                    stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="4 3"
                  />
                  <text x={todayX + 3} y={HEADER_HEIGHT - 4} fontSize={9} fill="#3b82f6">
                    Today
                  </text>
                </g>
              )}

              {/* Rows */}
              {milestones.map((m, idx) => {
                const y = HEADER_HEIGHT + idx * ROW_HEIGHT;
                const rowBg = idx % 2 === 0 ? 'transparent' : '#f8fafc';

                // Planned bar
                const ps = toDate(m.plannedStart);
                const pe = toDate(m.plannedEnd);
                const plannedX = ps ? xFromDate(ps) : null;
                const plannedW = ps && pe ? Math.max(8, (xFromDate(pe) - xFromDate(ps))) : null;

                // Actual bar
                const as_ = toDate(m.actualStart);
                const ae = toDate(m.actualEnd);
                const actualX = as_ ? xFromDate(as_) : (ps ? xFromDate(ps) : null);
                const actualW = as_ && ae ? Math.max(8, (xFromDate(ae) - xFromDate(as_))) : null;

                // Baseline bar (L4)
                const bs = toDate(m.baselinePlannedStart);
                const be = toDate(m.baselinePlannedEnd);

                const color = stateColor(m.state, m.isCritical);
                const barY1 = y + BAR_Y_OFFSET;
                const barY2 = barY1 + BAR_HEIGHT + 4;

                return (
                  <g key={m.id}>
                    {/* Row background */}
                    <rect x={0} y={y} width={chartWidth} height={ROW_HEIGHT} fill={rowBg} />
                    <line x1={0} y1={y + ROW_HEIGHT} x2={chartWidth} y2={y + ROW_HEIGHT} stroke="#f1f5f9" />

                    {/* Baseline bar (L4 only) */}
                    {mode === 'L4' && bs && be && (
                      <rect
                        x={xFromDate(bs)}
                        y={barY1}
                        width={Math.max(4, xFromDate(be) - xFromDate(bs))}
                        height={BAR_HEIGHT}
                        fill="#cbd5e1"
                        rx={3}
                        opacity={0.5}
                      />
                    )}

                    {/* Planned bar */}
                    {plannedX !== null && plannedW !== null && (
                      <rect
                        x={plannedX}
                        y={barY1}
                        width={plannedW}
                        height={BAR_HEIGHT}
                        fill={color}
                        fillOpacity={0.3}
                        stroke={color}
                        strokeWidth={1.5}
                        rx={3}
                        style={mode === 'L2' ? { cursor: 'pointer' } : {}}
                        onClick={() => handleBarClick(m, 'plannedEnd')}
                      />
                    )}

                    {/* Actual bar */}
                    {actualX !== null && actualW !== null && (
                      <rect
                        x={actualX}
                        y={barY2}
                        width={actualW}
                        height={BAR_HEIGHT}
                        fill={color}
                        rx={3}
                      />
                    )}

                    {/* No-date milestone: diamond marker */}
                    {!ps && !pe && (
                      <polygon
                        points={`${chartWidth / 2},${barY1} ${chartWidth / 2 + 8},${barY1 + BAR_HEIGHT / 2} ${chartWidth / 2},${barY1 + BAR_HEIGHT} ${chartWidth / 2 - 8},${barY1 + BAR_HEIGHT / 2}`}
                        fill={color}
                        opacity={0.4}
                      />
                    )}

                    {/* Dependency arrows (L3 / L4) */}
                    {(mode === 'L3' || mode === 'L4') &&
                      m.predecessors.map((dep) => {
                        const predIdx = milestones.findIndex((x) => x.id === dep.predecessorId);
                        if (predIdx === -1) return null;
                        const pred = milestones[predIdx];
                        const predPe = toDate(pred.plannedEnd);
                        if (!predPe || !ps) return null;
                        const x1 = xFromDate(predPe);
                        const y1 = HEADER_HEIGHT + predIdx * ROW_HEIGHT + barY1 - y + BAR_HEIGHT / 2 + (HEADER_HEIGHT + predIdx * ROW_HEIGHT);
                        const x2 = xFromDate(ps);
                        const y2 = HEADER_HEIGHT + idx * ROW_HEIGHT + barY1 + BAR_HEIGHT / 2;
                        return (
                          <g key={dep.predecessorId}>
                            <path
                              d={`M ${x1} ${HEADER_HEIGHT + predIdx * ROW_HEIGHT + BAR_Y_OFFSET + BAR_HEIGHT / 2} L ${x2} ${barY1 + BAR_HEIGHT / 2}`}
                              stroke={dep.predecessorId === m.id ? '#ef4444' : '#94a3b8'}
                              strokeWidth={1}
                              fill="none"
                              strokeDasharray="3 2"
                              markerEnd="url(#arrow)"
                            />
                          </g>
                        );
                      })}
                  </g>
                );
              })}

              {/* Arrow marker def */}
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX={10} refY={5} markerWidth={6} markerHeight={6} orient="auto">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                </marker>
              </defs>
            </svg>
          </div>
        </div>
      </div>

      {/* Footer: state legend */}
      <div className="flex items-center flex-wrap gap-4 px-4 py-2.5 border-t border-surface-100 bg-surface-50">
        {[
          { color: '#94a3b8', label: 'Draft' },
          { color: '#3b82f6', label: 'In Progress' },
          { color: '#f59e0b', label: 'Submitted' },
          { color: '#22c55e', label: 'Verified/Closed' },
          ...(mode === 'L3' || mode === 'L4' ? [{ color: '#ef4444', label: 'Critical' }] : []),
        ].map((item) => (
          <span key={item.label} className="flex items-center gap-1.5 text-[11px] text-surface-500">
            <span className="inline-block w-3 h-3 rounded-sm" style={{ background: item.color }} />
            {item.label}
          </span>
        ))}
        <span className="text-[11px] text-surface-400 ml-auto">
          Top bar = Planned &nbsp; Bottom bar = Actual
          {mode === 'L4' && ' &nbsp; Gray = Baseline'}
        </span>
      </div>
    </div>
  );
}
