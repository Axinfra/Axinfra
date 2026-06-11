'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';

/* ── Types ─────────────────────────────────────────────────────────────── */

export interface VendorKPIs {
  totalMilestones: number;
  completedMilestones: number;
  onTimePct: number;
  avgDelayDays: number;
  avgApprovalCycleDays: number;
  escalationsLast30Days: number;
}

export interface OverviewMilestone {
  id: string; title: string; state: string;
  plannedStart: string | null; plannedEnd: string | null;
  actualEnd: string | null; value: number;
}

export interface GanttMilestone {
  id: string; title: string; state: string; sortOrder: number;
  plannedStart: string | null; plannedEnd: string | null;
  actualStart: string | null; actualEnd: string | null;
  baselinePlannedStart: string | null; baselinePlannedEnd: string | null;
  value: number; vendorId: string | null; vendorName: string | null;
  isCritical: boolean; totalFloat: number | null;
  predecessors: { predecessorId: string; dependencyType: string; lagDays: number }[];
  successors:   { successorId:   string; dependencyType: string; lagDays: number }[];
}

export interface AnalyticsKPIs {
  netScheduleDays: number; totalSavedDays: number; totalOverrunDays: number;
  onTimePct: number; avgApprovalCycleDays: number;
  completedMilestones: number; totalMilestones: number;
}

export interface SCurvePoint { date: string; plannedCumulative: number; actualCumulative: number; }
export interface DelayBucket { bucket: string; count: number; }
export interface OnTimeTrend  { month: string; onTimePct: number; }
export interface ProjectOption { id: string; name: string; }

export interface VendorPortalData {
  projectId: string;
  projectName: string;
  allProjects: ProjectOption[];
  overview: { kpis: VendorKPIs; milestones: OverviewMilestone[] };
  gantt:    { milestones: GanttMilestone[]; cpm: { projectDuration: number; criticalPath: string[]; hasCycle: boolean }; scheduleConfig: unknown };
  analytics:{ kpis: AnalyticsKPIs; sCurve: SCurvePoint[]; delayHistogram: DelayBucket[]; paymentCycleDays: { avg: number }; onTimeTrend: OnTimeTrend[] };
}

interface VendorPortalCtx {
  data: VendorPortalData | null;
  loading: boolean;
  error: string;
  reload: (projectId?: string) => void;
}

/* ── Context ────────────────────────────────────────────────────────────── */

const VendorPortalContext = createContext<VendorPortalCtx>({
  data: null, loading: true, error: '', reload: () => {},
});

export function VendorPortalProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [data, setData]       = useState<VendorPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState('');

  const reload = useCallback(async (pid?: string) => {
    setLoading(true);
    setError('');
    try {
      const url = `/api/vendor/portal?view=all${pid ? `&projectId=${pid}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();

      if (!json.success) {
        if (res.status === 401) { router.push('/auth/login'); return; }
        if (res.status === 403) { setError(json.error ?? 'Access denied'); return; }
        setError(json.error ?? 'Failed to load'); return;
      }

      setData({
        projectId:   json.data.projectId,
        projectName: json.data.projectName,
        allProjects: json.allProjects ?? [],
        overview:    json.data.overview,
        gantt:       json.data.gantt,
        analytics:   json.data.analytics,
      });
    } catch {
      setError('Failed to load vendor portal data');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => { reload(); }, [reload]);

  return (
    <VendorPortalContext.Provider value={{ data, loading, error, reload }}>
      {children}
    </VendorPortalContext.Provider>
  );
}

export function useVendorPortal() {
  return useContext(VendorPortalContext);
}
