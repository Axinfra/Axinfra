export interface SchedulePhaseOption {
  id: string;
  name: string;
  parentPhaseId: string | null;
  sortOrder: number;
  /** Present when this row is a schedule-imported Execution/WBS phase; null for a genuine
   *  Purchase Order phase. Optional so older callers that don't fetch it still compile. */
  scheduleImportId?: string | null;
}

/** True for a genuine Purchase Order phase (top-level, never touched by a schedule import) —
 *  false for a schedule-imported Execution/WBS phase (top-level or nested). Mirrors the
 *  `parentPhaseId: null, scheduleImportId: null` filter used everywhere a BOQ/Order query
 *  needs to exclude Execution phases (see BOQService.create, phases/route.ts, etc). */
export function isPurchaseOrderPhase(p: Pick<SchedulePhaseOption, 'parentPhaseId' | 'scheduleImportId'>): boolean {
  return p.parentPhaseId === null && !p.scheduleImportId;
}

/** Flattens the phase tree into indented dropdown options — a top-level phase's option
 * represents itself, subphases nest below it. Same convention across the WBS Tree, Gantt,
 * Milestones phase filter, and MilestoneEditModal/Create Milestone's phase pickers. Includes
 * every phase for the project (Purchase Orders and schedule-imported Execution phases alike —
 * they're just flat vs. nested entries in the same tree), since a milestone can link to either.
 * Each option carries `isPurchaseOrder` so callers can visually distinguish the two kinds
 * instead of presenting them as one undifferentiated list. */
export function buildPhaseOptions(phases: SchedulePhaseOption[]): Array<{ id: string; name: string; depth: number; isPurchaseOrder: boolean }> {
  const childrenByParent = new Map<string, SchedulePhaseOption[]>();
  const roots: SchedulePhaseOption[] = [];
  phases.forEach((p) => {
    if (p.parentPhaseId) {
      const list = childrenByParent.get(p.parentPhaseId) ?? [];
      list.push(p);
      childrenByParent.set(p.parentPhaseId, list);
    } else {
      roots.push(p);
    }
  });
  const bySortOrder = (a: SchedulePhaseOption, b: SchedulePhaseOption) => a.sortOrder - b.sortOrder;
  roots.sort(bySortOrder);
  Array.from(childrenByParent.values()).forEach((l) => l.sort(bySortOrder));
  const options: Array<{ id: string; name: string; depth: number; isPurchaseOrder: boolean }> = [];
  function walk(p: SchedulePhaseOption, depth: number) {
    options.push({ id: p.id, name: p.name, depth, isPurchaseOrder: isPurchaseOrderPhase(p) });
    (childrenByParent.get(p.id) ?? []).forEach((c) => walk(c, depth + 1));
  }
  roots.forEach((p) => walk(p, 0));
  return options;
}

/** A phase plus every descendant subphase — so filtering/selecting a parent phase also
 * covers milestones filed under its subphases, not just milestones on the parent itself. */
export function collectDescendantPhaseIds(phaseId: string, phases: SchedulePhaseOption[]): Set<string> {
  const ids = new Set([phaseId]);
  let added = true;
  while (added) {
    added = false;
    for (const p of phases) {
      if (p.parentPhaseId && ids.has(p.parentPhaseId) && !ids.has(p.id)) {
        ids.add(p.id);
        added = true;
      }
    }
  }
  return ids;
}
