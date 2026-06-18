'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface VendorNavProps {
  projectName: string;
}

export default function VendorNav({ projectName }: VendorNavProps) {
  const pathname = usePathname();

  const tabs = [
    { href: '/vendor/overview',   label: 'Overview' },
    { href: '/vendor/gantt',      label: 'Gantt' },
    { href: '/vendor/analytics',  label: 'Analytics' },
  ];

  return (
    <div className="mb-6">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <span className="text-[12px] font-medium" style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>
          {projectName}
        </span>
        <span className="px-2 py-0.5 rounded-full text-[11px] font-medium"
          style={{ background: 'rgba(var(--ax-accent-rgb),0.1)', color: 'var(--ax-accent)' }}>
          Vendor Portal
        </span>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b" style={{ borderColor: 'var(--ax-border)' }}>
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className="ax-tab-active ax-tab-inactive"
              style={isActive ? {
                borderBottom: '2px solid var(--ax-accent)',
                color: 'var(--ax-accent)',
                marginBottom: -1,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-block',
                transition: 'all 0.2s',
              } : {
                borderBottom: '2px solid transparent',
                color: 'rgba(var(--ax-text-rgb),0.55)',
                marginBottom: -1,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-block',
                transition: 'all 0.2s',
              }}
            >
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}
