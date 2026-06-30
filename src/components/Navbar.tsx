'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { usePathname } from 'next/navigation';
import { Badge } from '@/components/ui/Badge';
import {
  LayoutDashboard,
  FileText,
  Flag,
  Layers,
  BarChart2,
  FileCheck,
  CreditCard,
  BellRing,
  History,
  Users,
  Settings,
  ChevronRight,
  FolderOpen,
  Ruler,
  CalendarRange,
} from 'lucide-react';
import { cn } from '@/lib/utils';

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
};

const roleLabels: Record<string, string> = {
  CONSULTANT: 'CONSULTANT',
};

export default function Navbar({ projectId, projectName, role }: NavbarProps) {
  const pathname = usePathname();

  // Map each nav target to the API endpoint(s) the destination page will
  // request. Hovering warms the server-side Redis cache for those endpoints
  // so the click feels instant.
  const navItems = [
    { href: `/projects/${projectId}`, label: 'Overview', icon: LayoutDashboard, always: true, prefetchApi: [`/api/projects/${projectId}`] },
    { href: `/projects/${projectId}/architecture`, label: 'Architecture', icon: Ruler, roles: ['CLIENT', 'PMC', 'CONSULTANT', 'VIEWER', 'VENDOR'], prefetchApi: [`/api/projects/${projectId}/architecture`] },
    { href: `/projects/${projectId}/boq`, label: role === 'CLIENT' ? 'View BOQ' : 'BOQ', icon: FileText, roles: ['CLIENT', 'PMC', 'CONSULTANT', 'VIEWER'], prefetchApi: [`/api/projects/${projectId}/boq`] },
    { href: `/projects/${projectId}/schedule`, label: 'Schedule', icon: CalendarRange, roles: ['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT'], prefetchApi: [`/api/projects/${projectId}/schedule`] },
    { href: `/projects/${projectId}/milestones`, label: 'Milestones', icon: Flag, always: true, prefetchApi: [`/api/projects/${projectId}/milestones`] },
    { href: `/projects/${projectId}/views`, label: 'Views', icon: Layers, always: true, prefetchApi: [`/api/projects/${projectId}/views`] },
    { href: `/projects/${projectId}/analysis`, label: 'Analysis', icon: BarChart2, roles: ['CLIENT', 'PMC'], prefetchApi: [`/api/projects/${projectId}/analysis`] },
    { href: `/projects/${projectId}/evidence-review`, label: 'Evidence', icon: FileCheck, roles: ['CLIENT', 'PMC'] },
    { href: `/projects/${projectId}/payments`, label: role === 'VENDOR' ? 'My Invoices' : 'Payments', icon: CreditCard, roles: ['CLIENT', 'PMC', 'VENDOR'], prefetchApi: [`/api/projects/${projectId}/payment-eligibility`] },
    { href: `/projects/${projectId}/follow-ups`, label: 'Follow-ups', icon: BellRing, roles: ['CLIENT', 'PMC'], prefetchApi: [`/api/projects/${projectId}/follow-ups`] },
    { href: `/projects/${projectId}/dashboard`, label: 'Dashboard', icon: BarChart2, always: true, prefetchApi: [`/api/projects/${projectId}/dashboard`] },
    { href: `/projects/${projectId}/audit-log`, label: 'Audit Log', icon: History, always: true, prefetchApi: [`/api/projects/${projectId}/audit-log`] },
{ href: `/projects/${projectId}/roles`, label: 'Roles', icon: Users, roles: ['CLIENT'], prefetchApi: [`/api/projects/${projectId}/roles`] },
    { href: `/projects/${projectId}/settings`, label: 'Settings', icon: Settings, roles: ['CLIENT'] },
    { href: `/projects`, label: 'Manage Projects', icon: FolderOpen, roles: ['CLIENT'] },
  ];

  const visibleItems = navItems.filter(
    (item) => item.always || (item.roles && item.roles.includes(role))
  );

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
            return (
              <Link
                key={item.href}
                href={item.href}
                prefetch={true}
                onMouseEnter={() => warmApi(item.prefetchApi)}
                onFocus={() => warmApi(item.prefetchApi)}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 outline-none rounded-t-md",
                  isActive ? "ax-tab-active" : "ax-tab-inactive"
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
