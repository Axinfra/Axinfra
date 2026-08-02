'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Layout from '@/components/Layout';
import { Truck, ChevronRight } from 'lucide-react';

interface Project {
  id: string;
  name: string;
  status: string;
  myRole: string;
}

/** Top-level landing/picker page — mirrors Architecture's pattern. Direct Orders has no
 * dedicated top-level route (it lives at /projects/[projectId]/direct-orders); this page
 * exists only for the sidebar entry point when no project is currently selected. */
export default function DirectOrdersLandingPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/projects')
      .then((r) => r.json())
      .then((data) => {
        if (data.success) {
          // PMC-only here — Direct Orders is restricted to PMC and Vendor, and a Vendor never
          // lands on this picker (they use the separate /vendor/direct-orders portal view).
          const pmcProjects = (data.data as Project[]).filter((p) => p.myRole === 'PMC');
          setProjects(pmcProjects);
          if (pmcProjects.length === 1) {
            router.replace(`/projects/${pmcProjects[0].id}/direct-orders`);
          }
        }
      })
      .finally(() => setLoading(false));
  }, [router]);

  return (
    <Layout>
      <div className="max-w-2xl mx-auto py-16 px-4">
        <div className="mb-10">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--ax-accent)' }}>
              <Truck className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-semibold tracking-tight" style={{ color: 'var(--ax-text)' }}>
              Direct Orders
            </h1>
          </div>
          <p className="text-[15px] leading-relaxed" style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>
            One-off vendor purchases outside the Purchase Order flow — PMC orders, delivery and payment status.
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
            Direct Orders is only available where you&apos;re the PMC on a project.
          </div>
        ) : (
          <div className="space-y-2">
            <p className="text-[12px] font-medium uppercase tracking-wider mb-3" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>
              Select a project
            </p>
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => router.push(`/projects/${p.id}/direct-orders`)}
                className="w-full flex items-center justify-between px-5 py-4 rounded-xl transition-all group text-left"
                style={{ background: 'var(--ax-card)', border: '1px solid var(--ax-border)' }}
                onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'rgba(var(--ax-accent-rgb),0.35)'; }}
                onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = 'var(--ax-border)'; }}
              >
                <div>
                  <p className="text-[14px] font-medium transition-colors" style={{ color: 'var(--ax-text)' }}>{p.name}</p>
                  <p className="text-[12px] mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.35)' }}>{p.myRole} &middot; {p.status}</p>
                </div>
                <ChevronRight className="w-4 h-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.3)' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}
