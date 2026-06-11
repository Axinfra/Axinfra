'use client';

import { useMemo, useRef, useState } from 'react';
import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import { useVendorPortal } from '@/lib/contexts/VendorPortalContext';
import { Loader2, AlertTriangle, ChevronDown } from 'lucide-react';

const STATE_LABEL: Record<string, string> = {
  DRAFT: 'Draft', IN_PROGRESS: 'In Progress',
  SUBMITTED: 'Submitted', VERIFIED: 'Verified', CLOSED: 'Closed',
};
const STATE_DOT: Record<string, string> = {
  DRAFT: 'rgba(232,228,220,0.3)', IN_PROGRESS: '#3b82f6',
  SUBMITTED: '#f59e0b', VERIFIED: '#22c55e', CLOSED: '#22c55e',
};
const ROW_H = 56;
const LABEL_W = 220;

export default function VendorGanttPage() {
  const { data, loading, error, reload } = useVendorPortal();
  const chartRef = useRef<HTMLDivElement>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const milestones = data?.gantt.milestones ?? [];

  const { minDate, maxDate, totalMs } = useMemo(() => {
    const ts: number[] = [];
    for (const m of milestones) {
      if (m.plannedStart) ts.push(new Date(m.plannedStart).getTime());
      if (m.plannedEnd)   ts.push(new Date(m.plannedEnd).getTime());
      if (m.actualStart)  ts.push(new Date(m.actualStart).getTime());
      if (m.actualEnd)    ts.push(new Date(m.actualEnd).getTime());
    }
    const pad = 5 * 86_400_000;
    if (ts.length === 0) {
      const now = Date.now();
      return { minDate: now - pad, maxDate: now + 90 * 86_400_000 + pad, totalMs: 95 * 86_400_000 };
    }
    const mn = Math.min(...ts) - pad;
    const mx = Math.max(...ts) + pad;
    return { minDate: mn, maxDate: mx, totalMs: mx - mn };
  }, [milestones]);

  const pct = (ts: number) => ((ts - minDate) / totalMs) * 100;
  const bar = (s: string | null, e: string | null) => {
    if (!s || !e) return null;
    const left = pct(new Date(s).getTime());
    const w    = Math.max(pct(new Date(e).getTime()) - left, 0.3);
    return { left: `${left.toFixed(2)}%`, width: `${w.toFixed(2)}%` };
  };

  const monthTicks = useMemo(() => {
    const ticks: { label: string; left: string }[] = [];
    const cur = new Date(minDate); cur.setDate(1); cur.setHours(0, 0, 0, 0);
    while (cur.getTime() <= maxDate) {
      const p = pct(cur.getTime());
      if (p >= 0 && p <= 100) ticks.push({ label: cur.toLocaleDateString('en-GB', { month: 'short', year: '2-digit' }), left: `${p.toFixed(2)}%` });
      cur.setMonth(cur.getMonth() + 1);
    }
    return ticks;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate, maxDate, totalMs]);

  const todayPct = useMemo(() => {
    const p = pct(Date.now());
    return p >= 0 && p <= 100 ? `${p.toFixed(2)}%` : null;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minDate, totalMs]);

  const fmt = (d: string | null) => d ? new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  if (loading) return <Layout><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[rgba(232,228,220,0.35)]" /></div></Layout>;
  if (error)   return <Layout><div className="flex flex-col items-center justify-center py-20 text-center px-4"><AlertTriangle className="w-8 h-8 text-[#e06050] mb-3" /><p className="text-[#e06050] font-semibold">{error}</p></div></Layout>;
  if (!data)   return null;

  const { projectId: _pid, projectName, allProjects, gantt } = data;
  const hasDates = milestones.some(m => m.plannedStart || m.plannedEnd);

  return (
    <Layout>
      <VendorNav projectName={projectName} />
      <div className="space-y-4">

        {allProjects.length > 1 && (
          <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-[rgba(232,228,220,0.45)] uppercase tracking-wider shrink-0">Project</span>
            <div className="relative">
              <select value={data.projectId} onChange={e => reload(e.target.value)}
                className="appearance-none bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.09)] rounded-lg pl-3 pr-8 py-2 text-sm text-[#e8e4dc] outline-none focus:border-[rgba(196,163,90,0.4)] cursor-pointer">
                {allProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[rgba(232,228,220,0.35)] pointer-events-none" />
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="flex items-center gap-4 flex-wrap">
          <span className="text-sm font-semibold text-[#e8e4dc]">Schedule</span>
          <div className="flex items-center gap-4 text-[11.5px] text-[rgba(232,228,220,0.55)] flex-wrap">
            {[['#c4a35a','Planned'],['#3b82f6','Actual']].map(([c,l])=>(
              <span key={l} className="flex items-center gap-1.5"><span className="w-8 h-2.5 rounded-sm inline-block" style={{background:c}}/>{l}</span>
            ))}
            <span className="flex items-center gap-1.5"><span className="w-8 h-2.5 rounded-sm inline-block" style={{outline:'1.5px dashed rgba(196,163,90,0.4)',background:'transparent'}}/>Baseline</span>
            {gantt.cpm.criticalPath.length > 0 && <span className="flex items-center gap-1.5"><span className="w-1 h-3.5 rounded-sm inline-block bg-[#ef4444]"/>Critical</span>}
            {todayPct && <span className="flex items-center gap-1.5"><span className="w-0.5 h-3.5 rounded-sm inline-block bg-[#22c55e]"/>Today</span>}
          </div>
        </div>

        {milestones.length === 0 ? (
          <EmptyState message="No milestones assigned" sub="The project team will assign milestones to your account." />
        ) : !hasDates ? (
          <EmptyState message="No planned dates set" sub="Ask the PMC or project owner to set planned start and end dates on your milestones." />
        ) : (
          <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
            <div className="flex" style={{ minWidth: 700 }}>

              {/* Label column */}
              <div className="shrink-0 border-r border-[rgba(255,255,255,0.07)]" style={{ width: LABEL_W }}>
                <div className="h-9 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] px-4 flex items-center">
                  <span className="text-[10.5px] font-semibold text-[rgba(232,228,220,0.4)] uppercase tracking-wider">Milestone</span>
                </div>
                {milestones.map(m => (
                  <div key={m.id} className="border-b border-[rgba(255,255,255,0.05)] last:border-0 px-4 flex items-center gap-2.5 transition-colors"
                    style={{ height: ROW_H, background: hoveredId === m.id ? 'rgba(255,255,255,0.025)' : 'transparent', borderLeft: m.isCritical ? '3px solid #ef4444' : '3px solid transparent' }}
                    onMouseEnter={() => setHoveredId(m.id)} onMouseLeave={() => setHoveredId(null)}>
                    <div className="w-2 h-2 rounded-full shrink-0" style={{ background: STATE_DOT[m.state] ?? STATE_DOT.DRAFT }} />
                    <div className="min-w-0">
                      <p className="text-[12.5px] font-medium text-[#e8e4dc] truncate leading-tight">{m.title}</p>
                      <p className="text-[10.5px] text-[rgba(232,228,220,0.4)] mt-0.5 leading-tight">
                        {STATE_LABEL[m.state] ?? m.state.replace(/_/g,' ')}
                        {m.isCritical && <span className="ml-1.5 text-[#ef4444] font-semibold">· Critical</span>}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Chart column */}
              <div className="flex-1 overflow-x-auto" ref={chartRef}>
                <div className="relative h-9 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)]" style={{ minWidth: 600 }}>
                  {monthTicks.map((t,i) => (
                    <span key={i} className="absolute top-1/2 -translate-y-1/2 text-[10px] font-medium text-[rgba(232,228,220,0.35)] whitespace-nowrap" style={{ left: t.left, paddingLeft: 4 }}>{t.label}</span>
                  ))}
                  {todayPct && <div className="absolute top-0 bottom-0 w-px" style={{ left: todayPct, background: '#22c55e', opacity: 0.6 }} />}
                </div>

                {milestones.map(m => {
                  const planned  = bar(m.plannedStart, m.plannedEnd);
                  const actual   = bar(m.actualStart, m.actualEnd);
                  const baseline = bar(m.baselinePlannedStart, m.baselinePlannedEnd);
                  const isHov    = hoveredId === m.id;
                  return (
                    <div key={m.id} className="relative border-b border-[rgba(255,255,255,0.05)] last:border-0 transition-colors"
                      style={{ height: ROW_H, minWidth: 600, background: isHov ? 'rgba(255,255,255,0.025)' : 'transparent' }}
                      onMouseEnter={() => setHoveredId(m.id)} onMouseLeave={() => setHoveredId(null)}>
                      {monthTicks.map((t,i) => <div key={i} className="absolute top-0 bottom-0 w-px" style={{ left: t.left, background: 'rgba(255,255,255,0.04)' }} />)}
                      {todayPct && <div className="absolute top-0 bottom-0 w-px z-10" style={{ left: todayPct, background: '#22c55e', opacity: 0.5 }} />}
                      {baseline && <div className="absolute rounded-sm" style={{ left: baseline.left, width: baseline.width, top: 10, height: 10, border: '1.5px dashed rgba(196,163,90,0.35)', background: 'transparent' }} title={`Baseline: ${fmt(m.baselinePlannedStart)} → ${fmt(m.baselinePlannedEnd)}`} />}
                      {planned  && <div className="absolute rounded-sm" style={{ left: planned.left,  width: planned.width,  top: 14, height: 12, background: m.isCritical ? 'rgba(239,68,68,0.75)' : 'rgba(196,163,90,0.8)' }} title={`Planned: ${fmt(m.plannedStart)} → ${fmt(m.plannedEnd)}`} />}
                      {actual   && <div className="absolute rounded-sm" style={{ left: actual.left,   width: actual.width,   top: 30, height: 10, background: 'rgba(59,130,246,0.75)' }} title={`Actual: ${fmt(m.actualStart)} → ${fmt(m.actualEnd)}`} />}
                      {isHov && m.totalFloat !== null && planned && (
                        <div className="absolute text-[10px] font-semibold whitespace-nowrap pointer-events-none z-20"
                          style={{ left: planned.left, top: 3, color: m.totalFloat === 0 ? '#ef4444' : 'rgba(232,228,220,0.5)' }}>
                          {m.totalFloat === 0 ? 'Critical path' : `Float: ${m.totalFloat}d`}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="border-t border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] px-4 py-2 flex items-center justify-between gap-4 flex-wrap">
              <span className="text-[10.5px] text-[rgba(232,228,220,0.35)]">{fmt(new Date(minDate).toISOString())} — {fmt(new Date(maxDate).toISOString())}</span>
              <div className="flex items-center gap-4 text-[10.5px] text-[rgba(232,228,220,0.35)]">
                <span>{milestones.filter(m => m.isCritical).length} critical</span>
                <span>{milestones.filter(m => m.plannedStart).length}/{milestones.length} scheduled</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function EmptyState({ message, sub }: { message: string; sub: string }) {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl flex flex-col items-center justify-center py-16 px-4 text-center">
      <div className="w-10 h-10 rounded-full bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)] flex items-center justify-center mb-3">
        <svg className="w-5 h-5 text-[rgba(232,228,220,0.3)]" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 9v7.5" />
        </svg>
      </div>
      <p className="text-sm font-medium text-[rgba(232,228,220,0.55)]">{message}</p>
      <p className="text-xs text-[rgba(232,228,220,0.35)] mt-1 max-w-xs">{sub}</p>
    </div>
  );
}
