import { prisma } from '@/lib/db';
import ProjectRequestsClient from '@/components/admin/ProjectRequestsClient';

export const dynamic = 'force-dynamic';

// Admin access is already enforced by src/app/admin/layout.tsx wrapping this page.
export default async function AdminProjectRequestsPage() {
  const requests = await prisma.projectRequest.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      requestedBy: { select: { id: true, name: true, email: true } },
      createdProject: { select: { id: true, name: true } },
    },
  });

  const initialRequests = requests.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    companyName: r.companyName,
    phone: r.phone,
    projectName: r.projectName,
    projectDetails: r.projectDetails,
    status: r.status,
    requestedByName: r.requestedBy?.name ?? null,
    reviewedByEmail: r.reviewedByEmail,
    reviewedAt: r.reviewedAt ? r.reviewedAt.toISOString() : null,
    rejectionReason: r.rejectionReason,
    createdProjectId: r.createdProject?.id ?? null,
    createdProjectName: r.createdProject?.name ?? null,
    createdAt: r.createdAt.toISOString(),
  }));

  return (
    <div className="px-8 py-8 max-w-[1200px]">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-[var(--ax-text)]">Project Requests</h1>
        <p className="text-[13.5px] text-[rgba(var(--ax-text-rgb),0.45)] mt-1">
          The platform charges per project — nothing gets created until you approve a request here.
        </p>
      </div>
      <ProjectRequestsClient initialRequests={initialRequests} />
    </div>
  );
}
