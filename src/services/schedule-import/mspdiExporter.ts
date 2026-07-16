import { XMLBuilder } from 'fast-xml-parser';

// Reverse of mspdiParser.ts — serializes current DB state back into MSPDI XML, the same
// schema Microsoft Project reads via File → Open. There is no open-source (or, per MPXJ's
// own supported-formats list, even paid) writer for the native .mpp binary format, so this
// XML is the closest faithful "export my edited schedule back out" path — MS Project opens
// it directly, same as any File → Save As → XML export.

const DEPENDENCY_TYPE_TO_LINK_TYPE: Record<string, string> = { FF: '0', FS: '1', SF: '2', SS: '3' };

export interface ExportPhase {
  id: string;
  parentPhaseId: string | null;
  name: string;
  outlineLevel: number | null;
  sortOrder: number;
  plannedStart: Date | null;
  plannedEnd: Date | null;
}
export interface ExportMilestone {
  id: string;
  phaseId: string | null;
  title: string;
  isMsProjectMilestone: boolean | null;
  plannedStart: Date | null;
  plannedEnd: Date | null;
  baselinePlannedStart: Date | null;
  baselinePlannedEnd: Date | null;
  actualStart: Date | null;
  actualEnd: Date | null;
  durationDays: number | null;
  percentComplete: number | null;
  actualWorkHours: number | null;
  remainingWorkHours: number | null;
  sortOrder: number;
  predecessorDependencies: Array<{ predecessorId: string; dependencyType: string; lagDays: number }>;
  resourceAssignments: Array<{ units: number; workHours: number | null; resource: { id: string; name: string } }>;
}

function dateStr(d: Date | null): string | undefined {
  return d ? d.toISOString().slice(0, 19) : undefined;
}
function durationStr(hours: number | null | undefined): string | undefined {
  if (hours === null || hours === undefined) return undefined;
  return `PT${Math.round(hours * 100) / 100}H0M0S`;
}

export function exportToMspdiXml(projectName: string, phases: ExportPhase[], milestones: ExportMilestone[]): string {
  const childrenByParent = new Map<string | null, ExportPhase[]>();
  for (const p of phases) {
    const list = childrenByParent.get(p.parentPhaseId) ?? [];
    list.push(p);
    childrenByParent.set(p.parentPhaseId, list);
  }
  const milestonesByPhase = new Map<string | null, ExportMilestone[]>();
  for (const m of milestones) {
    const list = milestonesByPhase.get(m.phaseId) ?? [];
    list.push(m);
    milestonesByPhase.set(m.phaseId, list);
  }
  for (const list of Array.from(childrenByParent.values())) list.sort((a, b) => a.sortOrder - b.sortOrder);
  for (const list of Array.from(milestonesByPhase.values())) list.sort((a, b) => a.sortOrder - b.sortOrder);

  // Sequential integer UIDs (0 reserved for the project summary task, matching MSPDI
  // convention), assigned in document (DFS pre-order) so a real MS Project client can read
  // it. Two passes: first walk the tree purely to assign every UID/WBS, then walk again to
  // emit Task objects — PredecessorLink can reference a task that appears *later* in the
  // document (e.g. a subphase's milestone depending on a sibling phase's task), so UIDs
  // must all be known before any PredecessorLink is resolved.
  type Entry =
    | { kind: 'phase'; phase: ExportPhase; uid: number; wbs: string; outlineLevel: number }
    | { kind: 'milestone'; milestone: ExportMilestone; uid: number; wbs: string | null; outlineLevel: number };

  let nextUid = 1;
  const phaseUid = new Map<string, number>();
  const milestoneUid = new Map<string, number>();
  const entries: Entry[] = [];

  function walk(parentId: string | null, outlineLevel: number, outlineNumber: string) {
    const children = childrenByParent.get(parentId) ?? [];
    children.forEach((phase, idx) => {
      const uid = nextUid++;
      phaseUid.set(phase.id, uid);
      const wbs = outlineNumber ? `${outlineNumber}.${idx + 1}` : `${idx + 1}`;
      entries.push({ kind: 'phase', phase, uid, wbs, outlineLevel });

      const ownMilestones = milestonesByPhase.get(phase.id) ?? [];
      ownMilestones.forEach((m, mIdx) => {
        const mUid = nextUid++;
        milestoneUid.set(m.id, mUid);
        entries.push({ kind: 'milestone', milestone: m, uid: mUid, wbs: `${wbs}.${mIdx + 1}`, outlineLevel: outlineLevel + 1 });
      });
      walk(phase.id, outlineLevel + 1, wbs);
    });
  }
  walk(null, 1, '');

  // Unphased milestones — attach directly under the project root, one level deep.
  for (const m of milestonesByPhase.get(null) ?? []) {
    const mUid = nextUid++;
    milestoneUid.set(m.id, mUid);
    entries.push({ kind: 'milestone', milestone: m, uid: mUid, wbs: null, outlineLevel: 1 });
  }

  const tasks: Record<string, unknown>[] = [
    { UID: 0, Name: projectName, Summary: 1, OutlineLevel: 0 },
  ];
  for (const entry of entries) {
    if (entry.kind === 'phase') {
      const { phase, uid, wbs, outlineLevel } = entry;
      tasks.push({
        UID: uid, Name: phase.name, WBS: wbs, OutlineNumber: wbs, OutlineLevel: outlineLevel,
        Summary: 1, Milestone: 0,
        Start: dateStr(phase.plannedStart), Finish: dateStr(phase.plannedEnd),
      });
      continue;
    }
    const { milestone: m, uid, wbs, outlineLevel } = entry;
    tasks.push({
      UID: uid, Name: m.title, WBS: wbs ?? undefined, OutlineNumber: wbs ?? undefined, OutlineLevel: outlineLevel,
      Summary: 0, Milestone: m.isMsProjectMilestone ? 1 : 0,
      Start: dateStr(m.plannedStart), Finish: dateStr(m.plannedEnd),
      BaselineStart: dateStr(m.baselinePlannedStart), BaselineFinish: dateStr(m.baselinePlannedEnd),
      ActualStart: dateStr(m.actualStart), ActualFinish: dateStr(m.actualEnd),
      Duration: durationStr(m.durationDays !== null ? m.durationDays * 8 : null),
      PercentComplete: m.percentComplete ?? undefined,
      ActualWork: durationStr(m.actualWorkHours),
      RemainingWork: durationStr(m.remainingWorkHours),
      PredecessorLink: m.predecessorDependencies.map((dep) => ({
        PredecessorUID: milestoneUid.get(dep.predecessorId) ?? phaseUid.get(dep.predecessorId),
        Type: DEPENDENCY_TYPE_TO_LINK_TYPE[dep.dependencyType] ?? '1',
        LinkLag: durationStr(dep.lagDays * 8),
        LagFormat: 7,
      })).filter((l) => l.PredecessorUID !== undefined),
    });
  }

  const resourceById = new Map<string, { id: string; name: string }>();
  for (const m of milestones) {
    for (const a of m.resourceAssignments) resourceById.set(a.resource.id, a.resource);
  }
  const resources = Array.from(resourceById.values()).map((r, idx) => ({ UID: idx + 1, Name: r.name }));
  const resourceUidByDbId = new Map(Array.from(resourceById.values()).map((r, idx) => [r.id, idx + 1]));

  const assignments: Record<string, unknown>[] = [];
  for (const m of milestones) {
    const taskUid = milestoneUid.get(m.id);
    if (!taskUid) continue;
    for (const a of m.resourceAssignments) {
      const resourceUid = resourceUidByDbId.get(a.resource.id);
      if (!resourceUid) continue;
      assignments.push({ TaskUID: taskUid, ResourceUID: resourceUid, Units: a.units / 100, Work: durationStr(a.workHours) });
    }
  }

  const builder = new XMLBuilder({ format: true, ignoreAttributes: false, suppressEmptyNode: true, attributeNamePrefix: '@_' });
  const doc = {
    Project: {
      '@_xmlns': 'http://schemas.microsoft.com/project',
      Name: projectName,
      Title: projectName,
      Tasks: { Task: tasks },
      Resources: { Resource: resources },
      Assignments: { Assignment: assignments },
    },
  };
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n${builder.build(doc)}`;
}
