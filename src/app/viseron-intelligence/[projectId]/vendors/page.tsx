'use client';

import { useParams } from 'next/navigation';
import useSWR from 'swr';
import Layout from '@/components/Layout';
import ViseronNav from '@/components/viseron/ViseronNav';
import VendorRankings from '@/components/viseron/VendorRankings';
import { useProject } from '@/lib/contexts/ProjectContext';
import { jsonFetcher } from '@/lib/fetcher';

interface DashboardData {
  vendorScores: Array<{
    vendorName: string;
    total: number;
    onTime: number;
    late: number;
    reliability: number;
    avgDelay: number;
  }>;
}

export default function ViseronVendorsPage() {
  const params = useParams();
  const projectId = params.projectId as string;

  const { project, isLoading: projectLoading } = useProject();
  const projectName = project?.name ?? '...';
  const myRole = project?.myRole ?? '';

  const { data, isLoading: dashLoading } = useSWR<DashboardData>(
    projectId ? `/api/viseron-intelligence/${projectId}/dashboard` : null,
    jsonFetcher,
    { revalidateOnFocus: false, dedupingInterval: 60_000 },
  );
  const loading = projectLoading || dashLoading;

  return (
    <Layout>
      <ViseronNav
        projectId={projectId}
        projectName={projectName}
        role={myRole}
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-[rgba(255,255,255,0.05)] animate-pulse" />
          ))}
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-[rgba(232,228,220,0.35)] text-sm">No data available.</div>
      ) : (
        <div className="animate-fade-in">
          <VendorRankings vendors={data.vendorScores} />
        </div>
      )}
    </Layout>
  );
}
