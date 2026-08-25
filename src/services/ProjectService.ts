import { prisma } from '@/lib/db';
import { invalidateUserWorkspaceCaches } from '@/lib/cache-invalidation';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes, Role } from '@/types';

export interface CreateProjectInput {
  name: string;
  description?: string;
  location?: string;
  contractValue?: number;
  currency?: string;
  startDate?: string;
  endDate?: string;
}

/**
 * Creates a Project and makes `ownerId` its CLIENT (Owner) in one transaction — the same shape
 * POST /api/projects has always used, extracted here so it has exactly one implementation now
 * that there are two callers: that route (admin-only, direct creation) and
 * POST /api/admin/project-requests/[id]/approve (the normal path — the platform charges per
 * project, so a project is otherwise only ever created by an admin approving a request).
 */
export class ProjectService {
  static async createForOwner(ownerId: string, input: CreateProjectInput) {
    const { name, description, location, contractValue, currency, startDate, endDate } = input;

    const metadata = (location || contractValue || currency || startDate || endDate)
      ? JSON.stringify({ location, contractValue, currency: currency || 'INR', startDate, endDate })
      : undefined;

    const project = await prisma.$transaction(async (tx) => {
      const project = await tx.project.create({
        data: { name, description, metadata },
      });

      // Other users must be invited/assigned explicitly (see ProjectInvite / roles route).
      await tx.projectRole.create({
        data: { projectId: project.id, userId: ownerId, role: Role.CLIENT },
      });

      return project;
    });

    await invalidateUserWorkspaceCaches(ownerId);

    await AuditLogger.log({
      projectId: project.id,
      actorId: ownerId,
      role: Role.CLIENT,
      actionType: AuditActionTypes.PROJECT_CREATE,
      entityType: 'Project',
      entityId: project.id,
      afterJson: { name, description },
    });

    return project;
  }
}
