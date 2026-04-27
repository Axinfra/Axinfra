'use client';

import { useParams } from 'next/navigation';
import { ProjectProvider } from '@/lib/contexts/ProjectContext';

export default function ProjectWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // useParams() is the safe client-side way to read route params; it always
  // returns synchronous data and never depends on the (Promise vs sync) params
  // prop typing that varies between Next 14.x patch versions.
  const params = useParams();
  const projectId = params?.projectId as string;
  return <ProjectProvider projectId={projectId}>{children}</ProjectProvider>;
}
