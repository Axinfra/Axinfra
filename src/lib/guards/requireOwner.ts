/**
 * requireClient — Server-side guard that verifies the user has OWNER role.
 *
 * SECURITY: Always re-fetches the role from the database (session can be stale).
 */

import { prisma } from '@/lib/db';
import { AuthContext } from '@/lib/auth';

export async function requireClient(session: AuthContext): Promise<void> {
  // Re-fetch role from DB — never trust session role alone
  const ownerRole = await prisma.projectRole.findFirst({
    where: {
      userId: session.userId,
      role: 'CLIENT',
    },
  });

  if (!ownerRole) {
    throw new Error('FORBIDDEN: Only project owners can perform this action');
  }
}

/**
 * requireProjectOwner — Verifies the user is the OWNER of a specific project.
 */
export async function requireProjectOwner(session: AuthContext, projectId: string): Promise<void> {
  // A user can hold several roles on this project now — check for the CLIENT row
  // specifically rather than "the" (now possibly ambiguous) role.
  const role = await prisma.projectRole.findFirst({
    where: {
      projectId,
      userId: session.userId,
      role: 'CLIENT',
    },
  });

  if (!role) {
    throw new Error('FORBIDDEN: Only the project owner can perform this action');
  }
}
