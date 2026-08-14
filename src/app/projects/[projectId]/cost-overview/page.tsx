'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * Cost Overview moved into the Analysis page as a tab (after Time & Money
 * Variance) — this route now just forwards any existing links/bookmarks
 * there instead of 404ing. See src/app/projects/[projectId]/analysis/page.tsx.
 */
export default function CostOverviewRedirect() {
  const params = useParams();
  const router = useRouter();
  const projectId = params.projectId as string;

  useEffect(() => {
    router.replace(`/projects/${projectId}/analysis?tab=cost`);
  }, [projectId, router]);

  return null;
}
