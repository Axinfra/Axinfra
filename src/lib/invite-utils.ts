import { prisma } from './db';
import { invalidateProjectAndMemberCaches } from './cache-invalidation';
import { Role } from '@/types';

// After a new user account is created (password or Google), check if they were
// pre-invited to any projects. If so, auto-accept those invites so they land
// in the project immediately without needing to click a link.
//
// For @example.com addresses this is the primary onboarding path (no email is
// sent when the invite is created). For real emails the token-link flow still
// works, but registration also triggers auto-accept as a fallback.
export async function autoAcceptPendingInvites(
  userId: string,
  email: string,
): Promise<number> {
  const pending = await prisma.$queryRaw<Array<{
    id: string;
    projectId: string;
    role: string;
  }>>`
    SELECT id, "projectId", role
    FROM "ProjectInvite"
    WHERE lower(email) = lower(${email})
      AND status = 'PENDING'
      AND "expiresAt" > NOW()
  `;

  if (pending.length === 0) return 0;

  let accepted = 0;
  for (const invite of pending) {
    try {
      await prisma.$transaction([
        prisma.projectRole.upsert({
          where: { projectId_userId: { projectId: invite.projectId, userId } },
          create: {
            projectId: invite.projectId,
            userId,
            role: invite.role as Role,
          },
          update: {},
        }),
        prisma.$executeRaw`
          UPDATE "ProjectInvite" SET status = 'ACCEPTED' WHERE id = ${invite.id}
        `,
      ]);
      void invalidateProjectAndMemberCaches(invite.projectId);
      accepted++;
    } catch (e) {
      console.error('[autoAcceptPendingInvites] invite', invite.id, e);
    }
  }

  return accepted;
}

// Returns true if this email address is a demo / placeholder that should never
// receive a real invitation email.
export function isDemoEmail(email: string): boolean {
  return email.toLowerCase().endsWith('@example.com');
}
