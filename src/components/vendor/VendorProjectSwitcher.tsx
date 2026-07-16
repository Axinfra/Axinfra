'use client';

import { useMemo, useState } from 'react';
import { Search, ChevronDown, Check, Building2, X } from 'lucide-react';
import { cardShadow, iconBadge } from './vendorTheme';

interface ProjectOption {
  id: string;
  name: string;
}

/** Big, tappable "current project" pill that opens a searchable picker as a proper floating
 * panel over a dimmed backdrop (same modal convention as the rest of the app) — not a
 * full-bleed screen that reads as navigating away to a different page. A vendor assigned to
 * many projects can just type a few letters instead of scrolling a tiny dropdown list. Only
 * rendered where there's more than one project. */
export default function VendorProjectSwitcher({
  projects,
  currentProjectId,
  currentProjectName,
  onChange,
}: {
  projects: ProjectOption[];
  currentProjectId: string;
  currentProjectName: string;
  onChange: (projectId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return projects;
    return projects.filter((p) => p.name.toLowerCase().includes(q));
  }, [projects, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 rounded-2xl pl-4 pr-3 py-2.5 max-w-[220px]"
        style={{ background: 'var(--ax-card)', color: 'var(--ax-text)', ...cardShadow }}
      >
        <span className="text-base font-bold truncate">{currentProjectName}</span>
        <ChevronDown className="w-4 h-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }} />
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-4"
          onClick={close}
        >
          <div
            className="w-full sm:max-w-md rounded-t-[28px] sm:rounded-[28px] flex flex-col max-h-[85vh]"
            style={{ background: 'var(--ax-base)', ...cardShadow }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 p-4 shrink-0">
              <div className="flex-1 flex items-center gap-3 rounded-2xl px-4" style={{ background: 'var(--ax-card)' }}>
                <Search className="w-5 h-5 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }} />
                <input
                  autoFocus
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search projects…"
                  className="flex-1 bg-transparent outline-none py-3.5 text-lg font-medium"
                  style={{ color: 'var(--ax-text)' }}
                />
              </div>
              <button
                onClick={close}
                aria-label="Close"
                className="flex items-center justify-center w-12 h-12 rounded-full shrink-0"
                style={{ background: 'var(--ax-card)', color: 'var(--ax-text)' }}
              >
                <X className="w-5 h-5" strokeWidth={2.5} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
              {filtered.length === 0 ? (
                <p className="text-center text-lg font-medium py-16" style={{ color: 'rgba(var(--ax-text-rgb),0.4)' }}>
                  No projects match &quot;{query}&quot;
                </p>
              ) : (
                filtered.map((p) => {
                  const isCurrent = p.id === currentProjectId;
                  return (
                    <button
                      key={p.id}
                      onClick={() => { onChange(p.id); close(); }}
                      className="w-full flex items-center gap-4 text-left p-4 rounded-[24px] min-h-[76px] active:scale-[0.98] transition-transform"
                      style={{ background: 'var(--ax-card)' }}
                    >
                      <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0" style={iconBadge(isCurrent ? '#22c55e' : '#3b82f6')}>
                        <Building2 className="w-5 h-5" style={{ color: isCurrent ? '#22c55e' : '#3b82f6' }} strokeWidth={2.25} />
                      </div>
                      <span className="flex-1 font-bold text-lg truncate" style={{ color: 'var(--ax-text)' }}>{p.name}</span>
                      {isCurrent && <Check className="w-6 h-6 shrink-0" style={{ color: '#22c55e' }} strokeWidth={2.5} />}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
