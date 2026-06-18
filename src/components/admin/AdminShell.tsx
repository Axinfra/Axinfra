'use client';

import { useState } from 'react';
import AdminSidebar from './AdminSidebar';
import ThemeNavbarPicker from '@/components/ThemeSwitcher';

interface Props {
  userEmail: string;
  userName: string;
  children: React.ReactNode;
}

export default function AdminShell({ userEmail, userName, children }: Props) {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Prevent body scroll when mobile sidebar is open
  if (typeof document !== 'undefined') {
    document.body.style.overflow = sidebarOpen ? 'hidden' : '';
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--ax-bg)' }}>
      <AdminSidebar
        userEmail={userEmail}
        userName={userName}
        sidebarOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        {/* Top bar */}
        <header className="h-14 backdrop-blur-sm border-b flex items-center px-4 lg:px-6 shrink-0 sticky top-0 z-30"
          style={{ background: 'var(--ax-bg)', borderColor: 'var(--ax-border)' }}>
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg lg:hidden mr-2"
            style={{ color: 'rgba(var(--ax-text-rgb),0.5)' }}
            aria-label="Open menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mr-auto">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--ax-accent) 0%, var(--ax-accent-hover) 100%)' }}>
              <span className="text-[9px] font-bold" style={{ color: 'var(--ax-bg)' }}>A</span>
            </div>
            <span className="text-sm font-semibold" style={{ color: 'var(--ax-text)' }}>Admin</span>
          </div>

          <div className="hidden lg:block flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-3">
            <ThemeNavbarPicker />
            <span className="text-[13px] hidden sm:block" style={{ color: 'rgba(var(--ax-text-rgb),0.55)' }}>{userName}</span>
            <span className="text-[10px] font-bold tracking-widest px-2 py-0.5 rounded-full uppercase"
              style={{ color: 'var(--ax-accent)', background: 'rgba(var(--ax-accent-rgb),0.1)', border: '1px solid rgba(var(--ax-accent-rgb),0.2)' }}>
              Platform Admin
            </span>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}
