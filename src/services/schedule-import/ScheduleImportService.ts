import { prisma } from '@/lib/db';
import { fileStorage } from '@/lib/file-storage';
import { generateStorageKey } from '@/lib/utils';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { parseMspdiXml } from './mspdiParser';
import { convertMppToXml } from './mppConverter';
import type { ExtractedSchedule } from './types';

export interface UploadInput {
  buffer: Buffer;
  fileName: string;
  mimeType: string;
  size: number;
}

/** Runs `fn` over `items` with at most `limit` in flight at once — large schedules (hundreds
 * of tasks) would otherwise commit one sequential DB round-trip at a time; bounded concurrency
 * gets most of the speedup of full parallelism without opening enough connections at once to
 * exhaust the Postgres/Neon pool. */
async function mapWithConcurrency<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return results;
}
const CONCURRENCY = 12;

/**
 * Orchestrates one-time schedule file imports (MS Project XML export or native
 * .mpp — .mpp is converted to the same MSPDI XML via mppConverter first, so
 * parseMspdiXml is the single extraction path for both formats).
 * Two-step: parseUpload() stores the file + caches the extraction for preview;
 * confirmImport() commits it into real Phase/Milestone/Dependency/Resource rows.
 */
export class ScheduleImportService {
  static detectSourceFormat(fileName: string, mimeType: string): 'XML' | 'MPP' {
    if (fileName.toLowerCase().endsWith('.mpp') || mimeType === 'application/vnd.ms-project') return 'MPP';
    return 'XML';
  }

  static async parseUpload(projectId: string, uploadedById: string, file: UploadInput) {
    const sourceFormat = this.detectSourceFormat(file.fileName, file.mimeType);
    const storageKey = generateStorageKey(file.fileName);
    const filePath = await fileStorage.save(storageKey, file.buffer, file.mimeType);

    const scheduleImport = await prisma.scheduleImport.create({
      data: {
        projectId,
        uploadedById,
        fileName: file.fileName,
        mimeType: file.mimeType,
        fileSize: file.size,
        storageKey: filePath,
        sourceFormat,
        status: 'PARSING',
      },
    });

    try {
      const xml = sourceFormat === 'MPP'
        ? await convertMppToXml(file.buffer)
        : file.buffer.toString('utf8');

      const extracted = parseMspdiXml(xml);
      this.validateExtraction(extracted);

      const updated = await prisma.scheduleImport.update({
        where: { id: scheduleImport.id },
        data: {
          status: 'PARSED',
          extractedDataJson: JSON.stringify(extracted),
          phasesFound: extracted.phases.length,
          milestonesFound: extracted.milestones.length,
          dependenciesFound: extracted.dependencies.length,
          resourcesFound: extracted.resources.length,
          parsedAt: new Date(),
        },
      });
      // Not a DB column — computed from the extraction so the preview UI can ask the user
      // about it without parsing extractedDataJson itself.
      return { ...updated, wrapperPhaseCandidate: extracted.wrapperPhaseCandidate };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse schedule file';
      await prisma.scheduleImport.update({
        where: { id: scheduleImport.id },
        data: { status: 'FAILED', errorMessage: message },
      });
      throw err;
    }
  }

  private static validateExtraction(extracted: ExtractedSchedule) {
    if (extracted.milestones.length === 0) {
      throw new Error('No tasks found in this file — check it was exported with task data included.');
    }
  }

  /** Commits a PARSED import's cached extraction into real Phase/Milestone/Dependency/Resource
   * rows. `keepWrapperPhase` answers the ambiguous-wrapper-phase question the preview may have
   * asked the user — the cached extraction always reflects the skip-it default, so when the
   * user instead chose to keep it, the original file is re-parsed with that override rather
   * than trying to reconstruct the kept structure from the already-skipped cache. */
  static async confirmImport(importId: string, projectId: string, options?: { keepWrapperPhase?: boolean }) {
    const record = await prisma.scheduleImport.findFirstOrThrow({ where: { id: importId, projectId } });
    if (record.status !== 'PARSED') {
      throw new Error(`Cannot confirm an import with status ${record.status}`);
    }
    const cached: ExtractedSchedule = JSON.parse(record.extractedDataJson!);

    let extracted: ExtractedSchedule = cached;
    if (options?.keepWrapperPhase && cached.wrapperPhaseCandidate) {
      const buffer = await fileStorage.read(record.storageKey);
      if (!buffer) {
        throw new Error('Original uploaded file is no longer available — please re-upload to change this choice.');
      }
      const xml = record.sourceFormat === 'MPP' ? await convertMppToXml(buffer) : buffer.toString('utf8');
      extracted = parseMspdiXml(xml, { keepWrapperPhase: true });
    }

    let phasesCreated = 0, milestonesCreated = 0, dependenciesCreated = 0, resourcesCreated = 0;

    // Phases — matched by (parentPhaseId, name) within the project, so subphases sharing a
    // name under different parents (e.g. repeated "Design Finalization" per discipline) don't
    // collide. extracted.phases is parent-before-child (DFS order from the parser), so
    // phaseIdByKey always has a subphase's parent DB id ready before the subphase is processed.
    const existingPhases = await prisma.phase.findMany({ where: { projectId }, select: { id: true, name: true, sortOrder: true, parentPhaseId: true } });
    const phaseIdByParentAndName = new Map(existingPhases.map((p) => [`${p.parentPhaseId ?? ''}::${p.name.toLowerCase().trim()}`, p.id]));
    let nextPhaseSortOrder = existingPhases.length > 0 ? Math.max(...existingPhases.map((p) => p.sortOrder)) + 1 : 0;

    // Batched by outline level (not fully parallel): a subphase's parentPhaseId lookup needs
    // its parent's DB id already resolved, and a child is always exactly one level deeper than
    // its immediate parent, so grouping by outlineLevel and processing level-by-level guarantees
    // parents land before children while still parallelizing every sibling within a level.
    const phaseIdByKey = new Map<string, string>();
    const phasesByLevel = new Map<number, typeof extracted.phases>();
    for (const phase of extracted.phases) {
      const list = phasesByLevel.get(phase.outlineLevel) ?? [];
      list.push(phase);
      phasesByLevel.set(phase.outlineLevel, list);
    }
    const levels = Array.from(phasesByLevel.keys()).sort((a, b) => a - b);
    for (const level of levels) {
      // Group this level's phases by matchKey first (parentPhaseId is already resolvable —
      // all shallower levels are done) so two same-named siblings under the same parent
      // resolve to one DB row instead of racing to create a duplicate each.
      const groups = new Map<string, { parentPhaseId: string | null; phase: (typeof extracted.phases)[number]; keys: string[] }>();
      for (const phase of phasesByLevel.get(level)!) {
        const parentPhaseId = phase.parentKey ? phaseIdByKey.get(phase.parentKey) ?? null : null;
        const matchKey = `${parentPhaseId ?? ''}::${phase.name.toLowerCase().trim()}`;
        const group = groups.get(matchKey);
        if (group) group.keys.push(phase.key);
        else groups.set(matchKey, { parentPhaseId, phase, keys: [phase.key] });
      }
      const groupList = Array.from(groups.entries());
      const results = await mapWithConcurrency(groupList, CONCURRENCY, async ([matchKey, group]) => {
        const { parentPhaseId, phase } = group;
        let phaseId = phaseIdByParentAndName.get(matchKey);
        let created = false;
        if (!phaseId) {
          const row = await prisma.phase.create({
            data: {
              projectId,
              parentPhaseId,
              name: phase.name,
              outlineLevel: phase.outlineLevel,
              sortOrder: nextPhaseSortOrder++,
              plannedStart: phase.plannedStart ? new Date(phase.plannedStart) : null,
              plannedEnd: phase.plannedEnd ? new Date(phase.plannedEnd) : null,
              scheduleImportId: importId,
            },
          });
          phaseId = row.id;
          created = true;
        } else {
          await prisma.phase.update({
            where: { id: phaseId },
            data: {
              outlineLevel: phase.outlineLevel,
              plannedStart: phase.plannedStart ? new Date(phase.plannedStart) : undefined,
              plannedEnd: phase.plannedEnd ? new Date(phase.plannedEnd) : undefined,
              scheduleImportId: importId,
            },
          });
        }
        return { keys: group.keys, phaseId, created };
      });
      for (const r of results) {
        for (const key of r.keys) phaseIdByKey.set(key, r.phaseId);
        if (r.created) phasesCreated++;
      }
    }

    // Milestones — matched by wbsCode within the project (more stable than title across re-exports).
    const existingMilestones = await prisma.milestone.findMany({
      where: { projectId, wbsCode: { not: null } },
      select: { id: true, wbsCode: true },
    });
    const milestoneIdByWbs = new Map(existingMilestones.map((m) => [m.wbsCode!, m.id]));

    // wbsCode is unique per task within a single file's extraction, so unlike phase names,
    // no in-batch duplicate risk — the whole set can be fully parallelized.
    const milestoneIdByKey = new Map<string, string>();
    const milestoneResults = await mapWithConcurrency(extracted.milestones, CONCURRENCY, async (m) => {
      const phaseId = m.phaseKey ? phaseIdByKey.get(m.phaseKey) ?? null : null;
      const data = {
        title: m.title,
        phaseId,
        wbsCode: m.wbsCode,
        outlineLevel: m.outlineLevel,
        isMsProjectMilestone: m.isMsProjectMilestone,
        plannedStart: m.plannedStart ? new Date(m.plannedStart) : null,
        plannedEnd: m.plannedEnd ? new Date(m.plannedEnd) : null,
        baselinePlannedStart: m.baselinePlannedStart ? new Date(m.baselinePlannedStart) : null,
        baselinePlannedEnd: m.baselinePlannedEnd ? new Date(m.baselinePlannedEnd) : null,
        actualStart: m.actualStart ? new Date(m.actualStart) : null,
        actualEnd: m.actualEnd ? new Date(m.actualEnd) : null,
        durationDays: m.durationDays,
        percentComplete: m.percentComplete,
        actualWorkHours: m.actualWorkHours,
        remainingWorkHours: m.remainingWorkHours,
        sortOrder: m.sortOrder,
        scheduleImportId: importId,
      };

      const existingId = milestoneIdByWbs.get(m.wbsCode);
      if (!existingId) {
        const created = await prisma.milestone.create({ data: { projectId, ...data } });
        return { key: m.key, milestoneId: created.id, created: true };
      }
      await prisma.milestone.update({ where: { id: existingId }, data });
      return { key: m.key, milestoneId: existingId, created: false };
    });
    for (const r of milestoneResults) {
      milestoneIdByKey.set(r.key, r.milestoneId);
      if (r.created) milestonesCreated++;
    }

    // Dependencies — upsert MilestoneDependency by (predecessorId, successorId). Deduped by
    // pair first (extracted.dependencies could in theory repeat a pair) before parallelizing.
    const depByPair = new Map<string, ExtractedSchedule['dependencies'][number]>();
    for (const dep of extracted.dependencies) {
      const predecessorId = milestoneIdByKey.get(dep.predecessorKey);
      const successorId = milestoneIdByKey.get(dep.successorKey);
      if (!predecessorId || !successorId || predecessorId === successorId) continue;
      depByPair.set(`${predecessorId}::${successorId}`, dep);
    }
    const depResults = await mapWithConcurrency(Array.from(depByPair.entries()), CONCURRENCY, async ([pairKey, dep]) => {
      const [predecessorId, successorId] = pairKey.split('::');
      const existing = await prisma.milestoneDependency.findUnique({
        where: { predecessorId_successorId: { predecessorId, successorId } },
      });
      if (!existing) {
        await prisma.milestoneDependency.create({
          data: { predecessorId, successorId, dependencyType: dep.dependencyType, lagDays: dep.lagDays },
        });
        return true;
      }
      if (existing.dependencyType !== dep.dependencyType || existing.lagDays !== dep.lagDays) {
        await prisma.milestoneDependency.update({
          where: { id: existing.id },
          data: { dependencyType: dep.dependencyType, lagDays: dep.lagDays },
        });
      }
      return false;
    });
    dependenciesCreated += depResults.filter(Boolean).length;

    // Resources — matched by name within the project. Grouped by name first (two resource
    // UIDs can share a display name) so duplicates in the batch resolve to one row, same
    // reasoning as the phase dedupe above.
    const existingResources = await prisma.resource.findMany({ where: { projectId }, select: { id: true, name: true } });
    const resourceIdByName = new Map(existingResources.map((r) => [r.name.toLowerCase().trim(), r.id]));

    const resourceGroups = new Map<string, { resource: ExtractedSchedule['resources'][number]; keys: string[] }>();
    for (const r of extracted.resources) {
      const nameKey = r.name.toLowerCase().trim();
      const group = resourceGroups.get(nameKey);
      if (group) group.keys.push(r.key);
      else resourceGroups.set(nameKey, { resource: r, keys: [r.key] });
    }
    const resourceIdByKey = new Map<string, string>();
    const resourceResults = await mapWithConcurrency(Array.from(resourceGroups.entries()), CONCURRENCY, async ([nameKey, group]) => {
      let resourceId = resourceIdByName.get(nameKey);
      let created = false;
      if (!resourceId) {
        const row = await prisma.resource.create({
          data: { projectId, name: group.resource.name, type: group.resource.type, scheduleImportId: importId },
        });
        resourceId = row.id;
        created = true;
      }
      return { keys: group.keys, resourceId, created };
    });
    for (const r of resourceResults) {
      for (const key of r.keys) resourceIdByKey.set(key, r.resourceId);
      if (r.created) resourcesCreated++;
    }

    // Assignments — each (milestoneId, resourceId) pair is a distinct row (upsert is atomic
    // per-row), so the whole flattened set can be parallelized directly.
    const allAssignments = extracted.milestones.flatMap((m) => {
      const milestoneId = milestoneIdByKey.get(m.key)!;
      return m.assignments
        .map((a) => ({ milestoneId, resourceId: resourceIdByKey.get(a.resourceKey), units: a.units, workHours: a.workHours }))
        .filter((a): a is { milestoneId: string; resourceId: string; units: number; workHours: number | null } => !!a.resourceId);
    });
    await mapWithConcurrency(allAssignments, CONCURRENCY, (a) =>
      prisma.milestoneResourceAssignment.upsert({
        where: { milestoneId_resourceId: { milestoneId: a.milestoneId, resourceId: a.resourceId } },
        create: { milestoneId: a.milestoneId, resourceId: a.resourceId, units: a.units, workHours: a.workHours },
        update: { units: a.units, workHours: a.workHours },
      }),
    );

    await prisma.scheduleImport.update({
      where: { id: importId },
      data: { status: 'CONFIRMED', confirmedAt: new Date() },
    });
    await invalidateProjectAndMemberCaches(projectId);

    return { phasesCreated, milestonesCreated, dependenciesCreated, resourcesCreated };
  }
}
