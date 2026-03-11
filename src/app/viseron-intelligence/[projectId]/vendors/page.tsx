'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Layout from '@/components/Layout';
import ViseronNav from '@/components/viseron/ViseronNav';
import VendorRankings from '@/components/viseron/VendorRankings';

interface ProjectInfo {
  name: string;
  myRole: string;
}

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
  const [projectInfo, setProjectInfo] = useState<ProjectInfo | null>(null);
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [projRes, dashRes] = await Promise.all([
      fetch(`/api/projects/${projectId}`),
      fetch(`/api/viseron-intelligence/${projectId}/dashboard`),
    ]);
    const [projData, dashData] = await Promise.all([projRes.json(), dashRes.json()]);
    if (projData.success) setProjectInfo({ name: projData.data.name, myRole: projData.data.myRole });
    if (dashData.success) setData(dashData.data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  return (
    <Layout>
      <ViseronNav
        projectId={projectId}
        projectName={projectInfo?.name ?? '...'}
        role={projectInfo?.myRole ?? ''}
      />

      {loading ? (
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-surface-100 animate-pulse" />
          ))}
        </div>
      ) : !data ? (
        <div className="text-center py-16 text-surface-400 text-sm">No data available.</div>
      ) : (
        <div className="animate-fade-in">
          <VendorRankings vendors={data.vendorScores} />
        </div>
      )}
    </Layout>
  );
}
