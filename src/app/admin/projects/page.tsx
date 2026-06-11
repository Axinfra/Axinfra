'use client';

import { useEffect, useState, useMemo } from 'react';
import Link from 'next/link';

interface UserRole {
  role: string; createdAt: string;
  user: { id: string; name: string; email: string };
}
interface Project {
  id: string; name: string; description: string | null;
  status: string; createdAt: string; isExampleProject: boolean;
  roles: UserRole[];
  _count: { milestones: number };
}

const STATUS_STYLE: Record<string, { bg: string; fg: string }> = {
  ONGOING:   { bg: 'rgba(92,186,128,0.15)',  fg: '#5cba80' },
  COMPLETED: { bg: 'rgba(196,163,90,0.15)',  fg: '#c4a35a' },
  PAUSED:    { bg: 'rgba(251,146,60,0.15)',  fg: '#fb923c' },
  CANCELLED: { bg: 'rgba(224,96,80,0.15)',   fg: '#e06050' },
};
const ROLE_COLOR: Record<string, string> = {
  CLIENT: '#c4a35a', PMC: '#60a5fa', VENDOR: '#5cba80',
  CONSULTANT: '#a78bfa', VIEWER: 'rgba(232,228,220,0.4)',
};

// Platform admin is never shown as a client "owner" group header
const PLATFORM_ADMIN_EMAIL = 'admin@axinfra.local';
const GROUPS_PER_PAGE = 4;

function fmt(d: string) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function AdminProjectsPage() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [page, setPage] = useState(0);

  useEffect(() => {
    fetch('/api/admin/projects')
      .then(r => r.json())
      .then(d => { if (d.success) setProjects(d.data.projects); else setError(d.error); })
      .catch(() => setError('Network error'))
      .finally(() => setLoading(false));
  }, []);

  // Reset to page 0 whenever filters change
  useEffect(() => { setPage(0); }, [search, statusFilter]);

  const filtered = useMemo(() => {
    let list = projects;
    if (statusFilter !== 'ALL') list = list.filter(p => p.status === statusFilter);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        p.description?.toLowerCase().includes(q) ||
        p.roles.some(r => r.user.name.toLowerCase().includes(q) || r.user.email.toLowerCase().includes(q))
      );
    }
    return list;
  }, [projects, search, statusFilter]);

  // Group by real-client OWNER — skip platform admin as group header.
  // If a project has both admin + real owner, use the real owner.
  // If only admin is owner, put it in a special "Platform Projects" group at end.
  const ownerGroups = useMemo(() => {
    const map = new Map<string, { owner: UserRole['user']; projects: Project[] }>();
    const adminOnly: Project[] = [];
    const noOwner: Project[] = [];

    filtered.forEach(p => {
      const clientRoles = p.roles.filter(r => r.role === 'CLIENT');
      // Prefer non-admin owner
      const realOwner = clientRoles.find(r => r.user.email.toLowerCase() !== PLATFORM_ADMIN_EMAIL);
      if (realOwner) {
        const key = realOwner.user.id;
        if (!map.has(key)) map.set(key, { owner: realOwner.user, projects: [] });
        map.get(key)!.projects.push(p);
      } else if (clientRoles.length > 0) {
        // Only admin is owner
        adminOnly.push(p);
      } else {
        noOwner.push(p);
      }
    });

    const groups: { owner: UserRole['user']; projects: Project[]; isSpecial?: boolean }[] = Array.from(map.values());
    if (adminOnly.length > 0) groups.push({ owner: { id: '_admin', name: 'Platform / Admin Projects', email: PLATFORM_ADMIN_EMAIL }, projects: adminOnly, isSpecial: true });
    if (noOwner.length > 0) groups.push({ owner: { id: '_none', name: 'Unassigned', email: '' }, projects: noOwner, isSpecial: true });
    return groups;
  }, [filtered]);

  const statusCounts = useMemo(() => {
    const c: Record<string, number> = {};
    projects.forEach(p => { c[p.status] = (c[p.status] ?? 0) + 1; });
    return c;
  }, [projects]);

  const totalGroups = ownerGroups.length;
  const totalPages = Math.ceil(totalGroups / GROUPS_PER_PAGE);
  const visibleGroups = ownerGroups.slice(page * GROUPS_PER_PAGE, (page + 1) * GROUPS_PER_PAGE);
  const totalFilteredProjects = filtered.length;
  const clientCount = ownerGroups.filter(g => !g.isSpecial).length;

  return (
    <div className="px-4 py-5 sm:px-6 sm:py-7 lg:px-9 lg:py-8 max-w-[1300px]">

      {/* Header */}
      <div className="mb-5">
        <h1 className="text-xl sm:text-2xl font-bold text-[#e8e4dc]">Projects</h1>
        <p className="text-[13px] text-[rgba(232,228,220,0.45)] mt-1">
          All projects grouped by client — click any project to view full details
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 sm:grid-cols-5 gap-2.5 mb-5">
        {[
          { label: 'Total', value: projects.length, color: '#e8e4dc' },
          { label: 'Active', value: statusCounts['ONGOING'] ?? 0, color: '#5cba80' },
          { label: 'Completed', value: statusCounts['COMPLETED'] ?? 0, color: '#c4a35a' },
          { label: 'Paused', value: statusCounts['PAUSED'] ?? 0, color: '#fb923c' },
          { label: 'Clients', value: clientCount, color: '#60a5fa' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl px-3 py-3">
            <div className="text-[10px] text-[rgba(232,228,220,0.4)] font-semibold uppercase tracking-wide mb-1 truncate">{label}</div>
            <div className="text-xl sm:text-2xl font-bold" style={{ color }}>{value}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search projects, owners, emails…"
          className="w-full sm:w-72 bg-[#16161c] border border-[rgba(255,255,255,0.1)] rounded-lg px-3.5 py-2.5 text-[13.5px] text-[#e8e4dc] outline-none placeholder:text-[rgba(232,228,220,0.3)]"
        />
        <div className="flex gap-2 overflow-x-auto pb-1 flex-nowrap">
          {['ALL', 'ONGOING', 'COMPLETED', 'PAUSED', 'CANCELLED'].map(s => {
            const sst = STATUS_STYLE[s];
            const active = statusFilter === s;
            return (
              <button key={s} onClick={() => setStatusFilter(s)}
                className="shrink-0 px-3.5 py-1.5 rounded-full text-[12px] font-semibold cursor-pointer transition-all whitespace-nowrap"
                style={{
                  background: active ? (sst?.bg ?? 'rgba(196,163,90,0.15)') : 'rgba(255,255,255,0.05)',
                  color: active ? (sst?.fg ?? '#c4a35a') : 'rgba(232,228,220,0.5)',
                  border: active ? `1px solid ${sst?.fg ?? '#c4a35a'}44` : '1px solid rgba(255,255,255,0.08)',
                }}>
                {s === 'ALL' ? `All (${projects.length})` : `${s.charAt(0)+s.slice(1).toLowerCase()} (${statusCounts[s] ?? 0})`}
              </button>
            );
          })}
        </div>
      </div>

      {/* Results summary */}
      {!loading && !error && (
        <div className="flex items-center justify-between mb-4">
          <p className="text-[12px] text-[rgba(232,228,220,0.35)]">
            {totalFilteredProjects} project{totalFilteredProjects !== 1 ? 's' : ''} · {totalGroups} client group{totalGroups !== 1 ? 's' : ''}
            {totalPages > 1 && <span className="ml-2">· Page {page + 1} of {totalPages}</span>}
          </p>
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-[rgba(232,228,220,0.35)] text-sm">Loading projects…</div>
      ) : error ? (
        <div className="p-4 text-[#e06050] text-sm">{error}</div>
      ) : ownerGroups.length === 0 ? (
        <div className="text-center py-16 text-[rgba(232,228,220,0.25)] text-sm">No projects found</div>
      ) : (
        <>
          <div className="space-y-8">
            {visibleGroups.map(group => (
              <div key={group.owner.id}>
                {/* Owner header */}
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-[13px] font-bold"
                    style={{
                      background: group.isSpecial ? 'rgba(255,255,255,0.06)' : 'rgba(196,163,90,0.15)',
                      border: group.isSpecial ? '1px solid rgba(255,255,255,0.1)' : '1px solid rgba(196,163,90,0.25)',
                      color: group.isSpecial ? 'rgba(232,228,220,0.5)' : '#c4a35a',
                    }}>
                    {group.owner.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[14px] sm:text-[15px] font-semibold text-[#e8e4dc]">{group.owner.name}</span>
                      {!group.isSpecial && (
                        <span className="text-[10px] font-bold text-[#c4a35a] bg-[rgba(196,163,90,0.12)] border border-[rgba(196,163,90,0.2)] px-2 py-0.5 rounded-full uppercase tracking-wide">Owner</span>
                      )}
                      <span className="text-[12px] text-[rgba(232,228,220,0.35)]">
                        · {group.projects.length} project{group.projects.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {group.owner.email && !group.isSpecial && (
                      <div className="text-[12px] text-[rgba(232,228,220,0.4)]">{group.owner.email}</div>
                    )}
                  </div>
                  <div className="flex-1 h-px bg-[rgba(255,255,255,0.06)] ml-2 hidden sm:block" />
                </div>

                {/* Project cards — equal height grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4 sm:pl-12">
                  {group.projects.map(p => {
                    const st = STATUS_STYLE[p.status] ?? { bg: 'rgba(255,255,255,0.08)', fg: '#e8e4dc' };
                    const pmc      = p.roles.find(r => r.role === 'PMC');
                    const vendors  = p.roles.filter(r => r.role === 'VENDOR');
                    const consults = p.roles.filter(r => r.role === 'CONSULTANT');
                    return (
                      <Link key={p.id} href={`/admin/projects/${p.id}`} style={{ textDecoration: 'none' }}>
                        {/* flex flex-col h-full makes all cards same height in the row */}
                        <div className="flex flex-col h-full bg-[#16161c] border border-[rgba(255,255,255,0.07)] rounded-xl p-5 hover:border-[rgba(196,163,90,0.3)] hover:bg-[rgba(196,163,90,0.03)] transition-all cursor-pointer group">

                          {/* Top — name + status */}
                          <div className="flex items-start justify-between gap-2 mb-3">
                            <div className="flex-1 min-w-0">
                              <div className="text-[14px] font-semibold text-[#e8e4dc] group-hover:text-[#c4a35a] transition-colors leading-snug">{p.name}</div>
                              {p.description && (
                                <div className="text-[12px] text-[rgba(232,228,220,0.4)] mt-1 line-clamp-2 leading-snug">{p.description}</div>
                              )}
                            </div>
                            <span className="shrink-0 text-[10.5px] font-bold px-2.5 py-1 rounded-full" style={{ background: st.bg, color: st.fg }}>
                              {p.status}
                            </span>
                          </div>

                          {/* Team details — flex-1 pushes footer down */}
                          <div className="flex-1 space-y-1.5 mb-4">
                            {pmc && (
                              <div className="flex items-center gap-2">
                                <span className="w-16 text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: ROLE_COLOR['PMC'] }}>PMC</span>
                                <span className="text-[12px] text-[rgba(232,228,220,0.65)] truncate">{pmc.user.name}</span>
                              </div>
                            )}
                            {vendors.length > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="w-16 text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: ROLE_COLOR['VENDOR'] }}>Vendors</span>
                                <span className="text-[12px] text-[rgba(232,228,220,0.65)] truncate">
                                  {vendors.slice(0, 2).map(v => v.user.name).join(', ')}
                                  {vendors.length > 2 && ` +${vendors.length - 2}`}
                                </span>
                              </div>
                            )}
                            {consults.length > 0 && (
                              <div className="flex items-center gap-2">
                                <span className="w-16 text-[10px] font-bold uppercase tracking-wide shrink-0" style={{ color: ROLE_COLOR['CONSULTANT'] }}>Consult</span>
                                <span className="text-[12px] text-[rgba(232,228,220,0.65)] truncate">{consults[0].user.name}{consults.length > 1 && ` +${consults.length - 1}`}</span>
                              </div>
                            )}
                          </div>

                          {/* Footer — always at bottom */}
                          <div className="flex items-center justify-between pt-3 border-t border-[rgba(255,255,255,0.05)] mt-auto">
                            <div className="flex items-center gap-2 text-[11.5px] text-[rgba(232,228,220,0.4)]">
                              <span>{p.roles.length} member{p.roles.length !== 1 ? 's' : ''}</span>
                              <span>·</span>
                              <span>{p._count.milestones} milestone{p._count.milestones !== 1 ? 's' : ''}</span>
                            </div>
                            <div className="flex items-center gap-1 text-[11.5px] font-medium text-[rgba(196,163,90,0.6)] group-hover:text-[#c4a35a] transition-colors">
                              View
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                              </svg>
                            </div>
                          </div>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-3 mt-10">
              <button
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(232,228,220,0.7)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
                </svg>
                Previous
              </button>

              {/* Page dots */}
              <div className="flex items-center gap-1.5">
                {Array.from({ length: totalPages }, (_, i) => (
                  <button key={i} onClick={() => setPage(i)}
                    className="w-8 h-8 rounded-lg text-[12px] font-semibold transition-all"
                    style={{
                      background: page === i ? 'rgba(196,163,90,0.2)' : 'rgba(255,255,255,0.04)',
                      color: page === i ? '#c4a35a' : 'rgba(232,228,220,0.5)',
                      border: page === i ? '1px solid rgba(196,163,90,0.4)' : '1px solid rgba(255,255,255,0.07)',
                    }}>
                    {i + 1}
                  </button>
                ))}
              </div>

              <button
                onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
                disabled={page === totalPages - 1}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-[13px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  color: 'rgba(232,228,220,0.7)',
                  border: '1px solid rgba(255,255,255,0.08)',
                }}>
                Next
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5L21 12m0 0l-7.5 7.5M21 12H3" />
                </svg>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
