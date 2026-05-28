import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ─── String-based enums (matches src/types/index.ts) ────────────────────────
const Role = { OWNER: 'OWNER', PMC: 'PMC', VENDOR: 'VENDOR', VIEWER: 'VIEWER', ARTIFACTS: 'ARTIFACTS' } as const;
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
  if (process.env.NODE_ENV === 'production') {
    console.error('SEED ABORTED: NODE_ENV is production.');
    process.exit(1);
  }

  console.log('🌱 Seeding Axinfra database with PHASE-WISE data…\n');

  // ── 1. Wipe all data (respects FK order) ─────────────────────────────────
  console.log('  Clearing existing data…');
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
  await prisma.phase.deleteMany();          // ← NEW: clear phases
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
    data: { name: 'Alex Owner', email: 'owner@example.com', hashedPassword: hash },
  });
  const pmc = await prisma.user.create({
    data: { name: 'Pat PMC', email: 'pmc@example.com', hashedPassword: hash },
  });
  const vendor1 = await prisma.user.create({
    data: { name: 'Victor Vendor', email: 'vendor@example.com', hashedPassword: hash },
  });
  const vendor2 = await prisma.user.create({
    data: { name: 'Sara Subcon', email: 'vendor2@example.com', hashedPassword: hash },
  });
  const viewer = await prisma.user.create({
    data: { name: 'Vera Viewer', email: 'viewer@example.com', hashedPassword: hash },
  });
  const architect = await prisma.user.create({
    data: { name: 'Arthur Architect', email: 'architect@example.com', hashedPassword: hash },
  });
  console.log('  Created 7 users (1 admin + 6 demo)');

  async function seedArchitectureForProject(projectId: string, label: string) {
    const draftSet = await prisma.drawingSet.create({
      data: {
        projectId,
        name: `${label} - Working Drawing Set A`,
        description: 'Core architectural package for review',
        cost: 90000,
        currency: 'INR',
        status: 'DRAFT',
        createdById: architect.id,
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
        createdById: architect.id,
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
        createdById: architect.id,
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
        createdById: architect.id,
      },
    });
    await prisma.drawingVersion.create({
      data: {
        drawingRowId: rowA.id,
        versionNumber: 1,
        uploadType: 'URL',
        fileUrl: 'https://example.com/drawings/ground-floor-layout-v1.pdf',
        fileName: 'ground-floor-layout-v1.pdf',
        uploadedById: architect.id,
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
        createdById: architect.id,
      },
    });
    await prisma.drawingVersion.create({
      data: {
        drawingRowId: rowB.id,
        versionNumber: 2,
        uploadType: 'URL',
        fileUrl: 'https://example.com/drawings/section-aa-v2.pdf',
        fileName: 'section-aa-v2.pdf',
        uploadedById: architect.id,
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
        createdById: architect.id,
      },
    });
    await prisma.drawingVersion.create({
      data: {
        drawingRowId: rowC.id,
        versionNumber: 0,
        uploadType: 'URL',
        fileUrl: 'https://example.com/drawings/south-elevation-v0.pdf',
        fileName: 'south-elevation-v0.pdf',
        uploadedById: architect.id,
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
          actorId: architect.id,
          role: Role.ARTIFACTS,
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

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECT 1 — Downtown Office Building
  // 4 Phases: Foundation → Structure → MEP → Finishing
  // Each Phase has its own BOQ + milestones
  // ════════════════════════════════════════════════════════════════════════════
  const p1 = await prisma.project.create({
    data: {
      name: 'Downtown Office Building',
      description: 'A 10-story office building construction project in the downtown area.',
      isExampleProject: true,
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: p1.id, userId: admin.id, role: Role.OWNER },
      { projectId: p1.id, userId: owner.id, role: Role.OWNER },
      { projectId: p1.id, userId: pmc.id, role: Role.PMC },
      { projectId: p1.id, userId: vendor1.id, role: Role.VENDOR },
      { projectId: p1.id, userId: vendor2.id, role: Role.VENDOR },
      { projectId: p1.id, userId: viewer.id, role: Role.VIEWER },
      { projectId: p1.id, userId: architect.id, role: Role.ARTIFACTS },
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: p1.id,
      projectStartDate: daysAgo(90),
      dailyOverheadCost: 5000,
      penaltyRatePerDay: 0.001,
      opportunityCostFactor: 1.2,
    },
  });

  // ── PHASE 0 — Foundation (APPROVED BOQ, all milestones CLOSED) ───────────
  const p1_phase0 = await prisma.phase.create({
    data: { projectId: p1.id, name: 'Phase 0 — Foundation', sortOrder: 0 },
  });

  const p1_boq0 = await prisma.bOQ.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase0.id,
      status: BOQStatus.APPROVED,
    },
  });

  const [p1_b0i1, p1_b0i2] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p1_boq0.id, description: 'Foundation concrete work', unit: 'cum', plannedQty: 500, rate: 150, plannedValue: 75000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: p1_boq0.id, description: 'Waterproofing membrane', unit: 'sqm', plannedQty: 800, rate: 50, plannedValue: 40000 },
    }),
  ]);

  // Phase 0 — M1: Foundation Work (CLOSED)
  const p1_ph0_m1 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase0.id,
      title: 'Foundation Work',
      description: 'Complete foundation concrete work — all 500 cum poured and cured',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(85), plannedEnd: daysAgo(60),
      baselinePlannedStart: daysAgo(85), baselinePlannedEnd: daysAgo(60),
      actualStart: daysAgo(82), actualSubmission: daysAgo(63), actualVerification: daysAgo(60),
      state: MilestoneState.CLOSED, value: 75000, advancePercent: 10,
      vendorUserId: vendor1.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph0_m1.id, boqItemId: p1_b0i1.id, plannedQty: 500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1_ph0_m1.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(88) },
      { milestoneId: p1_ph0_m1.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(82) },
      { milestoneId: p1_ph0_m1.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(63) },
      { milestoneId: p1_ph0_m1.id, fromState: 'SUBMITTED', toState: 'VERIFIED', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(61) },
      { milestoneId: p1_ph0_m1.id, fromState: 'VERIFIED', toState: 'CLOSED', actorId: owner.id, role: Role.OWNER, createdAt: daysAgo(60) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1_ph0_m1.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'Foundation complete — all 500 cum poured and cured.', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(61) },
  });
  await prisma.verification.create({
    data: { milestoneId: p1_ph0_m1.id, verifiedById: pmc.id, qtyVerified: 500, valueEligibleComputed: 75000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph0_m1.id, boqValueCompleted: 75000, eligibleAmount: 75000,
      advanceAmount: 7500, remainingAmount: 0,
      state: EligibilityState.MARKED_PAID, dueDate: daysAgo(60),
      markedPaidAt: daysAgo(58), markedPaidByActorId: owner.id,
      paidExplanation: 'Payment processed via bank transfer',
    },
  });

  // Phase 0 — M2: Waterproofing (CLOSED)
  const p1_ph0_m2 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase0.id,
      title: 'Waterproofing Membrane',
      description: 'Waterproofing membrane application on all below-grade surfaces',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(62), plannedEnd: daysAgo(52),
      baselinePlannedStart: daysAgo(62), baselinePlannedEnd: daysAgo(52),
      actualStart: daysAgo(60), actualSubmission: daysAgo(54), actualVerification: daysAgo(52),
      state: MilestoneState.CLOSED, value: 40000,
      vendorUserId: vendor1.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph0_m2.id, boqItemId: p1_b0i2.id, plannedQty: 800 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph0_m2.id, boqValueCompleted: 40000, eligibleAmount: 40000,
      state: EligibilityState.MARKED_PAID, dueDate: daysAgo(52),
      markedPaidAt: daysAgo(50), markedPaidByActorId: owner.id,
    },
  });

  console.log('    ✓ Phase 0 — Foundation (2 milestones, BOQ APPROVED)');

  // ── PHASE 1 — Structural Works (APPROVED BOQ, mixed states) ──────────────
  const p1_phase1 = await prisma.phase.create({
    data: { projectId: p1.id, name: 'Phase 1 — Structural Works', sortOrder: 1 },
  });

  const p1_boq1 = await prisma.bOQ.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase1.id,
      status: BOQStatus.APPROVED,
    },
  });

  const [p1_b1i1, p1_b1i2] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p1_boq1.id, description: 'Structural steel framework', unit: 'MT', plannedQty: 200, rate: 2500, plannedValue: 500000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: p1_boq1.id, description: 'Floor slab casting', unit: 'sqm', plannedQty: 5000, rate: 80, plannedValue: 400000 },
    }),
  ]);

  // Phase 1 — M1: Steel Framework (VERIFIED)
  const p1_ph1_m1 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase1.id,
      title: 'Structural Framework — Floors 1-5',
      description: 'Steel framework for floors 1-5',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(50), plannedEnd: daysAgo(20),
      baselinePlannedStart: daysAgo(50), baselinePlannedEnd: daysAgo(22),
      actualStart: daysAgo(48), actualSubmission: daysAgo(22), actualVerification: daysAgo(18),
      state: MilestoneState.VERIFIED, value: 250000, advancePercent: 15,
      vendorUserId: vendor1.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph1_m1.id, boqItemId: p1_b1i1.id, plannedQty: 100 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1_ph1_m1.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(52) },
      { milestoneId: p1_ph1_m1.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(48) },
      { milestoneId: p1_ph1_m1.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(22) },
      { milestoneId: p1_ph1_m1.id, fromState: 'SUBMITTED', toState: 'VERIFIED', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(18) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1_ph1_m1.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'Floors 1-5 steel framework completed', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(19) },
  });
  await prisma.verification.create({
    data: { milestoneId: p1_ph1_m1.id, verifiedById: pmc.id, qtyVerified: 100, valueEligibleComputed: 250000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph1_m1.id, boqValueCompleted: 250000, eligibleAmount: 250000,
      advanceAmount: 37500, remainingAmount: 212500,
      state: EligibilityState.FULLY_ELIGIBLE, dueDate: daysFromNow(3),
    },
  });

  // Phase 1 — M2: Floor Slab L1-3 (SUBMITTED)
  const p1_ph1_m2 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase1.id,
      title: 'Floor Slab — Levels 1-3',
      description: 'Concrete slab casting for floors 1-3',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(25), plannedEnd: daysFromNow(5),
      baselinePlannedStart: daysAgo(25), baselinePlannedEnd: daysFromNow(3),
      actualStart: daysAgo(20), actualSubmission: daysAgo(3),
      state: MilestoneState.SUBMITTED, value: 120000,
      vendorUserId: vendor2.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph1_m2.id, boqItemId: p1_b1i2.id, plannedQty: 1500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1_ph1_m2.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(27) },
      { milestoneId: p1_ph1_m2.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(20) },
      { milestoneId: p1_ph1_m2.id, fromState: 'IN_PROGRESS', toState: 'SUBMITTED', actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(3) },
    ],
  });
  await prisma.evidence.create({
    data: { milestoneId: p1_ph1_m2.id, submittedById: vendor2.id, qtyOrPercent: 100, remarks: 'Slab casting complete for L1-L3', frozen: true, status: EvidenceStatus.SUBMITTED, submittedAt: daysAgo(3) },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph1_m2.id, remainingAmount: 120000,
      state: EligibilityState.DUE_PENDING_VERIFICATION, dueDate: daysFromNow(5),
    },
  });

  console.log('    ✓ Phase 1 — Structural Works (2 milestones, BOQ APPROVED)');

  // ── PHASE 2 — Facade & MEP (APPROVED BOQ, IN_PROGRESS + DRAFT) ───────────
  const p1_phase2 = await prisma.phase.create({
    data: { projectId: p1.id, name: 'Phase 2 — Facade & MEP', sortOrder: 2 },
  });

  const p1_boq2 = await prisma.bOQ.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase2.id,
      status: BOQStatus.APPROVED,
    },
  });

  const [p1_b2i1, p1_b2i2] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p1_boq2.id, description: 'External glazing', unit: 'sqm', plannedQty: 2000, rate: 200, plannedValue: 400000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: p1_boq2.id, description: 'MEP installations', unit: 'LS', plannedQty: 1, rate: 300000, plannedValue: 300000 },
    }),
  ]);

  // Phase 2 — M1: External Glazing (IN_PROGRESS)
  const p1_ph2_m1 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase2.id,
      title: 'External Glazing — South Facade',
      description: 'Installation of external glazing on south-facing facade',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(12), plannedEnd: daysFromNow(30),
      baselinePlannedStart: daysAgo(12), baselinePlannedEnd: daysFromNow(28),
      actualStart: daysAgo(10),
      state: MilestoneState.IN_PROGRESS, value: 100000, advancePercent: 20,
      vendorUserId: vendor2.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph2_m1.id, boqItemId: p1_b2i1.id, plannedQty: 500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p1_ph2_m1.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(15) },
      { milestoneId: p1_ph2_m1.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(10) },
    ],
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph2_m1.id, advanceAmount: 20000, remainingAmount: 80000,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(30),
    },
  });

  // Phase 2 — M2: MEP Rough-In (DRAFT, unassigned)
  const p1_ph2_m2 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase2.id,
      title: 'MEP Rough-In',
      description: 'Mechanical, Electrical, and Plumbing rough-in work',
      paymentModel: PaymentModel.ADVANCE,
      plannedStart: daysFromNow(20), plannedEnd: daysFromNow(45),
      baselinePlannedStart: daysFromNow(20), baselinePlannedEnd: daysFromNow(45),
      state: MilestoneState.DRAFT, value: 300000, advancePercent: 25,
      sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p1_ph2_m2.id, boqItemId: p1_b2i2.id, plannedQty: 1 } });
  await prisma.milestoneStateTransition.create({
    data: { milestoneId: p1_ph2_m2.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(5) },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p1_ph2_m2.id, advanceAmount: 75000, remainingAmount: 225000,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(45),
    },
  });

  console.log('    ✓ Phase 2 — Facade & MEP (2 milestones, BOQ APPROVED)');

  // ── PHASE 3 — Finishing (DRAFT BOQ — not yet approved) ───────────────────
  const p1_phase3 = await prisma.phase.create({
    data: { projectId: p1.id, name: 'Phase 3 — Finishing & Handover', sortOrder: 3 },
  });

  const p1_boq3 = await prisma.bOQ.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase3.id,
      status: BOQStatus.DRAFT,   // ← Not approved yet — shows DRAFT state in UI
    },
  });

  await prisma.bOQItem.create({
    data: { boqId: p1_boq3.id, description: 'Interior finishes and fit-out', unit: 'sqm', plannedQty: 8000, rate: 120, plannedValue: 960000 },
  });
  await prisma.bOQItem.create({
    data: { boqId: p1_boq3.id, description: 'Lift installation and commissioning', unit: 'nos', plannedQty: 4, rate: 80000, plannedValue: 320000 },
  });

  // Phase 3 milestones are DRAFT — BOQ not approved yet, no work started
  const p1_ph3_m1 = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: p1_phase3.id,
      title: 'Interior Fit-Out — Floors 1-5',
      description: 'Complete interior finishing works for floors 1 to 5',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysFromNow(50), plannedEnd: daysFromNow(90),
      baselinePlannedStart: daysFromNow(50), baselinePlannedEnd: daysFromNow(90),
      state: MilestoneState.DRAFT, value: 480000,
      sortOrder: 1,
    },
  });
  await prisma.milestoneStateTransition.create({
    data: { milestoneId: p1_ph3_m1.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(2) },
  });
  await prisma.paymentEligibility.create({
    data: { milestoneId: p1_ph3_m1.id, state: EligibilityState.NOT_DUE, dueDate: daysFromNow(90) },
  });

  console.log('    ✓ Phase 3 — Finishing (1 milestone, BOQ DRAFT — awaiting approval)');

  // ── P1 Extra Milestone (no phaseId — tests isExtra = true) ───────────────
  const p1_extra = await prisma.milestone.create({
    data: {
      projectId: p1.id,
      phaseId: null,                          // ← Not linked to any phase
      title: 'Additional Parking Level — B3', // ← Extra work, not in original BOQ
      description: 'Extra basement parking level requested by client after BOQ approval',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysFromNow(60), plannedEnd: daysFromNow(100),
      baselinePlannedStart: daysFromNow(60), baselinePlannedEnd: daysFromNow(100),
      state: MilestoneState.DRAFT,
      isExtra: true,                          // ← Needs owner approval before starting
      value: 180000,
      sortOrder: 99,
    },
  });
  await prisma.milestoneStateTransition.create({
    data: { milestoneId: p1_extra.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(1) },
  });
  await prisma.paymentEligibility.create({
    data: { milestoneId: p1_extra.id, state: EligibilityState.NOT_DUE, dueDate: daysFromNow(100) },
  });

  console.log('    ✓ Extra milestone (isExtra=true, no phase, awaiting owner approval)');

  // ── P1 Dependencies ───────────────────────────────────────────────────────
  await prisma.milestoneDependency.createMany({
    data: [
      { predecessorId: p1_ph0_m1.id, successorId: p1_ph0_m2.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p1_ph0_m2.id, successorId: p1_ph1_m1.id, dependencyType: 'FS', lagDays: 5 },
      { predecessorId: p1_ph1_m1.id, successorId: p1_ph1_m2.id, dependencyType: 'FS', lagDays: 2 },
      { predecessorId: p1_ph1_m2.id, successorId: p1_ph2_m1.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p1_ph2_m1.id, successorId: p1_ph2_m2.id, dependencyType: 'FS', lagDays: 5 },
    ],
  });

  console.log('  ✅ Project 1: Downtown Office Building');
  console.log('     4 Phases | 4 BOQs (3 APPROVED, 1 DRAFT) | 7 Milestones | 1 Extra\n');
  await seedArchitectureForProject(p1.id, 'Downtown');
  console.log('     + Architecture demo: sets, rows, versions, set request, audit logs\n');

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECT 2 — Riverfront Residential Towers
  // 3 Phases: Foundation → Superstructure → Finishing
  // ════════════════════════════════════════════════════════════════════════════
  const p2 = await prisma.project.create({
    data: {
      name: 'Riverfront Residential Towers',
      description: 'Twin 25-story luxury residential towers with shared podium.',
      isExampleProject: true,
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: p2.id, userId: owner.id, role: Role.OWNER },
      { projectId: p2.id, userId: pmc.id, role: Role.PMC },
      { projectId: p2.id, userId: vendor1.id, role: Role.VENDOR },
      { projectId: p2.id, userId: viewer.id, role: Role.VIEWER },
      { projectId: p2.id, userId: architect.id, role: Role.ARTIFACTS },
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: p2.id,
      projectStartDate: daysAgo(120),
      dailyOverheadCost: 12000,
      penaltyRatePerDay: 0.002,
      opportunityCostFactor: 1.5,
    },
  });

  // ── Phase 0 — Piling & Foundation (APPROVED) ─────────────────────────────
  const p2_phase0 = await prisma.phase.create({
    data: { projectId: p2.id, name: 'Phase 0 — Piling & Foundation', sortOrder: 0 },
  });

  const p2_boq0 = await prisma.bOQ.create({
    data: { projectId: p2.id, phaseId: p2_phase0.id, status: BOQStatus.APPROVED },
  });

  const [p2_b0i1] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p2_boq0.id, description: 'Piling and foundation works', unit: 'LS', plannedQty: 1, rate: 2000000, plannedValue: 2000000 },
    }),
  ]);

  // Mobilization (CLOSED)
  const p2m1 = await prisma.milestone.create({
    data: {
      projectId: p2.id, phaseId: p2_phase0.id,
      title: 'Advance Payment — Mobilization',
      description: '20% advance for contractor mobilization',
      paymentModel: PaymentModel.ADVANCE,
      plannedStart: daysAgo(120), plannedEnd: daysAgo(90),
      baselinePlannedStart: daysAgo(120), baselinePlannedEnd: daysAgo(90),
      state: MilestoneState.CLOSED, value: 500000, advancePercent: 100,
      vendorUserId: vendor1.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m1.id, boqItemId: p2_b0i1.id, plannedQty: 0.2 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m1.id, boqValueCompleted: 500000, eligibleAmount: 500000,
      advanceAmount: 500000, state: EligibilityState.MARKED_PAID,
      markedPaidAt: daysAgo(88), markedPaidByActorId: owner.id,
    },
  });

  // Piling Tower A (VERIFIED, BLOCKED)
  const p2m2 = await prisma.milestone.create({
    data: {
      projectId: p2.id, phaseId: p2_phase0.id,
      title: 'Piling Work — Tower A',
      description: 'Complete piling for Tower A foundation',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(90), plannedEnd: daysAgo(50),
      baselinePlannedStart: daysAgo(90), baselinePlannedEnd: daysAgo(55),
      actualStart: daysAgo(85), actualSubmission: daysAgo(55), actualVerification: daysAgo(50),
      state: MilestoneState.VERIFIED, value: 800000, advancePercent: 15,
      vendorUserId: vendor1.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m2.id, boqItemId: p2_b0i1.id, plannedQty: 0.4 } });
  await prisma.evidence.create({
    data: { milestoneId: p2m2.id, submittedById: vendor1.id, qtyOrPercent: 100, remarks: 'All piles driven and tested', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(52) },
  });
  await prisma.verification.create({
    data: { milestoneId: p2m2.id, verifiedById: pmc.id, qtyVerified: 0.4, valueEligibleComputed: 800000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m2.id, boqValueCompleted: 800000, eligibleAmount: 800000,
      advanceAmount: 120000, remainingAmount: 680000, blockedAmount: 800000,
      state: EligibilityState.BLOCKED, dueDate: daysAgo(30),
      blockReasonCode: 'DISPUTE_PENDING', blockExplanation: 'Quantity dispute — awaiting third-party audit',
      blockedAt: daysAgo(48), blockedByActorId: owner.id,
    },
  });

  console.log('    ✓ Phase 0 — Piling & Foundation (2 milestones, BOQ APPROVED)');

  // ── Phase 1 — Superstructure (APPROVED BOQ, IN_PROGRESS) ─────────────────
  const p2_phase1 = await prisma.phase.create({
    data: { projectId: p2.id, name: 'Phase 1 — Concrete Superstructure', sortOrder: 1 },
  });

  const p2_boq1 = await prisma.bOQ.create({
    data: { projectId: p2.id, phaseId: p2_phase1.id, status: BOQStatus.APPROVED },
  });

  const [p2_b1i1] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p2_boq1.id, description: 'Concrete superstructure', unit: 'cum', plannedQty: 15000, rate: 180, plannedValue: 2700000 },
    }),
  ]);

  const p2m3 = await prisma.milestone.create({
    data: {
      projectId: p2.id, phaseId: p2_phase1.id,
      title: 'Concrete Superstructure — Tower A L1-10',
      description: 'Concrete pour for Tower A floors 1 through 10',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(30), plannedEnd: daysFromNow(60),
      baselinePlannedStart: daysAgo(30), baselinePlannedEnd: daysFromNow(55),
      actualStart: daysAgo(25),
      state: MilestoneState.IN_PROGRESS, value: 1350000, advancePercent: 10,
      vendorUserId: vendor1.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p2m3.id, boqItemId: p2_b1i1.id, plannedQty: 7500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p2m3.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(32) },
      { milestoneId: p2m3.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor1.id, role: Role.VENDOR, createdAt: daysAgo(25) },
    ],
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p2m3.id, advanceAmount: 135000, remainingAmount: 1215000,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(60),
    },
  });

  console.log('    ✓ Phase 1 — Superstructure (1 milestone, BOQ APPROVED)');

  // ── Phase 2 — Finishing (REVISED BOQ — shows re-approval needed) ─────────
  const p2_phase2 = await prisma.phase.create({
    data: { projectId: p2.id, name: 'Phase 2 — Finishing Works', sortOrder: 2 },
  });

  const p2_boq2 = await prisma.bOQ.create({
    data: { projectId: p2.id, phaseId: p2_phase2.id, status: BOQStatus.REVISED },
  });

  await prisma.bOQItem.create({
    data: { boqId: p2_boq2.id, description: 'Interior fit-out both towers', unit: 'sqm', plannedQty: 20000, rate: 150, plannedValue: 3000000 },
  });

  // BOQ Revision record — why it was revised
  await prisma.bOQRevision.create({
    data: {
      boqId: p2_boq2.id,
      revisionNumber: 1,
      reason: 'Client requested upgrade from standard to premium finish specification — rate increased from ₹120 to ₹150/sqm',
      changesJson: JSON.stringify({ before: { rate: 120, plannedValue: 2400000 }, after: { rate: 150, plannedValue: 3000000 } }),
    },
  });

  console.log('    ✓ Phase 2 — Finishing (BOQ REVISED — awaiting owner re-approval)');

  // ── P2 Dependencies ──────────────────────────────────────────────────────
  await prisma.milestoneDependency.createMany({
    data: [
      { predecessorId: p2m1.id, successorId: p2m2.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p2m2.id, successorId: p2m3.id, dependencyType: 'FS', lagDays: 3 },
    ],
  });

  console.log('  ✅ Project 2: Riverfront Residential Towers');
  console.log('     3 Phases | 3 BOQs (1 APPROVED, 1 APPROVED+BLOCKED, 1 REVISED) | 3 Milestones\n');
  await seedArchitectureForProject(p2.id, 'Riverfront');
  console.log('     + Architecture demo: sets, rows, versions, set request, audit logs\n');

  // ════════════════════════════════════════════════════════════════════════════
  // PROJECT 3 — Industrial Warehouse Fit-Out
  // 2 Phases: Demolition & Structure → Cold Storage & MEP
  // ════════════════════════════════════════════════════════════════════════════
  const p3 = await prisma.project.create({
    data: {
      name: 'Industrial Warehouse Fit-Out',
      description: 'Conversion of 50,000 sqft warehouse into modern logistics facility.',
      isExampleProject: true,
    },
  });

  await prisma.projectRole.createMany({
    data: [
      { projectId: p3.id, userId: owner.id, role: Role.OWNER },
      { projectId: p3.id, userId: pmc.id, role: Role.PMC },
      { projectId: p3.id, userId: vendor2.id, role: Role.VENDOR },
      { projectId: p3.id, userId: viewer.id, role: Role.VIEWER },
      { projectId: p3.id, userId: architect.id, role: Role.ARTIFACTS },
    ],
  });

  await prisma.projectScheduleConfig.create({
    data: {
      projectId: p3.id,
      projectStartDate: daysAgo(60),
      dailyOverheadCost: 2500,
      penaltyRatePerDay: 0.0015,
      opportunityCostFactor: 1.0,
    },
  });

  // ── Phase 0 — Demolition & Structure (APPROVED BOQ) ───────────────────────
  const p3_phase0 = await prisma.phase.create({
    data: { projectId: p3.id, name: 'Phase 0 — Demolition & Structure', sortOrder: 0 },
  });

  const p3_boq0 = await prisma.bOQ.create({
    data: { projectId: p3.id, phaseId: p3_phase0.id, status: BOQStatus.APPROVED },
  });

  const [p3_b0i1, p3_b0i2] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p3_boq0.id, description: 'Demolition and site prep', unit: 'LS', plannedQty: 1, rate: 50000, plannedValue: 50000 },
    }),
    prisma.bOQItem.create({
      data: { boqId: p3_boq0.id, description: 'Structural modifications and mezzanine', unit: 'LS', plannedQty: 1, rate: 150000, plannedValue: 150000 },
    }),
  ]);

  // Demolition (CLOSED)
  const p3m1 = await prisma.milestone.create({
    data: {
      projectId: p3.id, phaseId: p3_phase0.id,
      title: 'Demolition Complete',
      description: 'Remove existing fixtures and prepare site',
      paymentModel: PaymentModel.MILESTONE_COMPLETE,
      plannedStart: daysAgo(60), plannedEnd: daysAgo(50),
      baselinePlannedStart: daysAgo(60), baselinePlannedEnd: daysAgo(50),
      actualStart: daysAgo(58), actualSubmission: daysAgo(51), actualVerification: daysAgo(50),
      state: MilestoneState.CLOSED, value: 50000,
      vendorUserId: vendor2.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m1.id, boqItemId: p3_b0i1.id, plannedQty: 1 } });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m1.id, boqValueCompleted: 50000, eligibleAmount: 50000,
      state: EligibilityState.MARKED_PAID, markedPaidAt: daysAgo(48), markedPaidByActorId: owner.id,
    },
  });

  // Structural Steel (VERIFIED)
  const p3m2 = await prisma.milestone.create({
    data: {
      projectId: p3.id, phaseId: p3_phase0.id,
      title: 'Structural Steel Install',
      description: 'Mezzanine reinforcement and structural steel',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(48), plannedEnd: daysAgo(35),
      baselinePlannedStart: daysAgo(48), baselinePlannedEnd: daysAgo(35),
      actualStart: daysAgo(47), actualSubmission: daysAgo(36), actualVerification: daysAgo(35),
      state: MilestoneState.VERIFIED, value: 75000, advancePercent: 20,
      vendorUserId: vendor2.id, sortOrder: 2,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m2.id, boqItemId: p3_b0i2.id, plannedQty: 0.5 } });
  await prisma.evidence.create({
    data: { milestoneId: p3m2.id, submittedById: vendor2.id, qtyOrPercent: 100, remarks: 'Mezzanine steel complete', frozen: true, status: EvidenceStatus.APPROVED, reviewedAt: daysAgo(36) },
  });
  await prisma.verification.create({
    data: { milestoneId: p3m2.id, verifiedById: pmc.id, qtyVerified: 0.5, valueEligibleComputed: 75000 },
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m2.id, boqValueCompleted: 75000, eligibleAmount: 75000,
      advanceAmount: 15000, remainingAmount: 60000,
      state: EligibilityState.FULLY_ELIGIBLE, dueDate: daysAgo(30),
    },
  });

  console.log('    ✓ Phase 0 — Demolition & Structure (2 milestones, BOQ APPROVED)');

  // ── Phase 1 — Cold Storage & MEP (APPROVED BOQ, IN_PROGRESS) ─────────────
  const p3_phase1 = await prisma.phase.create({
    data: { projectId: p3.id, name: 'Phase 1 — Cold Storage & MEP', sortOrder: 1 },
  });

  const p3_boq1 = await prisma.bOQ.create({
    data: { projectId: p3.id, phaseId: p3_phase1.id, status: BOQStatus.APPROVED },
  });

  const [p3_b1i1] = await Promise.all([
    prisma.bOQItem.create({
      data: { boqId: p3_boq1.id, description: 'Cold storage insulated panels', unit: 'sqm', plannedQty: 5000, rate: 100, plannedValue: 500000 },
    }),
  ]);

  const p3m3 = await prisma.milestone.create({
    data: {
      projectId: p3.id, phaseId: p3_phase1.id,
      title: 'Cold Storage — Insulation',
      description: 'Install insulated panels for cold storage rooms',
      paymentModel: PaymentModel.PROGRESS_BASED,
      plannedStart: daysAgo(15), plannedEnd: daysFromNow(15),
      baselinePlannedStart: daysAgo(15), baselinePlannedEnd: daysFromNow(15),
      actualStart: daysAgo(12),
      state: MilestoneState.IN_PROGRESS, value: 250000, advancePercent: 15,
      vendorUserId: vendor2.id, sortOrder: 1,
    },
  });
  await prisma.milestoneBOQLink.create({ data: { milestoneId: p3m3.id, boqItemId: p3_b1i1.id, plannedQty: 2500 } });
  await prisma.milestoneStateTransition.createMany({
    data: [
      { milestoneId: p3m3.id, fromState: null, toState: 'DRAFT', actorId: pmc.id, role: Role.PMC, createdAt: daysAgo(18) },
      { milestoneId: p3m3.id, fromState: 'DRAFT', toState: 'IN_PROGRESS', actorId: vendor2.id, role: Role.VENDOR, createdAt: daysAgo(12) },
    ],
  });
  await prisma.paymentEligibility.create({
    data: {
      milestoneId: p3m3.id, advanceAmount: 37500, remainingAmount: 212500,
      state: EligibilityState.NOT_DUE, dueDate: daysFromNow(15),
    },
  });

  console.log('    ✓ Phase 1 — Cold Storage & MEP (1 milestone, BOQ APPROVED)');

  // P3 Dependencies
  await prisma.milestoneDependency.createMany({
    data: [
      { predecessorId: p3m1.id, successorId: p3m2.id, dependencyType: 'FS', lagDays: 0 },
      { predecessorId: p3m2.id, successorId: p3m3.id, dependencyType: 'FS', lagDays: 3 },
    ],
  });

  console.log('  ✅ Project 3: Industrial Warehouse Fit-Out');
  console.log('     2 Phases | 2 BOQs (both APPROVED) | 3 Milestones\n');
  await seedArchitectureForProject(p3.id, 'Warehouse');
  console.log('     + Architecture demo: sets, rows, versions, set request, audit logs\n');

  // ── Summary ──────────────────────────────────────────────────────────────
  console.log('========================================');
  console.log('  ✅ Database seeded successfully!');
  console.log('========================================\n');
  console.log('  3 Projects');
  console.log('  7 Users (1 admin + 6 demo incl. Architects role)');
  console.log('  9 Phases total (3-4 per project)');
  console.log('  9 BOQs (6 APPROVED, 1 DRAFT, 1 REVISED, 1 APPROVED+BLOCKED)');
  console.log('  11 Milestones (linked to phases) + 1 Extra milestone (isExtra=true)');
  console.log('  All milestones have phaseId set correctly\n');
  console.log('  BOQ States visible in UI:');
  console.log('    APPROVED  — Phase 0,1,2 of Downtown + Phase 0,1 of Warehouse');
  console.log('    DRAFT     — Phase 3 of Downtown (awaiting owner approval)');
  console.log('    REVISED   — Phase 2 of Riverfront (re-approval needed)\n');
  console.log('  Milestone States visible in UI:');
  console.log('    CLOSED     — Foundation, Waterproofing, Mobilization, Demolition');
  console.log('    VERIFIED   — Steel Framework, Piling Tower A, Structural Steel');
  console.log('    SUBMITTED  — Floor Slab L1-3');
  console.log('    IN_PROGRESS— Glazing, Superstructure, Cold Storage');
  console.log('    DRAFT      — MEP Rough-In, Interior Fit-Out, Extra Parking\n');
  console.log('  Demo accounts:');
  console.log('    Admin (OWNER) : admin@axinfra.local       (password: admin123)');
  console.log('    Owner         : owner@example.com         (password: password123)');
  console.log('    PMC           : pmc@example.com           (password: password123)');
  console.log('    Vendor 1      : vendor@example.com        (password: password123)');
  console.log('    Vendor 2      : vendor2@example.com       (password: password123)');
  console.log('    Viewer        : viewer@example.com        (password: password123)');
  console.log('    Architects    : architect@example.com     (password: password123)');
  console.log('');
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
