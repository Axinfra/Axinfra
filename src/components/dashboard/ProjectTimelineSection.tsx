'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ExternalLink } from 'lucide-react';
import GanttChart, { type GanttPhase, type GanttMilestone } from '@/components/execution-intelligence/GanttChart';
import ProcurementTimeline from '@/components/execution-intelligence/ProcurementTimeline';
import { jsonFetcher } from '@/lib/fetcher';

interface GanttData {
  milestones: GanttMilestone[];
  phases: GanttPhase[];
  cpm: { hasCycle: boolean; cycleDescription: string | null };
  scheduleConfig: { projectStartDate: string | null } | null;
}

type Track = 'execution' | 'procurement';

/** Combined milestone/phase (Execution) + purchase-order (Procurement) timeline — a pictorial
 * summary so the schedule and BOQ side of the project are visible right from the Dashboard,
 * not just buried in Execution Intelligence. Reuses the exact same GanttChart/ProcurementTimeline
 * components the EI Gantt page uses, just in a condensed, scrollable card. */
export default function ProjectTimelineSection({ projectId }: { projectId: string }) {
  const [track, setTrack] = useState<Track>('execution');

  const { data: ganttData, isLoading } = useSWR<GanttData>(
    projectId ? `/api/execution-intelligence/${projectId}/gantt` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );

  const hasExecutionData = (ganttData?.milestones?.length ?? 0) > 0;

  return (
    <div className="card">
      <div className="card-header flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold">Project Timeline</h2>
          <div className="flex items-center bg-[rgba(255,255,255,0.05)] rounded-lg p-0.5 gap-0.5">
            {(['execution', 'procurement'] as Track[]).map((t) => (
              <button key={t} onClick={() => setTrack(t)}
                className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors
                  ${track === t ? 'bg-[rgba(var(--ax-accent-rgb),0.15)] text-[var(--ax-accent)]' : 'text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc]'}`}>
                {t === 'execution' ? 'Execution' : 'Procurement'}
              </button>
            ))}
          </div>
        </div>
        <Link
          href={`/execution-intelligence/${projectId}/gantt`}
          className="text-[12.5px] font-semibold text-[var(--ax-accent)] hover:underline flex items-center gap-1.5"
        >
          Open Full Gantt <ExternalLink className="w-3.5 h-3.5" />
        </Link>
      </div>
      <div className="card-body p-0">
        {track === 'procurement' ? (
          <div className="p-4 max-h-[420px] overflow-y-auto">
            <ProcurementTimeline projectId={projectId} />
          </div>
        ) : isLoading ? (
          <div className="p-4 space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 rounded-lg bg-[rgba(255,255,255,0.04)] animate-pulse" />
            ))}
          </div>
        ) : hasExecutionData ? (
          <div className="max-h-[420px] overflow-y-auto">
            <GanttChart
              milestones={ganttData!.milestones}
              phases={ganttData!.phases}
              mode="L1"
              viewMode="phase"
              hasCycle={ganttData!.cpm.hasCycle}
              projectStartDate={ganttData?.scheduleConfig?.projectStartDate ?? null}
            />
          </div>
        ) : (
          <div className="py-10 text-center text-[rgba(232,228,220,0.3)] text-sm">
            No milestones with planned dates yet — add them from Milestones or import a schedule.
          </div>
        )}
      </div>
    </div>
  );
}
