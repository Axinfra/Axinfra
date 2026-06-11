/**
 * Critical Path Method (CPM) implementation.
 *
 * Inputs: an array of milestone nodes with duration and predecessor IDs.
 * Output: CpmResult with ES/EF/LS/LF, total float, and the ordered critical path.
 *
 * Only Finish-to-Start (FS) dependencies with optional lag are modelled here.
 * This is a deterministic, pure-function implementation with no side effects.
 */

import type { CpmNode, CpmResult } from '@/types';

export interface CpmInput {
  id: string;
  title: string;
  /** Duration in calendar days (≥ 0). If 0 the milestone is a milestone/checkpoint. */
  durationDays: number;
  predecessorIds: string[];
  lagDays?: number; // per-predecessor lag; positive = delay
}

// -------------------------------------------------------------------------
// Internal helpers
// -------------------------------------------------------------------------

/**
 * Topological sort using Kahn's algorithm.
 * Returns { order, hasCycle } where order is [] if a cycle is detected.
 */
function topologicalSort(
  nodes: CpmInput[],
  edges: Map<string, { successors: string[]; predecessors: string[] }>,
): { order: string[]; hasCycle: boolean } {
  const inDegree = new Map<string, number>();
  for (const n of nodes) inDegree.set(n.id, 0);
  for (const n of nodes) {
    const e = edges.get(n.id)!;
    for (const s of e.successors) {
      inDegree.set(s, (inDegree.get(s) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [id, deg] of Array.from(inDegree)) {
    if (deg === 0) queue.push(id);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    order.push(id);
    const e = edges.get(id)!;
    for (const s of e.successors) {
      const newDeg = (inDegree.get(s) ?? 1) - 1;
      inDegree.set(s, newDeg);
      if (newDeg === 0) queue.push(s);
    }
  }

  return { order, hasCycle: order.length !== nodes.length };
}

function describeCycle(
  nodes: CpmInput[],
  edges: Map<string, { successors: string[]; predecessors: string[] }>,
): string {
  const nodeMap = new Map(nodes.map((n) => [n.id, n]));
  const visiting = new Set<string>();
  const visited = new Set<string>();
  const stack: string[] = [];

  function visit(id: string): string[] | null {
    if (visiting.has(id)) {
      const start = stack.indexOf(id);
      return [...stack.slice(Math.max(0, start)), id];
    }
    if (visited.has(id)) return null;

    visiting.add(id);
    stack.push(id);
    for (const successorId of edges.get(id)?.successors ?? []) {
      const cycle = visit(successorId);
      if (cycle) return cycle;
    }
    stack.pop();
    visiting.delete(id);
    visited.add(id);
    return null;
  }

  for (const node of nodes) {
    const cycle = visit(node.id);
    if (cycle) {
      const names = cycle.map((id) => nodeMap.get(id)?.title ?? id);
      return `Circular dependency: ${names.join(' → ')}. Remove one link in this loop.`;
    }
  }

  return 'A circular dependency was found. Remove one link in the loop to restore the flow.';
}

// -------------------------------------------------------------------------
// Public API
// -------------------------------------------------------------------------

/**
 * Compute CPM for a set of milestones.
 *
 * @param milestones - Array of milestone inputs (IDs must be unique).
 * @param lagMap - Optional map of `${predecessorId}→${successorId}` to lag days.
 */
export function computeCPM(
  milestones: CpmInput[],
  lagMap: Map<string, number> = new Map(),
): CpmResult {
  if (milestones.length === 0) {
    return { nodes: [], criticalPath: [], projectDuration: 0, hasCycle: false };
  }

  // Build adjacency maps
  const nodeMap = new Map<string, CpmInput>();
  const edges = new Map<string, { successors: string[]; predecessors: string[] }>();

  for (const m of milestones) {
    nodeMap.set(m.id, m);
    if (!edges.has(m.id)) edges.set(m.id, { successors: [], predecessors: [] });
  }

  for (const m of milestones) {
    for (const predId of m.predecessorIds) {
      if (!edges.has(predId)) {
        // Unknown predecessor - treat as external (no edge)
        continue;
      }
      edges.get(predId)!.successors.push(m.id);
      edges.get(m.id)!.predecessors.push(predId);
    }
  }

  // Topological sort
  const { order, hasCycle } = topologicalSort(milestones, edges);
  if (hasCycle) {
    return {
      nodes: [],
      criticalPath: [],
      projectDuration: 0,
      hasCycle: true,
      cycleDescription: describeCycle(milestones, edges),
    };
  }

  // Forward pass – compute Early Start (ES) and Early Finish (EF)
  const es = new Map<string, number>();
  const ef = new Map<string, number>();

  for (const id of order) {
    const m = nodeMap.get(id)!;
    const edge = edges.get(id)!;
    let maxPredEF = 0;
    for (const predId of edge.predecessors) {
      const lag = lagMap.get(`${predId}→${id}`) ?? 0;
      maxPredEF = Math.max(maxPredEF, (ef.get(predId) ?? 0) + lag);
    }
    es.set(id, maxPredEF);
    ef.set(id, maxPredEF + m.durationDays);
  }

  const projectDuration = Math.max(...Array.from(ef.values()), 0);

  // Backward pass – compute Late Start (LS) and Late Finish (LF)
  const ls = new Map<string, number>();
  const lf = new Map<string, number>();

  // Initialise terminal nodes
  for (const id of order) {
    lf.set(id, projectDuration);
    ls.set(id, projectDuration - nodeMap.get(id)!.durationDays);
  }

  for (let i = order.length - 1; i >= 0; i--) {
    const id = order[i];
    const edge = edges.get(id)!;
    let minSuccLS = lf.get(id)!;
    for (const succId of edge.successors) {
      const lag = lagMap.get(`${id}→${succId}`) ?? 0;
      minSuccLS = Math.min(minSuccLS, (ls.get(succId) ?? projectDuration) - lag);
    }
    lf.set(id, minSuccLS);
    ls.set(id, minSuccLS - nodeMap.get(id)!.durationDays);
  }

  // Build result nodes
  const nodes: CpmNode[] = order.map((id) => {
    const m = nodeMap.get(id)!;
    const totalFloat = (ls.get(id) ?? 0) - (es.get(id) ?? 0);
    return {
      milestoneId: id,
      title: m.title,
      duration: m.durationDays,
      predecessorIds: m.predecessorIds,
      earlyStart: es.get(id) ?? 0,
      earlyFinish: ef.get(id) ?? 0,
      lateStart: ls.get(id) ?? 0,
      lateFinish: lf.get(id) ?? 0,
      totalFloat: Math.max(0, totalFloat), // clamp to 0 to avoid floating-point negatives
      isCritical: Math.max(0, totalFloat) === 0,
    };
  });

  // Determine critical path (ordered by earlyStart)
  const criticalNodes = nodes
    .filter((n) => n.isCritical)
    .sort((a, b) => a.earlyStart - b.earlyStart);
  const criticalPath = criticalNodes.map((n) => n.milestoneId);

  return { nodes, criticalPath, projectDuration, hasCycle: false };
}

/**
 * Convert milestone planned dates into CPM inputs.
 * If dates are missing, falls back to sortOrder-based positioning.
 */
export function milestonesCpmInputs(
  milestones: Array<{
    id: string;
    title: string;
    plannedStart: Date | null;
    plannedEnd: Date | null;
    sortOrder: number;
    predecessorIds: string[];
  }>,
  projectStartDate: Date,
): CpmInput[] {
  return milestones.map((m) => {
    let durationDays = 1;
    if (m.plannedStart && m.plannedEnd) {
      const diff =
        (m.plannedEnd.getTime() - m.plannedStart.getTime()) / (1000 * 60 * 60 * 24);
      durationDays = Math.max(1, Math.round(diff));
    }
    return {
      id: m.id,
      title: m.title,
      durationDays,
      predecessorIds: m.predecessorIds,
    };
  });
}
