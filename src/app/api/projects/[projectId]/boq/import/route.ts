import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'crypto';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { prisma } from '@/lib/db';
import { AuditLogger } from '@/services/AuditLogger';
import { AuditActionTypes } from '@/types';
import { invalidateProjectAndMemberCaches } from '@/lib/cache-invalidation';
import { z } from 'zod';

const importItemSchema = z.object({
  phaseName: z.string().min(1),
  description: z.string().min(1),
  unit: z.string().min(1),
  plannedQty: z.number().positive(),
  rate: z.number().positive(),
});

const importBodySchema = z.object({
  items: z.array(importItemSchema).min(1).max(500),
});

// POST /api/projects/[projectId]/boq/import
// Creates BOQs for multiple phases in one request, adding all items atomically.
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await request.json();
    const { items } = importBodySchema.parse(body);

    // Load all project phases (with existing BOQ state)
    const phases = await prisma.phase.findMany({
      where: { projectId },
      include: { boq: { select: { id: true, status: true } } },
      orderBy: { sortOrder: 'asc' },
    });
    const phaseByName = new Map(phases.map((p) => [p.name.toLowerCase().trim(), p]));

    // Group items by phase name (preserve insertion order)
    const byPhase = new Map<string, typeof items>();
    for (const item of items) {
      const key = item.phaseName;
      const list = byPhase.get(key) ?? [];
      list.push(item);
      byPhase.set(key, list);
    }

    const results: Array<{
      phaseName: string;
      itemsAdded?: number;
      duplicatesSkipped?: number;
      error?: string;
      phaseCreated?: boolean;
    }> = [];
    let totalCreated = 0;
    let totalSkipped = 0;
    let totalDuplicates = 0;

    // Pass 1 — resolve every phase group to a real phase + BOQ. Any phase that doesn't exist
    // yet, and any existing phase that has no BOQ yet, gets queued up and created via a couple
    // of bulk createMany calls instead of one-row-at-a-time — this is what made large imports
    // into a mostly-empty project slow (N phases used to mean N sequential round trips).
    let nextSortOrder = (phases[phases.length - 1]?.sortOrder ?? -1) + 1;
    const newPhaseIdByKey = new Map<string, string>();
    const newBoqIdByPhaseId = new Map<string, string>();
    const phaseInserts: Array<{ id: string; projectId: string; name: string; sortOrder: number }> = [];
    const boqInserts: Array<{ id: string; projectId: string; phaseId: string; status: string }> = [];

    const resolved: Array<{
      phaseName: string;
      phaseItems: typeof items;
      boqId?: string;
      phaseCreated: boolean;
      error?: string;
    }> = [];

    for (const [phaseName, phaseItems] of Array.from(byPhase.entries())) {
      const key = phaseName.toLowerCase().trim();
      const phase = phaseByName.get(key);

      if (phase) {
        if (phase.boq) {
          if (phase.boq.status === 'APPROVED') {
            resolved.push({ phaseName, phaseItems, phaseCreated: false, error: 'BOQ is already approved and locked' });
          } else {
            resolved.push({ phaseName, phaseItems, boqId: phase.boq.id, phaseCreated: false });
          }
          continue;
        }
        // Existing phase with no BOQ yet — queue a BOQ for it.
        let boqId = newBoqIdByPhaseId.get(phase.id);
        if (!boqId) {
          boqId = randomUUID();
          newBoqIdByPhaseId.set(phase.id, boqId);
          boqInserts.push({ id: boqId, projectId, phaseId: phase.id, status: 'DRAFT' });
        }
        resolved.push({ phaseName, phaseItems, boqId, phaseCreated: false });
        continue;
      }

      // Brand-new phase — queue both a phase and a BOQ for it. Two sheet rows that only
      // differ by case/whitespace ("Foo" vs "foo ") still land on the same new phase.
      let phaseId = newPhaseIdByKey.get(key);
      let boqId = phaseId ? newBoqIdByPhaseId.get(phaseId) : undefined;
      if (!phaseId) {
        phaseId = randomUUID();
        boqId = randomUUID();
        phaseInserts.push({ id: phaseId, projectId, name: phaseName, sortOrder: nextSortOrder++ });
        boqInserts.push({ id: boqId, projectId, phaseId, status: 'DRAFT' });
        newPhaseIdByKey.set(key, phaseId);
        newBoqIdByPhaseId.set(phaseId, boqId);
      }
      resolved.push({ phaseName, phaseItems, boqId, phaseCreated: true });
    }

    if (phaseInserts.length > 0) {
      await prisma.phase.createMany({ data: phaseInserts });
    }
    if (boqInserts.length > 0) {
      await prisma.bOQ.createMany({ data: boqInserts });
      await AuditLogger.log({
        projectId,
        actorId: auth.userId,
        role: auth.role,
        actionType: AuditActionTypes.BOQ_CREATE,
        entityType: 'Project',
        entityId: projectId,
        afterJson: { boqsCreated: boqInserts.length, phasesCreated: phaseInserts.length, source: 'excel-import' },
      });
    }

    // Pass 2 — each resolved phase writes to a different BOQ, so do the duplicate check +
    // bulk insert + audit log for all of them concurrently instead of one phase at a time.
    //
    // The duplicate check is a read-then-write: if the same import were somehow submitted
    // twice at once (a double click, or a client retry after a dropped connection — this
    // happens in practice, not just in theory), two requests could both read "no duplicate"
    // before either had inserted anything, and both would insert the same item. To close that
    // window, each phase's work runs inside a transaction that takes a row lock on its BOQ
    // first: a second writer targeting the same BOQ blocks on the lock until the first
    // transaction commits, then its own read sees the first transaction's inserts and
    // correctly treats them as duplicates.
    interface GroupResult {
      phaseName: string;
      itemsAdded?: number;
      duplicatesSkipped?: number;
      error?: string;
      phaseCreated: boolean;
      skipped?: number;
    }

    const groupResults: GroupResult[] = await Promise.all(
      resolved.map(async (g): Promise<GroupResult> => {
        if (g.error || !g.boqId) {
          return { phaseName: g.phaseName, error: g.error, phaseCreated: g.phaseCreated, skipped: g.phaseItems.length };
        }
        const boqId = g.boqId;

        return prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "BOQ" WHERE id = ${boqId} FOR UPDATE`;

            // Duplicate check: skip any item whose description already exists in this BOQ
            // (a re-import of the same sheet, or two rows in this sheet repeating a line item).
            const existingItems = await tx.bOQItem.findMany({
              where: { boqId },
              select: { description: true },
            });
            const seenDescriptions = new Set(existingItems.map((e) => e.description.toLowerCase().trim()));

            const toInsert: typeof g.phaseItems = [];
            let duplicatesSkipped = 0;
            for (const item of g.phaseItems) {
              const key = item.description.toLowerCase().trim();
              if (seenDescriptions.has(key)) {
                duplicatesSkipped++;
                continue;
              }
              seenDescriptions.add(key);
              toInsert.push(item);
            }

            // Insert all of this phase's items in one round trip instead of one-by-one.
            let added = 0;
            if (toInsert.length > 0) {
              const created = await tx.bOQItem.createMany({
                data: toInsert.map((item) => ({
                  boqId,
                  description: item.description,
                  unit: item.unit,
                  plannedQty: item.plannedQty,
                  rate: item.rate,
                  plannedValue: item.plannedQty * item.rate,
                })),
              });
              added = created.count;

              await tx.auditLog.create({
                data: {
                  projectId,
                  actorId: auth.userId,
                  role: auth.role,
                  actionType: AuditActionTypes.BOQ_ITEM_ADD,
                  entityType: 'BOQ',
                  entityId: boqId,
                  afterJson: JSON.stringify({ itemsAdded: added, duplicatesSkipped, source: 'excel-import' }),
                },
              });
            }

            return { phaseName: g.phaseName, itemsAdded: added, duplicatesSkipped, phaseCreated: g.phaseCreated };
          },
          { timeout: 15000, maxWait: 15000 }
        );
      })
    );

    for (const r of groupResults) {
      if (r.error) {
        results.push({ phaseName: r.phaseName, error: r.error, phaseCreated: r.phaseCreated });
        totalSkipped += r.skipped ?? 0;
      } else {
        results.push({
          phaseName: r.phaseName,
          itemsAdded: r.itemsAdded,
          duplicatesSkipped: r.duplicatesSkipped,
          phaseCreated: r.phaseCreated,
        });
        totalCreated += r.itemsAdded ?? 0;
        totalDuplicates += r.duplicatesSkipped ?? 0;
      }
    }

    await invalidateProjectAndMemberCaches(projectId);

    return NextResponse.json({
      success: true,
      data: { created: totalCreated, skipped: totalSkipped, duplicates: totalDuplicates, results },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Invalid data', details: error.errors },
        { status: 400 }
      );
    }
    if (error instanceof Error && error.message === 'UNAUTHORIZED') {
      return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    }
    if (error instanceof Error && error.message.startsWith('FORBIDDEN')) {
      return NextResponse.json({ success: false, error: error.message }, { status: 403 });
    }
    console.error('BOQ import error:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
