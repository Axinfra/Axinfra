/**
 * SystemEventService - Unified event pipeline for Viseron Intelligence.
 *
 * Captures system events from core services (MilestoneStateMachine,
 * EvidenceService, PaymentEligibilityEngine) without modifying their
 * core logic. Events feed the analytics and risk engines.
 *
 * DESIGN:
 * - In-memory ring buffer for real-time streaming within a process — fast,
 *   but ephemeral (lost on restart, not shared across serverless instances).
 * - ALSO persisted to the SystemEvent table (fire-and-forget, best-effort)
 *   so durable consumers — right now, the /api/notifications bell — can read
 *   these events regardless of which process/instance produced them. Before
 *   this, MILESTONE_VERIFIED/MILESTONE_REJECTED only ever reached the
 *   in-memory buffer, so the notification bell could never show them.
 * - emit() never throws, never blocks callers — the DB write is not awaited.
 */

import { prisma } from '@/lib/db';

const EVENT_MESSAGES: Record<string, string> = {
  MILESTONE_TRANSITIONED: 'Milestone status was updated.',
  MILESTONE_SUBMITTED: 'Milestone submitted for verification.',
  MILESTONE_VERIFIED: 'Milestone verified.',
  MILESTONE_REJECTED: 'Milestone sent back for revision.',
  EVIDENCE_SUBMITTED: 'Evidence submitted.',
  EVIDENCE_APPROVED: 'Evidence approved.',
  EVIDENCE_REJECTED: 'Evidence rejected.',
  ELIGIBILITY_RECALCULATED: 'Payment eligibility recalculated.',
  PAYMENT_BLOCKED: 'Payment blocked.',
  PAYMENT_UNBLOCKED: 'Payment unblocked.',
  PAYMENT_MARKED_PAID: 'Payment marked as paid.',
};

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

      // Not awaited — persistence is best-effort and must never slow down or
      // break the caller. A failure here just means this one event doesn't
      // show up in the notification bell; the in-memory buffer above (used
      // by the analytics/risk engines) is unaffected either way.
      void prisma.systemEvent.create({
        data: {
          projectId,
          eventType: type,
          severity: 'INFO',
          message: EVENT_MESSAGES[type] ?? type,
          entityType,
          entityId,
          actorId,
        },
      }).catch((e) => console.error('[SystemEventService] DB persist failed:', e));
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
