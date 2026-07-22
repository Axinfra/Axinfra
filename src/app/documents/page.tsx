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

/** Top-level landing/picker page — mirrors architecture/execution-intelligence/
 * viseron-intelligence's pattern. Documents itself has no dedicated top-level route (it lives
 * at /projects/[projectId]/documents); this page exists only for the sidebar entry point when
 * no project is currently selected. */
export default function DocumentsLandingPage() {
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
            router.replace(`/projects/${data.data[0].id}/documents`);
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
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--ax-accent)' }}>
              <DocumentsIcon className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--ax-text)' }}>
              Documents
            </h1>
          </div>
          <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>
            Specs, checklists, and daily progress reports — all in one place.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl animate-pulse" style={{ background: 'var(--ax-overlay-hover)' }} />
            ))}
          </div>
        ) : projects.length === 0 ? (
          <div className="text-center py-12 text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>
            No projects found. Create a project first.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] font-medium uppercase tracking-wider mb-3" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>
              Select a project
            </p>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}/documents`)}
                className="w-full flex items-center justify-between px-5 py-4 rounded-xl transition-all group text-left"
                style={{ background: 'var(--ax-card)', border: '1px solid var(--ax-border)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(var(--ax-accent-rgb),0.35)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ax-border)'; }}
              >
                <div>
                  <p className="text-[14px] font-medium transition-colors" style={{ color: 'var(--ax-text)' }}>{p.name}</p>
                  <p className="text-[12px] mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>{p.myRole} &middot; {p.status}</p>
                </div>
                <ChevronRightIcon className="w-4 h-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function DocumentsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m3 12.75h3m-3 3h3m-9-9.75h1.5m-1.5 3h1.5m-1.5 3h1.5m3-16.5H6.75a2.25 2.25 0 00-2.25 2.25v15a2.25 2.25 0 002.25 2.25h10.5a2.25 2.25 0 002.25-2.25V9.75c0-.464-.184-.909-.512-1.238l-4.5-4.5A1.75 1.75 0 0013.128 3.5H8.25z" />
    </svg>
  );
}

function ChevronRightIcon({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return (
    <svg className={className} style={style} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
    </svg>
  );
}
