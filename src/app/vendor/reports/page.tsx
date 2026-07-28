'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { GitCompare, HardHat, ChevronRight, Loader2 } from 'lucide-react';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import VendorGanttChart from '@/components/vendor/VendorGanttChart';
import VendorPerformanceCharts from '@/components/vendor/VendorPerformanceCharts';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';
import { jsonFetcher } from '@/lib/fetcher';
import type { GanttMilestone, AnalyticsKPIs, SCurvePoint, DelayBucket, OnTimeTrend, PaymentCycleDays } from '@/lib/contexts/VendorPortalContext';

interface VendorProject { id: string; name: string }
interface Variance { id: string }
interface WorkOrderRow { id: string; needsAcceptance: boolean }

interface VendorPortalAllData {
  projectName: string;
  gantt: { milestones: GanttMilestone[]; cpm: { criticalPath: string[] } };
  analytics: {
    kpis: AnalyticsKPIs;
    sCurve: SCurvePoint[];
    delayHistogram: DelayBucket[];
    paymentCycleDays: PaymentCycleDays;
    onTimeTrend: OnTimeTrend[];
  };
}

/** Reports hub — desktop-style, full width (reached from the sidebar, same as PMC/Client
 * pages). Pick a project, see its Schedule and Performance charts inline. Bill Variances and
 * Work Orders sit above as compact link cards since those already span every project the
 * vendor is on, not just the one selected below. */
export default function VendorReportsPage() {
  const { data: projects, isLoading: projectsLoading } = useSWR<VendorProject[]>('/api/vendor/projects', jsonFetcher);
  const [selectedProjectId, setSelectedProjectId] = useState('');

  useEffect(() => {
    if (!selectedProjectId && projects && projects.length > 0) {
      setSelectedProjectId(projects[0].id);
    }
  }, [projects, selectedProjectId]);

  const { data: variances } = useSWR<Variance[]>('/api/vendor/variances', jsonFetcher);
  const { data: workOrders } = useSWR<WorkOrderRow[]>('/api/vendor/work-orders', jsonFetcher);
  const needsAcceptanceCount = (workOrders ?? []).filter((w) => w.needsAcceptance).length;

  const { data: portalData, isLoading: chartsLoading } = useSWR<VendorPortalAllData>(
    selectedProjectId ? `/api/vendor/portal?view=all&projectId=${selectedProjectId}` : null,
    jsonFetcher,
  );

  if (projectsLoading) {
    return <Layout><TablePageSkeleton /></Layout>;
  }

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>Reports</h1>

        {!projects || projects.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12">
              <p className="text-lg font-semibold mb-2" style={{ color: 'var(--ax-text)' }}>No projects yet</p>
              <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.45)' }}>
                You haven&apos;t been added as a vendor on any project yet.
              </p>
            </div>
          </div>
        ) : (
          <>
            {/* Cross-project links */}
            <div className="grid gap-4 sm:grid-cols-2">
              <Link href="/vendor/reports/variance" className="card hover:shadow-none transition-shadow block">
                <div className="card-body flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(249,115,22,0.15)' }}>
                    <GitCompare className="w-6 h-6" style={{ color: '#f97316' }} strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ color: 'var(--ax-text)' }}>Bill Variances</p>
                    <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>
                      {variances?.length ?? 0} bill{(variances?.length ?? 0) === 1 ? '' : 's'} edited by Site Engineer
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
                </div>
              </Link>
              <Link href="/vendor/reports/work-orders" className="card hover:shadow-none transition-shadow block">
                <div className="card-body flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={{ background: 'rgba(234,179,8,0.15)' }}>
                    <HardHat className="w-6 h-6" style={{ color: '#eab308' }} strokeWidth={2.25} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold" style={{ color: 'var(--ax-text)' }}>Work Orders</p>
                    <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>
                      {needsAcceptanceCount > 0 ? `${needsAcceptanceCount} need${needsAcceptanceCount === 1 ? 's' : ''} your acceptance` : 'All up to date'}
                    </p>
                  </div>
                  <ChevronRight className="w-5 h-5 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
                </div>
              </Link>
            </div>

            {/* Project selector */}
            <div className="card">
              <div className="card-body flex items-center gap-3 flex-wrap">
                <label className="text-xs font-medium uppercase tracking-wider shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>Project</label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  className="input text-sm max-w-xs"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {chartsLoading || !portalData ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }} />
              </div>
            ) : (
              <div className="space-y-8">
                <div>
                  <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--ax-text)' }}>Schedule</h2>
                  <VendorGanttChart milestones={portalData.gantt.milestones} criticalPathLength={portalData.gantt.cpm.criticalPath.length} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold mb-3" style={{ color: 'var(--ax-text)' }}>Performance</h2>
                  <VendorPerformanceCharts
                    kpis={portalData.analytics.kpis}
                    sCurve={portalData.analytics.sCurve}
                    delayHistogram={portalData.analytics.delayHistogram}
                    paymentCycleDays={portalData.analytics.paymentCycleDays}
                    onTimeTrend={portalData.analytics.onTimeTrend}
                  />
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </Layout>
  );
}
