'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import EINav from '@/components/execution-intelligence/EINav';
import GanttChart, { type GanttMode, type GanttPhase, type GanttMilestone } from '@/components/execution-intelligence/GanttChart';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface GanttData {
  milestones: GanttMilestone[];
  phases: GanttPhase[];
  cpm: {
    projectDuration: number;
    criticalPath: string[];
    hasCycle: boolean;
    cycleDescription: string | null;
  };
  scheduleConfig: { projectStartDate: string | null } | null;
}

type ViewMode = 'phase' | 'flat';

const MODE_LABELS: Record<GanttMode, { short: string; desc: string }> = {
  L1: { short: 'Timeline',      desc: 'View planned & actual bars' },
  L2: { short: 'Edit Dates',    desc: 'Click bars to edit planned dates' },
  L3: { short: 'Critical Path', desc: 'Highlight critical chain + float' },
  L4: { short: 'EV Overlay',    desc: 'Schedule Performance Index (SPI)' },
};

export default function GanttPage() {
  const params    = useParams();
  const projectId = params.projectId as string;

  const [mode, setMode]             = useState<GanttMode>('L1');
  const [viewMode, setViewMode]     = useState<ViewMode>('phase');
  const [criticalOnly, setCriticalOnly] = useState(false);
  const [filterVendor, setFilterVendor] = useState('');

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '…';
  const role        = project?.myRole ?? '';
  const canEdit     = role === 'CLIENT' || role === 'PMC';

  const { data: ganttData, isLoading: ganttLoading, mutate: refetch } = useSWR<GanttData>(
    projectId ? `/api/execution-intelligence/${projectId}/gantt` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 30_000 },
  );

  const loading = projectLoading || ganttLoading;

  /* ── Unique vendors for filter ──────────────────────────────────────── */
  const vendors = ganttData
    ? Array.from(new Map(
        ganttData.milestones.filter(m => m.vendorId).map(m => [m.vendorId, m.vendorName])
      ).entries())
    : [];

  /* ── Apply filters ──────────────────────────────────────────────────── */
  const filteredMs = (ganttData?.milestones ?? []).filter(m => {
    if (criticalOnly && !m.isCritical) return false;
    if (filterVendor && m.vendorId !== filterVendor) return false;
    return true;
  });

  const phases = ganttData?.phases ?? [];

  /* ── Date edit handler ──────────────────────────────────────────────── */
  const handleDateEdit = async (msId: string, field: 'plannedStart' | 'plannedEnd', value: string) => {
    await fetch(`/api/execution-intelligence/${projectId}/milestones/${msId}/planned-dates`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    void refetch();
  };

  /* ── CPM summary stats ──────────────────────────────────────────────── */
  const cpm = ganttData?.cpm;
  const criticalCount = cpm?.criticalPath.length ?? 0;
  const totalMs       = filteredMs.length;
  const doneMs        = filteredMs.filter(m => m.state === 'VERIFIED' || m.state === 'CLOSED').length;

  return (
    <Layout>
      <EINav projectId={projectId} projectName={projectName} role={role} />

      <div className="space-y-4">

        {/* ── Toolbar ───────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-start gap-3">

          {/* Mode selector */}
          <div className="flex items-center bg-[rgba(255,255,255,0.05)] rounded-xl p-1 gap-0.5">
            {(['L1', 'L2', 'L3', 'L4'] as GanttMode[]).map(m => {
              const disabled = !canEdit && m === 'L2';
              return (
                <button key={m}
                  onClick={() => !disabled && setMode(m)}
                  disabled={disabled}
                  title={disabled ? 'Owner/PMC only' : MODE_LABELS[m].desc}
                  className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors
                    ${mode === m ? 'bg-[rgba(var(--ax-accent-rgb),0.15)] text-[var(--ax-accent)]' : 'text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc]'}
                    ${disabled ? 'opacity-35 cursor-not-allowed' : ''}`}>
                  {MODE_LABELS[m].short}
                </button>
              );
            })}
          </div>

          {/* View mode toggle */}
          <div className="flex items-center bg-[rgba(255,255,255,0.05)] rounded-xl p-1 gap-0.5">
            {(['phase', 'flat'] as ViewMode[]).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                className={`px-3 py-1.5 rounded-lg text-[12.5px] font-medium transition-colors
                  ${viewMode === v ? 'bg-[rgba(96,165,250,0.15)] text-[#60a5fa]' : 'text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc]'}`}>
                {v === 'phase' ? '⊞ Phase View' : '≡ Flat View'}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-3 ml-auto flex-wrap">
            {vendors.length > 1 && (
              <select value={filterVendor} onChange={e => setFilterVendor(e.target.value)}
                className="text-[12.5px] border border-[rgba(255,255,255,0.08)] rounded-lg px-3 py-1.5 bg-[rgba(255,255,255,0.04)] text-[#e8e4dc] outline-none">
                <option value="">All Vendors</option>
                {vendors.map(([id, name]) => <option key={id} value={id ?? ''}>{name}</option>)}
              </select>
            )}
            <label className="flex items-center gap-2 text-[12.5px] text-[rgba(232,228,220,0.6)] cursor-pointer select-none">
              <input type="checkbox" checked={criticalOnly} onChange={e => setCriticalOnly(e.target.checked)}
                className="rounded border-[rgba(255,255,255,0.15)] accent-[var(--ax-accent)]" />
              Critical only
            </label>
          </div>
        </div>

        {/* ── Summary bar ───────────────────────────────────────────────── */}
        {!loading && ganttData && (
          <div className="flex flex-wrap gap-3">
            {[
              { label: 'Phases',     value: phases.length,   color: 'var(--ax-accent)' },
              { label: 'Milestones', value: totalMs,          color: 'var(--ax-text)' },
              { label: 'Completed',  value: `${doneMs}/${totalMs}`, color: '#22c55e' },
              { label: 'Critical',   value: criticalCount,   color: '#ef4444' },
              { label: 'Duration',   value: cpm?.projectDuration ? `${cpm.projectDuration}d` : '—', color: '#60a5fa' },
            ].map(({ label, value, color }) => (
              <div key={label} className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[rgba(255,255,255,0.04)] border border-[rgba(255,255,255,0.07)]">
                <span className="text-[11px] text-[rgba(232,228,220,0.45)] font-medium">{label}</span>
                <span className="text-[13px] font-bold" style={{ color }}>{value}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── CPM cycle warning ─────────────────────────────────────────── */}
        {ganttData?.cpm.hasCycle && (
          <div className="flex items-start gap-3 px-4 py-3 bg-[rgba(239,68,68,0.08)] border border-[rgba(239,68,68,0.25)] rounded-xl text-[13px] text-[#f87171]">
            <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span><strong>Dependency cycle detected.</strong> {ganttData.cpm.cycleDescription} CPM is disabled until resolved.</span>
          </div>
        )}

        {/* ── Chart ─────────────────────────────────────────────────────── */}
        {loading ? (
          <GanttSkeleton />
        ) : filteredMs.length === 0 ? (
          <EmptyState hasPhases={phases.length > 0} />
        ) : (
          <GanttChart
            milestones={filteredMs}
            phases={phases}
            mode={mode}
            viewMode={viewMode}
            hasCycle={ganttData?.cpm.hasCycle ?? false}
            projectStartDate={ganttData?.scheduleConfig?.projectStartDate ?? null}
            onDateEdit={canEdit && mode === 'L2' ? handleDateEdit : undefined}
          />
        )}

        {/* ── Mode info callout ─────────────────────────────────────────── */}
        <div className="text-[11.5px] text-[rgba(232,228,220,0.35)] flex items-center gap-2">
          <span className="font-semibold text-[rgba(232,228,220,0.5)]">{MODE_LABELS[mode].short}:</span>
          {MODE_LABELS[mode].desc}
        </div>

      </div>
    </Layout>
  );
}

function GanttSkeleton() {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl overflow-hidden">
      <div className="h-12 border-b border-[rgba(255,255,255,0.07)] bg-[rgba(255,255,255,0.02)] animate-pulse" />
      {[54, 42, 42, 42, 54, 42, 42].map((h, i) => (
        <div key={i} className="flex items-center border-b border-[rgba(255,255,255,0.05)] px-4 gap-4 animate-pulse"
          style={{ height: h }}>
          <div className="h-3 rounded bg-[rgba(255,255,255,0.06)]" style={{ width: 80 + i * 20 }} />
          <div className="flex-1 h-4 rounded bg-[rgba(255,255,255,0.04)]" style={{ marginLeft: i % 3 === 0 ? 0 : 40 }} />
        </div>
      ))}
    </div>
  );
}

function EmptyState({ hasPhases }: { hasPhases: boolean }) {
  return (
    <div className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl py-20 text-center">
      <div className="text-4xl mb-3 opacity-30">📅</div>
      <p className="text-[rgba(232,228,220,0.45)] text-sm font-medium mb-1">No milestones with planned dates</p>
      <p className="text-[rgba(232,228,220,0.3)] text-xs">
        {hasPhases
          ? 'Add planned start/end dates to milestones to see them on the Gantt chart.'
          : 'Create phases and milestones with planned dates to visualise the project timeline.'}
      </p>
    </div>
  );
}
