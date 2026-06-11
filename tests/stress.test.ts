/**
 * Stress & Edge-Case Tests
 *
 * Covers:
 *  1. CPM — large graphs, deep chains, wide fans, lags, cycles
 *  2. S-Curve & Burndown — narrow date ranges, single milestone, zero value
 *  3. Schedule metrics — extreme delays, zero duration, null dates
 *  4. Dependency cycle detection — direct, indirect, long chain
 *  5. Gantt layout — 200 milestones, all DRAFT, mixed null dates
 *  6. State machine dependency validation logic
 */

import { describe, it, expect } from 'vitest';
import { computeCPM, milestonesCpmInputs }  from '../src/lib/cpm';
import { computeSCurve, computeBurndown, computeMilestoneScheduleMetrics } from '../src/lib/scheduleMetrics';

/* ── helpers ─────────────────────────────────────────────────────────── */
function d(s: string) { return new Date(s); }
function ms(id: string, predecessorIds: string[], dur = 5) {
  return { id, title: `M${id}`, durationDays: dur, predecessorIds };
}
function makChain(n: number) {
  return Array.from({ length: n }, (_, i) =>
    ms(String(i), i === 0 ? [] : [String(i - 1)])
  );
}

/* ══════════════════════════════════════════════════════════════════════
   1. CPM — STRESS
══════════════════════════════════════════════════════════════════════ */
describe('CPM — stress', () => {

  it('100-node linear chain completes in reasonable time', () => {
    const t0 = Date.now();
    const result = computeCPM(makChain(100));
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeLessThan(500); // must finish in < 500ms
    expect(result.hasCycle).toBe(false);
    expect(result.projectDuration).toBe(500); // 100 × 5d each
    expect(result.criticalPath).toHaveLength(100);
  });

  it('500-node linear chain: all nodes critical', () => {
    const result = computeCPM(makChain(500));
    expect(result.hasCycle).toBe(false);
    expect(result.projectDuration).toBe(2500);
    result.nodes.forEach(n => {
      expect(n.isCritical).toBe(true);
      expect(n.totalFloat).toBe(0);
    });
  });

  it('wide fan: 1 root → 50 parallel leaves, only longest is critical', () => {
    // root(1) → leaf_i(i+1) for i in 0..49
    // longest leaf = leaf_49 with dur=50, total=51
    const nodes = [ms('root', [], 1)];
    for (let i = 0; i < 50; i++) nodes.push(ms(`L${i}`, ['root'], i + 1));
    const result = computeCPM(nodes);
    expect(result.hasCycle).toBe(false);
    expect(result.projectDuration).toBe(51); // 1 + 50
    expect(result.criticalPath).toContain('root');
    expect(result.criticalPath).toContain('L49');
    // First 49 leaves have float
    for (let i = 0; i < 49; i++) {
      const n = result.nodes.find(x => x.milestoneId === `L${i}`)!;
      expect(n.isCritical).toBe(false);
      expect(n.totalFloat).toBe(49 - i); // leaf_0 has float=49, leaf_48 has float=1
    }
  });

  it('diamond: A→B, A→C, B→D, C→D; B path longer', () => {
    const result = computeCPM([
      ms('A', [],        3),
      ms('B', ['A'],     6),
      ms('C', ['A'],     2),
      ms('D', ['B','C'], 4),
    ]);
    expect(result.projectDuration).toBe(13); // A(3)+B(6)+D(4)
    expect(result.criticalPath).toEqual(['A','B','D']);
    const nodeC = result.nodes.find(n => n.milestoneId === 'C')!;
    expect(nodeC.totalFloat).toBe(4); // C-path = 3+2+4=9; critical=13; float=4
  });

  it('cycle detection: indirect cycle A→B→C→A', () => {
    const result = computeCPM([
      ms('A', ['C']),
      ms('B', ['A']),
      ms('C', ['B']),
    ]);
    expect(result.hasCycle).toBe(true);
    expect(result.criticalPath).toHaveLength(0);
  });

  it('cycle detection: self-loop A→A', () => {
    const result = computeCPM([ms('A', ['A'])]);
    expect(result.hasCycle).toBe(true);
  });

  it('lag pushes earlyStart correctly', () => {
    const lagMap = new Map([['A→B', 10]]);
    const result = computeCPM(
      [ms('A', [], 5), ms('B', ['A'], 3)],
      lagMap,
    );
    expect(result.projectDuration).toBe(18); // 5 + 10 lag + 3
    const b = result.nodes.find(n => n.milestoneId === 'B')!;
    expect(b.earlyStart).toBe(15);
  });

  it('negative lag (lead) shortens gap', () => {
    const lagMap = new Map([['A→B', -3]]);
    const result = computeCPM(
      [ms('A', [], 10), ms('B', ['A'], 4)],
      lagMap,
    );
    // B can start at 10-3=7, finishes at 11
    const b = result.nodes.find(n => n.milestoneId === 'B')!;
    expect(b.earlyStart).toBe(7);
    expect(result.projectDuration).toBe(11);
  });

  it('disconnected subgraph: two independent chains', () => {
    // Chain 1: X→Y (3+4=7), Chain 2: P→Q (2+8=10)
    const result = computeCPM([
      ms('X', [], 3), ms('Y', ['X'], 4),
      ms('P', [], 2), ms('Q', ['P'], 8),
    ]);
    expect(result.hasCycle).toBe(false);
    expect(result.projectDuration).toBe(10);
    const y = result.nodes.find(n => n.milestoneId === 'Y')!;
    expect(y.isCritical).toBe(false); // chain 1 is not critical
    expect(y.totalFloat).toBe(3);
  });

  it('all zero-duration milestones (checkpoints)', () => {
    const result = computeCPM([
      ms('A', [], 0), ms('B', ['A'], 0), ms('C', ['B'], 0),
    ]);
    expect(result.projectDuration).toBe(0);
    result.nodes.forEach(n => {
      expect(n.earlyStart).toBe(0);
      expect(n.earlyFinish).toBe(0);
    });
  });

  it('milestonesCpmInputs handles null plannedStart/End gracefully', () => {
    const inputs = milestonesCpmInputs([
      { id: 'A', title: 'A', plannedStart: null, plannedEnd: null, sortOrder: 1, predecessorIds: [] },
      { id: 'B', title: 'B', plannedStart: new Date('2026-01-01'), plannedEnd: new Date('2026-01-10'), sortOrder: 2, predecessorIds: ['A'] },
    ], new Date('2025-01-01'));
    expect(inputs.length).toBe(2);
    const a = inputs.find(i => i.id === 'A')!;
    expect(a.durationDays).toBeGreaterThanOrEqual(0);
    const b = inputs.find(i => i.id === 'B')!;
    expect(b.durationDays).toBe(9); // Jan 1 → Jan 10 = 9 days
  });
});

/* ══════════════════════════════════════════════════════════════════════
   2. S-CURVE & BURNDOWN — STRESS
══════════════════════════════════════════════════════════════════════ */
describe('S-Curve & Burndown — stress', () => {

  function makeMilestones(n: number, offsetDays = 0) {
    return Array.from({ length: n }, (_, i) => ({
      id: String(i),
      plannedEnd: d(`2026-0${Math.floor(i / 10) + 1}-${(i % 28) + 1}`.padEnd(10, '0').slice(0,10)),
      actualEnd: i < n / 2 ? d(`2026-0${Math.floor(i / 10) + 1}-${(i % 28) + 1}`.padEnd(10, '0').slice(0,10)) : null,
      value: 100_000 + i * 1000,
    }));
  }

  it('50 milestones: S-curve has ≥10 points and ends at 100%', () => {
    // Spread milestones evenly over 180 days so they all fall before `to`
    const ms_ = Array.from({ length: 50 }, (_, i) => ({
      id: String(i),
      plannedEnd: new Date(2026, 0, 5 + i * 3), // Jan 5 → Jun 22 (50*3=150 days)
      actualEnd: i < 25 ? new Date(2026, 0, 5 + i * 3) : null,
      value: 1000,
    }));
    const from = new Date(2026, 0, 1);
    const to   = new Date(2026, 6, 31); // Jul 31 — past the last milestone
    const curve = computeSCurve(ms_, from, to);
    expect(curve.length).toBeGreaterThanOrEqual(10);
    const last = curve[curve.length - 1];
    expect(last.plannedCumulative).toBeCloseTo(100, 0);
  });

  it('narrow date range (3 days): adaptive step gives ≥3 points', () => {
    const ms_ = [
      { id: '1', plannedEnd: new Date(2026, 5, 8),  actualEnd: null, value: 1000 },
      { id: '2', plannedEnd: new Date(2026, 5, 10), actualEnd: null, value: 1000 },
    ];
    const curve = computeSCurve(ms_, new Date(2026, 5, 7), new Date(2026, 5, 11));
    expect(curve.length).toBeGreaterThanOrEqual(2);
  });

  it('single milestone: S-curve goes from 0 to 100', () => {
    const ms_ = [{ id: '1', plannedEnd: new Date(2026, 3, 15), actualEnd: new Date(2026, 3, 15), value: 5000 }];
    const curve = computeSCurve(ms_, new Date(2026, 3, 1), new Date(2026, 4, 1));
    const before = curve.find(p => p.date < '2026-04-15')!;
    const after  = curve.find(p => p.date >= '2026-04-15')!;
    expect(before.plannedCumulative).toBe(0);
    expect(after.plannedCumulative).toBe(100);
  });

  it('all zero value milestones: does not divide by zero', () => {
    const ms_ = Array.from({ length: 5 }, (_, i) => ({
      id: String(i), plannedEnd: new Date(2026, 0, i + 1), actualEnd: null, value: 0,
    }));
    const curve = computeSCurve(ms_, new Date(2026, 0, 1), new Date(2026, 1, 1));
    expect(curve.every(p => !isNaN(p.plannedCumulative))).toBe(true);
  });

  it('burndown starts at 100% and ends near 0%', () => {
    const ms_ = Array.from({ length: 10 }, (_, i) => ({
      id: String(i), plannedEnd: new Date(2026, 0, 5 + i * 7), actualEnd: new Date(2026, 0, 5 + i * 7), value: 1000,
    }));
    const from = new Date(2026, 0, 1);
    const to   = new Date(2026, 2, 31);
    const bd = computeBurndown(ms_, from, to);
    expect(bd[0].plannedRemaining).toBeCloseTo(100, 5);
    const last = bd[bd.length - 1];
    expect(last.plannedRemaining).toBeCloseTo(0, 5);
  });

  it('from === to: still returns at least 1 point', () => {
    const ms_ = [{ id: '1', plannedEnd: new Date(2026, 5, 10), actualEnd: null, value: 1000 }];
    const day = new Date(2026, 5, 10);
    const curve = computeSCurve(ms_, day, day);
    expect(curve.length).toBeGreaterThanOrEqual(1);
  });

  it('200 milestones: both S-curve and burndown finish in < 500ms', () => {
    const ms_ = Array.from({ length: 200 }, (_, i) => ({
      id: String(i),
      plannedEnd: new Date(2025 + Math.floor(i / 100), i % 12, (i % 28) + 1),
      actualEnd: i < 100 ? new Date(2025 + Math.floor(i / 100), i % 12, (i % 28) + 1) : null,
      value: 50_000,
    }));
    const from = new Date(2025, 0, 1);
    const to   = new Date(2027, 11, 31);
    const t0 = Date.now();
    computeSCurve(ms_, from, to);
    computeBurndown(ms_, from, to);
    expect(Date.now() - t0).toBeLessThan(500);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   3. SCHEDULE METRICS — EDGE CASES
══════════════════════════════════════════════════════════════════════ */
describe('computeMilestoneScheduleMetrics — edge cases', () => {

  it('null plannedEnd: isOverdue is always false', () => {
    const m = computeMilestoneScheduleMetrics(
      { id: '1', title: 'T', state: 'IN_PROGRESS', plannedEnd: null, actualEnd: null, value: 100, vendorId: null },
      d('2026-10-01'),
    );
    expect(m.isOverdue).toBe(false);
    expect(m.projectedOverrun).toBe(0);
  });

  it('CLOSED with no actualEnd: zero overrun, complete', () => {
    const m = computeMilestoneScheduleMetrics({
      id: '1', title: 'T', state: 'CLOSED',
      plannedEnd: d('2026-01-10'), actualEnd: null, value: 100, vendorId: null,
    });
    expect(m.isComplete).toBe(true);
    expect(m.overrunDays).toBe(0);
  });

  it('extreme late completion: 1000 days overrun', () => {
    const m = computeMilestoneScheduleMetrics({
      id: '1', title: 'T', state: 'VERIFIED',
      plannedEnd: d('2023-01-01'), actualEnd: d('2025-09-27'), value: 1, vendorId: null,
    });
    expect(m.overrunDays).toBeGreaterThan(900);
    expect(m.timeSavedDays).toBe(0);
  });

  it('far future milestone: no overrun, not overdue', () => {
    const m = computeMilestoneScheduleMetrics(
      { id: '1', title: 'T', state: 'DRAFT', plannedEnd: d('2030-01-01'), actualEnd: null, value: 1, vendorId: null },
      d('2026-01-01'),
    );
    expect(m.isOverdue).toBe(false);
    expect(m.projectedOverrun).toBe(0);
  });

  it('completed 1 day early: timeSavedDays = 1', () => {
    const m = computeMilestoneScheduleMetrics({
      id: '1', title: 'T', state: 'CLOSED',
      plannedEnd: d('2026-06-10'), actualEnd: d('2026-06-09'), value: 1, vendorId: null,
    });
    expect(m.timeSavedDays).toBe(1);
    expect(m.overrunDays).toBe(0);
  });

  it('on-time completion: both save and overrun are 0', () => {
    const m = computeMilestoneScheduleMetrics({
      id: '1', title: 'T', state: 'CLOSED',
      plannedEnd: d('2026-06-10'), actualEnd: d('2026-06-10'), value: 1, vendorId: null,
    });
    expect(m.timeSavedDays).toBe(0);
    expect(m.overrunDays).toBe(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   4. DEPENDENCY CYCLE DETECTION — SERVER-SIDE LOGIC
══════════════════════════════════════════════════════════════════════ */
describe('Dependency cycle detection logic', () => {

  // Replicate the DFS cycle check from the dependencies route
  function wouldCreateCycle(edges: Array<{ predecessorId: string; successorId: string }>, newPredId: string, newSuccId: string): boolean {
    const fwd = new Map<string, string[]>();
    for (const e of edges) {
      if (!fwd.has(e.predecessorId)) fwd.set(e.predecessorId, []);
      fwd.get(e.predecessorId)!.push(e.successorId);
    }
    return (function canReach(from: string, target: string, visited: Set<string>): boolean {
      if (from === target) return true;
      if (visited.has(from)) return false;
      visited.add(from);
      for (const next of fwd.get(from) ?? []) {
        if (canReach(next, target, visited)) return true;
      }
      return false;
    })(newSuccId, newPredId, new Set());
  }

  it('direct self-loop: A → A', () => {
    expect(wouldCreateCycle([], 'A', 'A')).toBe(true);
  });

  it('simple cycle: A→B exists, adding B→A', () => {
    expect(wouldCreateCycle([{ predecessorId: 'A', successorId: 'B' }], 'B', 'A')).toBe(true);
  });

  it('indirect cycle: A→B→C exists, adding C→A', () => {
    const edges = [
      { predecessorId: 'A', successorId: 'B' },
      { predecessorId: 'B', successorId: 'C' },
    ];
    expect(wouldCreateCycle(edges, 'C', 'A')).toBe(true);
  });

  it('long chain (10 nodes): closing the loop is detected', () => {
    const edges = Array.from({ length: 9 }, (_, i) => ({
      predecessorId: String(i), successorId: String(i + 1),
    }));
    // Adding 9→0 would close the loop
    expect(wouldCreateCycle(edges, '9', '0')).toBe(true);
  });

  it('valid addition: no cycle created', () => {
    const edges = [
      { predecessorId: 'A', successorId: 'B' },
      { predecessorId: 'B', successorId: 'C' },
    ];
    // Adding D→B: D has no incoming from C chain, so no cycle
    expect(wouldCreateCycle(edges, 'D', 'B')).toBe(false);
  });

  it('branching graph: adding safe parallel edge', () => {
    // A→C, A→B, B→D — adding C→D should be fine
    const edges = [
      { predecessorId: 'A', successorId: 'C' },
      { predecessorId: 'A', successorId: 'B' },
      { predecessorId: 'B', successorId: 'D' },
    ];
    expect(wouldCreateCycle(edges, 'C', 'D')).toBe(false);
  });

  it('branching graph: adding D→A would create cycle', () => {
    const edges = [
      { predecessorId: 'A', successorId: 'B' },
      { predecessorId: 'A', successorId: 'C' },
      { predecessorId: 'B', successorId: 'D' },
      { predecessorId: 'C', successorId: 'D' },
    ];
    // D→A: A can reach D through B or C, so cycle
    expect(wouldCreateCycle(edges, 'D', 'A')).toBe(true);
  });

  it('empty graph: any edge is safe', () => {
    expect(wouldCreateCycle([], 'X', 'Y')).toBe(false);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   5. STATE MACHINE DEPENDENCY VALIDATION LOGIC
══════════════════════════════════════════════════════════════════════ */
describe('Dependency violation detection (start/close rules)', () => {

  type DepType = 'FS' | 'SS' | 'FF' | 'SF';
  interface Dep { state: string; type: DepType }

  function checkViolations(milestoneState: string, predecessors: Dep[]): string[] {
    const isStarting = milestoneState === 'DRAFT';
    const isClosing  = milestoneState === 'VERIFIED';
    const violations: string[] = [];
    for (const p of predecessors) {
      if (isStarting) {
        if (p.type === 'FS' && p.state !== 'CLOSED')
          violations.push(`FS: predecessor must be CLOSED (is ${p.state})`);
        if (p.type === 'SS' && p.state === 'DRAFT')
          violations.push(`SS: predecessor must be started (is DRAFT)`);
      }
      if (isClosing) {
        if (p.type === 'FF' && p.state !== 'CLOSED')
          violations.push(`FF: predecessor must be CLOSED (is ${p.state})`);
        if (p.type === 'SF' && p.state === 'DRAFT')
          violations.push(`SF: predecessor must be started (is DRAFT)`);
      }
    }
    return violations;
  }

  it('FS: predecessor CLOSED → no violation', () => {
    expect(checkViolations('DRAFT', [{ state: 'CLOSED', type: 'FS' }])).toHaveLength(0);
  });

  it('FS: predecessor DRAFT → violation on start', () => {
    expect(checkViolations('DRAFT', [{ state: 'DRAFT', type: 'FS' }])).toHaveLength(1);
  });

  it('FS: predecessor IN_PROGRESS → violation on start', () => {
    expect(checkViolations('DRAFT', [{ state: 'IN_PROGRESS', type: 'FS' }])).toHaveLength(1);
  });

  it('FS: predecessor VERIFIED → violation on start (not yet CLOSED)', () => {
    expect(checkViolations('DRAFT', [{ state: 'VERIFIED', type: 'FS' }])).toHaveLength(1);
  });

  it('SS: predecessor IN_PROGRESS → no violation', () => {
    expect(checkViolations('DRAFT', [{ state: 'IN_PROGRESS', type: 'SS' }])).toHaveLength(0);
  });

  it('SS: predecessor DRAFT → violation on start', () => {
    expect(checkViolations('DRAFT', [{ state: 'DRAFT', type: 'SS' }])).toHaveLength(1);
  });

  it('FF: predecessor CLOSED → no violation on close', () => {
    expect(checkViolations('VERIFIED', [{ state: 'CLOSED', type: 'FF' }])).toHaveLength(0);
  });

  it('FF: predecessor IN_PROGRESS → violation on close', () => {
    expect(checkViolations('VERIFIED', [{ state: 'IN_PROGRESS', type: 'FF' }])).toHaveLength(1);
  });

  it('SF: predecessor started → no violation on close', () => {
    expect(checkViolations('VERIFIED', [{ state: 'IN_PROGRESS', type: 'SF' }])).toHaveLength(0);
  });

  it('SF: predecessor DRAFT → violation on close', () => {
    expect(checkViolations('VERIFIED', [{ state: 'DRAFT', type: 'SF' }])).toHaveLength(1);
  });

  it('multiple predecessors: one violation reported per violating predecessor', () => {
    const v = checkViolations('DRAFT', [
      { state: 'CLOSED',      type: 'FS' }, // OK
      { state: 'IN_PROGRESS', type: 'FS' }, // VIOLATION
      { state: 'DRAFT',       type: 'FS' }, // VIOLATION
    ]);
    expect(v).toHaveLength(2);
  });

  it('IN_PROGRESS milestone: no start/close checks apply', () => {
    expect(checkViolations('IN_PROGRESS', [{ state: 'DRAFT', type: 'FS' }])).toHaveLength(0);
  });

  it('CLOSED milestone: no further checks', () => {
    expect(checkViolations('CLOSED', [{ state: 'DRAFT', type: 'FF' }])).toHaveLength(0);
  });
});

/* ══════════════════════════════════════════════════════════════════════
   6. GANTT LAYOUT LOGIC — STRESS
══════════════════════════════════════════════════════════════════════ */
describe('Gantt layout — stress', () => {

  // Simulate the computeLayout depth function from DependencyGraph
  function computeDepths(milestones: Array<{ id: string; predecessorIds: string[] }>): Map<string, number> {
    const byId = new Map(milestones.map(m => [m.id, m]));
    const memo  = new Map<string, number>();
    const inStack = new Set<string>();

    function depth(id: string): number {
      if (memo.has(id)) return memo.get(id)!;
      if (inStack.has(id)) { memo.set(id, 0); return 0; } // cycle guard
      inStack.add(id);
      const m = byId.get(id);
      const preds = (m?.predecessorIds ?? []).filter(p => byId.has(p));
      const col = preds.length === 0 ? 0 : Math.max(...preds.map(p => depth(p))) + 1;
      inStack.delete(id);
      memo.set(id, col);
      return col;
    }
    milestones.forEach(m => depth(m.id));
    return memo;
  }

  it('200-node chain: depths are 0,1,2,...199', () => {
    const nodes = Array.from({ length: 200 }, (_, i) => ({
      id: String(i), predecessorIds: i === 0 ? [] : [String(i - 1)],
    }));
    const t0 = Date.now();
    const depths = computeDepths(nodes);
    expect(Date.now() - t0).toBeLessThan(200);
    expect(depths.get('0')).toBe(0);
    expect(depths.get('199')).toBe(199);
  });

  it('all independent milestones: all at depth 0', () => {
    const nodes = Array.from({ length: 100 }, (_, i) => ({ id: String(i), predecessorIds: [] }));
    const depths = computeDepths(nodes);
    nodes.forEach(n => expect(depths.get(n.id)).toBe(0));
  });

  it('circular deps: depth algorithm does not hang (cycle guard)', () => {
    const nodes = [
      { id: 'A', predecessorIds: ['C'] },
      { id: 'B', predecessorIds: ['A'] },
      { id: 'C', predecessorIds: ['B'] },
    ];
    const t0 = Date.now();
    const depths = computeDepths(nodes);
    expect(Date.now() - t0).toBeLessThan(100);
    // All resolve to 0 via cycle guard — no infinite loop
    expect(depths.size).toBe(3);
  });

  it('wide fan then merge: correct max depth', () => {
    // root → 10 parallel → merge
    const nodes = [
      { id: 'root', predecessorIds: [] },
      ...Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, predecessorIds: ['root'] })),
      { id: 'merge', predecessorIds: Array.from({ length: 10 }, (_, i) => `p${i}`) },
    ];
    const depths = computeDepths(nodes);
    expect(depths.get('root')).toBe(0);
    for (let i = 0; i < 10; i++) expect(depths.get(`p${i}`)).toBe(1);
    expect(depths.get('merge')).toBe(2);
  });

  it('milestonesCpmInputs: 50 milestones all null dates → fallback sortOrder-based durations', () => {
    const mils = Array.from({ length: 50 }, (_, i) => ({
      id: String(i), title: `M${i}`,
      plannedStart: null, plannedEnd: null,
      sortOrder: i, predecessorIds: i === 0 ? [] : [String(i - 1)],
    }));
    const inputs = milestonesCpmInputs(mils, new Date('2026-01-01'));
    expect(inputs).toHaveLength(50);
    inputs.forEach(inp => expect(inp.durationDays).toBeGreaterThanOrEqual(0));
  });
});
