import { redirect } from 'next/navigation';
import Layout from '@/components/Layout';
import VendorOnboardingClient from '@/components/vendor/VendorOnboardingClient';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/db';
import { Role } from '@/types';

export const dynamic = 'force-dynamic';

export default async function VendorOnboardingPage() {
  const session = await getSession();
  if (!session) {
    redirect('/auth/login');
  }

  // Fetch admin (OWNER/PMC) projects for this user, ordered most recent first.
  const adminRoles = await prisma.projectRole.findMany({
    where: {
      userId: session.userId,
      role: { in: [Role.OWNER, Role.PMC] },
      project: { deletedAt: null },
    },
    include: {
      project: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (adminRoles.length === 0) {
    redirect('/projects');
  }

  const projects = adminRoles.map((r) => ({
    projectId: r.project.id,
    projectName: r.project.name,
    role: r.role,
  }));

  const initialProjectId = projects[0].projectId;

  // Pre-fetch the initial vendor list so the table renders on first paint.
  // Switching projects in the client uses SWR to refetch from the existing API.
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
    <Layout>
      <VendorOnboardingClient
        projects={projects}
        initialProjectId={initialProjectId}
        initialVendors={initialVendors}
      />
    </Layout>
  );
}
