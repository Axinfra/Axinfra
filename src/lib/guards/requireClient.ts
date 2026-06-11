/**
 * requireClient / requireProjectOwner — guards that verify CLIENT role.
 * SECURITY: Always re-fetches from DB; never trusts the session role alone.
 */

import { prisma } from '@/lib/db';
import { AuthContext } from '@/lib/auth';

export async function requireClient(session: AuthContext): Promise<void> {
  const clientRole = await prisma.projectRole.findFirst({
    where: { userId: session.userId, role: 'CLIENT' },
  });
  if (!clientRole) {
    throw new Error('FORBIDDEN: Only project clients can perform this action');
  }
}

export async function requireProjectOwner(session: AuthContext, projectId: string): Promise<void> {
  const role = await prisma.projectRole.findUnique({
    where: { projectId_userId: { projectId, userId: session.userId } },
  });
  if (!role || role.role !== 'CLIENT') {
    throw new Error('FORBIDDEN: Only the project client can perform this action');
  }
}
