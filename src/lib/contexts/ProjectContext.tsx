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
  myRole: 'CLIENT' | 'PMC' | 'VENDOR' | 'VIEWER' | 'CONSULTANT';
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
