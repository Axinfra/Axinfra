'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Layout from '@/components/Layout';
import VendorOnboardingClient from '@/components/vendor/VendorOnboardingClient';
import { Loader2 } from 'lucide-react';

interface ProjectOption {
  projectId: string;
  projectName: string;
  role: string;
}

interface VendorRow {
  userId: string | null;
  inviteId: string | null;
  name: string;
  email: string;
  role: string;
  assignedAt: string;
  userCreatedAt: string | null;
  isPendingInvite: boolean;
}

interface PageData {
  projects: ProjectOption[];
  initialProjectId: string;
  initialVendors: VendorRow[];
}

export default function VendorOnboardingPage() {
  return (
    <Suspense fallback={<Layout><div className="flex items-center justify-center py-20"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--ax-accent)' }} /></div></Layout>}>
      <VendorOnboardingPageInner />
    </Suspense>
  );
}

/** useSearchParams() (for ?projectId=... from the sidebar link) requires a Suspense boundary
 * around it in the App Router, hence the wrapper above. */
function VendorOnboardingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedProjectId = searchParams.get('projectId');
  const [data, setData] = useState<PageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    // Load projects where user is CLIENT or PMC
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then(async (session) => {
        if (!session.success) { router.push('/auth/login'); return; }

        const roles: Array<{ projectId: string; projectName: string; role: string }> =
          session.data.projectRoles || [];

        const adminRoles = roles.filter(
          (r) => r.role === 'CLIENT' || r.role === 'PMC',
        );

        if (adminRoles.length === 0) { router.push('/projects'); return; }

        const projects = adminRoles.map((r) => ({
          projectId: r.projectId,
          projectName: r.projectName,
          role: r.role,
        }));

        // If we arrived here already viewing a specific project (via the sidebar link,
        // ?projectId=...), land directly on that project's vendors instead of always
        // defaulting to the first one — same "open directly" behavior as Execution
        // Intelligence / Viseron Intelligence / Architecture.
        const requested = requestedProjectId && projects.some((p) => p.projectId === requestedProjectId)
          ? requestedProjectId
          : null;
        const initialProjectId = requested ?? projects[0].projectId;

        // Load initial vendors for first project
        const vendorsRes = await fetch(
          `/api/admin/vendors?projectId=${initialProjectId}`,
        );
        const vendorsData = await vendorsRes.json();

        setData({
          projects,
          initialProjectId,
          initialVendors: vendorsData.success ? vendorsData.data : [],
        });
      })
      .catch(() => setError('Failed to load'))
      .finally(() => setLoading(false));
  }, [router, requestedProjectId]);

  return (
    <Layout>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--ax-accent)' }} />
        </div>
      ) : error ? (
        <div className="text-center py-20 text-sm" style={{ color: 'rgba(var(--ax-text-rgb),0.45)' }}>
          {error}
        </div>
      ) : data ? (
        <VendorOnboardingClient
          projects={data.projects}
          initialProjectId={data.initialProjectId}
          initialVendors={data.initialVendors}
        />
      ) : null}
    </Layout>
  );
}
