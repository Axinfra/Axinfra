'use client';

/**
 * ProjectContext — fetches `/api/projects/[projectId]` once for the whole
 * project workspace and exposes the result via `useProject()`.
 *
 * Why: many pages re-fetch the same project metadata on every navigation
 * (3.7KB UUID-keyed request). Hoisting it to the layout via SWR with a long
 * dedupingInterval means subsequent navigations within the workspace are
 * instant for that data.
 */

import { createContext, useContext, type ReactNode } from 'react';
import useSWR from 'swr';
import { jsonFetcher } from '@/lib/fetcher';

export interface ProjectMeta {
  id: string;
  name: string;
  description?: string | null;
  status?: string;
  /** ISO currency code from the project's own metadata (e.g. "INR", "AED") — always
   * present, defaults to "INR" server-side for projects created before this existed. */
  currency: string;
  myRole: 'CLIENT' | 'PMC' | 'VENDOR' | 'VIEWER' | 'CONSULTANT' | 'SITE_ENGINEER';
  /** Every role the caller holds on this project — more than one entry means the Navbar's
   * role switcher should show. `myRole` is whichever of these is currently active. */
  myRoles?: Array<'CLIENT' | 'PMC' | 'VENDOR' | 'VIEWER' | 'CONSULTANT' | 'SITE_ENGINEER'>;
  permissions?: Record<string, boolean>;
  // Anything else the API returns; consumers cast as needed.
  [key: string]: unknown;
}

interface ProjectContextValue {
  project: ProjectMeta | null;
  isLoading: boolean;
  error: Error | undefined;
  refetch: () => void;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

interface ProjectProviderProps {
  projectId: string;
  children: ReactNode;
}

export function ProjectProvider({ projectId, children }: ProjectProviderProps) {
  const { data, error, isLoading, mutate } = useSWR<ProjectMeta>(
    projectId ? `/api/projects/${projectId}` : null,
    jsonFetcher,
    {
      revalidateOnFocus: false,
      // 5 minutes — the same call inside this window returns cached data.
      dedupingInterval: 300_000,
    },
  );

  const value: ProjectContextValue = {
    project: data ?? null,
    isLoading,
    error,
    refetch: () => {
      void mutate();
    },
  };

  return <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>;
}

/**
 * Hook to read the current project's metadata. Must be called inside a
 * `ProjectProvider` (rendered by the project workspace layout).
 */
export function useProject(): ProjectContextValue {
  const ctx = useContext(ProjectContext);
  if (!ctx) {
    throw new Error('useProject() must be used inside <ProjectProvider>');
  }
  return ctx;
}
