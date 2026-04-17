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
        <span className="text-[12px] text-[rgba(232,228,220,0.55)] font-medium">{projectName}</span>
        <span className="px-2 py-0.5 rounded-full bg-[rgba(50,200,120,0.1)] text-[#5cba80] text-[11px] font-medium">
          Vendor Portal
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
                  ? 'border-[#5cba80] text-[#5cba80]'
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
