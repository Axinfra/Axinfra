import { prisma } from '@/lib/db';
import { getOverviewRollup } from '@/services/BOQService';

/** Loads everything sendVendorPOAssignmentEmail needs to describe a Purchase Order
 * assignment, and validates the phase is actually assignable (belongs to this project, no
 * vendor yet). Shared by /api/projects/[projectId]/roles and /api/admin/vendors — both are
 * "invite/assign a vendor" entry points (project-scoped Roles page vs. the cross-project
 * Vendor Onboarding page) and both support the same "Assign to Purchase Order" option. */
export async function loadAssignablePhase(projectId: string, phaseId: string) {
  const phase = await prisma.phase.findFirst({
    where: { id: phaseId, projectId, parentPhaseId: null, scheduleImportId: null },
    include: {
      workOrder: { select: { number: true, status: true } },
      boqs: { include: { items: { select: { plannedQty: true, unit: true, rate: true, plannedValue: true } } } },
    },
  });
  if (!phase) return { ok: false as const, error: 'Purchase order not found in this project' };
  if (phase.vendorUserId) return { ok: false as const, error: 'This Purchase Order already has a vendor assigned' };

  return {
    ok: true as const,
    phase,
    emailPayload: {
      phase: {
        name: phase.name,
        plannedStart: phase.plannedStart?.toISOString() ?? null,
        plannedEnd: phase.plannedEnd?.toISOString() ?? null,
        estimatedCost: phase.estimatedCost,
      },
      workOrder: phase.workOrder,
      boqs: phase.boqs.map((b) => ({
        boqNumber: b.boqNumber,
        name: b.name,
        plannedStart: b.plannedStart?.toISOString() ?? null,
        plannedEnd: b.plannedEnd?.toISOString() ?? null,
        value: getOverviewRollup(b.items).totalValue,
      })),
    },
  };
}
