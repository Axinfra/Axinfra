'use client';

import { use } from 'react';
import { ProjectProvider } from '@/lib/contexts/ProjectContext';

export default function ExecutionIntelligenceProjectLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = use(params);
  return <ProjectProvider projectId={projectId}>{children}</ProjectProvider>;
}
