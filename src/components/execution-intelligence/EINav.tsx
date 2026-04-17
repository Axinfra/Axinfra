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
          className="text-[12px] text-[rgba(232,228,220,0.35)] hover:text-[rgba(232,228,220,0.55)] transition-colors"
        >
          Execution Intelligence
        </Link>
        <span className="text-[rgba(255,255,255,0.12)] text-[12px]">/</span>
        <span className="text-[12px] text-[rgba(232,228,220,0.55)] font-medium">{projectName}</span>
        <span className="ml-2 px-2 py-0.5 rounded-full bg-[rgba(196,163,90,0.08)] text-[#c4a35a] text-[11px] font-medium">
          {role}
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b border-[rgba(255,255,255,0.07)]">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-colors
                ${isActive
                  ? 'border-[#c4a35a] text-[#c4a35a]'
                  : 'border-transparent text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] hover:border-[rgba(255,255,255,0.1)]'
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
