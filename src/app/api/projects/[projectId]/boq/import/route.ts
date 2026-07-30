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
  orderName: z.string().min(1),
  description: z.string().min(1),
  unit: z.string().min(1),
  plannedQty: z.number().positive(),
  rate: z.number().positive(),
});

const importBodySchema = z.object({
  items: z.array(importItemSchema).min(1).max(500),
});

// POST /api/projects/[projectId]/boq/import
// Each row in the sheet is one BOQ (a BOQ is a single scope/measurement line — same model as
// adding one manually). Rows sharing an Order name are grouped only to resolve/create that
// Purchase Order once; each row still gets its own BOQ + item underneath it.
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

    // Load all project orders (with existing BOQ state) — Execution/WBS phases aren't Orders;
    // scheduleImportId excludes a promoted top-level WBS phase too (see mspdiParser's
    // echo-phase detection), which would otherwise satisfy parentPhaseId: null.
    const orders = await prisma.phase.findMany({
      where: { projectId, parentPhaseId: null, scheduleImportId: null },
      include: { boqs: { select: { id: true }, orderBy: { createdAt: 'asc' } } },
      orderBy: { sortOrder: 'asc' },
    });
    const orderByName = new Map(orders.map((o) => [o.name.toLowerCase().trim(), o]));

    // Group rows by order name (preserve insertion order)
    const byOrder = new Map<string, typeof items>();
    for (const item of items) {
      const list = byOrder.get(item.orderName) ?? [];
      list.push(item);
      byOrder.set(item.orderName, list);
    }

    // Pass 1 — resolve every order group to a real order, creating brand-new ones in bulk.
    let nextSortOrder = (orders[orders.length - 1]?.sortOrder ?? -1) + 1;
    const newOrderIdByKey = new Map<string, string>();
    const orderInserts: Array<{ id: string; projectId: string; name: string; sortOrder: number }> = [];

    const resolved: Array<{ orderName: string; orderId: string; orderItems: typeof items; orderCreated: boolean; existingBoqCount: number }> = [];

    for (const [orderName, orderItems] of Array.from(byOrder.entries())) {
      const key = orderName.toLowerCase().trim();
      const existing = orderByName.get(key);

      if (existing) {
        resolved.push({ orderName, orderId: existing.id, orderItems, orderCreated: false, existingBoqCount: existing.boqs.length });
        continue;
      }

      // Brand-new order — two sheet rows that only differ by case/whitespace ("Foo" vs "foo ")
      // still land on the same new order.
      let orderId = newOrderIdByKey.get(key);
      if (!orderId) {
        orderId = randomUUID();
        orderInserts.push({ id: orderId, projectId, name: orderName, sortOrder: nextSortOrder++ });
        newOrderIdByKey.set(key, orderId);
        resolved.push({ orderName, orderId, orderItems, orderCreated: true, existingBoqCount: 0 });
      } else {
        const entry = resolved.find((r) => r.orderId === orderId);
        if (entry) entry.orderItems.push(...orderItems);
      }
    }

    if (orderInserts.length > 0) {
      await prisma.phase.createMany({ data: orderInserts });
    }

    // Pass 2 — one BOQ + item per row, grouped per order in a transaction so the duplicate
    // check (by description, against every BOQ already under that order) and the boqNumber
    // sequence stay consistent even if the same sheet is re-submitted concurrently.
    interface GroupResult {
      orderName: string;
      itemsAdded?: number;
      duplicatesSkipped?: number;
      error?: string;
      orderCreated: boolean;
      skipped?: number;
    }

    const groupResults: GroupResult[] = await Promise.all(
      resolved.map(async (g): Promise<GroupResult> => {
        return prisma.$transaction(
          async (tx) => {
            await tx.$queryRaw`SELECT id FROM "Phase" WHERE id = ${g.orderId} FOR UPDATE`;

            const existingItems = await tx.bOQItem.findMany({
              where: { boq: { orderId: g.orderId } },
              select: { description: true },
            });
            const seenDescriptions = new Set(existingItems.map((e) => e.description.toLowerCase().trim()));

            let added = 0;
            let duplicatesSkipped = 0;
            let nextBoqSeq = g.existingBoqCount;

            for (const item of g.orderItems) {
              const key = item.description.toLowerCase().trim();
              if (seenDescriptions.has(key)) {
                duplicatesSkipped++;
                continue;
              }
              seenDescriptions.add(key);
              nextBoqSeq++;

              const boq = await tx.bOQ.create({
                data: {
                  projectId,
                  orderId: g.orderId,
                  status: 'DRAFT',
                  boqNumber: `ORD-${String(nextBoqSeq).padStart(3, '0')}`,
                  name: item.description,
                },
              });
              await tx.bOQItem.create({
                data: {
                  boqId: boq.id,
                  description: item.description,
                  unit: item.unit,
                  plannedQty: item.plannedQty,
                  rate: item.rate,
                  plannedValue: item.plannedQty * item.rate,
                },
              });
              added++;
            }

            if (added > 0) {
              await tx.auditLog.create({
                data: {
                  projectId,
                  actorId: auth.userId,
                  role: auth.role,
                  actionType: AuditActionTypes.BOQ_CREATE,
                  entityType: 'Phase',
                  entityId: g.orderId,
                  afterJson: JSON.stringify({ boqsCreated: added, duplicatesSkipped, source: 'excel-import' }),
                },
              });
            }

            return { orderName: g.orderName, itemsAdded: added, duplicatesSkipped, orderCreated: g.orderCreated };
          },
          { timeout: 15000, maxWait: 15000 }
        );
      })
    );

    let totalCreated = 0;
    let totalDuplicates = 0;
    for (const r of groupResults) {
      totalCreated += r.itemsAdded ?? 0;
      totalDuplicates += r.duplicatesSkipped ?? 0;
    }

    await invalidateProjectAndMemberCaches(projectId);

    return NextResponse.json({
      success: true,
      data: { created: totalCreated, skipped: 0, duplicates: totalDuplicates, results: groupResults },
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
