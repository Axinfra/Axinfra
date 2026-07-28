'use client';

import Layout from '@/components/Layout';
import VendorNav from '@/components/vendor/VendorNav';
import VendorGanttChart from '@/components/vendor/VendorGanttChart';
import { useVendorPortal } from '@/lib/contexts/VendorPortalContext';
import { Loader2, AlertTriangle } from 'lucide-react';

export default function VendorGanttPage() {
  const { data, loading, error, reload } = useVendorPortal();

  if (loading) return <Layout><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-[rgba(var(--ax-text-rgb),0.35)]" /></div></Layout>;
  if (error)   return <Layout><div className="flex flex-col items-center justify-center py-20 text-center px-4"><AlertTriangle className="w-8 h-8 text-[#e06050] mb-3" /><p className="text-[#e06050] font-semibold">{error}</p></div></Layout>;
  if (!data)   return null;

  const { projectName, allProjects, gantt } = data;

  return (
    <Layout>
      <VendorNav
        title="Schedule"
        backHref="/vendor/reports"
        projectName={projectName}
        allProjects={allProjects}
        currentProjectId={data.projectId}
        onProjectChange={reload}
      />
      <VendorGanttChart milestones={gantt.milestones} criticalPathLength={gantt.cpm.criticalPath.length} />
    </Layout>
  );
}
