'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface EINavProps {
  projectId: string;
  projectName: string;
  role: string;
}

export default function EINav({ projectId, projectName, role }: EINavProps) {
  const pathname = usePathname();
  const base = `/execution-intelligence/${projectId}`;

  const tabs = [
    { href: `${base}/overview`, label: 'Overview' },
    { href: `${base}/gantt`, label: 'Gantt' },
    { href: `${base}/analytics`, label: 'Analytics' },
  ];

  return (
    <div className="mb-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 mb-4">
        <Link
          href="/execution-intelligence"
          className="text-[12px] text-[rgba(var(--ax-text-rgb),0.35)] hover:text-[rgba(var(--ax-text-rgb),0.55)] transition-colors"
        >
          Execution Intelligence
        </Link>
        <span className="text-[rgba(var(--ax-text-rgb),0.12)] text-[12px]">/</span>
        <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.55)] font-medium">{projectName}</span>
        <span className="ml-2 px-2 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.08)] text-[var(--ax-accent)] text-[11px] font-medium">
          {role}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[var(--ax-border)]">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors
                ${isActive
                  ? 'border-[var(--ax-accent)] text-[var(--ax-accent)]'
                  : 'border-transparent text-[rgba(var(--ax-text-rgb),0.55)] hover:text-[var(--ax-text)] hover:border-[var(--ax-border)]'
                }`}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
