'use client';

import useSWR from 'swr';
import { format, parseISO, differenceInDays, addDays, startOfDay } from 'date-fns';
import { CheckCircle2 } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';

interface OrderBOQ {
  id: string;
  status: string;
  itemsCount: number;
}
interface Order {
  id: string;
  name: string;
  sortOrder: number;
  plannedStart: string | null;
  plannedEnd: string | null;
  boqs: OrderBOQ[];
}

// A Purchase Order can now have multiple BOQs — roll them up into one status for the timeline
// bar, prioritizing whichever needs the most attention.
const STATUS_PRIORITY = ['REVISED', 'PENDING_APPROVAL', 'DRAFT', 'APPROVED'];
function rollupStatus(boqs: OrderBOQ[]): string {
  if (boqs.length === 0) return 'NONE';
  const statuses = new Set(boqs.map((b) => b.status));
  return STATUS_PRIORITY.find((s) => statuses.has(s)) ?? boqs[0].status;
}

const STATUS_COLORS: Record<string, string> = {
  APPROVED: '#22c55e',
  PENDING_APPROVAL: '#eab308',
  REVISED: '#f97316',
  DRAFT: 'rgba(232,228,220,0.35)',
  NONE: 'rgba(232,228,220,0.2)',
};
const STATUS_LABELS: Record<string, string> = {
  APPROVED: 'Approved',
  PENDING_APPROVAL: 'Pending Approval',
  REVISED: 'Needs Revision',
  DRAFT: 'Draft',
  NONE: 'No BOQ',
};

function toDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  try { return parseISO(s); } catch { return null; }
}

const LABEL_W = 272;
const ROW_H = 52;
const HEADER_H = 44;
const BAR_H = 22;

/** Procurement timeline — one bar per Purchase Order (top-level Phase + its BOQ), colored by
 * BOQ approval status. Mirrors GanttChart's date-axis mechanics but stays intentionally simple
 * since orders have no dependencies/critical path, just planned dates + BOQ lifecycle. */
export default function ProcurementTimeline({ projectId }: { projectId: string }) {
  const { data: orders = [], isLoading } = useSWR<Order[]>(
    projectId ? `/api/projects/${projectId}/phases` : null,
    jsonFetcher,
  );

  if (isLoading) {
    return (
      <div className="bg-[#0b0b0f] border border-[rgba(255,255,255,0.08)] rounded-xl py-20 text-center">
        <p className="text-[rgba(232,228,220,0.35)] text-sm">Loading procurement timeline…</p>
      </div>
    );
  }

  const withDates = orders.filter((o) => o.plannedStart || o.plannedEnd);

  if (orders.length === 0) {
    return (
      <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl py-20 text-center">
        <div className="text-4xl mb-3 opacity-30">📦</div>
        <p className="text-[rgba(232,228,220,0.45)] text-sm font-medium mb-1">No purchase orders yet</p>
        <p className="text-[rgba(232,228,220,0.3)] text-xs">Add purchase orders from the project Overview to see the procurement timeline.</p>
      </div>
    );
  }

  const sorted = [...orders].sort((a, b) => a.sortOrder - b.sortOrder);

  const dates: Date[] = [];
  withDates.forEach((o) => {
    const s = toDate(o.plannedStart);
    const e = toDate(o.plannedEnd);
    if (s) dates.push(s);
    if (e) dates.push(e);
  });

  const now = new Date();
  const chartStart = dates.length ? addDays(new Date(Math.min(...dates.map((d) => d.getTime()))), -14) : now;
  const chartEndRaw = dates.length ? addDays(new Date(Math.max(...dates.map((d) => d.getTime()))), 28) : addDays(now, 120);
  const totalDays = Math.max(differenceInDays(chartEndRaw, chartStart), 60);
  const chartEnd = addDays(chartStart, totalDays);

  const MIN_CHART_W = 800;
  const PX_PER_DAY = Math.max(MIN_CHART_W / totalDays, 5);
  const chartWidth = Math.ceil(totalDays * PX_PER_DAY);
  const xFrom = (d: Date) => differenceInDays(d, chartStart) * PX_PER_DAY;

  const monthTicks: { x: number; label: string }[] = [];
  let cur = new Date(chartStart.getFullYear(), chartStart.getMonth(), 1);
  while (cur <= chartEnd) {
    const x = xFrom(cur);
    if (x >= 0 && x <= chartWidth) monthTicks.push({ x, label: format(cur, totalDays > 200 ? 'MMM yy' : 'MMM yyyy') });
    cur = new Date(cur.getFullYear(), cur.getMonth() + 1, 1);
  }

  const todayX = xFrom(startOfDay(now));
  const bodyH = sorted.length * ROW_H + 8;

  return (
    <div className="flex flex-col bg-[#0b0b0f] border border-[rgba(255,255,255,0.08)] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] flex-wrap">
        <span className="text-[11.5px] text-[rgba(232,228,220,0.5)] font-medium">
          Purchase order timeline, colored by BOQ approval status
        </span>
        <span className="text-[11px] text-[rgba(232,228,220,0.35)]">{sorted.length} purchase orders</span>
      </div>

      <div className="flex min-w-0 overflow-x-auto">
        <div style={{ width: LABEL_W, flexShrink: 0, position: 'sticky', left: 0, zIndex: 20 }}
          className="bg-[#0b0b0f] border-r border-[rgba(255,255,255,0.08)] flex flex-col">
          <div style={{ height: HEADER_H }} className="flex items-end px-4 pb-2 border-b border-[rgba(255,255,255,0.08)] bg-[#13151a] shrink-0">
            <span className="text-[10.5px] font-semibold text-[rgba(232,228,220,0.4)] uppercase tracking-wider">Purchase Order</span>
          </div>
          {sorted.map((o) => {
            const status = rollupStatus(o.boqs);
            const color = STATUS_COLORS[status] ?? STATUS_COLORS.NONE;
            const itemsCount = o.boqs.reduce((sum, b) => sum + b.itemsCount, 0);
            return (
              <div key={o.id} style={{ height: ROW_H }}
                className="flex flex-col justify-center gap-1 px-4 border-b border-[rgba(255,255,255,0.05)] shrink-0">
                <span className="text-[12.5px] font-medium text-[#e8e4dc] truncate" title={o.name}>{o.name}</span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold w-fit px-1.5 py-0.5 rounded"
                  style={{ background: `${color}22`, color }}>
                  {status === 'APPROVED' && <CheckCircle2 className="w-2.5 h-2.5" />}
                  {STATUS_LABELS[status] ?? status}
                  {o.boqs.length > 0 && ` · ${o.boqs.length} BOQ${o.boqs.length > 1 ? 's' : ''} · ${itemsCount} items`}
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex-1 min-w-0 flex flex-col">
          <div style={{ height: HEADER_H }} className="bg-[#13151a] border-b border-[rgba(255,255,255,0.08)] shrink-0">
            <svg width={chartWidth} height={HEADER_H} style={{ display: 'block' }}>
              {monthTicks.map((t, i) => (
                <g key={i}>
                  <line x1={t.x} y1={0} x2={t.x} y2={HEADER_H} stroke="var(--ax-chart-line-strong)" />
                  <text x={t.x + 7} y={HEADER_H - 10} fontSize={11} fontWeight="600" fill="var(--ax-chart-text)">{t.label}</text>
                </g>
              ))}
              {todayX >= 0 && todayX <= chartWidth && (
                <g>
                  <line x1={todayX} y1={0} x2={todayX} y2={HEADER_H} stroke="#3b82f6" strokeWidth={2} opacity={0.9} />
                  <rect x={todayX - 20} y={4} width={40} height={18} rx={5} fill="#3b82f6" />
                  <text x={todayX} y={17} fontSize={9.5} fill="white" textAnchor="middle" fontWeight="700">Today</text>
                </g>
              )}
            </svg>
          </div>

          <div className="flex-1 overflow-y-visible">
            <svg width={chartWidth} height={bodyH} style={{ display: 'block' }}>
              {monthTicks.map((t, i) => (
                <line key={i} x1={t.x} y1={0} x2={t.x} y2={bodyH} stroke="var(--ax-chart-line)" />
              ))}
              {todayX >= 0 && todayX <= chartWidth && (
                <line x1={todayX} y1={0} x2={todayX} y2={bodyH} stroke="#3b82f6" strokeWidth={1.5} strokeDasharray="6 4" opacity={0.7} />
              )}
              {sorted.map((o, i) => {
                const y = i * ROW_H;
                const status = rollupStatus(o.boqs);
                const color = STATUS_COLORS[status] ?? STATUS_COLORS.NONE;
                const s = toDate(o.plannedStart);
                const e = toDate(o.plannedEnd);
                const barY = y + (ROW_H - BAR_H) / 2;

                return (
                  <g key={o.id}>
                    <rect x={0} y={y} width={chartWidth} height={ROW_H} fill={i % 2 === 0 ? 'transparent' : 'var(--ax-chart-row-alt)'} />
                    <line x1={0} y1={y + ROW_H} x2={chartWidth} y2={y + ROW_H} stroke="var(--ax-chart-line-row)" />
                    {s && e ? (
                      <g>
                        <rect x={xFrom(s)} y={barY} width={Math.max(10, xFrom(e) - xFrom(s))} height={BAR_H}
                          rx={5} fill={color} fillOpacity={0.28} stroke={color} strokeWidth={1.5} />
                        <text x={xFrom(s) + 4} y={barY - 4} fontSize={9} fill={`${color}bb`}>{format(s, 'MMM d')}</text>
                        <text x={xFrom(e) - 4} y={barY - 4} fontSize={9} fill={`${color}bb`} textAnchor="end">{format(e, 'MMM d')}</text>
                      </g>
                    ) : (
                      <text x={16} y={barY + BAR_H / 2 + 4} fontSize={11} fill="rgba(232,228,220,0.3)">No planned dates</text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      <div className="flex items-center flex-wrap gap-4 px-4 py-2.5 border-t shrink-0" style={{ borderColor: 'var(--ax-border)', backgroundColor: 'var(--ax-overlay)' }}>
        {(['DRAFT', 'PENDING_APPROVAL', 'REVISED', 'APPROVED'] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[11px] text-[rgba(232,228,220,0.5)]">
            <span className="w-5 h-2.5 rounded-sm inline-block" style={{ background: STATUS_COLORS[s], opacity: 0.75 }} />
            {STATUS_LABELS[s]}
          </span>
        ))}
      </div>
    </div>
  );
}
