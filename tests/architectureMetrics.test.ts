import { describe, it, expect } from 'vitest';
import { buildArchitectureSnapshot } from '@/lib/architectureMetrics';

describe('buildArchitectureSnapshot', () => {
  it('computes set and row counts by status', () => {
    const result = buildArchitectureSnapshot({
      sets: [
        { status: 'REQUESTED' },
        { status: 'IN_PROGRESS' },
        { status: 'APPROVED' },
        { status: 'PAID' },
        { status: 'DRAFT' },
      ],
      rows: [
        { status: 'PENDING' },
        { status: 'SUBMITTED' },
        { status: 'APPROVED' },
        { status: 'REJECTED' },
        { status: 'APPROVED' },
      ],
      pendingReview: 3,
      dueSoonSets: [],
      nowMs: Date.UTC(2026, 4, 27, 0, 0, 0),
    });

    expect(result.sets).toEqual({
      total: 5,
      requested: 1,
      inProgress: 1,
      approved: 1,
      paid: 1,
    });
    expect(result.rows).toEqual({
      total: 5,
      pending: 1,
      submitted: 1,
      approved: 2,
      rejected: 1,
    });
    expect(result.pendingReview).toBe(3);
  });

  it('computes due date days remaining correctly', () => {
    const now = Date.UTC(2026, 4, 27, 0, 0, 0); // May 27, 2026 UTC
    const result = buildArchitectureSnapshot({
      sets: [],
      rows: [],
      pendingReview: 0,
      nowMs: now,
      dueSoonSets: [
        { id: 'a', name: 'Set A', status: 'REQUESTED', dueDate: new Date(Date.UTC(2026, 4, 30, 0, 0, 0)) },
        { id: 'b', name: 'Set B', status: 'IN_PROGRESS', dueDate: new Date(Date.UTC(2026, 4, 26, 0, 0, 0)) },
        { id: 'c', name: 'Set C', status: 'DELIVERED', dueDate: null },
      ],
    });

    expect(result.dueDates[0].daysRemaining).toBe(3);
    expect(result.dueDates[1].daysRemaining).toBe(-1);
    expect(result.dueDates[2].daysRemaining).toBeNull();
  });
});
