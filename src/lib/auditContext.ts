import { prisma } from '@/lib/db';

interface AuditLogLike {
  id: string;
  entityType: string;
  entityId: string;
  beforeJson?: unknown;
  afterJson?: unknown;
}

/** Field names that hold a foreign-key-shaped ID inside a log's before/afterJson,
 *  mapped to the Set that collects them for batched lookup. Several routes embed
 *  e.g. `phaseId` or `milestoneId` in the JSON alongside plain values like `status` —
 *  those IDs need the same name resolution as `entityId` does, or the "Technical
 *  details" panel ends up showing a raw UUID with no way for a user to act on it. */
function buildIdFieldSets() {
  return {
    milestoneIds: new Set<string>(),
    evidenceIds: new Set<string>(),
    eligibilityIds: new Set<string>(),
    verificationIds: new Set<string>(),
    userIds: new Set<string>(),
    boqIds: new Set<string>(),
    boqItemIds: new Set<string>(),
    phaseIds: new Set<string>(),
    workOrderIds: new Set<string>(),
    raBillIds: new Set<string>(),
    projectIds: new Set<string>(),
    vendorRequestIds: new Set<string>(),
    drawingSetIds: new Set<string>(),
    drawingRowIds: new Set<string>(),
    drawingVersionIds: new Set<string>(),
    followUpIds: new Set<string>(),
  };
}

type IdSets = ReturnType<typeof buildIdFieldSets>;

/** Maps a JSON field key to the Set it should be collected into, and the label
 *  it should surface as once resolved (e.g. `phaseId` → "phase"). */
function idFieldRouting(sets: IdSets): Record<string, { set: Set<string>; humanKey: string }> {
  return {
    phaseId: { set: sets.phaseIds, humanKey: 'phase' },
    orderId: { set: sets.phaseIds, humanKey: 'order' }, // BOQ's FK to Phase, labeled "order" in the BOQ module
    milestoneId: { set: sets.milestoneIds, humanKey: 'milestone' },
    boqId: { set: sets.boqIds, humanKey: 'order' }, // a BOQ's only human identity is its order
    boqItemId: { set: sets.boqItemIds, humanKey: 'item' },
    userId: { set: sets.userIds, humanKey: 'user' },
    vendorUserId: { set: sets.userIds, humanKey: 'vendor' },
    evidenceId: { set: sets.evidenceIds, humanKey: 'milestone' },
    verificationId: { set: sets.verificationIds, humanKey: 'milestone' },
    eligibilityId: { set: sets.eligibilityIds, humanKey: 'milestone' },
    paymentEligibilityId: { set: sets.eligibilityIds, humanKey: 'milestone' },
    vendorRequestId: { set: sets.vendorRequestIds, humanKey: 'request' },
    requestId: { set: sets.vendorRequestIds, humanKey: 'request' },
    drawingSetId: { set: sets.drawingSetIds, humanKey: 'drawingSet' },
    setId: { set: sets.drawingSetIds, humanKey: 'drawingSet' },
    drawingRowId: { set: sets.drawingRowIds, humanKey: 'drawingRow' },
    rowId: { set: sets.drawingRowIds, humanKey: 'drawingRow' },
    drawingVersionId: { set: sets.drawingVersionIds, humanKey: 'drawing' },
    versionId: { set: sets.drawingVersionIds, humanKey: 'drawing' },
    followUpId: { set: sets.followUpIds, humanKey: 'followUp' },
    projectId: { set: sets.projectIds, humanKey: 'project' },
  };
}

/**
 * Resolves human-readable labels for audit log rows and their embedded ID fields:
 *  - `labels` maps each row's own id → a label for its entity (e.g. a milestone
 *    title instead of a raw milestone ID), used to build the one-line description.
 *  - `humanizeJson` rewrites a before/afterJson object so any embedded ID field
 *    (e.g. `{ phaseId: "…", status: "DRAFT" }`) becomes its resolved name
 *    (`{ phase: "Foundation", status: "DRAFT" }`); IDs that can't be resolved are
 *    dropped rather than shown as a bare UUID a user can't do anything with.
 *
 * Batches lookups per entity type so a page of N logs costs a small constant
 * number of queries, not N.
 */
export async function resolveAuditContextLabels(logs: AuditLogLike[]): Promise<{
  labels: Map<string, string>;
  humanizeJson: (json: unknown) => unknown;
}> {
  const sets = buildIdFieldSets();
  const routing = idFieldRouting(sets);
  const roleUserIdByLogId = new Map<string, string>();

  for (const log of logs) {
    switch (log.entityType) {
      case 'Milestone': sets.milestoneIds.add(log.entityId); break;
      case 'Evidence': sets.evidenceIds.add(log.entityId); break;
      case 'PaymentEligibility': sets.eligibilityIds.add(log.entityId); break;
      case 'Verification': sets.verificationIds.add(log.entityId); break;
      case 'User': sets.userIds.add(log.entityId); break;
      case 'ProjectRole': {
        const after = log.afterJson as Record<string, unknown> | undefined;
        const before = log.beforeJson as Record<string, unknown> | undefined;
        const uid = (after?.userId ?? before?.userId) as string | undefined;
        if (uid) {
          sets.userIds.add(uid);
          roleUserIdByLogId.set(log.id, uid);
        }
        break;
      }
      case 'BOQ': sets.boqIds.add(log.entityId); break;
      case 'BOQItem': sets.boqItemIds.add(log.entityId); break;
      case 'Phase': sets.phaseIds.add(log.entityId); break;
      // WorkOrderRevision logs its own entityId as the parent WorkOrder's id (see
      // WorkOrderService) — same resolution as WorkOrder itself.
      case 'WorkOrder':
      case 'WorkOrderRevision': sets.workOrderIds.add(log.entityId); break;
      case 'RABill': sets.raBillIds.add(log.entityId); break;
      case 'Project': sets.projectIds.add(log.entityId); break;
      case 'VendorRequest': sets.vendorRequestIds.add(log.entityId); break;
      case 'DrawingSet': sets.drawingSetIds.add(log.entityId); break;
      case 'DrawingRow': sets.drawingRowIds.add(log.entityId); break;
      case 'DrawingVersion': sets.drawingVersionIds.add(log.entityId); break;
      case 'FollowUp': sets.followUpIds.add(log.entityId); break;
    }

    // Also collect any ID fields embedded inside the before/after JSON itself —
    // e.g. BOQ_CREATE's afterJson.orderId — so they get resolved the same way.
    for (const json of [log.beforeJson, log.afterJson]) {
      if (!json || typeof json !== 'object' || Array.isArray(json)) continue;
      for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
        if (typeof value === 'string' && routing[key]) routing[key].set.add(value);
      }
    }
  }

  const arr = <T,>(s: Set<T>) => Array.from(s);

  const [
    milestones, evidenceRows, eligibilities, verifications, users,
    boqs, boqItems, phases, workOrders, raBills, projects, vendorRequests,
    drawingSets, drawingRows, drawingVersions, followUps,
  ] = await Promise.all([
    sets.milestoneIds.size ? prisma.milestone.findMany({ where: { id: { in: arr(sets.milestoneIds) } }, select: { id: true, title: true } }) : Promise.resolve([]),
    sets.evidenceIds.size ? prisma.evidence.findMany({ where: { id: { in: arr(sets.evidenceIds) } }, select: { id: true, milestone: { select: { title: true } } } }) : Promise.resolve([]),
    sets.eligibilityIds.size ? prisma.paymentEligibility.findMany({ where: { id: { in: arr(sets.eligibilityIds) } }, select: { id: true, milestone: { select: { title: true } } } }) : Promise.resolve([]),
    sets.verificationIds.size ? prisma.verification.findMany({ where: { id: { in: arr(sets.verificationIds) } }, select: { id: true, milestone: { select: { title: true } } } }) : Promise.resolve([]),
    sets.userIds.size ? prisma.user.findMany({ where: { id: { in: arr(sets.userIds) } }, select: { id: true, name: true } }) : Promise.resolve([]),
    sets.boqIds.size ? prisma.bOQ.findMany({ where: { id: { in: arr(sets.boqIds) } }, select: { id: true, order: { select: { name: true } } } }) : Promise.resolve([]),
    sets.boqItemIds.size ? prisma.bOQItem.findMany({ where: { id: { in: arr(sets.boqItemIds) } }, select: { id: true, description: true } }) : Promise.resolve([]),
    sets.phaseIds.size ? prisma.phase.findMany({ where: { id: { in: arr(sets.phaseIds) } }, select: { id: true, name: true } }) : Promise.resolve([]),
    sets.workOrderIds.size ? prisma.workOrder.findMany({ where: { id: { in: arr(sets.workOrderIds) } }, select: { id: true, order: { select: { name: true } } } }) : Promise.resolve([]),
    sets.raBillIds.size ? prisma.rABill.findMany({ where: { id: { in: arr(sets.raBillIds) } }, select: { id: true, billNumber: true } }) : Promise.resolve([]),
    sets.projectIds.size ? prisma.project.findMany({ where: { id: { in: arr(sets.projectIds) } }, select: { id: true, name: true } }) : Promise.resolve([]),
    sets.vendorRequestIds.size ? prisma.vendorRequest.findMany({ where: { id: { in: arr(sets.vendorRequestIds) } }, select: { id: true, title: true } }) : Promise.resolve([]),
    sets.drawingSetIds.size ? prisma.drawingSet.findMany({ where: { id: { in: arr(sets.drawingSetIds) } }, select: { id: true, name: true } }) : Promise.resolve([]),
    sets.drawingRowIds.size ? prisma.drawingRow.findMany({ where: { id: { in: arr(sets.drawingRowIds) } }, select: { id: true, name: true } }) : Promise.resolve([]),
    sets.drawingVersionIds.size ? prisma.drawingVersion.findMany({ where: { id: { in: arr(sets.drawingVersionIds) } }, select: { id: true, drawingRow: { select: { name: true } } } }) : Promise.resolve([]),
    sets.followUpIds.size ? prisma.followUp.findMany({ where: { id: { in: arr(sets.followUpIds) } }, select: { id: true, description: true } }) : Promise.resolve([]),
  ]);

  const milestoneTitle = new Map(milestones.map((m) => [m.id, m.title]));
  const evidenceTitle = new Map(evidenceRows.map((e) => [e.id, e.milestone?.title ?? '']));
  const eligibilityTitle = new Map(eligibilities.map((p) => [p.id, p.milestone?.title ?? '']));
  const verificationTitle = new Map(verifications.map((v) => [v.id, v.milestone?.title ?? '']));
  const userName = new Map(users.map((u) => [u.id, u.name]));
  const boqOrder = new Map(boqs.map((b) => [b.id, b.order?.name ?? '']));
  const boqItemDesc = new Map(boqItems.map((i) => [i.id, i.description]));
  const phaseName = new Map(phases.map((p) => [p.id, p.name]));
  const workOrderOrderName = new Map(workOrders.map((w) => [w.id, w.order?.name ?? '']));
  const raBillLabel = new Map(raBills.map((b) => [b.id, `RA-${b.billNumber}`]));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));
  const vendorRequestTitle = new Map(vendorRequests.map((v) => [v.id, v.title]));
  const drawingSetName = new Map(drawingSets.map((d) => [d.id, d.name]));
  const drawingRowName = new Map(drawingRows.map((d) => [d.id, d.name]));
  const drawingVersionLabel = new Map(drawingVersions.map((d) => [d.id, d.drawingRow?.name ?? '']));
  const followUpDesc = new Map(followUps.map((f) => [f.id, f.description]));

  const labels = new Map<string, string>();
  for (const log of logs) {
    let label: string | undefined;
    switch (log.entityType) {
      case 'Milestone': label = milestoneTitle.get(log.entityId); break;
      case 'Evidence': label = evidenceTitle.get(log.entityId); break;
      case 'PaymentEligibility': label = eligibilityTitle.get(log.entityId); break;
      case 'Verification': label = verificationTitle.get(log.entityId); break;
      case 'User': label = userName.get(log.entityId); break;
      case 'ProjectRole': {
        const uid = roleUserIdByLogId.get(log.id);
        label = uid ? userName.get(uid) : undefined;
        break;
      }
      case 'BOQ': label = boqOrder.get(log.entityId); break;
      case 'BOQItem': label = boqItemDesc.get(log.entityId); break;
      case 'Phase': label = phaseName.get(log.entityId); break;
      case 'WorkOrder':
      case 'WorkOrderRevision': label = workOrderOrderName.get(log.entityId); break;
      case 'RABill': label = raBillLabel.get(log.entityId); break;
      case 'Project': label = projectName.get(log.entityId); break;
      case 'VendorRequest': label = vendorRequestTitle.get(log.entityId); break;
      case 'DrawingSet': label = drawingSetName.get(log.entityId); break;
      case 'DrawingRow': label = drawingRowName.get(log.entityId); break;
      case 'DrawingVersion': label = drawingVersionLabel.get(log.entityId); break;
      case 'FollowUp': label = followUpDesc.get(log.entityId); break;
    }
    if (label) labels.set(log.id, label);
  }

  const idFieldLabelMaps: Record<string, Map<string, string>> = {
    phaseId: phaseName,
    orderId: phaseName,
    milestoneId: milestoneTitle,
    boqId: boqOrder,
    boqItemId: boqItemDesc,
    userId: userName,
    vendorUserId: userName,
    evidenceId: evidenceTitle,
    verificationId: verificationTitle,
    eligibilityId: eligibilityTitle,
    paymentEligibilityId: eligibilityTitle,
    vendorRequestId: vendorRequestTitle,
    requestId: vendorRequestTitle,
    drawingSetId: drawingSetName,
    setId: drawingSetName,
    drawingRowId: drawingRowName,
    rowId: drawingRowName,
    drawingVersionId: drawingVersionLabel,
    versionId: drawingVersionLabel,
    followUpId: followUpDesc,
    projectId: projectName,
  };

  function humanizeJson(json: unknown): unknown {
    if (!json || typeof json !== 'object' || Array.isArray(json)) return json;
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(json as Record<string, unknown>)) {
      const labelMap = idFieldLabelMaps[key];
      if (labelMap && typeof value === 'string') {
        const label = value ? labelMap.get(value) : undefined;
        if (label) out[routing[key].humanKey] = label;
        // Unresolved ID (e.g. the referenced record was itself deleted) — drop it
        // rather than show a raw UUID the user has no way to act on.
        continue;
      }
      out[key] = value;
    }
    return out;
  }

  return { labels, humanizeJson };
}
