'use client';

import { use } from 'react';
import { ProjectProvider } from '@/lib/contexts/ProjectContext';

export default function ProjectWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  // Next.js 14 App Router passes params as a Promise to layouts/pages;
  // unwrap with React.use() since this is a client component.
  const { projectId } = use(params);
  return <ProjectProvider projectId={projectId}>{children}</ProjectProvider>;
}
