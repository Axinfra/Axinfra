/**
 * Milestone Dependency Management
 *
 * GET    /api/projects/[pid]/milestones/[mid]/dependencies
 *        → { predecessors, successors, allMilestones }
 *
 * POST   /api/projects/[pid]/milestones/[mid]/dependencies
 *        body: { predecessorId, dependencyType, lagDays }
 *        → creates a Predecessor→ThisMilestone dependency
 *
 * DELETE /api/projects/[pid]/milestones/[mid]/dependencies?depId=xxx
 *        → deletes that dependency record
 *
 * Access: GET = any project member. POST/DELETE = OWNER or PMC only.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { z } from 'zod';
import { invalidatePrefix } from '@/lib/cache';

const DEPENDENCY_TYPES = ['FS', 'SS', 'FF', 'SF'] as const;

const createSchema = z.object({
  predecessorId: z.string().uuid('Invalid milestone ID'),
  dependencyType: z.enum(DEPENDENCY_TYPES).default('FS'),
  lagDays: z.number().int().default(0),
});

type Params = { params: { projectId: string; milestoneId: string } };

/* ── GET ─────────────────────────────────────────────────────────────── */
export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const { projectId, milestoneId } = params;
    await requireProjectAuth(projectId);

    const [predDeps, succDeps, allMilestones] = await Promise.all([
      // Predecessors of this milestone
      prisma.milestoneDependency.findMany({
        where: { successorId: milestoneId, predecessorId: { not: milestoneId } },
        select: {
          id: true, dependencyType: true, lagDays: true,
          predecessorId: true,
          predecessor: { select: { id: true, title: true, state: true, plannedEnd: true } },
        },
      }),
      // Successors of this milestone
      prisma.milestoneDependency.findMany({
        where: { predecessorId: milestoneId, successorId: { not: milestoneId } },
        select: {
          id: true, dependencyType: true, lagDays: true,
          successorId: true,
          successor: { select: { id: true, title: true, state: true, plannedStart: true } },
        },
      }),
      prisma.milestone.findMany({
        where: { projectId, id: { not: milestoneId } },
        select: { id: true, title: true, state: true, sortOrder: true, phase: { select: { name: true } } },
        orderBy: [{ sortOrder: 'asc' }],
      }),
    ]);

    const predecessors = predDeps.map(d => ({
      depId: d.id,
      milestoneId: d.predecessorId,
      title: d.predecessor.title,
      state: d.predecessor.state,
      plannedEnd: d.predecessor.plannedEnd,
      dependencyType: d.dependencyType,
      lagDays: d.lagDays,
    }));

    const successors = succDeps.map(d => ({
      depId: d.id,
      milestoneId: d.successorId,
      title: d.successor.title,
      state: d.successor.state,
      plannedStart: d.successor.plannedStart,
      dependencyType: d.dependencyType,
      lagDays: d.lagDays,
    }));

    const milestones = allMilestones.map(m => ({
      id: m.id,
      title: m.title,
      state: m.state,
      phaseName: m.phase?.name ?? null,
    }));

    return NextResponse.json({ success: true, data: { predecessors, successors, milestones } });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[dependencies GET]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/* ── POST ────────────────────────────────────────────────────────────── */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    const { projectId, milestoneId } = params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'CLIENT' && auth.role !== 'PMC') {
      return NextResponse.json({ error: 'Only Owner or PMC can manage dependencies' }, { status: 403 });
    }

    const body = await req.json();
    const parsed = createSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.errors[0].message }, { status: 400 });
    }

    const { predecessorId, dependencyType, lagDays } = parsed.data;

    if (predecessorId === milestoneId) {
      return NextResponse.json({ error: 'A milestone cannot depend on itself' }, { status: 400 });
    }

    // Make sure both milestones belong to the same project
    const [predecessor, successor] = await Promise.all([
      prisma.milestone.findFirst({ where: { id: predecessorId, projectId }, select: { id: true, title: true } }),
      prisma.milestone.findFirst({ where: { id: milestoneId, projectId }, select: { id: true, title: true } }),
    ]);
    if (!predecessor || !successor) {
      return NextResponse.json({ error: 'Milestone not found in this project' }, { status: 404 });
    }

    // Check for duplicate
    const existing = await prisma.milestoneDependency.findFirst({
      where: { predecessorId, successorId: milestoneId },
    });
    if (existing) {
      return NextResponse.json({ error: 'This dependency already exists' }, { status: 409 });
    }

    // Cycle detection: would adding predecessorId → milestoneId create a loop?
    const allEdges = await prisma.milestoneDependency.findMany({
      where: { predecessor: { projectId } },
      select: { predecessorId: true, successorId: true },
    });
    const fwd = new Map<string, string[]>();
    for (const e of allEdges) {
      if (!fwd.has(e.predecessorId)) fwd.set(e.predecessorId, []);
      fwd.get(e.predecessorId)!.push(e.successorId);
    }
    const hasCycle = (function canReach(from: string, target: string, visited: Set<string>): boolean {
      if (from === target) return true;
      if (visited.has(from)) return false;
      visited.add(from);
      for (const next of fwd.get(from) ?? []) {
        if (canReach(next, target, visited)) return true;
      }
      return false;
    })(milestoneId, predecessorId, new Set());
    if (hasCycle) {
      return NextResponse.json(
        { error: `Circular dependency: "${predecessor.title}" is already downstream of "${successor.title}". Adding this link would create a loop.` },
        { status: 409 },
      );
    }

    const dep = await prisma.milestoneDependency.create({
      data: { predecessorId, successorId: milestoneId, dependencyType, lagDays },
    });

    // Invalidate gantt + analytics caches so the graph updates immediately
    await Promise.all([
      invalidatePrefix(`gantt:${projectId}`),
      invalidatePrefix(`analytics:${projectId}`),
    ]);

    return NextResponse.json({ success: true, data: { depId: dep.id } }, { status: 201 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[dependencies POST]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}

/* ── DELETE ──────────────────────────────────────────────────────────── */
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    const { projectId, milestoneId } = params;
    const auth = await requireProjectAuth(projectId);

    if (auth.role !== 'CLIENT' && auth.role !== 'PMC') {
      return NextResponse.json({ error: 'Only Owner or PMC can manage dependencies' }, { status: 403 });
    }

    const depId = req.nextUrl.searchParams.get('depId');
    if (!depId) return NextResponse.json({ error: 'depId query param required' }, { status: 400 });

    // Verify the dependency involves this milestone
    const dep = await prisma.milestoneDependency.findFirst({
      where: {
        id: depId,
        OR: [{ predecessorId: milestoneId }, { successorId: milestoneId }],
      },
    });
    if (!dep) return NextResponse.json({ error: 'Dependency not found' }, { status: 404 });

    await prisma.milestoneDependency.delete({ where: { id: depId } });

    await Promise.all([
      invalidatePrefix(`gantt:${projectId}`),
      invalidatePrefix(`analytics:${projectId}`),
    ]);

    return NextResponse.json({ success: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    console.error('[dependencies DELETE]', err);
    return NextResponse.json({ error: 'Internal error' }, { status: 500 });
  }
}
