'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface ViseronNavProps {
  projectId: string;
  projectName: string;
  role: string;
}

export default function ViseronNav({ projectId, projectName, role }: ViseronNavProps) {
  const pathname = usePathname();
  const base = `/viseron-intelligence/${projectId}`;

  const tabs = [
    { href: `${base}/dashboard`, label: 'Dashboard', icon: PulseIcon },
    { href: `${base}/vendors`, label: 'Vendors', icon: VendorGridIcon },
    { href: `${base}/query`, label: 'Query', icon: TerminalIcon },
  ];

  return (
    <div className="mb-8">
      {/* Breadcrumb with Viseron branding */}
      <div className="flex items-center gap-2 mb-5">
        <Link
          href="/viseron-intelligence"
          className="flex items-center gap-1.5 text-[12px] text-[rgba(var(--ax-text-rgb),0.35)] hover:text-[rgba(var(--ax-text-rgb),0.55)] transition-colors"
        >
          <ViseronMark className="w-3.5 h-3.5" />
          Viseron Intelligence
        </Link>
        <span className="text-[rgba(var(--ax-text-rgb),0.12)] text-[12px]">/</span>
        <span className="text-[12px] text-[rgba(var(--ax-text-rgb),0.55)] font-medium">{projectName}</span>
        <span className="ml-2 px-2 py-0.5 rounded-full bg-[rgba(var(--ax-accent-rgb),0.08)] text-[var(--ax-accent)] text-[11px] font-medium">
          {role}
        </span>
      </div>

      {/* Tab bar with subtle glow effect */}
      <div className="flex items-center gap-0.5 border-b border-[var(--ax-border)]">
        {tabs.map((tab) => {
          const isActive = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex items-center gap-2 px-4 py-2.5 text-[13px] font-medium border-b-2 -mb-px transition-all duration-200
                ${isActive
                  ? 'border-[var(--ax-accent)] text-[var(--ax-accent)]'
                  : 'border-transparent text-[rgba(var(--ax-text-rgb),0.55)] hover:text-[var(--ax-text)] hover:border-[var(--ax-border)]'
                }`}
            >
              <tab.icon className={`w-3.5 h-3.5 ${isActive ? 'text-[var(--ax-accent)]' : ''}`} />
              {tab.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

/* ---- Inline SVG Icons ---- */

function ViseronMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 16 16" fill="none">
      <path d="M8 1L14.5 4.75V12.25L8 16L1.5 12.25V4.75L8 1Z" fill="currentColor" fillOpacity="0.15" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="8" cy="8.5" r="2.5" fill="currentColor" fillOpacity="0.4" />
      <path d="M8 3.5V6M8 11V13.5M4 6.5L6 7.5M10 9.5L12 10.5M4 10.5L6 9.5M10 7.5L12 6.5" stroke="currentColor" strokeWidth="0.8" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

function PulseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 12h3l3-9 4 18 3-9h5" />
    </svg>
  );
}

function VendorGridIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function TerminalIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 7.5l3 2.25-3 2.25m4.5 0h3M4.5 19.5h15a2.25 2.25 0 002.25-2.25V6.75A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25v10.5A2.25 2.25 0 004.5 19.5z" />
    </svg>
  );
}
