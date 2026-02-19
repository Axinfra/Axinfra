'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import EINav from '@/components/execution-intelligence/EINav';
import GanttChart from '@/components/execution-intelligence/GanttChart';

interface ProjectInfo {
  name: string;
  myRole: string;
}

interface GanttMilestone {
  id: string;
  title: string;
  state: string;
  sortOrder: number;
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

interface GanttData {
  milestones: GanttMilestone[];
  cpm: {
    projectDuration: number;
    criticalPath: string[];
    hasCycle: boolean;
    cycleDescription: string | null;
  };
  scheduleConfig: {
    projectStartDate: string | null;
  } | null;
}

type GanttMode = 'L1' | 'L2' | 'L3' | 'L4';

export default function GanttPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [ganttData, setGanttData] = useState<GanttData | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<GanttMode>('L1');
  const [showCriticalOnly, setShowCriticalOnly] = useState(false);
  const [filterVendor, setFilterVendor] = useState<string>('');

  const load = useCallback(async () => {
    const [projRes, ganttRes] = await Promise.all([
      fetch(`/api/projects/${projectId}`),
      fetch(`/api/execution-intelligence/${projectId}/gantt`),
    ]);
    const [projData, ganttJson] = await Promise.all([projRes.json(), ganttRes.json()]);
    if (projData.success) setProjectInfo({ name: projData.data.name, myRole: projData.data.myRole });
    if (ganttJson.success) setGanttData(ganttJson.data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const role = projectInfo?.myRole ?? '';
  const canEdit = role === 'OWNER' || role === 'PMC';

  // Unique vendors for filter
  const vendors = ganttData
    ? Array.from(
        new Map(
          ganttData.milestones
            .filter((m) => m.vendorId)
            .map((m) => [m.vendorId, m.vendorName]),
        ).entries(),
      )
    : [];

  const filteredMilestones = (ganttData?.milestones ?? []).filter((m) => {
    if (showCriticalOnly && !m.isCritical) return false;
    if (filterVendor && m.vendorId !== filterVendor) return false;
    return true;
  });

  const handleDateEdit = async (milestoneId: string, field: 'plannedStart' | 'plannedEnd', value: string) => {
    await fetch(`/api/execution-intelligence/${projectId}/milestones/${milestoneId}/planned-dates`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [field]: value }),
    });
    load();
  };

  return (
    <Layout>
      <EINav projectId={projectId} projectName={projectInfo?.name ?? '...'} role={role} />

      <div className="space-y-4">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Mode selector */}
          <div className="flex items-center bg-surface-100 rounded-lg p-0.5">
            {(['L1', 'L2', 'L3', 'L4'] as GanttMode[]).map((m) => {
              const labels: Record<GanttMode, string> = {
                L1: 'Timeline',
                L2: 'Edit Dates',
                L3: 'Critical Path',
                L4: 'EV Overlay',
              };
              const disabled = !canEdit && (m === 'L2');
              return (
                <button
                  key={m}
                  onClick={() => !disabled && setMode(m)}
                  disabled={disabled}
                  title={disabled ? 'Only Owner/PMC can edit planned dates' : undefined}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-colors
                    ${mode === m ? 'bg-white text-surface-900 shadow-xs' : 'text-surface-500 hover:text-surface-700'}
                    ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                >
                  {labels[m]}
                </button>
              );
            })}
          </div>

          {/* Filters */}
          <div className="flex items-center gap-2 ml-auto">
            {vendors.length > 1 && (
              <select
                value={filterVendor}
                onChange={(e) => setFilterVendor(e.target.value)}
                className="text-[12px] border border-surface-200 rounded-lg px-3 py-1.5 bg-white text-surface-700 focus:outline-none focus:ring-2 focus:ring-primary-300"
              >
                <option value="">All Vendors</option>
                {vendors.map(([id, name]) => (
                  <option key={id} value={id ?? ''}>{name}</option>
                ))}
              </select>
            )}
            <label className="flex items-center gap-2 text-[12px] text-surface-600 cursor-pointer">
              <input
                type="checkbox"
                checked={showCriticalOnly}
                onChange={(e) => setShowCriticalOnly(e.target.checked)}
                className="rounded border-surface-300 text-primary-600"
              />
              Critical only
            </label>
          </div>
        </div>

        {/* CPM cycle warning */}
        {ganttData?.cpm.hasCycle && (
          <div className="flex items-center gap-3 px-4 py-3 bg-danger-50 border border-danger-200 rounded-xl text-[13px] text-danger-700">
            <AlertCircleIcon className="w-4 h-4 shrink-0" />
            <span><strong>Dependency cycle detected.</strong> {ganttData.cpm.cycleDescription} CPM is disabled until the cycle is resolved.</span>
          </div>
        )}

        {/* Gantt chart */}
        {loading ? (
          <GanttSkeleton />
        ) : filteredMilestones.length === 0 ? (
          <EmptyGantt />
        ) : (
          <GanttChart
            milestones={filteredMilestones}
            mode={mode}
            hasCycle={ganttData?.cpm.hasCycle ?? false}
            projectStartDate={ganttData?.scheduleConfig?.projectStartDate ?? null}
            onDateEdit={canEdit && mode === 'L2' ? handleDateEdit : undefined}
          />
        )}

        {/* Mode legend */}
        <div className="flex flex-wrap gap-4 text-[11px] text-surface-400">
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-2 rounded-full bg-primary-200" /> Planned
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-2 rounded-full bg-success-400" /> Actual
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-2 rounded-full bg-danger-400" /> Critical
          </span>
          <span className="flex items-center gap-1.5">
            <span className="inline-block w-8 h-2 rounded-full bg-surface-300" /> Baseline
          </span>
        </div>
      </div>
    </Layout>
  );
}

function GanttSkeleton() {
  return (
    <div className="bg-white border border-surface-200 rounded-xl overflow-hidden">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center border-b border-surface-100 px-4 py-3 gap-4">
          <div className="h-3 w-32 rounded bg-surface-100 animate-pulse" />
          <div className="flex-1 h-5 rounded bg-surface-100 animate-pulse" style={{ width: `${30 + i * 10}%` }} />
        </div>
      ))}
    </div>
  );
}

function EmptyGantt() {
  return (
    <div className="bg-white border border-surface-200 rounded-xl py-16 text-center">
      <p className="text-surface-400 text-sm">No milestones with planned dates found.</p>
      <p className="text-surface-400 text-xs mt-1">Add planned start/end dates to milestones to see them here.</p>
    </div>
  );
}

function AlertCircleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
    </svg>
  );
}
