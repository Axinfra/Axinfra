'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import AxinfraLogo from '@/components/AxinfraLogo';
import { useState, useEffect } from 'react';

const NAV_ITEMS = [
  { href: '/admin/dashboard', label: 'Dashboard', Icon: DashboardIcon },
  { href: '/admin/users',     label: 'Users',     Icon: UsersIcon },
  { href: '/admin/projects',  label: 'Projects',  Icon: ProjectsIcon },
  { href: '/admin/vendors',   label: 'Vendors',   Icon: VendorIcon },
  { href: '/admin/system',    label: 'System & Issues', Icon: SystemIcon },
];

interface Props {
  userEmail: string;
  userName: string;
  sidebarOpen: boolean;
  onClose: () => void;
}

export default function AdminSidebar({ userEmail, userName, sidebarOpen, onClose }: Props) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/auth/login');
  }

  const initials = userName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-[var(--ax-surface)] border-r border-[var(--ax-border)] flex flex-col
          transition-transform duration-200 ease-out
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b shrink-0" style={{ borderColor: 'var(--ax-border)' }}>
          <div onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AxinfraLogo size="md" href="/admin/dashboard" />
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--ax-accent)', letterSpacing: '1.5px', textTransform: 'uppercase', lineHeight: 1 }}>Admin</span>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto">
          <p className="px-3 mb-2 text-[10px] font-medium text-[rgba(var(--ax-text-rgb),0.35)] uppercase tracking-wider">Platform</p>
          <div className="space-y-0.5">
            {NAV_ITEMS.map(({ href, label, Icon }) => {
              const isActive = pathname === href || (href !== '/admin' && pathname.startsWith(href + '/'));
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={onClose}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-100
                    ${isActive
                      ? 'bg-[rgba(var(--ax-accent-rgb),0.08)] text-[var(--ax-accent)] border-l-2 border-[var(--ax-accent)]'
                      : 'text-[rgba(var(--ax-text-rgb),0.5)] hover:bg-[var(--ax-overlay-hover)] hover:text-[var(--ax-text)]'
                    }`}
                >
                  <Icon className="w-[18px] h-[18px] shrink-0" />
                  {label}
                </Link>
              );
            })}
          </div>

          <div className="my-3 border-t border-[var(--ax-border-subtle)]" />

          <p className="px-3 mb-2 text-[10px] font-medium text-[rgba(var(--ax-text-rgb),0.35)] uppercase tracking-wider">App</p>
          <Link
            href="/projects"
            className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[rgba(var(--ax-text-rgb),0.4)] hover:bg-[var(--ax-overlay-hover)] hover:text-[var(--ax-text)] transition-colors"
          >
            <BackIcon className="w-[18px] h-[18px] shrink-0" />
            Back to App
          </Link>
        </nav>

        {/* User section */}
        <div className="border-t border-[var(--ax-border)] px-3 py-3 shrink-0">
          <div className="flex items-center gap-2.5 px-2">
            <div className="w-8 h-8 rounded-full bg-[rgba(var(--ax-accent-rgb),0.15)] border border-[rgba(var(--ax-accent-rgb),0.3)] flex items-center justify-center shrink-0">
              <span className="text-[11px] font-bold text-[var(--ax-accent)]">{initials}</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="text-[13px] font-medium text-[var(--ax-text)] truncate">{userName}</p>
                <span className="shrink-0 text-[8px] font-bold tracking-widest text-[var(--ax-accent)] bg-[rgba(var(--ax-accent-rgb),0.12)] border border-[rgba(var(--ax-accent-rgb),0.2)] px-1.5 py-0.5 rounded-full uppercase">Admin</span>
              </div>
              <p className="text-[11px] text-[rgba(var(--ax-text-rgb),0.35)] truncate">{userEmail}</p>
            </div>
            <button
              onClick={handleLogout}
              className="p-1.5 rounded-md text-[rgba(var(--ax-text-rgb),0.35)] hover:text-[#e06050] hover:bg-[rgba(220,80,60,0.1)] transition-colors shrink-0"
              title="Sign out"
              aria-label="Sign out"
            >
              <LogoutIcon className="w-4 h-4" />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}

/* ── SVG Icons (Heroicons outline style) ─────────────────────────── */

function DashboardIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z" />
    </svg>
  );
}

function ProjectsIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
    </svg>
  );
}

function VendorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.016 2.016 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z" />
    </svg>
  );
}

function SystemIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
    </svg>
  );
}

function BackIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3" />
    </svg>
  );
}

function LogoutIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
    </svg>
  );
}
