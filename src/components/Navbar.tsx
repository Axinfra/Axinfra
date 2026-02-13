'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface NavbarProps {
  projectId: string;
  projectName: string;
  role: string;
}

export default function Navbar({ projectId, projectName, role }: NavbarProps) {
  const pathname = usePathname();

  const navItems = [
    { href: `/projects/${projectId}`, label: 'Overview', always: true },
    { href: `/projects/${projectId}/boq`, label: 'BOQ', always: true },
    { href: `/projects/${projectId}/milestones`, label: 'Milestones', always: true },
    { href: `/projects/${projectId}/views`, label: 'Custom Views', always: true },
    { href: `/projects/${projectId}/analysis`, label: 'Analysis', roles: ['OWNER', 'PMC'] },
    { href: `/projects/${projectId}/evidence-review`, label: 'Evidence Review', roles: ['OWNER', 'PMC'] },
    { href: `/projects/${projectId}/payments`, label: 'Payments', roles: ['OWNER', 'PMC', 'VENDOR'] },
    { href: `/projects/${projectId}/follow-ups`, label: 'Follow-ups', roles: ['OWNER', 'PMC'] },
    { href: `/projects/${projectId}/dashboard`, label: 'Dashboard', always: true },
    { href: `/projects/${projectId}/audit-log`, label: 'Audit Log', always: true },
    { href: `/projects/${projectId}/roles`, label: 'Roles', roles: ['OWNER'] },
    { href: `/projects/${projectId}/settings`, label: 'Settings', roles: ['OWNER'] },
  ];

  const visibleItems = navItems.filter(
    (item) => item.always || (item.roles && item.roles.includes(role))
  );

  return (
    <div className="bg-white border-b border-gray-200 mb-6">
      <div className="flex items-center justify-between py-4">
        <div>
          <Link href="/projects" className="text-sm text-gray-500 hover:text-gray-700">
            Projects
          </Link>
          <span className="mx-2 text-gray-300">/</span>
          <span className="text-lg font-semibold text-gray-900">{projectName}</span>
          <span className="ml-2 badge badge-draft">{role}</span>
        </div>
      </div>
      <nav className="flex space-x-6 overflow-x-auto pb-2">
        {visibleItems.map((item) => {
          const isActive = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`whitespace-nowrap pb-2 text-sm font-medium border-b-2 ${
                isActive
                  ? 'border-primary-500 text-primary-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
