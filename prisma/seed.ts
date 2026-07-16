import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── String-based enums (matches src/types/index.ts) ────────────────────────
// App uses 'CLIENT' as the project-owner role throughout (types/index.ts, all API routes)
const Role = { OWNER: 'CLIENT', PMC: 'PMC', VENDOR: 'VENDOR', VIEWER: 'VIEWER', CONSULTANT: 'CONSULTANT' } as const;
const BOQStatus = { DRAFT: 'DRAFT', APPROVED: 'APPROVED', REVISED: 'REVISED' } as const;
const MilestoneState = {
  DRAFT: 'DRAFT', IN_PROGRESS: 'IN_PROGRESS', SUBMITTED: 'SUBMITTED',
  VERIFIED: 'VERIFIED', CLOSED: 'CLOSED',
} as const;
const PaymentModel = {
  ADVANCE: 'ADVANCE', PROGRESS_BASED: 'PROGRESS_BASED',
  MILESTONE_COMPLETE: 'MILESTONE_COMPLETE', RETENTION: 'RETENTION',
} as const;
const EvidenceStatus = { SUBMITTED: 'SUBMITTED', APPROVED: 'APPROVED', REJECTED: 'REJECTED' } as const;
const EligibilityState = {
  NOT_DUE: 'NOT_DUE', DUE_PENDING_VERIFICATION: 'DUE_PENDING_VERIFICATION',
  FULLY_ELIGIBLE: 'FULLY_ELIGIBLE', BLOCKED: 'BLOCKED', MARKED_PAID: 'MARKED_PAID',
} as const;

// ─── Date helpers ────────────────────────────────────────────────────────────
const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
const daysFromNow = (d: number) => new Date(now.getTime() + d * 86_400_000);

// ─── Main seed ───────────────────────────────────────────────────────────────
async function main() {
  // Two independent guards, because NODE_ENV alone isn't enough: if DATABASE_URL in .env
  // ever points at a real/production database while running this locally (NODE_ENV would
  // still say "development"), NODE_ENV===production would never catch it. This script wipes
  // EVERY table — it must never run without a deliberate, explicit opt-in.
  if (process.env.NODE_ENV === 'production') {
    console.error('SEED ABORTED: NODE_ENV is production.');
    process.exit(1);
  }
  if (process.env.SEED_I_UNDERSTAND_THIS_DELETES_ALL_DATA !== 'yes') {
    console.error('SEED ABORTED: this script deletes every row in every table before reseeding demo data.');
    console.error('If you are certain DATABASE_URL points at a throwaway/demo database, re-run with:');
    console.error('  SEED_I_UNDERSTAND_THIS_DELETES_ALL_DATA=yes npm run db:seed');
    process.exit(1);
  }

  console.log('🌱 Seeding Axinfra database with ONE comprehensive demo project…\n');

  // ── 1. Wipe all data (respects FK order) ─────────────────────────────────
  console.log('  Clearing existing data…');
  await prisma.milestoneResourceAssignment.deleteMany();
  await prisma.resource.deleteMany();
  await prisma.rABillLineItem.deleteMany();
  await prisma.rABill.deleteMany();
  await prisma.workOrderRevision.deleteMany();
  await prisma.workOrder.deleteMany();
  await prisma.vendorRequestFile.deleteMany();
  await prisma.vendorRequest.deleteMany();
  await prisma.drawingVersion.deleteMany();
  await prisma.drawingRow.deleteMany();
  await prisma.setRequest.deleteMany();
  await prisma.drawingSet.deleteMany();
  await prisma.privateCostEntry.deleteMany();
  await prisma.cashAdjustment.deleteMany();
  await prisma.systemEvent.deleteMany();
  await prisma.projectMetrics.deleteMany();
  await prisma.vendorMetrics.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.followUp.deleteMany();
  await prisma.eligibilityEvent.deleteMany();
  await prisma.paymentEligibility.deleteMany();
  await prisma.verification.deleteMany();
  await prisma.evidenceFile.deleteMany();
  await prisma.evidence.deleteMany();
  await prisma.milestoneStateTransition.deleteMany();
  await prisma.milestoneBOQLink.deleteMany();
  await prisma.milestoneDependency.deleteMany();
  await prisma.milestone.deleteMany();
  await prisma.bOQRevision.deleteMany();
  await prisma.bOQItem.deleteMany();
  await prisma.bOQ.deleteMany();
  await prisma.scheduleImport.deleteMany();
  await prisma.phase.deleteMany();
  await prisma.customView.deleteMany();
  await prisma.projectScheduleConfig.deleteMany();
  await prisma.projectRole.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();
  console.log('  Done.\n');

  // ── 2. Users ─────────────────────────────────────────────────────────────
  const hash = await bcrypt.hash('password123', 10);
  const adminHash = await bcrypt.hash('admin123', 10);

  const admin = await prisma.user.create({
    data: { name: 'Admin', email: 'admin@axinfra.local', hashedPassword: adminHash },
  });
  const owner = await prisma.user.create({
    data: { name: 'Alex Client', email: 'client@example.com', hashedPassword: hash, preferredRole: 'CLIENT' },
  });
  const pmc = await prisma.user.create({
    data: { name: 'Pat PMC', email: 'pmc@example.com', hashedPassword: hash, preferredRole: 'PMC' },
  });
  const vendor1 = await prisma.user.create({
    data: { name: 'Victor Vendor', email: 'vendor@example.com', hashedPassword: hash, preferredRole: 'VENDOR' },
  });
  const vendor2 = await prisma.user.create({
    data: { name: 'Sara Subcon', email: 'vendor2@example.com', hashedPassword: hash, preferredRole: 'VENDOR' },
  });
  const consultant = await prisma.user.create({
    data: { name: 'Arthur Consultant', email: 'consultant@example.com', hashedPassword: hash, preferredRole: 'CONSULTANT' },
  });
  console.log('  Created 6 users (1 admin + 5 demo)');

  async function seedArchitectureForProject(projectId: string, label: string) {
    const draftSet = await prisma.drawingSet.create({
      data: {
        projectId,
        name: `${label} - Working Drawing Set A`,
        description: 'Core architectural package for review',
        cost: 90000,
        currency: 'INR',
        status: 'DRAFT',
        createdById: consultant.id,
      },
    });

    const requestedSet = await prisma.drawingSet.create({
      data: {
        projectId,
        name: `${label} - Working Drawing Set B`,
        description: 'PMC-requested revision package',
        cost: 125000,
        currency: 'INR',
        status: 'REQUESTED',
        createdById: consultant.id,
        requestedById: pmc.id,
        requestedAt: daysAgo(4),
        dueDate: daysFromNow(8),
      },
    });

    const approvedSet = await prisma.drawingSet.create({
      data: {
        projectId,
        name: `${label} - Working Drawing Set C`,
        description: 'Approved package ready for owner payment',
        cost: 150000,
        currency: 'INR',
        status: 'APPROVED',
        createdById: consultant.id,
        requestedById: pmc.id,
        requestedAt: daysAgo(20),
        deliveredAt: daysAgo(14),
        approvedAt: daysAgo(10),
      },
    });

    const rowA = await prisma.drawingRow.create({
      data: {
        projectId,
        setId: requestedSet.id,
        serialNo: 1,
        category: 'Plans',
        name: 'Ground Floor Layout',
        floor: 'GROUND_FLOOR',
        description: 'Updated layout with circulation revision',
        status: 'SUBMITTED',
        dueDate: daysFromNow(8),
        createdById: consultant.id,
      },
    });
    await prisma.drawingVersion.create({
      data: {
        drawingRowId: rowA.id,
        versionNumber: 1,
        uploadType: 'URL',
        fileUrl: 'https://example.com/drawings/ground-floor-layout-v1.pdf',
        fileName: 'ground-floor-layout-v1.pdf',
        uploadedById: consultant.id,
        reviewStatus: 'PENDING',
        isCurrent: true,
      },
    });

    const rowB = await prisma.drawingRow.create({
      data: {
        projectId,
        setId: approvedSet.id,
        serialNo: 2,
        category: 'Sections',
        name: 'Section A-A',
        floor: 'ALL_FLOORS',
        description: 'Final coordinated section',
        status: 'APPROVED',
        createdById: consultant.id,
      },
    });
    await prisma.drawingVersion.create({
      data: {
        drawingRowId: rowB.id,
        versionNumber: 2,
        uploadType: 'URL',
        fileUrl: 'https://example.com/drawings/section-aa-v2.pdf',
        fileName: 'section-aa-v2.pdf',
        uploadedById: consultant.id,
        reviewStatus: 'APPROVED',
        reviewedById: pmc.id,
        reviewedAt: daysAgo(11),
        isCurrent: true,
      },
    });

    const rowC = await prisma.drawingRow.create({
      data: {
        projectId,
        setId: draftSet.id,
        serialNo: 3,
        category: 'Elevations',
        name: 'South Elevation',
        floor: 'ALL_FLOORS',
        description: 'Facade control line draft',
        status: 'PENDING',
        createdById: consultant.id,
      },
    });
    await prisma.drawingVersion.create({
      data: {
        drawingRowId: rowC.id,
        versionNumber: 0,
        uploadType: 'URL',
        fileUrl: 'https://example.com/drawings/south-elevation-v0.pdf',
        fileName: 'south-elevation-v0.pdf',
        uploadedById: consultant.id,
        reviewStatus: 'REJECTED',
        reviewedById: pmc.id,
        reviewedAt: daysAgo(7),
        rejectionReason: 'Please align facade grid with structural column lines',
        isCurrent: true,
      },
    });

    await prisma.setRequest.create({
      data: {
        setId: requestedSet.id,
        projectId,
        requestedById: pmc.id,
        requestedAt: daysAgo(4),
        dueDate: daysFromNow(8),
        note: 'Need updated layout + services coordination',
        status: 'ACCEPTED',
      },
    });

    await prisma.auditLog.createMany({
      data: [
        {
          projectId,
          actorId: consultant.id,
          role: Role.CONSULTANT,
          actionType: 'PROJECT_UPDATE',
          entityType: 'DrawingSet',
          entityId: draftSet.id,
          afterJson: JSON.stringify({ name: draftSet.name, status: draftSet.status, cost: draftSet.cost }),
          createdAt: daysAgo(25),
        },
        {
          projectId,
          actorId: pmc.id,
          role: Role.PMC,
          actionType: 'PROJECT_UPDATE',
          entityType: 'SetRequest',
          entityId: requestedSet.id,
          afterJson: JSON.stringify({ setId: requestedSet.id, dueDate: daysFromNow(8).toISOString(), status: 'REQUESTED' }),
          reason: 'Request drawings for review',
          createdAt: daysAgo(4),
        },
        {
          projectId,
          actorId: owner.id,
          role: Role.OWNER,
          actionType: 'PROJECT_UPDATE',
          entityType: 'DrawingSet',
          entityId: approvedSet.id,
          afterJson: JSON.stringify({ status: approvedSet.status, approvedAt: approvedSet.approvedAt?.toISOString() ?? null }),
          createdAt: daysAgo(10),
        },
      ],
    });
  }

  // ══════════════════════════════════════════════════════════════════════════════
  // THE ONE PROJECT — Gateway Commercial Tower (full demo: every module, every status)
  // 30-story mixed-use tower, 18-month build, currently in superstructure phase.
  // ══════════════════════════════════════════════════════════════════════════════
  console.log('  Seeding project: Gateway Commercial Tower…');

  const project = await prisma.project.create({
    data: {
      name: 'Gateway Commercial Tower',
      description: '30-storey mixed-use commercial tower. Concrete frame, curtain wall facade, full MEP fit-out. Contract value AED 94,000,000.',
      isExampleProject: true,
      metadata: JSON.stringify({
        location: 'Business Bay, Dubai, UAE',
        contractValue: 94_000_000,
        currency: 'AED',
        startDate: new Date(now.getTime() - 420 * 86_400_000).toISOString(),
        endDate: new Date(now.getTime() + 355 * 86_400_000).toISOString(),
      }),
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: project.id, userId: admin.id,      role: Role.OWNER },
      { projectId: project.id, userId: owner.id,       role: Role.OWNER },
      { projectId: project.id, userId: pmc.id,         role: Role.PMC },
      { projectId: project.id, userId: vendor1.id,     role: Role.VENDOR },
      { projectId: project.id, userId: vendor2.id,     role: Role.VENDOR },
      { projectId: project.id, userId: consultant.id,  role: Role.CONSULTANT },
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: project.id,
      projectStartDate: daysAgo(420),
      dailyOverheadCost: 18_000,
      penaltyRatePerDay: 0.0008,
      opportunityCostFactor: 1.3,
    },
  });

  // ── Schedule import marker — stamps every Execution/WBS phase below so the WBS
  // Tree/Gantt/export routes (which exclude scheduleImportId:null phases so real
  // Purchase Orders don't leak in) correctly treat these as schedule phases, not POs. ──
  const scheduleImport = await prisma.scheduleImport.create({
    data: {
      projectId: project.id,
      uploadedById: pmc.id,
      fileName: 'gateway-tower-baseline.xml',
      mimeType: 'application/xml',
      fileSize: 128_000,
      storageKey: 'seed/schedule-imports/gateway-tower-baseline.xml',
      sourceFormat: 'XML',
      status: 'CONFIRMED',
      phasesFound: 6,
      milestonesFound: 24,
      dependenciesFound: 23,
      resourcesFound: 4,
      parsedAt: daysAgo(420),
      confirmedAt: daysAgo(420),
    },
  });

  // ── Purchase Orders — genuine top-level Phases (parentPhaseId: null, scheduleImportId:
  // null), separate from the Execution/WBS phases below. Each BOQ is a single item, per
  // the current "BOQ = 1 item" model. ──────────────────────────────────────────────────
  const p4po1 = await prisma.phase.create({ data: { projectId: project.id, name: 'PO-1 Piling & Foundation', sortOrder: 0, vendorUserId: vendor1.id, plannedStart: daysAgo(420), plannedEnd: daysAgo(230) } });
  const p4po2 = await prisma.phase.create({ data: { projectId: project.id, name: 'PO-2 RC Superstructure', sortOrder: 1, vendorUserId: vendor1.id, plannedStart: daysAgo(230), plannedEnd: daysFromNow(55) } });
  const p4po3 = await prisma.phase.create({ data: { projectId: project.id, name: 'PO-3 Curtain Wall & Envelope', sortOrder: 2, vendorUserId: vendor2.id, plannedStart: daysFromNow(50), plannedEnd: daysFromNow(175) } });
  const p4po4 = await prisma.phase.create({ data: { projectId: project.id, name: 'PO-4 MEP Package', sortOrder: 3, vendorUserId: vendor2.id, plannedStart: daysFromNow(88), plannedEnd: daysFromNow(255) } });
  const p4po5 = await prisma.phase.create({ data: { projectId: project.id, name: 'PO-5 Interior Fit-Out', sortOrder: 4, vendorUserId: vendor2.id, plannedStart: daysFromNow(250), plannedEnd: daysFromNow(355) } });

  async function createBOQItem(orderId: string, desc: string, unit: string, qty: number, rate: number) {
    const boq = await prisma.bOQ.create({ data: { projectId: project.id, orderId, status: BOQStatus.APPROVED, workOrderStatus: 'PENDING' } });
    return prisma.bOQItem.create({ data: { boqId: boq.id, description: desc, unit, plannedQty: qty, rate, plannedValue: qty * rate } });
  }

  const p4b0i  = await createBOQItem(p4po1.id, 'Site clearance, hoarding & temp utilities', 'LS', 1, 430_000);
  const p4b1i1 = await createBOQItem(p4po1.id, 'Piling works — 320 bored piles dia 900mm', 'No.', 320, 12_000);
  const p4b1i2 = await createBOQItem(p4po1.id, 'Pile caps, grade beams & raft foundation', 'cum', 4800, 620);
  const p4b1i3 = await createBOQItem(p4po1.id, 'Basement retaining walls B2-B1', 'sqm', 3200, 480);
  const p4b1i4 = await createBOQItem(p4po1.id, 'Raft waterproofing & drainage', 'sqm', 5600, 180);

  const p4b2i  = await createBOQItem(p4po2.id, 'RC frame — core walls, columns, flat slabs', 'cum', 28_000, 580);

  const p4b3i1 = await createBOQItem(p4po3.id, 'Unitised curtain wall system — supply & install', 'sqm', 18_500, 480);
  const p4b3i2 = await createBOQItem(p4po3.id, 'Roof waterproofing, insulation & finishes', 'sqm', 3200, 320);

  const p4b4i  = await createBOQItem(p4po4.id, 'MEP complete package — HVAC, Electrical, Plumbing, Fire', 'LS', 1, 18_400_000);

  const p4b5i  = await createBOQItem(p4po5.id, 'Internal fit-out, finishes, FF&E and landscaping', 'LS', 1, 22_500_000);

  console.log('    ✓ 5 Purchase Orders + 10 BOQ items');

  // ── Milestone helper (reduces repetition) ────────────────────────────────
  async function p4Closed(
    phaseId: string, boqItemId: string, sortOrder: number,
    title: string, desc: string, boqQty: number,
    ps: Date, pe: Date, as_: Date, asub: Date, aver: Date,
    val: number, vendorId: string,
    approvalCycleDays: number, // evidence→verification gap
  ) {
    const m = await prisma.milestone.create({ data: {
      projectId: project.id, phaseId,
      title, description: desc,
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: ps, plannedEnd: pe,
      baselinePlannedStart: ps, baselinePlannedEnd: pe,
      actualStart: as_, actualSubmission: asub, actualVerification: aver,
      state: MilestoneState.CLOSED, value: val,
      vendorUserId: vendorId, sortOrder,
    }});
    await prisma.milestoneBOQLink.create({ data: { milestoneId: m.id, boqItemId, plannedQty: boqQty } });
    await prisma.milestoneStateTransition.createMany({ data: [
      { milestoneId: m.id, fromState: null,          toState: 'DRAFT',       actorId: pmc.id,     role: Role.PMC,    createdAt: new Date(ps.getTime() - 3*86_400_000) },
      { milestoneId: m.id, fromState: 'DRAFT',       toState: 'IN_PROGRESS', actorId: vendorId,   role: Role.VENDOR, createdAt: as_ },
      { milestoneId: m.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED',   actorId: vendorId,   role: Role.VENDOR, createdAt: asub },
      { milestoneId: m.id, fromState: 'SUBMITTED',   toState: 'VERIFIED',    actorId: pmc.id,     role: Role.PMC,    createdAt: new Date(asub.getTime() + approvalCycleDays * 86_400_000) },
      { milestoneId: m.id, fromState: 'VERIFIED',    toState: 'CLOSED',      actorId: owner.id,   role: Role.OWNER,  createdAt: aver },
    ]});
    await prisma.evidence.create({ data: {
      milestoneId: m.id, submittedById: vendorId,
      qtyOrPercent: 100, remarks: `${title} — work completed and verified on site.`,
      frozen: true, status: EvidenceStatus.APPROVED,
      reviewedAt: new Date(asub.getTime() + approvalCycleDays * 86_400_000),
    }});
    const verifiedAt = new Date(asub.getTime() + approvalCycleDays * 86_400_000);
    await prisma.verification.create({ data: { milestoneId: m.id, verifiedById: pmc.id, qtyVerified: boqQty, valueEligibleComputed: val, verifiedAt } });
    await prisma.paymentEligibility.create({ data: {
      milestoneId: m.id, boqValueCompleted: val, eligibleAmount: val,
      advanceAmount: 0, remainingAmount: 0,
      state: EligibilityState.MARKED_PAID, dueDate: aver,
      markedPaidAt: new Date(aver.getTime() + 7 * 86_400_000),
      markedPaidByActorId: owner.id,
      paidExplanation: 'Bank transfer — invoice settled.',
    }});
    return m;
  }

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 0 — Enabling Works (DONE, daysAgo(420) → daysAgo(365))
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph0 = await prisma.phase.create({ data: { projectId: project.id, scheduleImportId: scheduleImport.id, name: 'Phase 0 — Enabling Works', sortOrder: 0 } });

  const p4m1 = await p4Closed(p4ph0.id, p4b0i.id, 1, 'Site Clearance & Hoarding',
    'Install perimeter hoarding, clear site, establish site offices and compound.',
    0.5, daysAgo(420), daysAgo(405), daysAgo(418), daysAgo(408), daysAgo(405), 215_000, vendor1.id, 3);
  const p4m2 = await p4Closed(p4ph0.id, p4b0i.id, 2, 'Temporary Utilities & Access Roads',
    'Establish temporary power, water, sewage, and haul roads within site.',
    0.5, daysAgo(404), daysAgo(390), daysAgo(402), daysAgo(391), daysAgo(388), 215_000, vendor1.id, 2);

  console.log('    ✓ Phase 0 — Enabling Works (2 CLOSED)');

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 1 — Substructure (DONE, daysAgo(390) → daysAgo(230))
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph1 = await prisma.phase.create({ data: { projectId: project.id, scheduleImportId: scheduleImport.id, name: 'Phase 1 — Substructure & Foundation', sortOrder: 1 } });

  const p4m3 = await p4Closed(p4ph1.id, p4b1i1.id, 1, 'Piling Works — 320 Bored Piles',
    'Bore and cast 320 reinforced concrete piles dia 900mm to depths 28-35m.',
    320, daysAgo(388), daysAgo(340), daysAgo(385), daysAgo(342), daysAgo(339), 3_840_000, vendor1.id, 5);
  const p4m4 = await p4Closed(p4ph1.id, p4b1i2.id, 2, 'Pile Caps, Grade Beams & Raft Foundation',
    'Excavate and cast pile caps, grade beams and 800mm thick raft slab.',
    4800, daysAgo(338), daysAgo(298), daysAgo(336), daysAgo(299), daysAgo(296), 2_976_000, vendor1.id, 4);
  const p4m5 = await p4Closed(p4ph1.id, p4b1i3.id, 3, 'Basement Retaining Walls (B2 & B1)',
    'Cast insitu RC retaining walls for 2-level basement carpark.',
    3200, daysAgo(296), daysAgo(258), daysAgo(294), daysAgo(260), daysAgo(257), 1_536_000, vendor1.id, 3);
  const p4m6 = await p4Closed(p4ph1.id, p4b1i4.id, 4, 'Raft Waterproofing & Drainage Layer',
    'Apply torch-on waterproofing membrane to raft slab and install drainage composite.',
    5600, daysAgo(256), daysAgo(232), daysAgo(254), daysAgo(233), daysAgo(230), 1_008_000, vendor2.id, 2);

  console.log('    ✓ Phase 1 — Substructure (4 CLOSED)');

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 2 — Superstructure (MIXED: 4 CLOSED + 1 VERIFIED + 1 IN_PROGRESS + 1 DRAFT)
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph2 = await prisma.phase.create({ data: { projectId: project.id, scheduleImportId: scheduleImport.id, name: 'Phase 2 — Superstructure', sortOrder: 2 } });

  const p4m7  = await p4Closed(p4ph2.id, p4b2i.id, 1, 'Core Walls — Basement to Ground Level',
    'Cast RC shear core walls from B2 to GL with staircase and lift shafts.',
    2800, daysAgo(230), daysAgo(192), daysAgo(228), daysAgo(193), daysAgo(190), 1_624_000, vendor1.id, 4);
  const p4m8  = await p4Closed(p4ph2.id, p4b2i.id, 2, 'Podium Slabs — Levels B1 to L3',
    'Cast post-tensioned flat slabs for basement and podium levels.',
    4200, daysAgo(192), daysAgo(155), daysAgo(190), daysAgo(160), daysAgo(157), 2_436_000, vendor1.id, 6); // 6-day approval = delay
  const p4m9  = await p4Closed(p4ph2.id, p4b2i.id, 3, 'Tower Frame — Floors L4 to L10',
    'Columns, shear walls and flat slabs floors 4 through 10.',
    4900, daysAgo(155), daysAgo(110), daysAgo(153), daysAgo(111), daysAgo(108), 2_842_000, vendor1.id, 3);
  const p4m10 = await p4Closed(p4ph2.id, p4b2i.id, 4, 'Tower Frame — Floors L11 to L17',
    'Columns, shear walls and flat slabs floors 11 through 17.',
    4900, daysAgo(110), daysAgo(70),  daysAgo(108), daysAgo(71),  daysAgo(68),  2_842_000, vendor1.id, 4);

  // M11: L18-L23 — VERIFIED (payment due, not yet closed)
  const p4m11 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph2.id,
    title: 'Tower Frame — Floors L18 to L23',
    description: 'Columns, shear walls and flat slabs floors 18 through 23.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysAgo(70), plannedEnd: daysAgo(30),
    baselinePlannedStart: daysAgo(70), baselinePlannedEnd: daysAgo(32),
    actualStart: daysAgo(68), actualSubmission: daysAgo(31), actualVerification: daysAgo(22),
    state: MilestoneState.VERIFIED, value: 2_842_000,
    vendorUserId: vendor1.id, sortOrder: 5,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m11.id, boqItemId: p4b2i.id, plannedQty: 4900 } });
  await prisma.milestoneStateTransition.createMany({ data: [
    { milestoneId: p4m11.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(73) },
    { milestoneId: p4m11.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(68) },
    { milestoneId: p4m11.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(31) },
    { milestoneId: p4m11.id, fromState: 'SUBMITTED', toState: 'VERIFIED', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(22) },
  ]});
  await prisma.evidence.create({ data: { milestoneId: p4m11.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'Floors L18-L23 complete. All slabs poured, columns stripped and surveyed.', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(26) }});
  await prisma.verification.create({ data: { milestoneId: p4m11.id, verifiedById: pmc.id, qtyVerified: 4900, valueEligibleComputed: 2_842_000, verifiedAt: daysAgo(22) }});
  await prisma.paymentEligibility.create({ data: { milestoneId: p4m11.id, boqValueCompleted: 2_842_000, eligibleAmount: 2_842_000, state: EligibilityState.FULLY_ELIGIBLE, dueDate: daysAgo(20) }});

  // M12: L24-L28 — IN_PROGRESS (currently behind schedule — key escalation source, spans today)
  const p4m12 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph2.id,
    title: 'Tower Frame — Floors L24 to L28',
    description: 'Columns, shear walls and flat slabs floors 24 through 28. Critical path item.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysAgo(32), plannedEnd: daysFromNow(12),
    baselinePlannedStart: daysAgo(32), baselinePlannedEnd: daysFromNow(10),
    actualStart: daysAgo(24), // started 8 days late
    state: MilestoneState.IN_PROGRESS, value: 2_320_000,
    vendorUserId: vendor1.id, sortOrder: 6,
  }});
  await prisma.milestoneStateTransition.createMany({ data: [
    { milestoneId: p4m12.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(35) },
    { milestoneId: p4m12.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(24) },
  ]});

  // M13: L29-L30 & Roof — DRAFT (upcoming, starts in 10 days)
  const p4m13 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph2.id,
    title: 'Tower Frame — L29, L30 & Roof Slab',
    description: 'Top two floors, roof slab, lift overrun and plant room.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(10), plannedEnd: daysFromNow(55),
    baselinePlannedStart: daysFromNow(10), baselinePlannedEnd: daysFromNow(55),
    state: MilestoneState.DRAFT, value: 2_030_000,
    vendorUserId: vendor1.id, sortOrder: 7,
  }});

  console.log('    ✓ Phase 2 — Superstructure (4 CLOSED + 1 VERIFIED + 1 IN_PROGRESS + 1 DRAFT)');

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 3 — External Envelope (DRAFT — all future)
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph3 = await prisma.phase.create({ data: { projectId: project.id, scheduleImportId: scheduleImport.id, name: 'Phase 3 — External Envelope', sortOrder: 3 } });

  const p4m14 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph3.id,
    title: 'Curtain Wall Frame & Anchors — Podium',
    description: 'Install unitised curtain wall system and glazing — podium levels L1-L3.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(50), plannedEnd: daysFromNow(95),
    baselinePlannedStart: daysFromNow(50), baselinePlannedEnd: daysFromNow(95),
    state: MilestoneState.DRAFT, value: 3_552_000,
    vendorUserId: vendor2.id, sortOrder: 1,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m14.id, boqItemId: p4b3i1.id, plannedQty: 7400 } });

  const p4m15 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph3.id,
    title: 'Curtain Wall — Tower L4 to L30',
    description: 'Full tower curtain wall — 11,100 sqm unitised panels including spandrels.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(90), plannedEnd: daysFromNow(155),
    baselinePlannedStart: daysFromNow(90), baselinePlannedEnd: daysFromNow(155),
    state: MilestoneState.DRAFT, value: 5_328_000,
    vendorUserId: vendor2.id, sortOrder: 2,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m15.id, boqItemId: p4b3i1.id, plannedQty: 11100 } });

  const p4m16 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph3.id,
    title: 'Roof Waterproofing & Insulation',
    description: 'Torch-on waterproofing, rigid PIR insulation and paving to roof terrace.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(150), plannedEnd: daysFromNow(175),
    baselinePlannedStart: daysFromNow(150), baselinePlannedEnd: daysFromNow(175),
    state: MilestoneState.DRAFT, value: 1_024_000,
    vendorUserId: vendor2.id, sortOrder: 3,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m16.id, boqItemId: p4b3i2.id, plannedQty: 3200 } });

  console.log('    ✓ Phase 3 — External Envelope (3 DRAFT)');

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 4 — MEP & Services (DRAFT)
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph4 = await prisma.phase.create({ data: { projectId: project.id, scheduleImportId: scheduleImport.id, name: 'Phase 4 — MEP & Services', sortOrder: 4 } });

  const p4m17 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph4.id,
    title: 'MEP Rough-In — Basement & Podium',
    description: 'All MEP first-fix: conduits, ductwork, piping — basement and podium levels.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(88), plannedEnd: daysFromNow(138),
    baselinePlannedStart: daysFromNow(88), baselinePlannedEnd: daysFromNow(138),
    state: MilestoneState.DRAFT, value: 4_600_000,
    vendorUserId: vendor2.id, sortOrder: 1,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m17.id, boqItemId: p4b4i.id, plannedQty: 0.25 } });

  const p4m18 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph4.id,
    title: 'MEP Rough-In — Tower L4 to L20',
    description: 'All MEP first-fix: conduits, ductwork, piping — tower floors 4-20.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(135), plannedEnd: daysFromNow(185),
    baselinePlannedStart: daysFromNow(135), baselinePlannedEnd: daysFromNow(185),
    state: MilestoneState.DRAFT, value: 5_060_000,
    vendorUserId: vendor2.id, sortOrder: 2,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m18.id, boqItemId: p4b4i.id, plannedQty: 0.275 } });

  const p4m19 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph4.id,
    title: 'MEP Rough-In — Tower L21 to L30',
    description: 'All MEP first-fix: conduits, ductwork, piping — tower floors 21-30.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(183), plannedEnd: daysFromNow(220),
    baselinePlannedStart: daysFromNow(183), baselinePlannedEnd: daysFromNow(220),
    state: MilestoneState.DRAFT, value: 3_680_000,
    vendorUserId: vendor2.id, sortOrder: 3,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m19.id, boqItemId: p4b4i.id, plannedQty: 0.2 } });

  const p4m20 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph4.id,
    title: 'HVAC Plant, Chillers & AHUs',
    description: 'Supply, install and commission chiller plant, air-handling units and BMS.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(215), plannedEnd: daysFromNow(255),
    baselinePlannedStart: daysFromNow(215), baselinePlannedEnd: daysFromNow(255),
    state: MilestoneState.DRAFT, value: 5_060_000,
    vendorUserId: vendor2.id, sortOrder: 4,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m20.id, boqItemId: p4b4i.id, plannedQty: 0.275 } });

  console.log('    ✓ Phase 4 — MEP & Services (4 DRAFT)');

  // ─────────────────────────────────────────────────────────────────────────
  // PHASE 5 — Finishing & Handover (DRAFT)
  // ─────────────────────────────────────────────────────────────────────────
  const p4ph5 = await prisma.phase.create({ data: { projectId: project.id, scheduleImportId: scheduleImport.id, name: 'Phase 5 — Finishing & Handover', sortOrder: 5 } });

  const p4m21 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph5.id,
    title: 'Internal Fit-Out — Ground & Podium',
    description: 'Full fit-out of ground floor lobby, retail podium, common areas and car park.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(250), plannedEnd: daysFromNow(295),
    baselinePlannedStart: daysFromNow(250), baselinePlannedEnd: daysFromNow(295),
    state: MilestoneState.DRAFT, value: 6_750_000,
    vendorUserId: vendor2.id, sortOrder: 1,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m21.id, boqItemId: p4b5i.id, plannedQty: 0.3 } });

  const p4m22 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph5.id,
    title: 'Internal Fit-Out — Tower Floors',
    description: 'Office fit-out floors 4-30: raised floors, ceilings, partitions, finishes.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(290), plannedEnd: daysFromNow(335),
    baselinePlannedStart: daysFromNow(290), baselinePlannedEnd: daysFromNow(335),
    state: MilestoneState.DRAFT, value: 11_250_000,
    vendorUserId: vendor2.id, sortOrder: 2,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m22.id, boqItemId: p4b5i.id, plannedQty: 0.5 } });

  const p4m23 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph5.id,
    title: 'Commissioning, Testing & Balancing',
    description: 'Full systems commissioning, TAB, lifts witness testing, fire drill.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(332), plannedEnd: daysFromNow(348),
    baselinePlannedStart: daysFromNow(332), baselinePlannedEnd: daysFromNow(348),
    state: MilestoneState.DRAFT, value: 2_250_000,
    vendorUserId: vendor2.id, sortOrder: 3,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m23.id, boqItemId: p4b5i.id, plannedQty: 0.1 } });

  const p4m24 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph5.id,
    title: 'Snagging, Defects Rectification & Handover',
    description: 'Complete snagging register, rectify defects and achieve Practical Completion.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(346), plannedEnd: daysFromNow(355),
    baselinePlannedStart: daysFromNow(346), baselinePlannedEnd: daysFromNow(355),
    state: MilestoneState.DRAFT, value: 2_250_000,
    vendorUserId: vendor2.id, sortOrder: 4,
  }});
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p4m24.id, boqItemId: p4b5i.id, plannedQty: 0.1 } });

  console.log('    ✓ Phase 5 — Finishing & Handover (4 DRAFT)');

  // ─────────────────────────────────────────────────────────────────────────
  // DEPENDENCIES — full critical path chain
  // ─────────────────────────────────────────────────────────────────────────
  const p4deps = [
    { predecessorId: p4m1.id,  successorId: p4m2.id  },  // Hoarding → Utilities
    { predecessorId: p4m2.id,  successorId: p4m3.id  },  // Utilities → Piling
    { predecessorId: p4m3.id,  successorId: p4m4.id  },  // Piling → Pile caps
    { predecessorId: p4m4.id,  successorId: p4m5.id  },  // Caps → Retaining walls
    { predecessorId: p4m5.id,  successorId: p4m6.id  },  // Walls → Waterproofing
    { predecessorId: p4m6.id,  successorId: p4m7.id  },  // WP → Core walls
    { predecessorId: p4m7.id,  successorId: p4m8.id  },  // Cores → Podium slabs
    { predecessorId: p4m8.id,  successorId: p4m9.id  },  // Podium → L4-10
    { predecessorId: p4m9.id,  successorId: p4m10.id },  // L4-10 → L11-17
    { predecessorId: p4m10.id, successorId: p4m11.id },  // L11-17 → L18-23
    { predecessorId: p4m11.id, successorId: p4m12.id },  // L18-23 → L24-28
    { predecessorId: p4m12.id, successorId: p4m13.id },  // L24-28 → L29-30
    { predecessorId: p4m13.id, successorId: p4m14.id },  // Roof slab → Curtain wall podium
    { predecessorId: p4m14.id, successorId: p4m15.id },  // CW podium → CW tower
    { predecessorId: p4m15.id, successorId: p4m16.id },  // CW tower → Roof WP
    { predecessorId: p4m12.id, successorId: p4m17.id },  // L24-28 → MEP podium (parallel start)
    { predecessorId: p4m17.id, successorId: p4m18.id },  // MEP B/P → MEP L4-20
    { predecessorId: p4m18.id, successorId: p4m19.id },  // MEP L4-20 → MEP L21-30
    { predecessorId: p4m19.id, successorId: p4m20.id },  // MEP rough-in → HVAC plant
    { predecessorId: p4m15.id, successorId: p4m21.id },  // CW tower → Fit-out podium (can't clad until glazed)
    { predecessorId: p4m20.id, successorId: p4m21.id },  // HVAC → Fit-out (needs MEP done)
    { predecessorId: p4m21.id, successorId: p4m22.id },  // Podium fit-out → Tower fit-out
    { predecessorId: p4m22.id, successorId: p4m23.id },  // Tower fit-out → Commissioning
    { predecessorId: p4m23.id, successorId: p4m24.id },  // Commissioning → Handover
  ];
  for (const dep of p4deps) {
    await prisma.milestoneDependency.create({ data: { ...dep, dependencyType: 'FS', lagDays: 0 } });
  }
  console.log(`    ✓ ${p4deps.length} dependency edges wired`);

  // ─────────────────────────────────────────────────────────────────────────
  // ESCALATION TREND — FollowUp records over 12 weeks (populates trend chart)
  // ─────────────────────────────────────────────────────────────────────────
  const escalations = [
    // Week 12 ago — 1 escalation (piling delay concern)
    { targetEntityId: p4m3.id, createdAt: daysAgo(84), title: 'Piling pace behind target — risk to programme' },
    // Week 10 ago — 2 escalations
    { targetEntityId: p4m4.id, createdAt: daysAgo(71), title: 'Pile cap pour sequence causing rework — delay risk' },
    { targetEntityId: p4m4.id, createdAt: daysAgo(70), title: 'Concrete pump breakdown — L3 pour postponed' },
    // Week 8 ago — 1 escalation
    { targetEntityId: p4m5.id, createdAt: daysAgo(58), title: 'Retaining wall shutter failures — programme impact' },
    // Week 6 ago — 3 escalations (podium slabs delayed)
    { targetEntityId: p4m8.id, createdAt: daysAgo(44), title: 'PT slab tendon installation late — 4 day delay' },
    { targetEntityId: p4m8.id, createdAt: daysAgo(43), title: 'PMC verification overdue — podium slab payment blocked' },
    { targetEntityId: p4m8.id, createdAt: daysAgo(42), title: 'Grouting of PT anchors incomplete — HOLD on payment' },
    // Week 5 ago — 1 escalation
    { targetEntityId: p4m9.id, createdAt: daysAgo(37), title: 'Rebar delivery delay — 3-day pour window missed' },
    // Week 4 ago — 2 escalations
    { targetEntityId: p4m10.id, createdAt: daysAgo(30), title: 'Formwork stripping strength not achieved — dispute' },
    { targetEntityId: p4m10.id, createdAt: daysAgo(29), title: 'Survey shows column out of plumb >10mm — remedial required' },
    // Week 3 ago — 1 escalation
    { targetEntityId: p4m11.id, createdAt: daysAgo(22), title: 'L18-L23 verification delayed — PMC site access issue' },
    // Week 2 ago — 3 escalations (M12 started late)
    { targetEntityId: p4m12.id, createdAt: daysAgo(15), title: 'L24-28 start delayed 8 days — crane allocation conflict' },
    { targetEntityId: p4m12.id, createdAt: daysAgo(14), title: 'Concrete supply shortage — high-rise pump not available' },
    { targetEntityId: p4m12.id, createdAt: daysAgo(13), title: 'Completion of L24-28 may overrun planned end date' },
    // Week 1 ago — 2 escalations
    { targetEntityId: p4m12.id, createdAt: daysAgo(8), title: 'L24 slab pour cracked — investigation underway' },
    { targetEntityId: p4m12.id, createdAt: daysAgo(7), title: 'PMC raised NCR on column reinforcement spacing' },
    // Current week — 2 escalations
    { targetEntityId: p4m12.id, createdAt: daysAgo(3), title: 'Programme delay confirmed — 10 days behind on superstructure' },
    { targetEntityId: p4m12.id, createdAt: daysAgo(1), title: 'Client notified of revised substantial completion date' },
  ];
  for (const esc of escalations) {
    await prisma.followUp.create({ data: {
      projectId: project.id,
      targetEntityId: esc.targetEntityId,
      targetEntity: 'Milestone',
      type: 'DELAY_RISK',
      status: 'ESCALATED',
      description: esc.title,
      createdAt: esc.createdAt,
    }});
  }
  console.log(`    ✓ ${escalations.length} escalation follow-ups seeded`);

  // ─────────────────────────────────────────────────────────────────────────
  // MONTHLY SPREAD — extra activities across May, Jun, Jul, Aug, Sep 2026 so
  // browsing/filtering by month always shows real work (today = 15 Jul 2026).
  // Same "no BOQ link" pattern as M12/M13 above — standalone site activities.
  // ─────────────────────────────────────────────────────────────────────────
  async function monthlyClosed(
    phaseId: string, sortOrder: number, title: string, desc: string,
    ps: Date, pe: Date, as_: Date, asub: Date, aver: Date,
    val: number, vendorId: string, approvalCycleDays: number,
  ) {
    const m = await prisma.milestone.create({ data: {
      projectId: project.id, phaseId,
      title, description: desc,
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: ps, plannedEnd: pe,
      baselinePlannedStart: ps, baselinePlannedEnd: pe,
      actualStart: as_, actualSubmission: asub, actualVerification: aver,
      state: MilestoneState.CLOSED, value: val,
      vendorUserId: vendorId, sortOrder,
    }});
    await prisma.milestoneStateTransition.createMany({ data: [
      { milestoneId: m.id, fromState: null,          toState: 'DRAFT',       actorId: pmc.id,   role: Role.PMC,    createdAt: new Date(ps.getTime() - 3*86_400_000) },
      { milestoneId: m.id, fromState: 'DRAFT',       toState: 'IN_PROGRESS', actorId: vendorId, role: Role.VENDOR, createdAt: as_ },
      { milestoneId: m.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED',   actorId: vendorId, role: Role.VENDOR, createdAt: asub },
      { milestoneId: m.id, fromState: 'SUBMITTED',   toState: 'VERIFIED',    actorId: pmc.id,   role: Role.PMC,    createdAt: new Date(asub.getTime() + approvalCycleDays * 86_400_000) },
      { milestoneId: m.id, fromState: 'VERIFIED',    toState: 'CLOSED',      actorId: owner.id, role: Role.OWNER,  createdAt: aver },
    ]});
    await prisma.evidence.create({ data: {
      milestoneId: m.id, submittedById: vendorId,
      qtyOrPercent: 100, remarks: `${title} — work completed and verified on site.`,
      frozen: true, status: EvidenceStatus.APPROVED,
      reviewedAt: new Date(asub.getTime() + approvalCycleDays * 86_400_000),
    }});
    const verifiedAt = new Date(asub.getTime() + approvalCycleDays * 86_400_000);
    await prisma.verification.create({ data: { milestoneId: m.id, verifiedById: pmc.id, qtyVerified: 100, valueEligibleComputed: val, verifiedAt } });
    await prisma.paymentEligibility.create({ data: {
      milestoneId: m.id, boqValueCompleted: val, eligibleAmount: val,
      advanceAmount: 0, remainingAmount: 0,
      state: EligibilityState.MARKED_PAID, dueDate: aver,
      markedPaidAt: new Date(aver.getTime() + 7 * 86_400_000),
      markedPaidByActorId: owner.id,
      paidExplanation: 'Bank transfer — invoice settled.',
    }});
    return m;
  }

  // May 2026 — CLOSED
  await monthlyClosed(p4ph2.id, 20, 'Tower Frame — Transfer Beams & L3 Podium Slab',
    'Cast transfer beams and podium level 3 slab ahead of tower core rise.',
    daysAgo(75), daysAgo(60), daysAgo(74), daysAgo(61), daysAgo(58), 203_000, vendor1.id, 3);
  await monthlyClosed(p4ph2.id, 21, 'Tower Crane Erection & Climbing Frame Setup',
    'Erect and commission the primary tower crane; install climbing formwork rig.',
    daysAgo(58), daysAgo(46), daysAgo(57), daysAgo(47), daysAgo(45), 162_400, vendor1.id, 2);

  // June 2026 — CLOSED
  await monthlyClosed(p4ph2.id, 22, 'Tower Frame — Water Tank Room & Lift Overrun Walls',
    'Cast RC walls for rooftop water tank room and lift shaft overrun.',
    daysAgo(44), daysAgo(30), daysAgo(43), daysAgo(31), daysAgo(28), 127_600, vendor1.id, 3);
  await monthlyClosed(p4ph3.id, 4, 'Facade Mock-Up Panel Fabrication & Testing',
    'Fabricate and air/water test a full-scale curtain wall mock-up panel offsite.',
    daysAgo(28), daysAgo(16), daysAgo(27), daysAgo(17), daysAgo(14), 104_400, vendor2.id, 3);

  // July 2026 — CLOSED before the 15th, IN_PROGRESS spanning today
  await monthlyClosed(p4ph2.id, 23, 'Structural Steel — Rooftop Plant Platform',
    'Fabricate and erect structural steel platform for rooftop MEP plant.',
    daysAgo(14), daysAgo(4), daysAgo(13), daysAgo(5), daysAgo(2), 87_000, vendor1.id, 3);

  const monJul1 = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph3.id,
    title: 'Facade Bracket & Anchor Installation — Tower Face',
    description: 'Install cast-in and post-fixed anchors for curtain wall brackets, tower elevation.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysAgo(6), plannedEnd: daysFromNow(10),
    baselinePlannedStart: daysAgo(6), baselinePlannedEnd: daysFromNow(10),
    actualStart: daysAgo(3),
    state: MilestoneState.IN_PROGRESS, value: 384_000,
    vendorUserId: vendor2.id, sortOrder: 5,
  }});
  await prisma.milestoneStateTransition.createMany({ data: [
    { milestoneId: monJul1.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(9) },
    { milestoneId: monJul1.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(3) },
  ]});

  // August 2026 — DRAFT (upcoming)
  await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph3.id,
    title: 'External Scaffolding & Access Platform — Tower Elevation',
    description: 'Erect tube-and-fitting access scaffold around the tower for facade works.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(17), plannedEnd: daysFromNow(31),
    baselinePlannedStart: daysFromNow(17), baselinePlannedEnd: daysFromNow(31),
    state: MilestoneState.DRAFT, value: 210_000,
    vendorUserId: vendor2.id, sortOrder: 6,
  }});
  await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph3.id,
    title: 'Curtain Wall Unitised Panels — Floors L4 to L10',
    description: 'Hoist and install unitised curtain wall panels, floors 4 through 10.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(26), plannedEnd: daysFromNow(44),
    baselinePlannedStart: daysFromNow(26), baselinePlannedEnd: daysFromNow(44),
    state: MilestoneState.DRAFT, value: 576_000,
    vendorUserId: vendor2.id, sortOrder: 7,
  }});

  // September 2026 — DRAFT (further upcoming)
  await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph3.id,
    title: 'Curtain Wall Mobilization & Site Logistics Setup',
    description: 'Mobilize glazing crew, set up material laydown area and hoist logistics.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: daysFromNow(48), plannedEnd: daysFromNow(57),
    baselinePlannedStart: daysFromNow(48), baselinePlannedEnd: daysFromNow(57),
    state: MilestoneState.DRAFT, value: 145_000,
    vendorUserId: vendor2.id, sortOrder: 8,
  }});
  await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph3.id,
    title: 'Curtain Wall Unitised Panels — Floors L11 to L17',
    description: 'Hoist and install unitised curtain wall panels, floors 11 through 17.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: daysFromNow(57), plannedEnd: daysFromNow(72),
    baselinePlannedStart: daysFromNow(57), baselinePlannedEnd: daysFromNow(72),
    state: MilestoneState.DRAFT, value: 576_000,
    vendorUserId: vendor2.id, sortOrder: 9,
  }});

  console.log('    ✓ 10 extra activities spread across May–Sep 2026 (5 CLOSED, 1 IN_PROGRESS, 4 DRAFT)');

  // ─────────────────────────────────────────────────────────────────────────
  // NEAR-TERM SPREAD — fixed calendar dates (not relative to seed run time) so
  // the Activities "Today" tab and the week immediately ahead always have real
  // work to show: 16 Jul (today), 17 Jul (tomorrow), 25 Jul (later this week).
  // ─────────────────────────────────────────────────────────────────────────
  const jul16 = new Date('2026-07-16T12:00:00Z');
  const jul17 = new Date('2026-07-17T12:00:00Z');
  const jul25 = new Date('2026-07-25T12:00:00Z');

  // Due TODAY (16 Jul) — IN_PROGRESS, not yet complete, so it lands in the
  // "Today" bucket rather than "Completed".
  const dueToday = await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph4.id,
    title: 'MEP Second Fix — Podium Retail Units',
    description: 'Second-fix electrical, plumbing and HVAC terminal units across podium retail shell.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: new Date('2026-07-08T12:00:00Z'), plannedEnd: jul16,
    baselinePlannedStart: new Date('2026-07-08T12:00:00Z'), baselinePlannedEnd: jul16,
    actualStart: new Date('2026-07-09T12:00:00Z'),
    state: MilestoneState.IN_PROGRESS, percentComplete: 70, value: 268_000,
    vendorUserId: vendor2.id, sortOrder: 10,
  }});
  await prisma.milestoneStateTransition.createMany({ data: [
    { milestoneId: dueToday.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: new Date('2026-07-05T12:00:00Z') },
    { milestoneId: dueToday.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor2.id, role: Role.VENDOR, createdAt: new Date('2026-07-09T12:00:00Z') },
  ]});

  // Due tomorrow (17 Jul) — upcoming, not started.
  await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph1.id,
    title: 'Waterproofing — Basement Lift Pits',
    description: 'Torch-on membrane and drainage board to the two basement lift pit recesses.',
    paymentModel: PaymentModel.MILESTONE_COMPLETE,
    plannedStart: new Date('2026-07-12T12:00:00Z'), plannedEnd: jul17,
    baselinePlannedStart: new Date('2026-07-12T12:00:00Z'), baselinePlannedEnd: jul17,
    state: MilestoneState.DRAFT, value: 62_000,
    vendorUserId: vendor1.id, sortOrder: 11,
  }});

  // Due 25 Jul — upcoming, later this week.
  await prisma.milestone.create({ data: {
    projectId: project.id, phaseId: p4ph4.id,
    title: 'Electrical Riser Cabling — Floors L1 to L10',
    description: 'Pull and terminate LV riser cabling from main switch room to floor DBs, L1-L10.',
    paymentModel: PaymentModel.PROGRESS_BASED,
    plannedStart: new Date('2026-07-18T12:00:00Z'), plannedEnd: jul25,
    baselinePlannedStart: new Date('2026-07-18T12:00:00Z'), baselinePlannedEnd: jul25,
    state: MilestoneState.DRAFT, value: 194_000,
    vendorUserId: vendor2.id, sortOrder: 12,
  }});

  console.log('    ✓ 3 near-term activities fixed to 16/17/25 Jul 2026 for the Today/Upcoming tabs');

  // ─────────────────────────────────────────────────────────────────────────
  // PAYMENT ELIGIBILITY EVENTS — so payment cycle chart has data
  // ─────────────────────────────────────────────────────────────────────────
  const eligibleMs = [p4m7, p4m8, p4m9, p4m10];
  for (const m of eligibleMs) {
    const pe = await prisma.paymentEligibility.findFirst({ where: { milestoneId: m.id } });
    if (pe) {
      await prisma.eligibilityEvent.create({ data: {
        paymentEligibilityId: pe.id,
        eventType: 'STATE_CHANGE',
        fromState: 'BLOCKED',
        toState: 'FULLY_ELIGIBLE',
        eligibleAmountAfter: pe.eligibleAmount,
        explanation: 'Milestone verified and evidence approved',
        actorId: pmc.id,
        actorRole: Role.PMC,
      }});
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WORK ORDERS — one per Purchase Order. PO-1/2/3 accepted; PO-4 demonstrates
  // the vendor "Not OK / Disagree" → PMC re-issue flow; PO-5 freshly issued.
  // ─────────────────────────────────────────────────────────────────────────
  async function acceptedWorkOrder(order: { id: string }, vendorId: string, number: string, issueDate: Date, plannedStart: Date, plannedEnd: Date) {
    const wo = await prisma.workOrder.create({ data: {
      projectId: project.id, orderId: order.id, number, currentRevisionNumber: 0, status: 'ACCEPTED',
    }});
    await prisma.workOrderRevision.create({ data: {
      workOrderId: wo.id, revisionNumber: 0, issueDate, plannedStart, plannedEnd,
      storageKey: `seed/work-orders/${number}-r0.pdf`, fileName: `${number}_R0.pdf`, mimeType: 'application/pdf', fileSize: 245_000,
      remarks: 'Issued per approved BOQ and site handover schedule.', reason: null,
      changesJson: JSON.stringify({ before: null, after: { revisionNumber: 0, issueDate, plannedStart, plannedEnd } }),
      vendorAcceptanceStatus: 'ACCEPTED',
      acceptedAt: new Date(issueDate.getTime() + 3 * 86_400_000), acceptedById: vendorId,
      createdById: pmc.id,
    }});
    await prisma.bOQ.updateMany({ where: { orderId: order.id }, data: { workOrderStatus: 'ACCEPTED' } });
    return wo;
  }

  await acceptedWorkOrder(p4po1, vendor1.id, 'WO-PO1', daysAgo(419), daysAgo(420), daysAgo(230));
  await acceptedWorkOrder(p4po2, vendor1.id, 'WO-PO2', daysAgo(231), daysAgo(230), daysFromNow(55));

  // PO-3: freshly issued, still pending the vendor's acceptance (work hasn't started yet).
  const p4wo3 = await prisma.workOrder.create({ data: {
    projectId: project.id, orderId: p4po3.id, number: 'WO-PO3', currentRevisionNumber: 0, status: 'PENDING_VENDOR_ACCEPTANCE',
  }});
  await prisma.workOrderRevision.create({ data: {
    workOrderId: p4wo3.id, revisionNumber: 0, issueDate: daysAgo(5), plannedStart: daysFromNow(50), plannedEnd: daysFromNow(175),
    storageKey: 'seed/work-orders/WO-PO3-r0.pdf', fileName: 'WO-PO3_R0.pdf', mimeType: 'application/pdf', fileSize: 239_000,
    remarks: 'Issued per approved curtain wall BOQ.', reason: null,
    changesJson: JSON.stringify({ before: null, after: { revisionNumber: 0 } }),
    vendorAcceptanceStatus: 'PENDING',
    createdById: pmc.id,
  }});

  // PO-4: vendor disagreed with R0 (remarks), PMC re-issued R1 — now pending again.
  const p4wo4 = await prisma.workOrder.create({ data: {
    projectId: project.id, orderId: p4po4.id, number: 'WO-PO4', currentRevisionNumber: 1, status: 'PENDING_VENDOR_ACCEPTANCE',
  }});
  await prisma.workOrderRevision.create({ data: {
    workOrderId: p4wo4.id, revisionNumber: 0, issueDate: daysAgo(20), plannedStart: daysFromNow(88), plannedEnd: daysFromNow(255),
    storageKey: 'seed/work-orders/WO-PO4-r0.pdf', fileName: 'WO-PO4_R0.pdf', mimeType: 'application/pdf', fileSize: 238_000,
    reason: null,
    changesJson: JSON.stringify({ before: null, after: { revisionNumber: 0, plannedStart: daysFromNow(88), plannedEnd: daysFromNow(255) } }),
    vendorAcceptanceStatus: 'REJECTED',
    vendorRemarks: 'Planned start conflicts with our crew mobilization on another site — please push MEP rough-in start by 3 weeks.',
    rejectedAt: daysAgo(15), rejectedById: vendor2.id,
    createdById: pmc.id,
  }});
  await prisma.workOrderRevision.create({ data: {
    workOrderId: p4wo4.id, revisionNumber: 1, issueDate: daysAgo(10), plannedStart: daysFromNow(109), plannedEnd: daysFromNow(276),
    storageKey: 'seed/work-orders/WO-PO4-r1.pdf', fileName: 'WO-PO4_R1.pdf', mimeType: 'application/pdf', fileSize: 241_000,
    reason: 'Revised start date per vendor request — 3-week mobilization delay accommodated.',
    changesJson: JSON.stringify({
      before: { plannedStart: daysFromNow(88), plannedEnd: daysFromNow(255) },
      after: { plannedStart: daysFromNow(109), plannedEnd: daysFromNow(276) },
    }),
    vendorAcceptanceStatus: 'PENDING',
    createdById: pmc.id,
  }});

  console.log('    ✓ 4 Work Orders (2 Accepted, 2 Pending Acceptance, 1 with a reject → re-issue history) — PO-5 has no Work Order yet, realistic 250+ days out');

  // ─────────────────────────────────────────────────────────────────────────
  // RA BILLS — spread across every status for a complete demo.
  // ─────────────────────────────────────────────────────────────────────────
  async function createRABill(
    order: { id: string }, billNumber: number, periodStart: Date, periodEnd: Date,
    lines: Array<{ item: { id: string; boqId: string; description: string; unit: string; plannedQty: number; rate: number }; previousCumulativeQty: number; thisBillQty: number }>,
  ) {
    const bill = await prisma.rABill.create({ data: {
      projectId: project.id, orderId: order.id, billNumber, periodStart, periodEnd,
      status: 'DRAFT', createdById: vendor1.id, // overwritten by caller as needed
    }});
    for (const l of lines) {
      const thisBillAmount = l.thisBillQty * l.item.rate;
      const cumulativeAmount = (l.previousCumulativeQty + l.thisBillQty) * l.item.rate;
      // RABillLineItem.boqId references the BOQ container, not the BOQItem — each BOQ under
      // the "BOQ = 1 item" model has exactly one item, but the FK still points at the BOQ.
      await prisma.rABillLineItem.create({ data: {
        raBillId: bill.id, boqId: l.item.boqId,
        description: l.item.description, unit: l.item.unit, contractedQty: l.item.plannedQty, rate: l.item.rate,
        previousCumulativeQty: l.previousCumulativeQty, thisBillQty: l.thisBillQty, thisBillAmount, cumulativeAmount,
      }});
    }
    return bill;
  }

  // Need the actual BOQItem for RABillLineItem.boqId — createBOQItem returned BOQItem rows directly.
  // PO-1 RA-1 — PAID (whole foundation package fully billed and paid).
  const po1ra1 = await createRABill(p4po1, 1, daysAgo(340), daysAgo(230), [
    { item: p4b1i1, previousCumulativeQty: 0, thisBillQty: 320 },
    { item: p4b1i2, previousCumulativeQty: 0, thisBillQty: 4800 },
    { item: p4b1i3, previousCumulativeQty: 0, thisBillQty: 3200 },
    { item: p4b1i4, previousCumulativeQty: 0, thisBillQty: 5600 },
  ]);
  {
    const gross = 320*12_000 + 4800*620 + 3200*480 + 5600*180;
    await prisma.rABill.update({ where: { id: po1ra1.id }, data: {
      status: 'PAID', createdById: vendor1.id,
      submittedValue: gross, submittedAt: daysAgo(228), submittedById: vendor1.id,
      certifiedAt: daysAgo(222), certifiedById: pmc.id, certifiedRemarks: 'Measured on site against as-built survey — matches claim.',
      approvedValue: gross - 50_000, deductions: 50_000, approvedAt: daysAgo(215), approvedById: owner.id,
      releasedValue: gross - 50_000, releasedAt: daysAgo(205), releasedById: owner.id, paymentReference: 'TT-2025-00142',
    }});
  }

  // PO-2 RA-1 — APPROVED, awaiting payment release.
  const po2ra1 = await createRABill(p4po2, 1, daysAgo(230), daysAgo(155), [
    { item: p4b2i, previousCumulativeQty: 0, thisBillQty: 7000 }, // M7 + M8
  ]);
  const po2ra1Gross = 7000 * 580;
  await prisma.rABill.update({ where: { id: po2ra1.id }, data: {
    status: 'APPROVED', createdById: vendor1.id,
    submittedValue: po2ra1Gross, submittedAt: daysAgo(153), submittedById: vendor1.id,
    certifiedAt: daysAgo(147), certifiedById: pmc.id, certifiedRemarks: 'Core walls and podium slabs measured — full claim verified.',
    approvedValue: po2ra1Gross - 40_000, deductions: 40_000, approvedAt: daysAgo(140), approvedById: owner.id,
  }});

  // PO-2 RA-2 — CERTIFIED, awaiting Owner approval. Cumulative continues from RA-1.
  const po2ra2 = await createRABill(p4po2, 2, daysAgo(110), daysAgo(70), [
    { item: p4b2i, previousCumulativeQty: 7000, thisBillQty: 9000 }, // most of M9 + M10 (9800)
  ]);
  await prisma.rABill.update({ where: { id: po2ra2.id }, data: {
    status: 'CERTIFIED', createdById: vendor1.id,
    submittedValue: 9000 * 580, submittedAt: daysAgo(68), submittedById: vendor1.id,
    certifiedAt: daysAgo(60), certifiedById: pmc.id, certifiedRemarks: 'Floors L4-L17 measured and confirmed complete.',
  }});

  // PO-2 RA-3 — PENDING_VENDOR_REVIEW, submitted, awaiting PMC certification. Covers
  // partial progress on the still-in-progress L24-28 milestone.
  const po2ra3 = await createRABill(p4po2, 3, daysAgo(32), daysAgo(3), [
    { item: p4b2i, previousCumulativeQty: 16000, thisBillQty: 2000 },
  ]);
  await prisma.rABill.update({ where: { id: po2ra3.id }, data: {
    status: 'PENDING_VENDOR_REVIEW', createdById: vendor1.id,
    submittedValue: 2000 * 580, submittedAt: daysAgo(2), submittedById: vendor1.id,
  }});

  // PO-3 RA-1 — DRAFT, vendor still preparing an early mobilization claim.
  const po3ra1 = await createRABill(p4po3, 1, daysAgo(4), daysFromNow(3), [
    { item: p4b3i1, previousCumulativeQty: 0, thisBillQty: 400 },
  ]);
  await prisma.rABill.update({ where: { id: po3ra1.id }, data: { createdById: vendor2.id, remarks: 'Advance mobilization — materials procurement claim.' } });

  // PO-1 RA-2 — REVISION_REQUESTED: a retention/adjustment claim PMC sent back.
  const po1ra2 = await createRABill(p4po1, 2, daysAgo(60), daysAgo(30), [
    { item: p4b1i2, previousCumulativeQty: 4800, thisBillQty: 200 }, // minor remedial works claim
  ]);
  await prisma.rABill.update({ where: { id: po1ra2.id }, data: {
    status: 'REVISION_REQUESTED', createdById: vendor1.id,
    submittedValue: 200 * 620, submittedAt: daysAgo(28), submittedById: vendor1.id,
    revisionRequestedAt: daysAgo(24), revisionRequestedById: pmc.id,
    revisionReason: "Quantities don't match the as-built survey — please recheck against the final measurement sheet.",
  }});

  console.log('    ✓ 6 RA Bills across PAID/APPROVED/CERTIFIED/PENDING_VENDOR_REVIEW/DRAFT/REVISION_REQUESTED');

  console.log('  ✅ Project: Gateway Commercial Tower');
  console.log(`     6 Phases | 5 Purchase Orders | 37 Milestones | ${p4deps.length} Dependencies | ${escalations.length} Escalations | 4 Work Orders | 6 RA Bills\n`);

  // ── Architecture (drawing sets) + vendor-request communications ──────────
  await seedArchitectureForProject(project.id, 'Gateway');
  console.log('  ✅ Architecture drawing sets seeded');

  const requestPairs = await Promise.all([
    prisma.vendorRequest.create({ data: {
      projectId: project.id, submittedById: vendor1.id, senderRole: Role.VENDOR,
      category: 'REQUEST', type: 'RFI', priority: 'HIGH',
      title: 'RFI — Column reinforcement clash at L24 transfer beam',
      description: 'Rebar congestion at the L24 transfer beam / column junction makes the detailed spacing unworkable on site. Requesting a revised detail or approval to adjust link spacing locally.',
      sendTo: 'PMC', status: 'PENDING',
      dueDate: daysFromNow(3),
      createdAt: daysAgo(2), updatedAt: daysAgo(2),
    }}),
    prisma.vendorRequest.create({ data: {
      projectId: project.id, submittedById: vendor1.id, senderRole: Role.VENDOR,
      category: 'REQUEST', type: 'MATERIAL_APPROVAL', priority: 'NORMAL',
      title: 'Material approval — alternate rebar supplier',
      description: 'Primary rebar supplier has a 3-week lead time issue. Requesting approval to source an equivalent-spec alternate supplier for the L24-28 pour.',
      sendTo: 'PMC', status: 'RESPONDED',
      dueDate: daysAgo(5), respondedAt: daysAgo(6),
      responseNote: 'Approved subject to mill test certificates being submitted before delivery.',
      createdAt: daysAgo(9), updatedAt: daysAgo(6),
    }}),
    prisma.vendorRequest.create({ data: {
      projectId: project.id, submittedById: vendor2.id, senderRole: Role.VENDOR,
      category: 'REQUEST', type: 'CLARIFICATION', priority: 'NORMAL',
      title: 'Clarification — curtain wall anchor embed tolerance',
      description: 'Drawings show ±5mm embed tolerance but site survey shows some slab edges vary by up to 12mm. Please confirm acceptable tolerance or remedial approach.',
      sendTo: 'CONSULTANT', status: 'PENDING',
      dueDate: daysFromNow(6),
      createdAt: daysAgo(1), updatedAt: daysAgo(1),
    }}),
    prisma.vendorRequest.create({ data: {
      projectId: project.id, submittedById: pmc.id, senderRole: Role.PMC,
      category: 'REQUEST', type: 'SITE_INSTRUCTION', priority: 'NORMAL',
      title: 'Site Instruction — crane allocation for L24-28 recovery plan',
      description: 'To recover the 8-day delay on L24-28, requesting a second tower crane shift be allocated for the next 3 weeks per the recovery programme discussed on site.',
      sendTo: 'VENDOR', status: 'PENDING',
      dueDate: daysFromNow(5),
      createdAt: daysAgo(1), updatedAt: daysAgo(1),
    }}),
  ]);

  console.log(`  ✅ ${requestPairs.length} vendor-request communications seeded\n`);

  console.log('🎉 Seed complete!\n');
  console.log('  Projects       : 1 (Gateway Commercial Tower)');
  console.log('  Users          : 6 (admin + owner + pmc + 2 vendors + consultant)');
  console.log('  Phases (WBS)   : 6');
  console.log('  Purchase Orders: 5');
  console.log('  BOQ items      : 10');
  console.log('  Milestones     : 37 (incl. 10 spread May-Sep 2026 + 3 fixed to 16/17/25 Jul)');
  console.log(`  Dependencies   : ${p4deps.length} edges`);
  console.log('  Work Orders    : 4 (2 Accepted, 2 Pending Acceptance, 1 with reject → re-issue history) — PO-5 not yet issued');
  console.log('  RA Bills       : 6 (every status represented)');
  console.log(`  Escalations    : ${escalations.length} follow-ups — trend chart ready`);
  console.log('\n  Demo logins (password: password123)');
  console.log('    Client     :  client@example.com');
  console.log('    PMC        :  pmc@example.com');
  console.log('    Vendor 1   :  vendor@example.com');
  console.log('    Vendor 2   :  vendor2@example.com');
  console.log('    Consultant :  consultant@example.com');
  console.log('    Admin      :  admin@axinfra.local   (password: admin123)');
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
