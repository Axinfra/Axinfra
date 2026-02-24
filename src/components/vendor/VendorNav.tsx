'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface VendorNavProps {
  projectName: string;
}

export default function VendorNav({ projectName }: VendorNavProps) {
  const pathname = usePathname();

  const tabs = [
    { href: '/vendor/overview', label: 'Overview' },
    { href: '/vendor/gantt', label: 'Gantt' },
    { href: '/vendor/analytics', label: 'Analytics' },
  ];

  return (
    <div className="mb-6">
      {/* Header with badge */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[12px] text-surface-600 font-medium">{projectName}</span>
        <span className="px-2 py-0.5 rounded-full bg-teal-50 text-teal-700 text-[11px] font-medium">
          Vendor Portal
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
                  ? 'border-teal-600 text-teal-700'
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
