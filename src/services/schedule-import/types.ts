/**
 * Normalized shape produced by any schedule-file parser (MSPDI XML today,
 * a future .mpp/Aspose path later) — everything downstream (preview, confirm,
 * Gantt/WBS display) consumes only this shape, never the source format directly.
 */

export interface ExtractedPhase {
  /** Stable key within this extraction — used to link milestones/subphases to their phase before DB ids exist. */
  key: string;
  /** Extraction-local key of the parent phase, or null for a top-level phase. Enables arbitrary WBS nesting. */
  parentKey: string | null;
  name: string;
  wbsCode: string;
  outlineLevel: number;
  sortOrder: number;
  plannedStart: string | null;
  plannedEnd: string | null;
}

export interface ExtractedDependency {
  /** Extraction-local task key, not a DB id. */
  predecessorKey: string;
  successorKey: string;
  dependencyType: 'FS' | 'SS' | 'FF' | 'SF';
  lagDays: number;
}

export interface ExtractedResourceAssignment {
  resourceKey: string;
  units: number; // % allocation, 100 = 1 FTE
  workHours: number | null;
}

export interface ExtractedMilestone {
  /** Stable key within this extraction (source task UID). */
  key: string;
  phaseKey: string | null;
  title: string;
  wbsCode: string;
  outlineLevel: number;
  isMsProjectMilestone: boolean;
  plannedStart: string | null;
  plannedEnd: string | null;
  baselinePlannedStart: string | null;
  baselinePlannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  durationDays: number | null;
  percentComplete: number | null;
  actualWorkHours: number | null;
  remainingWorkHours: number | null;
  sortOrder: number;
  assignments: ExtractedResourceAssignment[];
}

export interface ExtractedResource {
  key: string;
  name: string;
  type: string | null;
}

export interface ExtractedProjectInfo {
  name: string | null;
  startDate: string | null;
  finishDate: string | null;
}

export interface ExtractedSchedule {
  projectInfo: ExtractedProjectInfo;
  phases: ExtractedPhase[];
  milestones: ExtractedMilestone[];
  dependencies: ExtractedDependency[];
  resources: ExtractedResource[];
  /** A lone top-level Summary task spanning the whole schedule — ambiguous whether it's just
   * the project's name (skip it, current default) or a real Phase the user wants to keep. Set
   * whenever detected, regardless of whether this run actually skipped it. */
  wrapperPhaseCandidate: { name: string; wbsCode: string } | null;
}
