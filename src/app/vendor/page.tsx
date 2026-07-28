'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Package, Wallet } from 'lucide-react';
import Layout from '@/components/Layout';
import { ProjectsListSkeleton } from '@/components/ui/SkeletonPage';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';
import useSWR from 'swr';

interface VendorProject {
  id: string;
  name: string;
  status?: string;
  isExampleProject?: boolean;
  createdAt: string;
  ordersCount: number;
  totalBillsCount: number;
  pendingBillsCount: number;
}

/** Vendor Portal landing — every project this vendor is assigned to, as a card grid, the same
 * shape PMC/Client see at /projects. Replaces the old single-active-project + switcher home;
 * a vendor working across several projects sees all of them up front instead of hunting
 * through a dropdown. Each card links into that project's standard workspace, which renders
 * a vendor-specific Overview tab scoped to just this vendor's Purchase Orders and RA Bills. */
export default function VendorHomePage() {
  const { data: projects, isLoading, error } = useSWR<VendorProject[]>('/api/vendor/projects', jsonFetcher);
  const [greeting, setGreeting] = useState('');

  useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => { if (d.success) setGreeting(d.data.user.name); })
      .catch(() => {});
  }, []);

  if (isLoading) {
    return <Layout><ProjectsListSkeleton /></Layout>;
  }

  return (
    <Layout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold" style={{ color: 'var(--ax-text)' }}>Projects</h1>
        {greeting && (
          <p className="text-sm mt-0.5" style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}>Welcome back, {greeting}</p>
        )}
      </div>

      {error && <div className="alert alert-error mb-4">Failed to load your projects</div>}

      {!projects || projects.length === 0 ? (
        <div className="card">
          <div className="card-body text-center py-12">
            <p className="text-lg font-semibold mb-2" style={{ color: 'var(--ax-text)' }}>No projects yet</p>
            <p className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb), 0.45)' }}>
              You haven&apos;t been added as a vendor on any project yet. Ask the project owner to invite you.
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {projects.map((project) => (
            <Link key={project.id} href={`/projects/${project.id}`} className="card hover:shadow-none transition-shadow block">
              <div className="card-body">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-lg font-semibold" style={{ color: 'var(--ax-text)' }}>{project.name}</h3>
                    {project.isExampleProject && (
                      <span className="px-2 py-0.5 text-xs rounded-full" style={{ backgroundColor: 'var(--ax-accent-subtle)', color: 'var(--ax-accent)' }}>
                        Example
                      </span>
                    )}
                  </div>
                  <span className="badge badge-draft shrink-0">VENDOR</span>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  <div className="flex items-center gap-2">
                    <Package className="w-4 h-4 shrink-0" style={{ color: '#3b82f6' }} />
                    <span className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.7)' }}>
                      {project.ordersCount} Purchase Order{project.ordersCount === 1 ? '' : 's'}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Wallet className="w-4 h-4 shrink-0" style={{ color: '#22c55e' }} />
                    <span className="text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.7)' }}>
                      {project.totalBillsCount} Bill{project.totalBillsCount === 1 ? '' : 's'}
                    </span>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between text-xs" style={{ color: 'rgba(var(--ax-text-rgb), 0.45)' }}>
                  {project.pendingBillsCount > 0 ? (
                    <span className="font-medium px-2 py-0.5 rounded-full" style={{ backgroundColor: 'rgba(234,179,8,0.15)', color: '#eab308' }}>
                      {project.pendingBillsCount} bill{project.pendingBillsCount === 1 ? '' : 's'} need attention
                    </span>
                  ) : (
                    <span>All bills up to date</span>
                  )}
                  <span>{formatDate(project.createdAt)}</span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </Layout>
  );
}
