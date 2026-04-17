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

export default function ViseronIntelligenceLandingPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          setProjects(data.data);
          if (data.data.length === 1) {
            router.replace(`/viseron-intelligence/${data.data[0].id}/dashboard`);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-16 px-4">
        {/* Header with Viseron branding */}
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary-600 to-primary-800 flex items-center justify-center shadow-none shadow-primary-500/20">
              <ViseronIcon className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-[#e8e4dc] tracking-tight">
                Viseron Intelligence
              </h1>
              <p className="text-[12px] text-primary-500 font-medium tracking-wide uppercase">
                Project Health &middot; Risk &middot; Vendor Analytics
              </p>
            </div>
          </div>
          <p className="text-[15px] text-[rgba(232,228,220,0.55)] leading-relaxed mt-4">
            AI-powered project intelligence with natural language queries, health monitoring,
            vendor performance tracking, and risk assessment — all in one place.
          </p>
        </div>

        {/* Feature highlights */}
        <div className="grid grid-cols-3 gap-3 mb-10">
          {[
            { label: 'Health Gauge', desc: 'Real-time project scoring', icon: '◎' },
            { label: 'Risk Radar', desc: 'Milestone risk assessment', icon: '◆' },
            { label: 'Query Engine', desc: 'Ask in plain English', icon: '▹' },
          ].map((f) => (
            <div
              key={f.label}
              className="bg-[rgba(255,255,255,0.03)] border border-[rgba(255,255,255,0.07)] rounded-xl p-4 text-center"
            >
              <span className="text-primary-500 text-lg">{f.icon}</span>
              <p className="text-[12px] font-semibold text-[#e8e4dc] mt-1.5">{f.label}</p>
              <p className="text-[11px] text-[rgba(232,228,220,0.35)] mt-0.5">{f.desc}</p>
            </div>
          ))}
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
                onClick={() => router.push(`/viseron-intelligence/${p.id}/dashboard`)}
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

function ViseronIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 20 20" fill="none">
      <path d="M10 2L17 6V14L10 18L3 14V6L10 2Z" fill="white" fillOpacity="0.2" stroke="white" strokeWidth="1.2" />
      <circle cx="10" cy="10" r="3" fill="white" fillOpacity="0.5" />
      <path d="M10 4V7M10 13V16M5 7L7.5 8.5M12.5 11.5L15 13M5 13L7.5 11.5M12.5 8.5L15 7" stroke="white" strokeWidth="0.8" strokeLinecap="round" opacity="0.6" />
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
