/**
 * SystemEventService - Unified event pipeline for Viseron Intelligence.
 *
 * Captures system events from core services (MilestoneStateMachine,
 * EvidenceService, PaymentEligibilityEngine) without modifying their
 * core logic. Events feed the analytics and risk engines.
 *
 * DESIGN:
 * - In-memory ring buffer (no DB writes) for real-time streaming
 * - Fire-and-forget: emit() never throws, never blocks callers
 * - Events are ephemeral per-process; durable history lives in AuditLog
 */

export const SystemEventType = {
  // Milestone events
  MILESTONE_TRANSITIONED: 'MILESTONE_TRANSITIONED',
  MILESTONE_SUBMITTED: 'MILESTONE_SUBMITTED',
  MILESTONE_VERIFIED: 'MILESTONE_VERIFIED',
  MILESTONE_REJECTED: 'MILESTONE_REJECTED',

  // Evidence events
  EVIDENCE_SUBMITTED: 'EVIDENCE_SUBMITTED',
  EVIDENCE_APPROVED: 'EVIDENCE_APPROVED',
  EVIDENCE_REJECTED: 'EVIDENCE_REJECTED',

  // Payment events
  ELIGIBILITY_RECALCULATED: 'ELIGIBILITY_RECALCULATED',
  PAYMENT_BLOCKED: 'PAYMENT_BLOCKED',
  PAYMENT_UNBLOCKED: 'PAYMENT_UNBLOCKED',
  PAYMENT_MARKED_PAID: 'PAYMENT_MARKED_PAID',
} as const;
export type SystemEventType = (typeof SystemEventType)[keyof typeof SystemEventType];

export interface SystemEvent {
  id: string;
  type: SystemEventType;
  projectId: string;
  entityType: string;
  entityId: string;
  actorId: string;
  payload: Record<string, unknown>;
  timestamp: Date;
}

/** Max events kept in the ring buffer per process. */
const MAX_BUFFER_SIZE = 2000;

let idCounter = 0;
const buffer: SystemEvent[] = [];

export class SystemEventService {
  /**
   * Emit a system event. Fire-and-forget; never throws.
   */
  static emit(
    type: SystemEventType,
    projectId: string,
    entityType: string,
    entityId: string,
    actorId: string,
    payload: Record<string, unknown> = {},
  ): void {
    try {
      const event: SystemEvent = {
        id: `evt_${Date.now()}_${++idCounter}`,
        type,
        projectId,
        entityType,
        entityId,
        actorId,
        payload,
        timestamp: new Date(),
      };

      buffer.push(event);

      // Ring buffer: drop oldest when full
      if (buffer.length > MAX_BUFFER_SIZE) {
        buffer.splice(0, buffer.length - MAX_BUFFER_SIZE);
      }
    } catch {
      // Fire-and-forget: never let event emission break callers
    }
  }

  /**
   * Get events, optionally filtered by projectId and/or type.
   * Returns newest-first, limited to `limit` entries.
   */
  static getEvents(options: {
    projectId?: string;
    type?: SystemEventType;
    since?: Date;
    limit?: number;
  } = {}): SystemEvent[] {
    const { projectId, type, since, limit = 100 } = options;

    let result = [...buffer];

    if (projectId) {
      result = result.filter((e) => e.projectId === projectId);
    }
    if (type) {
      result = result.filter((e) => e.type === type);
    }
    if (since) {
      result = result.filter((e) => e.timestamp >= since);
    }

    // Newest first
    result.reverse();

    return result.slice(0, limit);
  }

  /**
   * Get event count by type for a project (useful for dashboards).
   */
  static getEventCounts(projectId: string, since?: Date): Record<string, number> {
    const events = this.getEvents({ projectId, since, limit: MAX_BUFFER_SIZE });
    const counts: Record<string, number> = {};
    for (const event of events) {
      counts[event.type] = (counts[event.type] || 0) + 1;
    }
    return counts;
  }
}
