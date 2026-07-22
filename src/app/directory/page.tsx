'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Mail, Phone, Building2, Search, Users as UsersIcon } from 'lucide-react';
import Layout from '@/components/Layout';
import { jsonFetcher } from '@/lib/fetcher';
import { formatDate } from '@/lib/utils';
import { TablePageSkeleton } from '@/components/ui/SkeletonPage';

interface DirectoryProject {
  projectId: string;
  projectName: string;
  projectStatus: string;
  role: string;
  since: string;
}

interface DirectoryEntry {
  id: string;
  name: string;
  email: string;
  mobile: string | null;
  companyName: string | null;
  contactPerson: string | null;
  address: string | null;
  memberSince: string;
  roleTypes: string[];
  projects: DirectoryProject[];
}

type RoleFilter = 'ALL' | 'VENDOR' | 'CONSULTANT';

const ROLE_COLOR: Record<string, { bg: string; fg: string }> = {
  VENDOR: { bg: 'rgba(92,186,128,0.15)', fg: '#5cba80' },
  CONSULTANT: { bg: 'rgba(167,139,250,0.15)', fg: '#a78bfa' },
};

function RoleBadge({ role }: { role: string }) {
  const c = ROLE_COLOR[role] ?? { bg: 'rgba(255,255,255,0.08)', fg: 'var(--ax-text)' };
  return (
    <span className="inline-block text-[10.5px] px-2 py-0.5 rounded-full font-bold" style={{ background: c.bg, color: c.fg }}>
      {role}
    </span>
  );
}

export default function DirectoryPage() {
  const { data, isLoading, error } = useSWR<DirectoryEntry[]>('/api/directory', jsonFetcher);
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<RoleFilter>('ALL');

  const filtered = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data.filter((entry) => {
      if (roleFilter !== 'ALL' && !entry.roleTypes.includes(roleFilter)) return false;
      if (!q) return true;
      return (
        entry.name.toLowerCase().includes(q) ||
        entry.email.toLowerCase().includes(q) ||
        (entry.companyName ?? '').toLowerCase().includes(q) ||
        entry.projects.some((p) => p.projectName.toLowerCase().includes(q))
      );
    });
  }, [data, search, roleFilter]);

  return (
    <Layout>
      <div className="space-y-6 pb-32">
        <div>
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: 'var(--ax-accent)' }}>
              <UsersIcon className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-[#e8e4dc]">Vendor &amp; Consultant Directory</h1>
          </div>
          <p className="text-sm text-[rgba(232,228,220,0.45)]">
            Every vendor and consultant on the platform, across all projects — browse contact info and project history, and reach out to onboard them for new work.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'rgba(232,228,220,0.35)' }} />
            <input
              type="text" className="input pl-9" placeholder="Search by name, company, or project…"
              value={search} onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex gap-1 p-1 rounded-lg" style={{ background: 'var(--ax-overlay-hover)' }}>
            {(['ALL', 'VENDOR', 'CONSULTANT'] as RoleFilter[]).map((r) => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${roleFilter === r ? 'ax-tab-active' : 'ax-tab-inactive'}`}
              >
                {r === 'ALL' ? 'All' : r === 'VENDOR' ? 'Vendors' : 'Consultants'}
              </button>
            ))}
          </div>
        </div>

        {isLoading ? (
          <TablePageSkeleton />
        ) : error ? (
          <div className="card">
            <div className="card-body text-center py-12 text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>
              {error.message?.includes('403')
                ? "You don't have access to the directory — this is available to Client and PMC roles."
                : 'Failed to load the directory.'}
            </div>
          </div>
        ) : filtered.length === 0 ? (
          <div className="card">
            <div className="card-body text-center py-12 text-sm" style={{ color: 'rgba(232,228,220,0.4)' }}>
              {search || roleFilter !== 'ALL' ? 'No matches found.' : 'No vendors or consultants registered yet.'}
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {filtered.map((entry) => (
              <DirectoryCard key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  );
}

function DirectoryCard({ entry }: { entry: DirectoryEntry }) {
  const [showAllProjects, setShowAllProjects] = useState(false);
  const visibleProjects = showAllProjects ? entry.projects : entry.projects.slice(0, 3);

  return (
    <div className="card flex flex-col">
      <div className="card-body flex-1 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: 'var(--ax-text)' }}>{entry.name}</p>
            {entry.companyName && (
              <p className="text-xs mt-0.5 flex items-center gap-1 truncate" style={{ color: 'rgba(232,228,220,0.5)' }}>
                <Building2 className="w-3 h-3 shrink-0" />{entry.companyName}
              </p>
            )}
          </div>
          <div className="flex gap-1 shrink-0">
            {entry.roleTypes.map((r) => <RoleBadge key={r} role={r} />)}
          </div>
        </div>

        {entry.contactPerson && (
          <p className="text-xs" style={{ color: 'rgba(232,228,220,0.45)' }}>Contact: {entry.contactPerson}</p>
        )}

        <div className="space-y-1.5">
          <a href={`mailto:${entry.email}`} className="flex items-center gap-2 text-xs hover:underline" style={{ color: 'var(--ax-accent)' }}>
            <Mail className="w-3.5 h-3.5 shrink-0" />{entry.email}
          </a>
          {entry.mobile ? (
            <a href={`tel:${entry.mobile}`} className="flex items-center gap-2 text-xs hover:underline" style={{ color: 'var(--ax-accent)' }}>
              <Phone className="w-3.5 h-3.5 shrink-0" />{entry.mobile}
            </a>
          ) : (
            <p className="flex items-center gap-2 text-xs" style={{ color: 'rgba(232,228,220,0.3)' }}>
              <Phone className="w-3.5 h-3.5 shrink-0" />Not provided
            </p>
          )}
        </div>

        <div className="pt-2 border-t" style={{ borderColor: 'var(--ax-border-subtle)' }}>
          <p className="text-[10px] font-medium uppercase tracking-wider mb-1.5" style={{ color: 'rgba(232,228,220,0.35)' }}>
            Projects ({entry.projects.length})
          </p>
          {entry.projects.length === 0 ? (
            <p className="text-xs" style={{ color: 'rgba(232,228,220,0.3)' }}>No projects yet.</p>
          ) : (
            <div className="space-y-1">
              {visibleProjects.map((p, i) => (
                <div key={i} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate" style={{ color: 'rgba(232,228,220,0.6)' }}>{p.projectName}</span>
                  <span className="shrink-0" style={{ color: 'rgba(232,228,220,0.35)' }}>{p.role === 'VENDOR' ? 'Vendor' : 'Consultant'}</span>
                </div>
              ))}
              {entry.projects.length > 3 && (
                <button
                  onClick={() => setShowAllProjects((v) => !v)}
                  className="text-xs font-medium mt-1"
                  style={{ color: 'var(--ax-accent)' }}
                >
                  {showAllProjects ? 'Show less' : `+${entry.projects.length - 3} more`}
                </button>
              )}
            </div>
          )}
        </div>

        <p className="text-[10px]" style={{ color: 'rgba(232,228,220,0.25)' }}>On platform since {formatDate(entry.memberSince)}</p>
      </div>
    </div>
  );
}
