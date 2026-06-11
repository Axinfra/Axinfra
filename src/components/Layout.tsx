'use client';

import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { useState, useEffect, useRef, FormEvent } from 'react';

interface LayoutProps {
  children: React.ReactNode;
}

interface ProjectRoleInfo {
  projectId: string;
  projectName: string;
  role: string;
}

interface User {
  id: string;
  name: string;
  email: string;
}

interface Notification {
  id: string;
  eventType: string;
  message: string;
  severity: string;
  projectId: string | null;
  projectName: string;
  entityId: string | null;
  entityType: string | null;
  createdAt: string;
}

export default function Layout({ children }: LayoutProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isVendorOnly, setIsVendorOnly] = useState(false);
  const [vendorProjects, setVendorProjects] = useState<ProjectRoleInfo[]>([]);

  // Support modal
  const [supportOpen, setSupportOpen] = useState(false);
  const [support, setSupport] = useState({ name: '', email: '', subject: '', message: '' });
  const [supportState, setSupportState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [supportError, setSupportError] = useState('');

  async function handleSupportSubmit(e: FormEvent) {
    e.preventDefault();
    setSupportState('sending');
    setSupportError('');
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(support),
      });
      const data = await res.json();
      if (data.success) {
        setSupportState('sent');
        setSupport({ name: '', email: '', subject: '', message: '' });
      } else {
        setSupportState('error');
        setSupportError(data.error || 'Something went wrong');
      }
    } catch {
      setSupportState('error');
      setSupportError('Network error. Please email dev@axinfra.in directly.');
    }
  }

  // Notifications
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [notifOpen, setNotifOpen] = useState(false);
  const [lastSeenAt, setLastSeenAt] = useState<string>(() =>
    typeof window !== 'undefined'
      ? localStorage.getItem('axinfra_notif_seen') ?? new Date(0).toISOString()
      : new Date(0).toISOString(),
  );
  const bellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/auth/session')
      .then((res) => res.json())
      .then((data) => {
        if (data.success) {
          setUser(data.data.user);
          const roles: ProjectRoleInfo[] = data.data.projectRoles || [];
          setIsAdminUser(roles.some((r) => r.role === 'CLIENT' || r.role === 'PMC'));
          const vendorOnly = roles.length > 0 && roles.every((r) => r.role === 'VENDOR');
          setIsVendorOnly(vendorOnly);
          if (vendorOnly) {
            setVendorProjects(roles.filter((r) => r.role === 'VENDOR'));
          }
        }
      })
      .catch(console.error);
  }, []);

  // Fetch notifications periodically
  useEffect(() => {
    const load = () =>
      fetch('/api/notifications')
        .then((r) => r.json())
        .then((d) => { if (d.success) setNotifications(d.data); })
        .catch(() => {});
    load();
    const id = setInterval(load, 30_000);
    return () => clearInterval(id);
  }, []);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (bellRef.current && !bellRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const unreadCount = notifications.filter(
    (n) => new Date(n.createdAt) > new Date(lastSeenAt),
  ).length;

  const handleBellClick = () => {
    if (!notifOpen) {
      const now = new Date().toISOString();
      setLastSeenAt(now);
      localStorage.setItem('axinfra_notif_seen', now);
    }
    setNotifOpen((v) => !v);
  };

  const severityColor = (s: string) =>
    s === 'HIGH' ? 'text-[#e06050]' : s === 'WARNING' ? 'text-[#f97316]' : 'text-[#5cba80]';

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/auth/login');
  };

  const navItems = isVendorOnly
    ? [
      { href: '/vendor', label: 'Vendor Portal', icon: VendorIcon },
    ]
    : [
      { href: '/projects', label: 'Projects', icon: FolderIcon },
      { href: '/execution-intelligence', label: 'Execution Intelligence', icon: ChartIcon },
      { href: '/viseron-intelligence', label: 'Viseron Intelligence', icon: ViseronNavIcon },
      ...(isAdminUser
        ? [{ href: '/admin/vendors', label: 'Vendor Onboarding', icon: UsersIcon }]
        : []),
    ];

  return (
    <div className="min-h-screen bg-[#0a0c10] flex">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 z-40 lg:hidden animate-fade-in"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 w-[260px] bg-[#0d0f13] border-r border-[rgba(255,255,255,0.07)] flex flex-col
          transition-transform duration-200 ease-out
          lg:translate-x-0 lg:static lg:z-auto
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Logo */}
        <div className="h-14 flex items-center px-5 border-b border-[rgba(255,255,255,0.07)] shrink-0">
          <Link href="/projects" className="flex items-center gap-2.5" onClick={() => setSidebarOpen(false)}>
            <div className="w-7 h-7 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4a35a 0%, #a8893e 100%)' }}>
              <span className="text-[#0a0c10] text-[10px] font-bold tracking-tight font-display">A</span>
            </div>
            <span className="text-[15px] font-semibold text-[#e8e4dc] tracking-tight">Axinfra</span>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-3 overflow-y-auto scrollbar-thin">
          <p className="px-3 mb-2 text-[10px] font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wider">Menu</p>
          <div className="space-y-0.5">
            {navItems.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-100
                    ${isActive
                      ? 'bg-[rgba(196,163,90,0.08)] text-[#c4a35a] border-l-2 border-[#c4a35a]'
                      : 'text-[rgba(232,228,220,0.5)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#e8e4dc]'
                    }`}
                >
                  <item.icon className="w-[18px] h-[18px] shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </div>

          {/* My Milestones – vendor projects grouped by name */}
          {isVendorOnly && vendorProjects.length > 0 && (
            <>
              <p className="px-3 mt-5 mb-2 text-[10px] font-medium text-[rgba(232,228,220,0.35)] uppercase tracking-wider">My Milestones</p>
              <div className="space-y-0.5">
                {vendorProjects.map((vp) => {
                  const milestoneHref = `/projects/${vp.projectId}/milestones`;
                  const isActive = pathname === milestoneHref || pathname.startsWith(milestoneHref + '/');
                  return (
                    <Link
                      key={vp.projectId}
                      href={milestoneHref}
                      onClick={() => setSidebarOpen(false)}
                      className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors duration-100
                        ${isActive
                          ? 'bg-[rgba(196,163,90,0.08)] text-[#c4a35a] border-l-2 border-[#c4a35a]'
                          : 'text-[rgba(232,228,220,0.5)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#e8e4dc]'
                        }`}
                    >
                      <FlagIcon className="w-[18px] h-[18px] shrink-0" />
                      {vp.projectName}
                    </Link>
                  );
                })}
              </div>
            </>
          )}
        </nav>

        {/* Support button */}
        <div className="px-3 pb-2 shrink-0">
          <button
            onClick={() => { setSupportOpen(true); setSupportState('idle'); }}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-[13px] font-medium text-[rgba(232,228,220,0.5)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#e8e4dc] transition-colors duration-100"
          >
            <SupportIcon className="w-[18px] h-[18px] shrink-0" />
            Support
          </button>
        </div>

        {/* User section */}
        {user && (
          <div className="border-t border-[rgba(255,255,255,0.07)] px-3 py-3 shrink-0">
            <div className="flex items-center gap-2.5 px-2">
              <div className="w-8 h-8 rounded-full bg-[rgba(196,163,90,0.12)] flex items-center justify-center shrink-0">
                <span className="text-[11px] font-semibold text-[#c4a35a]">
                  {user.name.split(' ').map(n => n[0]).join('').toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[13px] font-medium text-[#e8e4dc] truncate">{user.name}</p>
                <p className="text-[11px] text-[rgba(232,228,220,0.35)] truncate">{user.email}</p>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-md text-[rgba(232,228,220,0.35)] hover:text-[#e06050] hover:bg-[rgba(220,80,60,0.1)] transition-colors"
                title="Sign out"
                aria-label="Sign out"
              >
                <LogoutIcon className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </aside>

      {/* Main content area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 bg-[#0a0c10]/80 backdrop-blur-sm border-b border-[rgba(255,255,255,0.07)] flex items-center px-4 lg:px-6 shrink-0 sticky top-0 z-30">
          <button
            onClick={() => setSidebarOpen(true)}
            className="p-2 -ml-2 rounded-lg text-[rgba(232,228,220,0.5)] hover:bg-[rgba(255,255,255,0.05)] lg:hidden mr-2"
            aria-label="Open menu"
          >
            <MenuIcon className="w-5 h-5" />
          </button>

          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-2 mr-auto">
            <div className="w-6 h-6 rounded-md flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #c4a35a 0%, #a8893e 100%)' }}>
              <span className="text-[#0a0c10] text-[9px] font-bold font-display">A</span>
            </div>
            <span className="text-sm font-semibold text-[#e8e4dc]">Axinfra</span>
          </div>

          <div className="hidden lg:block flex-1" />

          {/* Right side */}
          <div className="flex items-center gap-3">
            {user && (
              <span className="text-[13px] text-[rgba(232,228,220,0.55)] hidden sm:block">{user.name}</span>
            )}

            {/* Notification bell */}
            <div ref={bellRef} className="relative">
              <button
                onClick={handleBellClick}
                className="relative p-2 rounded-lg text-[rgba(232,228,220,0.5)] hover:bg-[rgba(255,255,255,0.05)] hover:text-[#e8e4dc] transition-colors"
                aria-label="Notifications"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
                    d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
                </svg>
                {unreadCount > 0 && (
                  <span className="absolute top-1 right-1 w-4 h-4 rounded-full bg-[#e06050] text-white text-[9px] font-bold flex items-center justify-center">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </button>

              {/* Dropdown */}
              {notifOpen && (
                <div className="absolute right-0 top-full mt-2 w-80 bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-xl shadow-2xl z-50 overflow-hidden">
                  <div className="px-4 py-3 border-b border-[rgba(255,255,255,0.07)]">
                    <p className="text-sm font-semibold text-[#e8e4dc]">Notifications</p>
                    <p className="text-xs text-[rgba(232,228,220,0.4)]">Last 7 days</p>
                  </div>
                  <div className="max-h-80 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <p className="text-sm text-[rgba(232,228,220,0.4)] text-center py-8">No notifications</p>
                    ) : (
                      notifications.map((n) => (
                        <div
                          key={n.id}
                          onClick={() => {
                            setNotifOpen(false);
                            if (n.projectId && n.entityId && n.entityType === 'Milestone') {
                              router.push(`/projects/${n.projectId}/milestones/${n.entityId}`);
                            }
                          }}
                          className="px-4 py-3 border-b border-[rgba(255,255,255,0.04)] hover:bg-[rgba(255,255,255,0.03)] cursor-pointer transition-colors"
                        >
                          <div className="flex items-start gap-2">
                            <span className={`text-base mt-0.5 shrink-0 ${severityColor(n.severity)}`}>
                              {n.severity === 'HIGH' ? '🔔' : n.severity === 'WARNING' ? '⚠' : '✓'}
                            </span>
                            <div className="min-w-0">
                              <p className="text-xs text-[rgba(232,228,220,0.8)] leading-relaxed">{n.message}</p>
                              {n.projectName && (
                                <p className="text-[10px] text-[rgba(232,228,220,0.35)] mt-0.5">{n.projectName}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-[1200px] mx-auto px-4 lg:px-8 py-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>

      {/* Support Modal */}
      {supportOpen && (
        <div className="fixed inset-0 bg-black/70 flex items-end sm:items-center justify-center z-[60] p-4">
          <div className="bg-[#13151a] border border-[rgba(255,255,255,0.1)] rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="sticky top-0 bg-[#13151a] px-6 py-4 border-b border-[rgba(255,255,255,0.07)] flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-[#e8e4dc]">Support</h2>
                <p className="text-xs text-[rgba(232,228,220,0.4)] mt-0.5">We&apos;ll get back within 1–2 business days.</p>
              </div>
              <button
                onClick={() => setSupportOpen(false)}
                className="p-1.5 rounded-lg text-[rgba(232,228,220,0.4)] hover:text-[#e8e4dc] hover:bg-[rgba(255,255,255,0.06)] transition-colors"
                aria-label="Close"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6">
              {supportState === 'sent' ? (
                <div className="text-center py-6">
                  <div className="w-12 h-12 rounded-full bg-[rgba(92,186,128,0.1)] flex items-center justify-center mx-auto mb-4">
                    <svg className="w-6 h-6 text-[#5cba80]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <h3 className="text-base font-semibold text-[#e8e4dc] mb-2">Message sent!</h3>
                  <p className="text-sm text-[rgba(232,228,220,0.5)] mb-5">We&apos;ve sent a confirmation to your email and will be in touch shortly.</p>
                  <button onClick={() => setSupportOpen(false)} className="btn btn-secondary text-sm">
                    Close
                  </button>
                </div>
              ) : (
                <form onSubmit={handleSupportSubmit} className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label text-xs">Name *</label>
                      <input
                        type="text" required className="input text-sm"
                        value={support.name}
                        onChange={e => setSupport(s => ({ ...s, name: e.target.value }))}
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label className="label text-xs">Email *</label>
                      <input
                        type="email" required className="input text-sm"
                        value={support.email}
                        onChange={e => setSupport(s => ({ ...s, email: e.target.value }))}
                        placeholder="you@company.com"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="label text-xs">Subject *</label>
                    <select
                      required className="input text-sm"
                      value={support.subject}
                      onChange={e => setSupport(s => ({ ...s, subject: e.target.value }))}
                    >
                      <option value="" disabled>Select a topic…</option>
                      <option value="Bug report">Bug report</option>
                      <option value="Feature request">Feature request</option>
                      <option value="Account or login issue">Account or login issue</option>
                      <option value="Billing or payment query">Billing or payment query</option>
                      <option value="General inquiry">General inquiry</option>
                    </select>
                  </div>

                  <div>
                    <label className="label text-xs">Message *</label>
                    <textarea
                      required rows={4} className="input text-sm resize-none"
                      value={support.message}
                      onChange={e => setSupport(s => ({ ...s, message: e.target.value }))}
                      placeholder="Describe your issue or question…"
                    />
                  </div>

                  {supportState === 'error' && (
                    <div className="alert alert-error text-sm">{supportError}</div>
                  )}

                  <div className="flex justify-end gap-3 pt-1">
                    <button type="button" onClick={() => setSupportOpen(false)} className="btn btn-secondary text-sm">
                      Cancel
                    </button>
                    <button type="submit" disabled={supportState === 'sending'} className="btn btn-primary text-sm">
                      {supportState === 'sending' ? 'Sending…' : 'Send Message'}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ---- Inline SVG Icons (Heroicons outline style) ---- */

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 014.5 9.75h15A2.25 2.25 0 0121.75 12v.75m-8.69-6.44l-2.12-2.12a1.5 1.5 0 00-1.06-.44H4.5A2.25 2.25 0 002.25 6v12a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9a2.25 2.25 0 00-2.25-2.25h-5.379a1.5 1.5 0 01-1.06-.44z" />
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

function MenuIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
    </svg>
  );
}

function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z" />
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

function VendorIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 21v-7.5a.75.75 0 01.75-.75h3a.75.75 0 01.75.75V21m-4.5 0H2.36m11.14 0H18m0 0h3.64m-1.39 0V9.349m-16.5 11.65V9.35m0 0a3.001 3.001 0 003.75-.615A2.993 2.993 0 009.75 9.75c.896 0 1.7-.393 2.25-1.016a2.993 2.993 0 002.25 1.016c.896 0 1.7-.393 2.25-1.016a3.001 3.001 0 003.75.614m-16.5 0a3.004 3.004 0 01-.621-4.72L4.318 3.44A1.5 1.5 0 015.378 3h13.243a1.5 1.5 0 011.06.44l1.19 1.189a3 3 0 01-.621 4.72m-13.5 8.65h3.75a.75.75 0 00.75-.75V13.5a.75.75 0 00-.75-.75H6.75a.75.75 0 00-.75.75v3.75c0 .415.336.75.75.75z" />
    </svg>
  );
}

function FlagIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 3v1.5M3 21v-6m0 0 2.77-.693a9 9 0 0 1 6.208.682l.108.054a9 9 0 0 0 6.086.71l3.114-.732a48.524 48.524 0 0 1-.005-10.499l-3.11.732a9 9 0 0 1-6.085-.711l-.108-.054a9 9 0 0 0-6.208-.682L3 4.5M3 15V4.5" />
    </svg>
  );
}

function ViseronNavIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 3L20 7.5V16.5L12 21L4 16.5V7.5L12 3Z" />
      <circle cx="12" cy="12" r="3" strokeWidth={1.5} />
      <path strokeLinecap="round" d="M12 6V9M12 15V18M7 8.5L9.5 10M14.5 14L17 15.5M7 15.5L9.5 14M14.5 10L17 8.5" strokeWidth="1" opacity="0.5" />
    </svg>
  );
}

function SupportIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 5.25h.008v.008H12v-.008Z" />
    </svg>
  );
}

function CloseIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}