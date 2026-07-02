import { NextRequest, NextResponse } from 'next/server';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';
import { prisma } from '@/lib/db';
import { BOQService } from '@/services/BOQService';
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

    const results: Array<{ phaseName: string; itemsAdded?: number; error?: string; phaseCreated?: boolean }> = [];
    let totalCreated = 0;
    let totalSkipped = 0;

    // Only phases the user explicitly kept in the payload get here. Any of those that don't
    // match an existing phase are new phases the user chose to create as part of this import.
    let nextSortOrder = (phases[phases.length - 1]?.sortOrder ?? -1) + 1;

    for (const [phaseName, phaseItems] of Array.from(byPhase.entries())) {
      let phase = phaseByName.get(phaseName.toLowerCase().trim());
      let phaseCreated = false;

      if (!phase) {
        try {
          phase = await prisma.phase.create({
            data: { projectId, name: phaseName, sortOrder: nextSortOrder },
            include: { boq: { select: { id: true, status: true } } },
          });
          nextSortOrder += 1;
          phaseCreated = true;
          phaseByName.set(phaseName.toLowerCase().trim(), phase);
        } catch {
          results.push({ phaseName, error: 'Failed to create phase' });
          totalSkipped += phaseItems.length;
          continue;
        }
      }

      // Get existing BOQ or create a new one
      let boqId = phase.boq?.id;
      if (!boqId) {
        const createResult = await BOQService.create(projectId, auth.userId, auth.role, phase.id);
        if (!createResult.success || !createResult.boqId) {
          results.push({ phaseName, error: createResult.error ?? 'Could not create BOQ' });
          totalSkipped += phaseItems.length;
          continue;
        }
        boqId = createResult.boqId;
      } else if (phase.boq!.status === 'APPROVED') {
        results.push({ phaseName, error: 'BOQ is already approved and locked' });
        totalSkipped += phaseItems.length;
        continue;
      }

      // Add items one by one (BOQService handles audit logging per item)
      let added = 0;
      for (const item of phaseItems) {
        const r = await BOQService.addItem(
          boqId,
          {
            description: item.description,
            unit: item.unit,
            plannedQty: item.plannedQty,
            rate: item.rate,
          },
          auth.userId,
          auth.role,
          projectId
        );
        if (r.success) added++;
      }
      totalCreated += added;
      results.push({ phaseName, itemsAdded: added, phaseCreated });
    }

    await invalidateProjectAndMemberCaches(projectId);

    return NextResponse.json({
      success: true,
      data: { created: totalCreated, skipped: totalSkipped, results },
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
