import { describe, it, expect } from 'vitest';
import { computeCPM } from '../src/lib/cpm';

describe('CPM Algorithm', () => {
  it('single node with no dependencies', () => {
    const result = computeCPM([{ id: 'A', title: 'A', durationDays: 5, predecessorIds: [] }]);
    expect(result.hasCycle).toBe(false);
    expect(result.projectDuration).toBe(5);
    expect(result.criticalPath).toEqual(['A']);
    const node = result.nodes[0];
    expect(node.earlyStart).toBe(0);
    expect(node.earlyFinish).toBe(5);
    expect(node.totalFloat).toBe(0);
    expect(node.isCritical).toBe(true);
  });

  it('linear chain A → B → C', () => {
    const result = computeCPM([
      { id: 'A', title: 'A', durationDays: 3, predecessorIds: [] },
      { id: 'B', title: 'B', durationDays: 4, predecessorIds: ['A'] },
      { id: 'C', title: 'C', durationDays: 2, predecessorIds: ['B'] },
    ]);
    expect(result.hasCycle).toBe(false);
    expect(result.projectDuration).toBe(9);
    expect(result.criticalPath).toEqual(['A', 'B', 'C']);
    result.nodes.forEach((n) => {
      expect(n.isCritical).toBe(true);
      expect(n.totalFloat).toBe(0);
    });
  });

  it('parallel paths; only longest is critical', () => {
    // A(3) → C(2), B(5) → C(2), project duration = 7
    const result = computeCPM([
      { id: 'A', title: 'A', durationDays: 3, predecessorIds: [] },
      { id: 'B', title: 'B', durationDays: 5, predecessorIds: [] },
      { id: 'C', title: 'C', durationDays: 2, predecessorIds: ['A', 'B'] },
    ]);
    expect(result.hasCycle).toBe(false);
    expect(result.projectDuration).toBe(7);
    expect(result.criticalPath).toContain('B');
    expect(result.criticalPath).toContain('C');

    const nodeA = result.nodes.find((n) => n.milestoneId === 'A')!;
    const nodeB = result.nodes.find((n) => n.milestoneId === 'B')!;
    expect(nodeB.isCritical).toBe(true);
    expect(nodeA.totalFloat).toBe(2); // A finishes at 3, B at 5; A has 2d float
  });

  it('detects cycle (A → B → A)', () => {
    const result = computeCPM([
      { id: 'A', title: 'A', durationDays: 3, predecessorIds: ['B'] },
      { id: 'B', title: 'B', durationDays: 3, predecessorIds: ['A'] },
    ]);
    expect(result.hasCycle).toBe(true);
    expect(result.criticalPath).toHaveLength(0);
  });

  it('empty input', () => {
    const result = computeCPM([]);
    expect(result.hasCycle).toBe(false);
    expect(result.projectDuration).toBe(0);
    expect(result.nodes).toHaveLength(0);
  });

  it('zero-duration node (milestone/checkpoint)', () => {
    const result = computeCPM([
      { id: 'A', title: 'A', durationDays: 5, predecessorIds: [] },
      { id: 'M', title: 'Milestone', durationDays: 0, predecessorIds: ['A'] },
    ]);
    expect(result.projectDuration).toBe(5);
    const mNode = result.nodes.find((n) => n.milestoneId === 'M')!;
    expect(mNode.earlyStart).toBe(5);
    expect(mNode.earlyFinish).toBe(5);
  });

  it('lag is applied correctly', () => {
    // A(5) →[lag=2]→ B(3): B starts at 5+2=7, finishes at 10
    const lagMap = new Map([['A→B', 2]]);
    const result = computeCPM(
      [
        { id: 'A', title: 'A', durationDays: 5, predecessorIds: [] },
        { id: 'B', title: 'B', durationDays: 3, predecessorIds: ['A'] },
      ],
      lagMap,
    );
    expect(result.projectDuration).toBe(10);
    const nodeB = result.nodes.find((n) => n.milestoneId === 'B')!;
    expect(nodeB.earlyStart).toBe(7);
    expect(nodeB.earlyFinish).toBe(10);
  });
});
