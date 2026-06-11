import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { requireAdminAccess } from '@/lib/adminAuth';
import AdminShell from '@/components/admin/AdminShell';

export const dynamic = 'force-dynamic';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect('/auth/login?redirect=/admin/dashboard');

  try {
    await requireAdminAccess(session.email);
  } catch {
    redirect('/projects');
  }

  return (
    <AdminShell userEmail={session.email} userName={session.name}>
      {children}
    </AdminShell>
  );
}
