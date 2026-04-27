'use client';

import { useParams } from 'next/navigation';
import { ProjectProvider } from '@/lib/contexts/ProjectContext';

export default function ExecutionIntelligenceProjectLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams();
  const projectId = params?.projectId as string;
  return <ProjectProvider projectId={projectId}>{children}</ProjectProvider>;
}
