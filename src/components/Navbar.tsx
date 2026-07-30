'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import useSWR from 'swr';
import { Badge } from '@/components/ui/Badge';
import {
  LayoutDashboard,
  FileText,
  Flag,
  Layers,
  BarChart2,
  CreditCard,
  Receipt,
  BellRing,
  History,
  Users,
  Settings,
  ChevronRight,
  FolderOpen,
  CalendarRange,
  MessageCircle,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { jsonFetcher } from '@/lib/fetcher';

interface NavbarProps {
  projectId: string;
  projectName: string;
  role: string;
}

const roleColors: Record<string, "default" | "secondary" | "outline" | "destructive" | "success" | "warning" | "neutral"> = {
  CLIENT: 'default',
  PMC: 'warning',
  VENDOR: 'success',
  VIEWER: 'secondary',
  CONSULTANT: 'outline',
  SITE_ENGINEER: 'neutral',
};

const roleLabels: Record<string, string> = {
  CONSULTANT: 'CONSULTANT',
  SITE_ENGINEER: 'SITE ENGINEER',
};

export default function Navbar({ projectId, projectName, role }: NavbarProps) {
  const pathname = usePathname();

  // Map each nav target to the API endpoint(s) the destination page will
  // request. Hovering warms the server-side Redis cache for those endpoints
  // so the click feels instant.
  const navItems = [
    { href: `/projects/${projectId}`, label: 'Overview', icon: LayoutDashboard, always: true, prefetchApi: [`/api/projects/${projectId}`] },
    { href: `/projects/${projectId}/boqs`, label: role === 'CLIENT' ? 'View Orders' : 'Orders', icon: FileText, roles: ['CLIENT', 'PMC', 'CONSULTANT', 'VIEWER', 'VENDOR', 'SITE_ENGINEER'], prefetchApi: [`/api/projects/${projectId}/boq`] },
    { href: `/projects/${projectId}/schedule`, label: 'Schedule', icon: CalendarRange, roles: ['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT', 'SITE_ENGINEER'], prefetchApi: [`/api/projects/${projectId}/schedule`] },
    { href: `/projects/${projectId}/activities`, label: 'Activities', icon: Flag, always: true, prefetchApi: [`/api/projects/${projectId}/milestones`] },
    { href: `/projects/${projectId}/views`, label: 'Views', icon: Layers, always: true, prefetchApi: [`/api/projects/${projectId}/views`] },
    { href: `/projects/${projectId}/messages`, label: 'Messages', icon: MessageCircle, always: true, prefetchApi: [`/api/projects/${projectId}/messages/conversations`] },
    // Analysis and Payments are deliberately NOT extended to SITE_ENGINEER (read-only PMC
    // variant, but these two stay off-limits per the role's definition).
    { href: `/projects/${projectId}/analysis`, label: 'Analysis', icon: BarChart2, roles: ['CLIENT', 'PMC'], prefetchApi: [`/api/projects/${projectId}/analysis`] },
    { href: `/projects/${projectId}/payments`, label: role === 'VENDOR' ? 'My Invoices' : 'Payments', icon: CreditCard, roles: ['CLIENT', 'PMC', 'VENDOR'], prefetchApi: [`/api/projects/${projectId}/payment-eligibility`] },
    { href: `/projects/${projectId}/ra-bills`, label: 'RA Bills', icon: Receipt, roles: ['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT', 'SITE_ENGINEER'], prefetchApi: [`/api/projects/${projectId}/ra-bills`] },
    { href: `/projects/${projectId}/follow-ups`, label: 'Follow-ups', icon: BellRing, roles: ['CLIENT', 'PMC', 'SITE_ENGINEER'], prefetchApi: [`/api/projects/${projectId}/follow-ups`] },
    { href: `/projects/${projectId}/dashboard`, label: 'Dashboard', icon: BarChart2, always: true, prefetchApi: [`/api/projects/${projectId}/dashboard`] },
    // Was `always: true` — converted to an explicit list (every existing role included, so
    // nobody else's access changes) so SITE_ENGINEER can be excluded, per its definition.
    { href: `/projects/${projectId}/audit-log`, label: 'Audit Log', icon: History, roles: ['CLIENT', 'PMC', 'VENDOR', 'VIEWER', 'CONSULTANT'], prefetchApi: [`/api/projects/${projectId}/audit-log`] },
{ href: `/projects/${projectId}/roles`, label: 'Roles', icon: Users, roles: ['CLIENT'], prefetchApi: [`/api/projects/${projectId}/roles`] },
    { href: `/projects/${projectId}/settings`, label: 'Settings', icon: Settings, roles: ['CLIENT'] },
    { href: `/projects`, label: 'Manage Projects', icon: FolderOpen, roles: ['CLIENT'] },
  ];

  const visibleItems = navItems.filter(
    (item) => item.always || (item.roles && item.roles.includes(role))
  );

  // Global unread count (across every project the user belongs to, not just this one) — a user
  // could have unread messages in a project they aren't currently viewing. Polled rather than
  // pushed for a "live enough" feel without adding a websocket layer.
  const { data: unreadResp } = useSWR<{ count: number }>('/api/messages/unread-count', jsonFetcher, {
    refreshInterval: 15_000,
  });
  const unreadCount = unreadResp?.count ?? 0;

  // Fire-and-forget warm-up for the destination's API endpoints. Hits are
  // ignored if the response errors; only purpose is to populate the Redis
  // cache layer behind requireProjectAuth + the route-level cached() calls.
  const warmedRef = useRef<Set<string>>(new Set());
  function warmApi(endpoints?: string[]) {
    if (!endpoints) return;
    for (const url of endpoints) {
      if (warmedRef.current.has(url)) continue;
      warmedRef.current.add(url);
      // No await — completely fire-and-forget.
      fetch(url, { credentials: 'include' }).catch(() => {});
    }
  }

  return (
    <div className="mb-8 space-y-4">
      {/* Breadcrumb + Role */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/projects"
            className="ax-nav-item flex items-center gap-1.5 text-sm font-medium transition-colors shrink-0 group rounded-md px-1 py-0.5"
          >
            <FolderOpen className="h-4 w-4" />
            Projects
          </Link>
          <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'rgba(var(--ax-text-rgb), 0.2)' }} />
          <h1 className="text-xl font-bold truncate tracking-tight" style={{ color: 'var(--ax-text)' }}>{projectName}</h1>
        </div>
        <Badge variant={roleColors[role] || 'secondary'} className="px-3 py-1 text-xs uppercase tracking-wider">
          {roleLabels[role] ?? role}
        </Badge>
      </div>

      {/* Tab Navigation */}
      <nav className="border-b" style={{ borderColor: 'var(--ax-border)' }}>
        <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-0.5">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href;
            const isMessages = item.href === `/projects/${projectId}/messages`;
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onMouseEnter={() => warmApi(item.prefetchApi)}
                onFocus={() => warmApi(item.prefetchApi)}
                className={cn(
                  "relative flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 outline-none rounded-t-md",
                  isActive ? "ax-tab-active" : "ax-tab-inactive"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
                {isMessages && unreadCount > 0 && (
                  <span className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-semibold text-white bg-[#e06050] leading-none">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
