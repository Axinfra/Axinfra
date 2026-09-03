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
  // A user can hold several roles on this project now — check for the CLIENT row
  // specifically rather than "the" (now possibly ambiguous) role.
  const role = await prisma.projectRole.findFirst({
    where: { projectId, userId: session.userId, role: 'CLIENT' },
  });
  if (!role) {
    throw new Error('FORBIDDEN: Only the project client can perform this action');
  }
}
