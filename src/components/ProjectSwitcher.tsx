'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
import { ChevronDown } from 'lucide-react';
import { jsonFetcher } from '@/lib/fetcher';

interface ProjectOption {
  id: string;
  name: string;
  status: string;
  myRole: string;
}

interface ProjectSwitcherProps {
  currentProjectId: string;
  currentProjectName: string;
  /** Builds the URL for a given project within this same section (e.g. Execution
   * Intelligence, Viseron Intelligence, Architecture) so switching stays in place. */
  buildHref: (projectId: string) => string;
}

/** Lets a user jump to a different project without leaving the current section — the sidebar
 * link now opens straight into whichever project you're already viewing, so this is the only
 * remaining path to a different project's Execution Intelligence / Viseron Intelligence /
 * Architecture without going back to the plain Projects list first. */
export default function ProjectSwitcher({ currentProjectId, currentProjectName, buildHref }: ProjectSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data } = useSWR<ProjectOption[]>('/api/projects', jsonFetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 300_000,
  });
  const projects = data ?? [];

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Nothing to switch to — keep the plain, non-interactive label.
  if (projects.length <= 1) {
    return <span className="text-[12px] font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>{currentProjectName}</span>;
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-[12px] font-medium transition-colors"
        style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}
      >
        {currentProjectName}
        <ChevronDown className="w-3 h-3" />
      </button>
      {open && (
        <div
          className="absolute left-0 top-full mt-1 w-64 max-h-80 overflow-y-auto scrollbar-thin rounded-lg shadow-2xl z-50 border"
          style={{ backgroundColor: 'var(--ax-modal)', borderColor: 'var(--ax-border)' }}
        >
          {projects.map((p) => (
            <button
              key={p.id}
              onClick={() => {
                setOpen(false);
                if (p.id !== currentProjectId) router.push(buildHref(p.id));
              }}
              className="w-full text-left px-3 py-2 text-[13px] transition-colors ax-hover-overlay"
              style={{ color: p.id === currentProjectId ? 'var(--ax-accent)' : 'rgba(var(--ax-text-rgb),0.75)' }}
            >
              {p.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
