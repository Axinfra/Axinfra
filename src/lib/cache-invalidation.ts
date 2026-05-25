import { prisma } from './db';
import { invalidate, invalidatePrefix } from './cache';

/**
 * Cache invalidation helpers for project membership and project-scoped reads.
 *
 * Keep these operations best-effort and explicit: cache misses are cheap, stale
 * project membership is not. Callers should perform the DB write first, then
 * invalidate the affected read caches.
 */

export async function invalidateUserWorkspaceCaches(userId: string): Promise<void> {
  await Promise.all([
    invalidate(`projects:list:${userId}`),
    invalidate(`session:roles:${userId}`),
    invalidate(`dashboard:budget-vs-actual:${userId}`),
    invalidate(`dashboard:payment-status:${userId}`),
    invalidate(`dashboard:milestone-completion:${userId}`),
  ]);
}

export async function invalidateProjectScopedCaches(projectId: string): Promise<void> {
  await Promise.all([
    invalidatePrefix(`project:${projectId}:detail:`),
    invalidatePrefix(`dash:owner:${projectId}`),
    invalidatePrefix(`dash:pmc:${projectId}`),
    invalidatePrefix(`dash:vendor:${projectId}:`),
    invalidatePrefix(`dash:viewer:${projectId}`),
    invalidatePrefix(`milestone:${projectId}:list:`),
    invalidatePrefix(`boq:${projectId}:`),
    invalidatePrefix(`analysis:${projectId}:`),
    invalidatePrefix(`project:${projectId}:eligibility:`),
    invalidatePrefix(`auditlog:${projectId}:`),
    invalidatePrefix(`viseron-vendors:${projectId}`),
    invalidatePrefix(`viseron-risk:${projectId}`),
    invalidatePrefix(`viseron-analytics:${projectId}`),
    invalidatePrefix(`analytics:${projectId}:`),
    invalidatePrefix(`gantt:${projectId}:`),
  ]);
}

export async function invalidateProjectMemberWorkspaceCaches(projectId: string): Promise<void> {
  const roles = await prisma.projectRole.findMany({
    where: { projectId },
    select: { userId: true },
  });

  await Promise.all(
    roles.map(({ userId }) =>
      Promise.all([
        invalidateUserWorkspaceCaches(userId),
        invalidatePrefix(`vendor:${userId}:portal:${projectId}:`),
      ]),
    ),
  );
}

export async function invalidateProjectAndMemberCaches(projectId: string): Promise<void> {
  await Promise.all([
    invalidateProjectScopedCaches(projectId),
    invalidateProjectMemberWorkspaceCaches(projectId),
  ]);
}
