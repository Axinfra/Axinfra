import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { requireProjectAuth } from '@/lib/auth';
import { RoleGuard } from '@/services/RoleGuard';

// GET /api/projects/[projectId]/custom-schedule
// Returns custom schedule with phases, milestone links, and all project milestones for picker.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['CLIENT', 'PMC', 'VENDOR', 'CONSULTANT', 'VIEWER']);

    const [customSchedule, allMilestones] = await Promise.all([
      prisma.customSchedule.findUnique({
        where: { projectId },
        include: {
          createdBy: { select: { id: true, name: true } },
          phases: {
            orderBy: { sortOrder: 'asc' },
            include: {
              milestoneLinks: {
                include: {
                  milestone: {
                    select: {
                      id: true, title: true, state: true, value: true,
                      plannedStart: true, plannedEnd: true,
                      vendorUser: { select: { id: true, name: true, email: true } },
                      phase: { select: { id: true, name: true } },
                    },
                  },
                },
              },
            },
          },
        },
      }),
      prisma.milestone.findMany({
        where: { projectId },
        orderBy: [{ phaseId: 'asc' }, { sortOrder: 'asc' }],
        select: {
          id: true, title: true, state: true, value: true,
          plannedStart: true, plannedEnd: true,
          vendorUser: { select: { id: true, name: true, email: true } },
          phase: { select: { id: true, name: true } },
        },
      }),
    ]);

    const data = customSchedule
      ? {
          id:          customSchedule.id,
          isPreferred: customSchedule.isPreferred,
          createdBy:   customSchedule.createdBy,
          phases: customSchedule.phases.map((p) => ({
            id:          p.id,
            name:        p.name,
            plannedStart: p.plannedStart.toISOString(),
            plannedEnd:   p.plannedEnd.toISOString(),
            sortOrder:   p.sortOrder,
            milestones: p.milestoneLinks.map((l) => ({
              id:          l.milestone.id,
              title:       l.milestone.title,
              state:       l.milestone.state,
              value:       l.milestone.value,
              plannedStart: l.milestone.plannedStart?.toISOString() ?? null,
              plannedEnd:   l.milestone.plannedEnd?.toISOString()   ?? null,
              vendorUser:  l.milestone.vendorUser ?? null,
              phase:       l.milestone.phase ?? null,
            })),
          })),
        }
      : null;

    return NextResponse.json({
      success: true,
      data: {
        customSchedule: data,
        myRole: auth.role,
        allMilestones: allMilestones.map((m) => ({
          id:          m.id,
          title:       m.title,
          state:       m.state,
          value:       m.value,
          plannedStart: m.plannedStart?.toISOString() ?? null,
          plannedEnd:   m.plannedEnd?.toISOString()   ?? null,
          vendorUser:  m.vendorUser ?? null,
          phase:       m.phase ?? null,
        })),
      },
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ success: false, error: msg }, { status: 403 });
    console.error('[custom-schedule GET]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/projects/[projectId]/custom-schedule — initialise (PMC only)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const existing = await prisma.customSchedule.findUnique({ where: { projectId } });
    if (existing) {
      return NextResponse.json({ success: false, error: 'Custom schedule already exists' }, { status: 409 });
    }

    const cs = await prisma.customSchedule.create({
      data: { projectId, createdById: auth.userId, isPreferred: false },
    });

    return NextResponse.json({ success: true, data: cs }, { status: 201 });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ success: false, error: msg }, { status: 403 });
    console.error('[custom-schedule POST]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/projects/[projectId]/custom-schedule — toggle isPreferred (PMC only)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  try {
    const { projectId } = await params;
    const auth = await requireProjectAuth(projectId);
    RoleGuard.requireRole(auth, ['PMC']);

    const body = await req.json() as { isPreferred: boolean };
    if (typeof body.isPreferred !== 'boolean') {
      return NextResponse.json({ success: false, error: 'isPreferred must be a boolean' }, { status: 400 });
    }

    const cs = await prisma.customSchedule.update({
      where: { projectId },
      data: { isPreferred: body.isPreferred },
    });

    return NextResponse.json({ success: true, data: cs });
  } catch (error) {
    const msg = error instanceof Error ? error.message : '';
    if (msg === 'UNAUTHORIZED') return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
    if (msg.startsWith('FORBIDDEN')) return NextResponse.json({ success: false, error: msg }, { status: 403 });
    console.error('[custom-schedule PATCH]', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
