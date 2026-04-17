'use client';

import Link from 'next/link';
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
  Wallet
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface NavbarProps {
  projectId: string;
  projectName: string;
  role: string;
}

const roleColors: Record<string, "default" | "secondary" | "outline" | "destructive" | "success" | "warning" | "neutral"> = {
  OWNER: 'default',
  PMC: 'warning',
  VENDOR: 'success',
  VIEWER: 'secondary',
};

export default function Navbar({ projectId, projectName, role }: NavbarProps) {
  const pathname = usePathname();

  const navItems = [
    { href: `/projects/${projectId}`, label: 'Overview', icon: LayoutDashboard, always: true },
    { href: `/projects/${projectId}/boq`, label: 'BOQ', icon: FileText, always: true },
    { href: `/projects/${projectId}/milestones`, label: 'Milestones', icon: Flag, always: true },
    { href: `/projects/${projectId}/views`, label: 'Views', icon: Layers, always: true },
    { href: `/projects/${projectId}/analysis`, label: 'Analysis', icon: BarChart2, roles: ['OWNER', 'PMC'] },
    { href: `/projects/${projectId}/evidence-review`, label: 'Evidence', icon: FileCheck, roles: ['OWNER', 'PMC'] },
    { href: `/projects/${projectId}/payments`, label: 'Payments', icon: CreditCard, roles: ['OWNER', 'PMC', 'VENDOR'] },
    { href: `/projects/${projectId}/follow-ups`, label: 'Follow-ups', icon: BellRing, roles: ['OWNER', 'PMC'] },
    { href: `/projects/${projectId}/dashboard`, label: 'Dashboard', icon: BarChart2, always: true },
    { href: `/projects/${projectId}/audit-log`, label: 'Audit Log', icon: History, always: true },
    { href: `/projects/${projectId}/cash`, label: 'Cash', icon: Wallet, roles: ['OWNER'] },
    { href: `/projects/${projectId}/roles`, label: 'Roles', icon: Users, roles: ['OWNER'] },
    { href: `/projects/${projectId}/settings`, label: 'Settings', icon: Settings, roles: ['OWNER'] },
    { href: `/projects`, label: 'Manage Projects', icon: FolderOpen, roles: ['OWNER'] },
  ];

  const visibleItems = navItems.filter(
    (item) => item.always || (item.roles && item.roles.includes(role))
  );

  return (
    <div className="mb-8 space-y-4">
      {/* Breadcrumb + Role */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <Link
            href="/projects"
            className="flex items-center gap-1.5 text-sm font-medium text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] transition-colors shrink-0 group"
          >
            <FolderOpen className="h-4 w-4 text-[rgba(232,228,220,0.35)] group-hover:text-[rgba(232,228,220,0.55)]" />
            Projects
          </Link>
          <ChevronRight className="h-4 w-4 text-[rgba(255,255,255,0.12)] shrink-0" />
          <h1 className="text-xl font-bold text-[#e8e4dc] truncate tracking-tight">{projectName}</h1>
        </div>
        <Badge variant={roleColors[role] || 'secondary'} className="px-3 py-1 text-xs uppercase tracking-wider">
          {role}
        </Badge>
      </div>

      {/* Tab Navigation */}
      <nav className="border-b border-[rgba(255,255,255,0.07)]">
        <div className="flex gap-1 overflow-x-auto scrollbar-thin pb-0.5">
          {visibleItems.map((item) => {
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-2 whitespace-nowrap px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 outline-none rounded-t-md",
                  isActive
                    ? "border-[#c4a35a] text-[#c4a35a] bg-[rgba(196,163,90,0.08)]"
                    : "border-transparent text-[rgba(232,228,220,0.55)] hover:text-[#e8e4dc] hover:border-[rgba(255,255,255,0.12)] hover:bg-[rgba(255,255,255,0.03)]"
                )}
              >
                <item.icon className={cn("h-4 w-4", isActive ? "text-[#c4a35a]" : "text-[rgba(232,228,220,0.35)]")} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
