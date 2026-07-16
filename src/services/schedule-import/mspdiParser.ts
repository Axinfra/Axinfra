import { XMLParser } from 'fast-xml-parser';
import type {
  ExtractedSchedule, ExtractedPhase, ExtractedMilestone, ExtractedDependency,
  ExtractedResource, ExtractedResourceAssignment,
} from './types';

// MSPDI (Microsoft Project XML Data Interchange) — the schema Microsoft Project
// writes via File → Save As → XML. Reference: schemas.microsoft.com/project/2007/mspdi_pj12.xsd

const LINK_TYPE_TO_DEPENDENCY: Record<string, 'FS' | 'SS' | 'FF' | 'SF'> = {
  '0': 'FF', '1': 'FS', '2': 'SF', '3': 'SS',
};
const STANDARD_WORK_HOURS_PER_DAY = 8;

interface RawTask {
  UID: string; ID?: string; Name?: string; WBS?: string; OutlineNumber?: string; OutlineLevel?: string;
  Start?: string; Finish?: string; Duration?: string;
  Work?: string; ActualWork?: string; RemainingWork?: string;
  Milestone?: string; Summary?: string; PercentComplete?: string;
  BaselineStart?: string; BaselineFinish?: string; ActualStart?: string; ActualFinish?: string;
  PredecessorLink?: RawPredecessorLink | RawPredecessorLink[];
}
interface RawPredecessorLink { PredecessorUID: string; Type?: string; LinkLag?: string; LagFormat?: string }
interface RawResource { UID: string; Name?: string; Type?: string }
interface RawAssignment { TaskUID: string; ResourceUID: string; Units?: string; Work?: string }
interface RawProject {
  Name?: string; Title?: string; StartDate?: string; FinishDate?: string;
  Tasks?: { Task?: RawTask | RawTask[] };
  Resources?: { Resource?: RawResource | RawResource[] };
  Assignments?: { Assignment?: RawAssignment | RawAssignment[] };
}

function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined) return [];
  return Array.isArray(v) ? v : [v];
}

function textOrNull(v: string | undefined): string | null {
  return v && v.trim() !== '' ? v.trim() : null;
}

function boolFromMspdi(v: string | undefined): boolean {
  return v === '1' || v === 'true';
}

function numberOrNull(v: string | undefined): number | null {
  if (v === undefined || v.trim() === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Parses an MSPDI duration string like "PT72H0M0S" or "PT3D0H0M" into total hours. */
function parseDurationHours(v: string | undefined): number | null {
  if (!v) return null;
  const match = /^PT(?:(\d+(?:\.\d+)?)D)?(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:(\d+(?:\.\d+)?)S)?$/i.exec(v.trim());
  if (!match) return null;
  const [, days, hours, minutes, seconds] = match;
  const totalHours =
    (days ? parseFloat(days) * 24 : 0) +
    (hours ? parseFloat(hours) : 0) +
    (minutes ? parseFloat(minutes) / 60 : 0) +
    (seconds ? parseFloat(seconds) / 3600 : 0);
  return totalHours > 0 || v === 'PT0H0M0S' ? totalHours : null;
}

function isoOrNull(v: string | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Parses a Microsoft Project XML (MSPDI) export into the normalized ExtractedSchedule shape.
 * `keepWrapperPhase` overrides the default guess for an ambiguous lone top-level Summary task
 * that spans the whole schedule — when true, it's kept as a real Phase instead of being
 * skipped. See `wrapperPhaseCandidate` on the return value. */
export function parseMspdiXml(xml: string, options?: { keepWrapperPhase?: boolean }): ExtractedSchedule {
  const parser = new XMLParser({
    ignoreAttributes: true,
    parseTagValue: false, // keep everything as strings — we convert explicitly, no silent type coercion
    trimValues: true,
    isArray: (name) => ['Task', 'Resource', 'Assignment', 'PredecessorLink'].includes(name),
  });

  const parsed = parser.parse(xml) as { Project?: RawProject };
  const project = parsed.Project;
  if (!project) {
    throw new Error('Not a recognizable MS Project XML file (missing <Project> root element)');
  }

  const allRawTasks = asArray(project.Tasks?.Task);
  const rawTasks = allRawTasks
    // UID 0 is the implicit "Project Summary Task" root — not a real phase or milestone.
    .filter((t) => t.UID !== '0' && textOrNull(t.Name));

  // Some MS Project files also carry a second, user-created top-level summary task that's
  // really just a redundant wrapper around the whole project rather than a real phase — e.g.
  // a single top-level "CM-711B" summary task containing every other phase as its children.
  // Detected below and skipped like UID 0: its children are promoted to top-level instead of
  // nesting one level deeper than they should.
  //
  // Two independent signals, either one is enough (combined with spanning the whole schedule):
  //  1. Its name echoes the project's own name (ignoring case/punctuation) — but this is a
  //     weak signal on its own, since <Project><Name>/<Title> and even UID 0's Name are often
  //     left at a generic template default (e.g. "Sample project") that was never renamed,
  //     rather than reflecting the actual project.
  //  2. It's the *only* task at outline level 1 — a real multi-phase project has several
  //     sibling top-level phases (Pre-Construction, Construction, …); a single top-level
  //     summary task that everything else nests under is structurally just a wrapper,
  //     regardless of what it happens to be named.
  const normalizeForCompare = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const uid0Task = allRawTasks.find((t) => t.UID === '0');
  const projectName = textOrNull(uid0Task?.Name) ?? textOrNull(project.Name) ?? textOrNull(project.Title);
  const topLevelSummaryCount = rawTasks.filter((t) => Number(t.OutlineLevel ?? '1') === 1 && boolFromMspdi(t.Summary)).length;
  const leafTaskDates = rawTasks
    .filter((t) => !boolFromMspdi(t.Summary))
    .flatMap((t) => [isoOrNull(t.Start), isoOrNull(t.Finish)])
    .filter((d): d is string => !!d)
    .map((d) => new Date(d).getTime());
  const overallStart = leafTaskDates.length ? Math.min(...leafTaskDates) : null;
  const overallEnd = leafTaskDates.length ? Math.max(...leafTaskDates) : null;
  const DAY_MS = 86_400_000;

  const phases: ExtractedPhase[] = [];
  const milestones: ExtractedMilestone[] = [];
  const dependencies: ExtractedDependency[] = [];
  let wrapperPhaseCandidate: { name: string; wbsCode: string } | null = null;

  // Every Summary task becomes a Phase row (nested via parentKey) — arbitrary WBS depth,
  // not just the shallowest level. Tracked with a stack keyed by outline level: walking
  // tasks in document order, a task closes out any open phase at >= its own outline level
  // (it can't be that phase's descendant), and the remaining top of stack is its parent.
  const phaseStack: { key: string; outlineLevel: number }[] = [];
  let phaseSortOrder = 0;
  let milestoneSortOrder = 0;
  let checkedFirstTopLevelPhase = false;

  for (const task of rawTasks) {
    const outlineLevel = Number(task.OutlineLevel ?? '1');
    const isSummary = boolFromMspdi(task.Summary);
    const key = task.UID;
    const wbsCode = textOrNull(task.OutlineNumber) ?? textOrNull(task.WBS) ?? String(task.ID ?? task.UID);

    while (phaseStack.length && phaseStack[phaseStack.length - 1].outlineLevel >= outlineLevel) {
      phaseStack.pop();
    }
    const parentPhaseKey = phaseStack.length ? phaseStack[phaseStack.length - 1].key : null;

    if (isSummary && parentPhaseKey === null && !checkedFirstTopLevelPhase) {
      checkedFirstTopLevelPhase = true;
      const taskStart = isoOrNull(task.Start);
      const taskEnd = isoOrNull(task.Finish);
      const nameEchoesProject = !!projectName && normalizeForCompare(task.Name!.trim()) === normalizeForCompare(projectName);
      const isSoleTopLevelPhase = topLevelSummaryCount === 1;
      const spansWholeSchedule =
        overallStart !== null && overallEnd !== null && !!taskStart && !!taskEnd &&
        Math.abs(new Date(taskStart).getTime() - overallStart) < DAY_MS &&
        Math.abs(new Date(taskEnd).getTime() - overallEnd) < DAY_MS;
      if ((nameEchoesProject || isSoleTopLevelPhase) && spansWholeSchedule) {
        // Ambiguous — either it's the project name again, or it's a real (if currently sole)
        // top-level Phase. Always report it so the caller can ask the user; only actually skip
        // it (children promoted to top level instead of nesting under a phantom "Phase 1")
        // when the caller hasn't told us to keep it.
        wrapperPhaseCandidate = { name: task.Name!.trim(), wbsCode };
        if (!options?.keepWrapperPhase) {
          continue;
        }
      }
    }

    if (isSummary) {
      phases.push({
        key,
        parentKey: parentPhaseKey,
        name: task.Name!.trim(),
        wbsCode,
        outlineLevel,
        sortOrder: phaseSortOrder++,
        plannedStart: isoOrNull(task.Start),
        plannedEnd: isoOrNull(task.Finish),
      });
      phaseStack.push({ key, outlineLevel });
      continue;
    }

    const durationHours = parseDurationHours(task.Duration);
    const workHours = parseDurationHours(task.Work);
    const actualWorkHours = parseDurationHours(task.ActualWork);
    const remainingWorkHours = parseDurationHours(task.RemainingWork);

    const assignments: ExtractedResourceAssignment[] = []; // filled in after Assignments are parsed, below

    milestones.push({
      key,
      phaseKey: parentPhaseKey,
      title: task.Name!.trim(),
      wbsCode,
      outlineLevel,
      isMsProjectMilestone: boolFromMspdi(task.Milestone),
      plannedStart: isoOrNull(task.Start),
      plannedEnd: isoOrNull(task.Finish),
      baselinePlannedStart: isoOrNull(task.BaselineStart),
      baselinePlannedEnd: isoOrNull(task.BaselineFinish),
      actualStart: isoOrNull(task.ActualStart),
      actualEnd: isoOrNull(task.ActualFinish),
      durationDays: durationHours !== null ? Math.round((durationHours / STANDARD_WORK_HOURS_PER_DAY) * 100) / 100 : null,
      percentComplete: numberOrNull(task.PercentComplete),
      actualWorkHours: actualWorkHours ?? (workHours !== null && remainingWorkHours !== null ? Math.max(0, workHours - remainingWorkHours) : null),
      remainingWorkHours,
      sortOrder: milestoneSortOrder++,
      assignments,
    });

    for (const link of asArray(task.PredecessorLink)) {
      if (!link.PredecessorUID) continue;
      dependencies.push({
        predecessorKey: link.PredecessorUID,
        successorKey: key,
        dependencyType: LINK_TYPE_TO_DEPENDENCY[link.Type ?? '1'] ?? 'FS',
        lagDays: parseDurationHours(link.LinkLag) !== null ? (parseDurationHours(link.LinkLag)! / STANDARD_WORK_HOURS_PER_DAY) : 0,
      });
    }
  }

  const rawResources = asArray(project.Resources?.Resource).filter((r) => textOrNull(r.Name));
  const resourceTypeLabel: Record<string, string> = { '0': 'Material', '1': 'Labor/Equipment', '2': 'Cost' };
  const resources: ExtractedResource[] = rawResources.map((r) => ({
    key: r.UID,
    name: r.Name!.trim(),
    type: r.Type !== undefined ? (resourceTypeLabel[r.Type] ?? null) : null,
  }));

  const milestoneByKey = new Map(milestones.map((m) => [m.key, m]));
  for (const assignment of asArray(project.Assignments?.Assignment)) {
    const milestone = milestoneByKey.get(assignment.TaskUID);
    if (!milestone) continue;
    const unitsRaw = numberOrNull(assignment.Units);
    milestone.assignments.push({
      resourceKey: assignment.ResourceUID,
      units: unitsRaw !== null ? Math.round(unitsRaw * 100) : 100, // MSPDI Units: 1 = 100%
      workHours: parseDurationHours(assignment.Work),
    });
  }

  return {
    projectInfo: {
      name: projectName,
      startDate: isoOrNull(project.StartDate),
      finishDate: isoOrNull(project.FinishDate),
    },
    phases,
    milestones,
    dependencies,
    resources,
    wrapperPhaseCandidate,
  };
}
