'use client';

import Link from 'next/link';
import { Home, ChevronLeft } from 'lucide-react';
import { cardShadow } from './vendorTheme';
import VendorProjectSwitcher from './VendorProjectSwitcher';

interface ProjectOption {
  id: string;
  name: string;
}

/** The simple top bar used on every vendor page instead of a tab strip: a Home button (always
 * gets back to the big-tile screen), a big title, an optional back arrow for nested pages, and
 * the project switcher only when the vendor actually has more than one project. */
export default function VendorNav({
  title,
  backHref,
  projectName,
  allProjects,
  currentProjectId,
  onProjectChange,
}: {
  title?: string;
  backHref?: string;
  projectName?: string;
  allProjects?: ProjectOption[];
  currentProjectId?: string;
  onProjectChange?: (projectId: string) => void;
}) {
  return (
    <div className="mb-7 space-y-3.5">
      <div className="flex items-center gap-2.5">
        <Link
          href="/vendor"
          aria-label="Home"
          className="flex items-center justify-center w-12 h-12 rounded-full shrink-0"
          style={{ background: 'var(--ax-card)', color: 'var(--ax-accent)', ...cardShadow }}
        >
          <Home className="w-5 h-5" strokeWidth={2.5} />
        </Link>
        {backHref && (
          <Link
            href={backHref}
            aria-label="Back"
            className="flex items-center justify-center w-12 h-12 rounded-full shrink-0"
            style={{ background: 'var(--ax-card)', color: 'var(--ax-text)', ...cardShadow }}
          >
            <ChevronLeft className="w-6 h-6" strokeWidth={2.5} />
          </Link>
        )}
        {title && (
          <h1 className="text-3xl font-bold truncate" style={{ color: 'var(--ax-text)' }}>{title}</h1>
        )}
      </div>

      {projectName && (
        allProjects && allProjects.length > 1 && onProjectChange && currentProjectId ? (
          <VendorProjectSwitcher
            projects={allProjects}
            currentProjectId={currentProjectId}
            currentProjectName={projectName}
            onChange={onProjectChange}
          />
        ) : (
          <span className="text-base font-semibold" style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>{projectName}</span>
        )
      )}
    </div>
  );
}
