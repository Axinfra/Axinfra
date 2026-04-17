'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';

interface Project {
  id: string;
  name: string;
  status: string;
  myRole: string;
}

export default function ExecutionIntelligenceLandingPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setProjects(data.data);
          // Auto-redirect if only one project
          if (data.data.length === 1) {
            router.replace(
              `/execution-intelligence/${data.data[0].id}/overview`,
            );
          }
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-16 px-4">
        {/* Header */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#c4a35a] flex items-center justify-center">
              <ChartBarIcon className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-semibold text-[#e8e4dc] tracking-tight">
              Execution Intelligence
            </h1>
          </div>
          <p className="text-[15px] text-[rgba(232,228,220,0.55)] leading-relaxed">
            Schedule analytics, Gantt charts, critical path analysis, and performance
            dashboards — all in one place.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-[rgba(255,255,255,0.05)] animate-pulse" />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 text-[rgba(232,228,220,0.35)] text-sm">
            No projects found. Create a project first.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wider mb-3">
              Select a project
            </p>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() =>
                  router.push(`/execution-intelligence/${p.id}/overview`)
                }
                className="w-full flex items-center justify-between px-5 py-4 rounded-xl bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] hover:border-[rgba(196,163,90,0.3)] hover:shadow-none transition-all group text-left"
              >
                <div>
                  <p className="text-[14px] font-medium text-[#e8e4dc] group-hover:text-[#c4a35a] transition-colors">
                    {p.name}
                  </p>
                  <p className="text-[12px] text-[rgba(232,228,220,0.35)] mt-0.5">
                    {p.myRole} &middot; {p.status}
                  </p>
                </div>
                <ChevronRightIcon className="w-4 h-4 text-surface-300 group-hover:text-primary-400 transition-colors" />
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function ChartBarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
    </svg>
  );
}

function ChevronRightIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
