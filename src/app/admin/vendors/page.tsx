import { redirect } from 'next/navigation';
import VendorOnboardingClient from '@/components/vendor/VendorOnboardingClient';
import { getSession } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import { prisma } from '@/lib/db';
import { Role } from '@/types';

export const dynamic = 'force-dynamic';

export default async function AdminVendorsPage() {
  const session = await getSession();
  if (!session) redirect('/auth/login');

  try {
    await requireAdminAccess(session.email);
  } catch {
    redirect('/projects');
  }

  // Platform admin sees ALL projects, not just ones they manage
  const allProjects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, name: true },
    orderBy: { createdAt: 'desc' },
  });

  if (allProjects.length === 0) {
    return (
      <div className="px-8 py-10 text-[rgba(var(--ax-text-rgb),0.45)] text-sm">
        No projects exist yet.
      </div>
    );
  }

  const projects = allProjects.map((p) => ({
    projectId: p.id,
    projectName: p.name,
    role: Role.CLIENT,
  }));

  const initialProjectId = projects[0].projectId;

  const initialVendorRoles = await prisma.projectRole.findMany({
    where: { projectId: initialProjectId, role: Role.VENDOR },
    include: {
      user: { select: { id: true, name: true, email: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  const initialVendors = initialVendorRoles.map((vr) => ({
    userId: vr.user.id,
    name: vr.user.name,
    email: vr.user.email,
    role: vr.role,
    assignedAt: vr.createdAt.toISOString(),
    userCreatedAt: vr.user.createdAt.toISOString(),
  }));

  return (
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--ax-text)]">Vendors</h1>
        <p className="text-[13.5px] text-[rgba(var(--ax-text-rgb),0.45)] mt-1">
          Manage vendor accounts and project assignments across the platform
        </p>
      </div>
      <VendorOnboardingClient
        projects={projects}
        initialProjectId={initialProjectId}
        initialVendors={initialVendors}
      />
    </div>
  );
}
