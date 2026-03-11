import { prisma } from '@/lib/db';
import { Role, AuditActionType } from '@/types';

export interface AuditLogEntry {
  projectId: string;
  actorId: string;
  role: Role;
  actionType: AuditActionType;
  entityType: string;
  entityId: string;
  beforeJson?: unknown;
  afterJson?: unknown;
  reason?: string;
}

/**
 * AuditLogger - Creates immutable audit log entries for all system actions.
 *
 * SPEC REQUIREMENT: All actions must write immutable audit logs with:
 * actor, role, action, before->after, timestamp, reason (if applicable)
 */
export class AuditLogger {
  /**
   * Log an action to the audit trail.
   * This is mandatory for every mutation in the system.
   */
  static async log(entry: AuditLogEntry): Promise<void> {
    await prisma.auditLog.create({
      data: {
        projectId: entry.projectId,
        actorId: entry.actorId,
        role: entry.role,
        actionType: entry.actionType,
        entityType: entry.entityType,
        entityId: entry.entityId,
        beforeJson: entry.beforeJson ? JSON.stringify(entry.beforeJson) : null,
        afterJson: entry.afterJson ? JSON.stringify(entry.afterJson) : null,
        reason: entry.reason,
      },
    });
  }

  /**
   * Get audit logs for a project with filtering and pagination.
   */
  static async getProjectLogs(
    projectId: string,
    options: {
      entityType?: string;
      entityId?: string;
      actorId?: string;
      actionType?: string;
      startDate?: Date;
      endDate?: Date;
      limit?: number;
      offset?: number;
      /** SECURITY: Exclude private action types (e.g. cash module entries) from non-BUILDER roles */
      excludeActionTypes?: string[];
    } = {}
  ) {
    const { entityType, entityId, actorId, actionType, startDate, endDate, limit = 100, offset = 0, excludeActionTypes } = options;

    const where: Record<string, unknown> = { projectId };

    if (entityType) where.entityType = entityType;
    if (entityId) where.entityId = entityId;
    if (actorId) where.actorId = actorId;
    if (actionType) where.actionType = actionType;
    // SECURITY: Filter out private cash module action types for non-BUILDER users
    if (excludeActionTypes && excludeActionTypes.length > 0) {
      where.actionType = { ...(where.actionType ? { equals: where.actionType } : {}), notIn: excludeActionTypes };
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
    }

    const [logs, total] = await Promise.all([
      prisma.auditLog.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              name: true,
              email: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }

  /**
   * Export audit logs as CSV-ready data.
   */
  static async exportProjectLogs(
    projectId: string,
    options: {
      entityType?: string;
      startDate?: Date;
      endDate?: Date;
      /** SECURITY: Exclude private action types (e.g. cash module entries) from non-BUILDER roles */
      excludeActionTypes?: string[];
    } = {}
  ): Promise<string> {
    const { entityType, startDate, endDate, excludeActionTypes } = options;

    const where: Record<string, unknown> = { projectId };
    if (entityType) where.entityType = entityType;
    // SECURITY: Filter out private cash module action types
    if (excludeActionTypes && excludeActionTypes.length > 0) {
      where.actionType = { notIn: excludeActionTypes };
    }
    if (startDate || endDate) {
      where.createdAt = {};
      if (startDate) (where.createdAt as Record<string, Date>).gte = startDate;
      if (endDate) (where.createdAt as Record<string, Date>).lte = endDate;
    }

    const logs = await prisma.auditLog.findMany({
      where,
      include: {
        actor: {
          select: {
            name: true,
            email: true,
          },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    // CSV Header
    const headers = [
      'Timestamp',
      'Actor Name',
      'Actor Email',
      'Role',
      'Action Type',
      'Entity Type',
      'Entity ID',
      'Before',
      'After',
      'Reason',
    ];

    const rows = logs.map((log) => [
      log.createdAt.toISOString(),
      log.actor.name,
      log.actor.email,
      log.role,
      log.actionType,
      log.entityType,
      log.entityId,
      log.beforeJson ? JSON.stringify(log.beforeJson) : '',
      log.afterJson ? JSON.stringify(log.afterJson) : '',
      log.reason || '',
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map((row) =>
        row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')
      ),
    ].join('\n');

    return csvContent;
  }
}
