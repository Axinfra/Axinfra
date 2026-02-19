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
          className="text-[12px] text-surface-400 hover:text-surface-600 transition-colors"
        >
          Execution Intelligence
        </Link>
        <span className="text-surface-300 text-[12px]">/</span>
        <span className="text-[12px] text-surface-600 font-medium">{projectName}</span>
        <span className="ml-2 px-2 py-0.5 rounded-full bg-primary-50 text-primary-600 text-[11px] font-medium">
          {role}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-surface-200">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors
                ${isActive
                  ? 'border-primary-600 text-primary-700'
                  : 'border-transparent text-surface-500 hover:text-surface-800 hover:border-surface-300'
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
