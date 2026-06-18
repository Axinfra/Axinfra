'use client';

import { useState } from 'react';
import AdminSidebar from './AdminSidebar';

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
    <div className="min-h-screen bg-[#0a0c10] flex">
      <AdminSidebar
        userEmail={userEmail}
        userName={userName}
        sidebarOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0 lg:ml-0">
        {/* Top bar — matches main Layout exactly */}
        <header className="h-14 bg-[#0a0c10]/80 backdrop-blur-sm border-b border-[rgba(255,255,255,0.07)] flex items-center px-4 lg:px-6 shrink-0 sticky top-0 z-30">
          {/* Mobile hamburger */}
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg text-[rgba(232,228,220,0.5)] hover:bg-[rgba(255,255,255,0.05)] lg:hidden mr-2"
            aria-label="Open menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mr-auto">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, var(--ax-accent) 0%, var(--ax-accent-hover) 100%)' }}>
              <span className="text-[#0a0c10] text-[9px] font-bold">A</span>
            </div>
            <span className="text-sm font-semibold text-[#e8e4dc]">Admin</span>
          </div>

          <div className="hidden lg:block flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-3">
            <span className="text-[13px] text-[rgba(232,228,220,0.55)] hidden sm:block">{userName}</span>
            <span className="text-[10px] font-bold tracking-widest text-[var(--ax-accent)] bg-[rgba(var(--ax-accent-rgb),0.1)] border border-[rgba(var(--ax-accent-rgb),0.2)] px-2 py-0.5 rounded-full uppercase">
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
