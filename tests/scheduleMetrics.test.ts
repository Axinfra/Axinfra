import { describe, it, expect } from 'vitest';
import {
  computeMilestoneScheduleMetrics,
  computeProjectScheduleKPIs,
  computeVendorScorecards,
  estimateDelayCost,
} from '../src/lib/scheduleMetrics';

const d = (s: string) => new Date(s);

describe('computeMilestoneScheduleMetrics', () => {
  it('completed on time → timeSavedDays > 0', () => {
    const m = computeMilestoneScheduleMetrics({
      id: '1', title: 'T', state: 'VERIFIED',
      plannedEnd: d('2025-01-10'), actualEnd: d('2025-01-08'), value: 1, vendorId: null,
    });
    expect(m.timeSavedDays).toBe(2);
    expect(m.overrunDays).toBe(0);
    expect(m.isComplete).toBe(true);
    expect(m.isOverdue).toBe(false);
  });

  it('completed late → overrunDays > 0', () => {
    const m = computeMilestoneScheduleMetrics({
      id: '1', title: 'T', state: 'CLOSED',
      plannedEnd: d('2025-01-10'), actualEnd: d('2025-01-15'), value: 1, vendorId: null,
    });
    expect(m.overrunDays).toBe(5);
    expect(m.timeSavedDays).toBe(0);
  });

  it('incomplete and overdue → projectedOverrun', () => {
    const m = computeMilestoneScheduleMetrics(
      { id: '1', title: 'T', state: 'IN_PROGRESS', plannedEnd: d('2025-01-01'), actualEnd: null, value: 1, vendorId: null },
      d('2025-01-11'),
    );
    expect(m.projectedOverrun).toBe(10);
    expect(m.isOverdue).toBe(true);
  });

  it('incomplete and on-track → remainingBuffer', () => {
    const m = computeMilestoneScheduleMetrics(
      { id: '1', title: 'T', state: 'IN_PROGRESS', plannedEnd: d('2025-02-01'), actualEnd: null, value: 1, vendorId: null },
      d('2025-01-20'),
    );
    expect(m.remainingBuffer).toBeGreaterThan(0);
    expect(m.isOverdue).toBe(false);
  });

  it('no planned end → no metrics', () => {
    const m = computeMilestoneScheduleMetrics({
      id: '1', title: 'T', state: 'DRAFT', plannedEnd: null, actualEnd: null, value: 1, vendorId: null,
    });
    expect(m.timeSavedDays).toBe(0);
    expect(m.overrunDays).toBe(0);
    expect(m.projectedOverrun).toBe(0);
  });
});

describe('computeProjectScheduleKPIs', () => {
  it('calculates netSchedule and onTimePct correctly', () => {
    const milestones = [
      { id: '1', title: 'A', state: 'VERIFIED', plannedEnd: d('2025-01-10'), actualEnd: d('2025-01-08'), value: 1, vendorId: null },
      { id: '2', title: 'B', state: 'VERIFIED', plannedEnd: d('2025-01-10'), actualEnd: d('2025-01-15'), value: 1, vendorId: null },
    ];
    const today = d('2025-01-20');
    const kpis = computeProjectScheduleKPIs({
      milestones, avgApprovalCycleDays: 3, criticalMilestoneCount: 1, escalationsLast30Days: 2,
    }, today);
    expect(kpis.totalSavedDays).toBe(2);
    expect(kpis.totalOverrunDays).toBe(5);
    expect(kpis.netScheduleDays).toBe(-3);
    expect(kpis.onTimePct).toBe(50);
  });
});

describe('computeVendorScorecards', () => {
  it('ranks vendors correctly', () => {
    const milestones = [
      { id: '1', title: 'A', state: 'VERIFIED', plannedEnd: d('2025-01-10'), actualEnd: d('2025-01-09'), value: 1, vendorId: 'v1', vendorName: 'Alpha', approvalCycleDays: 3, isEscalated: false },
      { id: '2', title: 'B', state: 'VERIFIED', plannedEnd: d('2025-01-10'), actualEnd: d('2025-01-20'), value: 1, vendorId: 'v2', vendorName: 'Beta', approvalCycleDays: 5, isEscalated: false },
    ];
    const scorecards = computeVendorScorecards(milestones);
    expect(scorecards[0].vendorId).toBe('v1'); // Alpha is on time → rank 1
    expect(scorecards[1].vendorId).toBe('v2');
    expect(scorecards[0].rank).toBe(1);
    expect(scorecards[0].onTimePct).toBe(100);
    expect(scorecards[1].onTimePct).toBe(0);
  });
});

describe('estimateDelayCost', () => {
  it('returns zero when not configured', () => {
    const r = estimateDelayCost(10, { dailyOverheadCost: 0, penaltyRatePerDay: 0, opportunityCostFactor: 1, totalProjectValue: 100000 });
    expect(r.totalEstimatedCost).toBe(0);
    expect(r.isConfigured).toBe(false);
  });

  it('calculates costs correctly', () => {
    const r = estimateDelayCost(5, { dailyOverheadCost: 1000, penaltyRatePerDay: 0.001, opportunityCostFactor: 1.1, totalProjectValue: 500000 });
    expect(r.overheadCost).toBe(5000);
    expect(r.penaltyCost).toBeCloseTo(2500);
    expect(r.opportunityCost).toBeCloseTo(500); // 5000 * 0.1
    expect(r.isConfigured).toBe(true);
    expect(r.totalEstimatedCost).toBeCloseTo(8000);
  });
});
